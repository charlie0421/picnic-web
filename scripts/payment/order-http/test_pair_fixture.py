"""Pure Docker-inspect authorization tests; no daemon or SQL is contacted.

The six positive controls must fail against the initial deny-all validator.
Rejection cases passing at that checkpoint prove only default denial. The
lifecycle tests below use an injected daemon transport, not real Docker.
"""

from contextlib import ExitStack
from copy import deepcopy
import json
import os
from pathlib import Path
import hashlib
import importlib
import py_compile
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from pair_fixture import CreationLedger, OwnedResources, PairFixtureError, validate_container, validate_created_container, validate_network
from pair_fixture import PairFactory, PINNED_IMAGES, PUBLIC_PASSWORD


RUN_ID = "d4097ccf-64cc-4d35-9731-638e2fba3461"
LABEL = "picnic.web-payment-order-http"
NETWORK_ID = "a" * 64
NETWORK_NAME = "picnic-order-http-" + RUN_ID
PG_ID = "1" * 64
REST_ID = "2" * 64
NODE_ID = "3" * 64
NODE_IMAGE = "sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54"


def container_case(role):
    """Handwritten inspect metadata, independent of the validator's builders."""
    cid, image, address, alias = {
        "postgres": (PG_ID, "sha256:" + "4" * 64, "172.29.40.2", "order-pg"),
        "postgrest": (REST_ID, "sha256:" + "5" * 64, "172.29.40.3", "order-rest"),
        "node": (NODE_ID, NODE_IMAGE, "172.29.40.4", "order-node"),
    }[role]
    mounts = []
    tmpfs = {"/tmp": "rw,noexec,nosuid,size=67108864"}
    if role == "postgres":
        tmpfs.update({
            "/var/lib/postgresql/data": "rw,nosuid,size=268435456",
            "/var/run/postgresql": "rw,noexec,nosuid,size=16777216",
        })
    if role == "node":
        mounts = [
            {"Type": "bind", "Source": "/fixture/artifacts/run-1", "Destination": "/fixture", "RW": False, "Propagation": "rprivate"},
            {"Type": "bind", "Source": "/fixture/installed/node_modules", "Destination": "/deps/node_modules", "RW": False, "Propagation": "rprivate"},
        ]
    expected = {
        "role": role,
        "container_id": cid,
        "run_id": RUN_ID,
        "label_key": LABEL,
        "image_id": image,
        "network_id": NETWORK_ID,
        "network_name": NETWORK_NAME,
        "alias": alias,
        "ipv4": address,
        "endpoint_id": {"postgres": "b", "postgrest": "c", "node": "d"}[role] * 64,
        "mounts": deepcopy(mounts),
        "tmpfs": deepcopy(tmpfs),
        "memory": 536870912,
        "nano_cpus": 1000000000,
        "pids_limit": 128,
    }
    info = {
        "Id": cid,
        "Name": "/order-http-" + role + "-" + RUN_ID,
        "Image": image,
        "State": {"Status": "running", "Running": True, "Paused": False, "Restarting": False, "Dead": False, "Pid": 123, "ExitCode": 0, "Error": ""},
        "Config": {"Labels": {LABEL: RUN_ID}},
        "HostConfig": {
            "NetworkMode": NETWORK_NAME,
            "PortBindings": {},
            "PublishAllPorts": False,
            "Privileged": False,
            "ReadonlyRootfs": True,
            "Binds": None,
            "VolumesFrom": None,
            "Mounts": [
                {"Type": "bind", "Source": m["Source"], "Target": m["Destination"], "ReadOnly": True}
                for m in mounts
            ],
            "Tmpfs": deepcopy(tmpfs),
            "Memory": 536870912,
            "NanoCpus": 1000000000,
            "PidsLimit": 128,
            "ExtraHosts": None,
            "Dns": [],
        },
        "Mounts": deepcopy(mounts),
        "NetworkSettings": {
            "Ports": {"5432/tcp": None} if role == "postgres" else {},
            "Networks": {
                NETWORK_NAME: {
                    "NetworkID": NETWORK_ID,
                    "EndpointID": expected["endpoint_id"],
                    "IPAddress": address,
                    "IPPrefixLen": 24,
                    "Gateway": "172.29.40.1",
                    "GlobalIPv6Address": "",
                    "GlobalIPv6PrefixLen": 0,
                    "IPv6Gateway": "",
                    "Aliases": [alias, cid[:12]],
                },
            },
        },
    }
    return info, expected


def network_case(*, populated=True):
    members = {
        PG_ID: {"Name": "order-http-postgres-" + RUN_ID, "EndpointID": "b" * 64, "MacAddress": "02:42:ac:1d:28:02", "IPv4Address": "172.29.40.2/24", "IPv6Address": ""},
        REST_ID: {"Name": "order-http-postgrest-" + RUN_ID, "EndpointID": "c" * 64, "MacAddress": "02:42:ac:1d:28:03", "IPv4Address": "172.29.40.3/24", "IPv6Address": ""},
        NODE_ID: {"Name": "order-http-node-" + RUN_ID, "EndpointID": "d" * 64, "MacAddress": "02:42:ac:1d:28:04", "IPv4Address": "172.29.40.4/24", "IPv6Address": ""},
    } if populated else {}
    expected = {
        "network_id": NETWORK_ID,
        "network_name": NETWORK_NAME,
        "run_id": RUN_ID,
        "label_key": LABEL,
        "members": deepcopy(members),
        "subnet": "172.29.40.0/24",
        "gateway": "172.29.40.1",
    }
    info = {
        "Id": NETWORK_ID,
        "Name": NETWORK_NAME,
        "Driver": "bridge",
        "Scope": "local",
        "Internal": True,
        "EnableIPv6": False,
        "Attachable": False,
        "Ingress": False,
        "Labels": {LABEL: RUN_ID},
        "Options": {},
        "IPAM": {"Driver": "default", "Options": None, "Config": [{"Subnet": "172.29.40.0/24", "Gateway": "172.29.40.1"}]},
        "Containers": deepcopy(members),
    }
    return info, expected


def put(info, path, value):
    node = info
    for part in path[:-1]:
        node = node[part]
    node[path[-1]] = value


class PureMetadataTests(unittest.TestCase):
    def setUp(self):
        # The validator is an authorization boundary. Even a rejection must
        # not run Docker removal or a host shell. These traps return no fake
        # Docker success; a command attempt fails the test immediately.
        stack = ExitStack()
        self.addCleanup(stack.close)
        for target in ("subprocess.run", "subprocess.Popen", "os.system", "os.popen"):
            stack.enter_context(patch(target, side_effect=AssertionError("metadata validation executed a command")))

    def allow_container(self, role):
        info, expected = container_case(role)
        before = deepcopy((info, expected))
        try:
            validate_container(info, expected)
        except PairFixtureError as exc:
            self.fail(f"valid {role} metadata was rejected: {exc}")
        self.assertEqual((info, expected), before, "validation mutated its authorization evidence")

    def test_positive_postgres_control(self):
        self.allow_container("postgres")

    def test_positive_postgrest_control(self):
        self.allow_container("postgrest")

    def test_positive_node_control(self):
        self.allow_container("node")

    def test_positive_second_pinned_postgres_image_control(self):
        info, expected = container_case("postgres")
        info["Image"] = "sha256:" + "6" * 64
        expected["image_id"] = "sha256:" + "6" * 64
        try:
            validate_container(info, expected)
        except PairFixtureError as exc:
            self.fail(f"valid second pinned PostgreSQL image was rejected: {exc}")

    def test_positive_populated_network_control(self):
        info, expected = network_case()
        before = deepcopy((info, expected))
        try:
            validate_network(info, expected)
        except PairFixtureError as exc:
            self.fail(f"valid three-member internal bridge was rejected: {exc}")
        self.assertEqual((info, expected), before)

    def test_positive_empty_owned_network_control(self):
        info, expected = network_case(populated=False)
        try:
            validate_network(info, expected)
        except PairFixtureError as exc:
            self.fail(f"valid pre-create owned internal bridge was rejected: {exc}")

    def test_container_identity_rejection_cannot_authorize_cleanup(self):
        changes = [
            (("Id",), PG_ID[:12]),
            (("Id",), "f" * 64),
            (("Image",), "postgres:15.8"),
            (("Image",), "sha256:" + "f" * 64),
            (("Config", "Labels"), {}),
            (("Config", "Labels", LABEL), "another-run"),
            (("Config",), None),
        ]
        for path, value in changes:
            with self.subTest(path=path, value=value):
                info, expected = container_case("postgres")
                put(info, path, value)
                before = deepcopy(info)
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)
                self.assertEqual(info, before)

    def test_container_rejects_extra_network_wrong_endpoint_and_ipv6(self):
        changes = [
            (("HostConfig", "NetworkMode"), "host"),
            (("HostConfig", "NetworkMode"), "bridge"),
            (("HostConfig", "NetworkMode"), "none"),
            (("NetworkSettings", "Networks", NETWORK_NAME, "NetworkID"), "f" * 64),
            (("NetworkSettings", "Networks", NETWORK_NAME, "EndpointID"), "f" * 64),
            (("NetworkSettings", "Networks", NETWORK_NAME, "IPAddress"), "172.29.40.99"),
            (("NetworkSettings", "Networks", NETWORK_NAME, "Aliases"), ["foreign-rest"]),
            (("NetworkSettings", "Networks", NETWORK_NAME, "GlobalIPv6Address"), "fd00::1"),
            (("NetworkSettings", "Networks", NETWORK_NAME, "GlobalIPv6PrefixLen"), 64),
            (("NetworkSettings", "Networks", NETWORK_NAME, "IPv6Gateway"), "fd00::ff"),
            (("NetworkSettings", "Networks"), {}),
            (("HostConfig", "ExtraHosts"), ["external:8.8.8.8"]),
            (("HostConfig", "Dns"), ["8.8.8.8"]),
        ]
        for path, value in changes:
            with self.subTest(path=path):
                info, expected = container_case("node")
                put(info, path, value)
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)
        info, expected = container_case("node")
        info["NetworkSettings"]["Networks"]["second-egress-network"] = deepcopy(info["NetworkSettings"]["Networks"][NETWORK_NAME])
        with self.assertRaises(PairFixtureError):
            validate_container(info, expected)

    def test_container_rejects_requested_publish_even_when_actual_ports_empty(self):
        for role in ("postgres", "postgrest", "node"):
            with self.subTest(role=role):
                info, expected = container_case(role)
                info["HostConfig"]["PortBindings"] = {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "54322"}]}
                info["NetworkSettings"]["Ports"] = {"3000/tcp": []}
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)

    def test_container_rejects_actual_publish_without_hostconfig_binding(self):
        for host in ("127.0.0.1", "0.0.0.0", "::"):
            with self.subTest(host=host):
                info, expected = container_case("postgrest")
                info["NetworkSettings"]["Ports"] = {"3000/tcp": [{"HostIp": host, "HostPort": "54322"}]}
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)

    def test_container_rejects_privilege_writable_root_and_wrong_limits(self):
        changes = [
            (("HostConfig", "PublishAllPorts"), True),
            (("HostConfig", "Privileged"), True),
            (("HostConfig", "ReadonlyRootfs"), False),
            (("HostConfig", "Memory"), 0),
            (("HostConfig", "Memory"), 1073741824),
            (("HostConfig", "NanoCpus"), 0),
            (("HostConfig", "NanoCpus"), "1000000000"),
            (("HostConfig", "PidsLimit"), -1),
            (("HostConfig", "PidsLimit"), None),
            (("HostConfig", "VolumesFrom"), ["foreign-container"]),
            (("HostConfig", "Binds"), ["/var/run/docker.sock:/var/run/docker.sock:ro"]),
        ]
        for path, value in changes:
            with self.subTest(path=path, value=value):
                info, expected = container_case("node")
                put(info, path, value)
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)

    def test_node_rejects_writable_or_unexpected_mounts(self):
        changes = [
            (("Mounts", 0, "RW"), True),
            (("Mounts", 0, "Source"), "/Users/charlie.hyun/orca/workspaces/picnic-web/웹결제"),
            (("Mounts", 0, "Source"), "/Users/charlie.hyun/.codex"),
            (("Mounts", 0, "Destination"), "/root"),
            (("Mounts", 0, "Type"), "volume"),
            (("Mounts", 0, "Propagation"), "rshared"),
            (("HostConfig", "Mounts", 0, "ReadOnly"), False),
            (("HostConfig", "Mounts", 0, "Source"), "/var/run/docker.sock"),
            (("Mounts",), []),
        ]
        for path, value in changes:
            with self.subTest(path=path):
                info, expected = container_case("node")
                put(info, path, value)
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)
        for source in ("/tmp/fixture/.env", "/Users/charlie.hyun", "/var/run/docker.sock"):
            with self.subTest(extra_source=source):
                info, expected = container_case("node")
                info["Mounts"].append({"Type": "bind", "Source": source, "Destination": "/unexpected", "RW": False, "Propagation": "rprivate"})
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)

    def test_container_rejects_missing_or_additional_tmpfs(self):
        for role in ("postgres", "postgrest", "node"):
            for tmpfs in ({}, {"/tmp": "rw,size=1"}, {"/tmp": "rw,noexec,nosuid,size=67108864", "/extra": "rw"}):
                with self.subTest(role=role, tmpfs=tmpfs):
                    info, expected = container_case(role)
                    info["HostConfig"]["Tmpfs"] = tmpfs
                    with self.assertRaises(PairFixtureError):
                        validate_container(info, expected)

    def test_unknown_inspect_shape_cannot_authorize_any_cleanup(self):
        for invalid in (None, [], {}, "inspect failed", [container_case("node")[0]]):
            with self.subTest(invalid=invalid):
                with self.assertRaises(PairFixtureError):
                    validate_container(invalid, container_case("node")[1])
                with self.assertRaises(PairFixtureError):
                    validate_network(invalid, network_case()[1])

    def test_missing_container_safety_evidence_is_rejected(self):
        for key in ("Id", "Image", "Config", "HostConfig", "Mounts", "NetworkSettings"):
            with self.subTest(key=key):
                info, expected = container_case("node")
                del info[key]
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)
        for key in ("NetworkMode", "PortBindings", "PublishAllPorts", "Privileged", "ReadonlyRootfs", "Tmpfs", "Memory", "NanoCpus", "PidsLimit"):
            with self.subTest(hostconfig_key=key):
                info, expected = container_case("node")
                del info["HostConfig"][key]
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)

    def test_network_identity_and_egress_changes_cannot_authorize_cleanup(self):
        changes = [
            (("Id",), NETWORK_ID[:12]),
            (("Id",), "f" * 64),
            (("Name",), "foreign-network"),
            (("Labels",), {}),
            (("Labels", LABEL), "another-run"),
            (("Driver",), "host"),
            (("Scope",), "swarm"),
            (("Internal",), False),
            (("EnableIPv6",), True),
            (("Attachable",), True),
            (("Ingress",), True),
            (("Options",), {"com.docker.network.bridge.enable_ip_masquerade": "true"}),
            (("IPAM", "Config", 0, "Subnet"), "0.0.0.0/0"),
            (("IPAM", "Config", 0, "Gateway"), "172.29.40.254"),
        ]
        for path, value in changes:
            with self.subTest(path=path, value=value):
                info, expected = network_case()
                put(info, path, value)
                before = deepcopy(info)
                with self.assertRaises(PairFixtureError):
                    validate_network(info, expected)
                self.assertEqual(info, before)

    def test_network_with_foreign_member_cannot_authorize_cleanup(self):
        info, expected = network_case()
        info["Containers"]["f" * 64] = {"Name": "someone-elses-db", "EndpointID": "e" * 64, "IPv4Address": "172.29.40.5/24", "IPv6Address": ""}
        before = deepcopy(info)
        with self.assertRaises(PairFixtureError):
            validate_network(info, expected)
        self.assertEqual(info, before)

    def test_network_rejects_missing_member_changed_endpoint_or_ipv6(self):
        changes = [
            (("Containers", PG_ID, "EndpointID"), "f" * 64),
            (("Containers", PG_ID, "IPv4Address"), "172.29.40.99/24"),
            (("Containers", PG_ID, "IPv6Address"), "fd00::1/64"),
            (("Containers",), {}),
            (("Containers",), None),
        ]
        for path, value in changes:
            with self.subTest(path=path):
                info, expected = network_case()
                put(info, path, value)
                with self.assertRaises(PairFixtureError):
                    validate_network(info, expected)

    def test_missing_network_safety_evidence_is_rejected(self):
        for key in ("Id", "Name", "Driver", "Scope", "Internal", "EnableIPv6", "Attachable", "Ingress", "Labels", "Options", "IPAM", "Containers"):
            with self.subTest(key=key):
                info, expected = network_case()
                del info[key]
                with self.assertRaises(PairFixtureError):
                    validate_network(info, expected)

    def test_untrusted_expected_identity_cannot_authorize_cleanup(self):
        for validator, case, keys in (
            (validate_container, lambda: container_case("node"), ("container_id", "image_id", "network_id", "run_id")),
            (validate_network, network_case, ("network_id", "run_id")),
        ):
            for key in keys:
                for invalid in (None, "", "short-id"):
                    with self.subTest(validator=validator.__name__, key=key, invalid=invalid):
                        info, expected = case()
                        expected[key] = invalid
                        with self.assertRaises(PairFixtureError):
                            validator(info, expected)


class InspectTransport:
    """Stateful daemon boundary; never invokes Docker or a real subprocess.

    Only literal inspect/remove/absence commands are accepted. Inspect results
    derive from live test state, so returning a success code without removing
    a resource cannot satisfy the cleanup assertions.
    """

    def __init__(self, roles=("postgres", "postgrest", "node")):
        self.containers = {}
        self.expected = []
        for role in roles:
            info, expected = container_case(role)
            self.containers[info["Id"]] = info
            self.expected.append(expected)
        self.network, self.network_expected = network_case()
        self.network["Containers"] = {cid: member for cid, member in self.network["Containers"].items() if cid in self.containers}
        self.network_expected["members"] = deepcopy(self.network["Containers"])
        self.calls = []
        self.inspects = {}
        self.before_inspect = None
        self.failures = {}
        self.ghost_removals = set()

    def __call__(self, args, *, timeout=30):
        args = tuple(args)
        if timeout != 30:
            raise AssertionError("Docker command deadline must remain 30 seconds")
        self.calls.append(args)
        if args in self.failures:
            failure = self.failures[args]
            if isinstance(failure, BaseException):
                raise failure
            return subprocess.CompletedProcess(args, failure, "", "synthetic daemon failure")
        if len(args) == 3 and args[:2] in (("container", "inspect"), ("network", "inspect")):
            key = (args[0], args[2])
            self.inspects[key] = self.inspects.get(key, 0) + 1
            if self.before_inspect:
                self.before_inspect(self, key, self.inspects[key])
            info = self.containers.get(args[2]) if args[0] == "container" else self.network
            if info is None:
                return subprocess.CompletedProcess(args, 1, "", "No such object")
            return subprocess.CompletedProcess(args, 0, json.dumps([deepcopy(info)]), "")
        if len(args) == 5 and args[:4] == ("container", "rm", "--force", "--volumes"):
            cid = args[4]
            if cid not in self.containers:
                raise AssertionError("Removal targeted an unknown CID")
            if cid not in self.ghost_removals:
                del self.containers[cid]
                self.network["Containers"].pop(cid, None)
            return subprocess.CompletedProcess(args, 0, cid + "\n", "")
        if args == ("network", "rm", NETWORK_ID):
            if self.network is None or self.network["Containers"]:
                raise AssertionError("Network removal targeted an absent or populated network")
            if NETWORK_ID not in self.ghost_removals:
                self.network = None
            return subprocess.CompletedProcess(args, 0, NETWORK_ID + "\n", "")
        if len(args) == 8 and args[:4] == ("container", "ls", "--all", "--no-trunc") and args[4] == "--filter" and args[6:] == ("--format", "{{.ID}}"):
            cid = args[5].removeprefix("id=")
            if args[5] != "id=" + cid or len(cid) != 64:
                raise AssertionError("Absence query needs the complete CID")
            return subprocess.CompletedProcess(args, 0, cid + "\n" if cid in self.containers else "", "")
        if args == ("network", "ls", "--no-trunc", "--filter", "id=" + NETWORK_ID, "--format", "{{.ID}}"):
            return subprocess.CompletedProcess(args, 0, NETWORK_ID + "\n" if self.network is not None else "", "")
        raise AssertionError("Unexpected daemon command: " + repr(args))

    @property
    def removals(self):
        return [args for args in self.calls if len(args) > 1 and args[1] == "rm"]

    @property
    def absence_queries(self):
        return [args for args in self.calls if len(args) > 1 and args[1] == "ls"]


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        stack = ExitStack()
        self.addCleanup(stack.close)
        for target in ("subprocess.run", "subprocess.Popen", "os.system", "os.popen"):
            stack.enter_context(patch(target, side_effect=AssertionError("lifecycle escaped its injected transport")))

    def resources(self, daemon):
        return OwnedResources(daemon, network=daemon.network_expected, containers=daemon.expected)

    def close_or_fail(self, resources):
        try:
            resources.close()
        except PairFixtureError as exc:
            self.fail("valid owned cleanup was rejected: " + str(exc))

    def assert_absence_queried(self, daemon, cids):
        wanted = {
            ("container", "ls", "--all", "--no-trunc", "--filter", "id=" + cid, "--format", "{{.ID}}")
            for cid in cids
        }
        wanted.add(("network", "ls", "--no-trunc", "--filter", "id=" + NETWORK_ID, "--format", "{{.ID}}"))
        self.assertEqual(set(daemon.absence_queries), wanted)

    def test_removes_only_three_exact_owned_cids_then_empty_network_and_queries_each_absence(self):
        daemon = InspectTransport()
        resources = self.resources(daemon)
        self.close_or_fail(resources)
        self.assertEqual(daemon.containers, {})
        self.assertIsNone(daemon.network)
        self.assertEqual(daemon.removals, [
            ("container", "rm", "--force", "--volumes", NODE_ID),
            ("container", "rm", "--force", "--volumes", REST_ID),
            ("container", "rm", "--force", "--volumes", PG_ID),
            ("network", "rm", NETWORK_ID),
        ])
        self.assert_absence_queried(daemon, (PG_ID, REST_ID, NODE_ID))
        self.assertEqual(resources.absence, {"containers": {PG_ID: True, REST_ID: True, NODE_ID: True}, "network": True})

    def test_network_only_partial_creation_is_removed_and_observed_absent(self):
        daemon = InspectTransport(roles=())
        resources = self.resources(daemon)
        self.close_or_fail(resources)
        self.assertIsNone(daemon.network)
        self.assertEqual(daemon.removals, [("network", "rm", NETWORK_ID)])
        self.assert_absence_queried(daemon, ())

    def test_partial_creation_failure_preserves_original_exception_and_cleans_only_known_pg(self):
        daemon = InspectTransport(roles=("postgres",))
        resources = self.resources(daemon)
        original = RuntimeError("POSTGREST_CREATE_FAILED")

        def creation_failed():
            raise original

        try:
            resources.run(creation_failed)
        except BaseException as observed:
            self.assertIs(observed, original, "cleanup replaced the original creation failure")
        else:
            self.fail("partial creation failure became success")
        self.assertEqual(daemon.containers, {})
        self.assertIsNone(daemon.network)
        self.assertEqual(daemon.removals, [("container", "rm", "--force", "--volumes", PG_ID), ("network", "rm", NETWORK_ID)])
        self.assert_absence_queried(daemon, (PG_ID,))

    def test_successful_operation_result_is_returned_only_after_cleanup(self):
        daemon = InspectTransport()
        resources = self.resources(daemon)
        try:
            result = resources.run(lambda: 17)
        except PairFixtureError as exc:
            self.fail("normal operation/cleanup was rejected: " + str(exc))
        self.assertEqual(result, 17)
        self.assertEqual(daemon.containers, {})
        self.assertIsNone(daemon.network)
        self.assertEqual(resources.absence["network"], True)

    def test_cleanup_failure_cannot_replace_original_operation_failure(self):
        daemon = InspectTransport()
        daemon.failures[("container", "rm", "--force", "--volumes", NODE_ID)] = 1
        resources = self.resources(daemon)
        original = RuntimeError("ORIGINAL_NODE_EXIT_7")

        def operation_failed():
            raise original

        try:
            resources.run(operation_failed)
        except BaseException as observed:
            self.assertIs(observed, original)
        else:
            self.fail("original nonzero child outcome became success")
        self.assertIsInstance(resources.cleanup_error, PairFixtureError)
        self.assertEqual(set(daemon.containers), {PG_ID, REST_ID, NODE_ID})
        self.assert_absence_queried(daemon, (PG_ID, REST_ID, NODE_ID))

    def test_cleanup_failure_after_success_is_a_failure(self):
        daemon = InspectTransport()
        daemon.failures[("network", "rm", NETWORK_ID)] = 1
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.run(lambda: "HTTP_COMPLETE")
        self.assertEqual(daemon.containers, {})
        self.assertIsNotNone(daemon.network)
        self.assertIs(resources.absence["network"], False)
        self.assert_absence_queried(daemon, (PG_ID, REST_ID, NODE_ID))

    def test_unknown_container_inspect_is_not_absence_and_causes_no_removal(self):
        daemon = InspectTransport()
        daemon.failures[("container", "inspect", REST_ID)] = 1
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])
        self.assertEqual(set(daemon.containers), {PG_ID, REST_ID, NODE_ID})

    def test_foreign_container_owner_causes_no_removal(self):
        daemon = InspectTransport()
        daemon.containers[REST_ID]["Config"]["Labels"][LABEL] = "foreign-owner"
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])
        self.assertEqual(set(daemon.containers), {PG_ID, REST_ID, NODE_ID})

    def test_network_foreign_member_causes_no_removal(self):
        daemon = InspectTransport()
        daemon.network["Containers"]["f" * 64] = {"Name": "foreign", "EndpointID": "e" * 64, "IPv4Address": "172.29.40.9/24", "IPv6Address": ""}
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])
        self.assertIn("f" * 64, daemon.network["Containers"])

    def test_unknown_network_inspect_causes_no_removal(self):
        daemon = InspectTransport()
        daemon.failures[("network", "inspect", NETWORK_ID)] = 1
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])

    def test_container_owner_is_rechecked_immediately_before_removal(self):
        daemon = InspectTransport()

        def replace_owner(current, key, count):
            if key == ("container", NODE_ID) and count == 2:
                current.containers[NODE_ID]["Config"]["Labels"][LABEL] = "changed-after-preflight"

        daemon.before_inspect = replace_owner
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])
        self.assertGreaterEqual(daemon.inspects.get(("container", NODE_ID), 0), 2)
        self.assertEqual(set(daemon.containers), {PG_ID, REST_ID, NODE_ID})

    def test_network_members_are_rechecked_before_first_container_removal(self):
        daemon = InspectTransport()

        def add_foreign_member(current, key, count):
            if key == ("network", NETWORK_ID) and count == 2:
                current.network["Containers"]["f" * 64] = {"Name": "new-foreign-member", "EndpointID": "e" * 64, "IPv4Address": "172.29.40.9/24", "IPv6Address": ""}

        daemon.before_inspect = add_foreign_member
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])
        self.assertGreaterEqual(daemon.inspects.get(("network", NETWORK_ID), 0), 2)

    def test_container_platform_image_is_rechecked_before_removal(self):
        daemon = InspectTransport()

        def change_image(current, key, count):
            if key == ("container", NODE_ID) and count == 2:
                current.containers[NODE_ID]["Image"] = "sha256:" + "f" * 64

        daemon.before_inspect = change_image
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])
        self.assertGreaterEqual(daemon.inspects.get(("container", NODE_ID), 0), 2)

    def test_remove_failure_is_preserved_and_remaining_presence_is_observed(self):
        daemon = InspectTransport()
        daemon.failures[("container", "rm", "--force", "--volumes", NODE_ID)] = 9
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(set(daemon.containers), {PG_ID, REST_ID, NODE_ID})
        self.assertIsNotNone(daemon.network)
        self.assertEqual(daemon.removals, [("container", "rm", "--force", "--volumes", NODE_ID)])
        self.assertEqual(resources.absence, {"containers": {PG_ID: False, REST_ID: False, NODE_ID: False}, "network": False})
        self.assert_absence_queried(daemon, (PG_ID, REST_ID, NODE_ID))

    def test_successful_remove_status_does_not_prove_container_absence(self):
        daemon = InspectTransport()
        daemon.ghost_removals.add(NODE_ID)
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertIn(NODE_ID, daemon.containers)
        self.assertIs(resources.absence["containers"][NODE_ID], False)
        self.assertIsNotNone(daemon.network)
        self.assert_absence_queried(daemon, (PG_ID, REST_ID, NODE_ID))

    def test_successful_network_remove_status_does_not_prove_network_absence(self):
        daemon = InspectTransport()
        daemon.ghost_removals.add(NETWORK_ID)
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.containers, {})
        self.assertIsNotNone(daemon.network)
        self.assertIs(resources.absence["network"], False)
        self.assert_absence_queried(daemon, (PG_ID, REST_ID, NODE_ID))

    def test_failed_absence_query_remains_unknown_and_cannot_be_success(self):
        daemon = InspectTransport()
        query = ("container", "ls", "--all", "--no-trunc", "--filter", "id=" + REST_ID, "--format", "{{.ID}}")
        daemon.failures[query] = 1
        resources = self.resources(daemon)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.containers, {})
        self.assertIsNone(daemon.network)
        self.assertIsNone(resources.absence["containers"][REST_ID])
        self.assertIs(resources.absence["containers"][PG_ID], True)
        self.assertIs(resources.absence["containers"][NODE_ID], True)
        self.assertIs(resources.absence["network"], True)
        self.assert_absence_queried(daemon, (PG_ID, REST_ID, NODE_ID))

    def test_timeout_preserves_exception_and_cleans_known_partial_resources(self):
        daemon = InspectTransport(roles=("postgres",))
        resources = self.resources(daemon)
        original = subprocess.TimeoutExpired(["create", "postgrest"], 30)

        def timed_out():
            raise original

        try:
            resources.run(timed_out)
        except BaseException as observed:
            self.assertIs(observed, original)
        else:
            self.fail("a timed-out create became success")
        self.assertEqual(daemon.containers, {})
        self.assertIsNone(daemon.network)
        self.assert_absence_queried(daemon, (PG_ID,))

    def test_unrecorded_cid_is_not_guessed_from_run_label_or_name(self):
        daemon = InspectTransport()
        expected = deepcopy(daemon.expected)
        expected[-1]["container_id"] = "short-unknown-create-result"
        resources = OwnedResources(daemon, network=daemon.network_expected, containers=expected)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])
        self.assertEqual(set(daemon.containers), {PG_ID, REST_ID, NODE_ID})


class CreationTests(unittest.TestCase):
    def transport(self, responses):
        calls = []

        def execute(args, *, timeout=30):
            args = tuple(args)
            self.assertEqual(timeout, 30)
            calls.append(args)
            self.assertIn(args, responses, "unexpected creation or recovery command")
            response = responses[args]
            if isinstance(response, BaseException):
                raise response
            code, stdout, stderr = response
            return subprocess.CompletedProcess(args, code, stdout, stderr)

        return execute, calls

    def test_cached_image_resolves_platform_id_and_never_returns_repository_digest(self):
        reference = "node@sha256:" + "7" * 64
        command = ("image", "inspect", reference)
        execute, calls = self.transport({command: (0, json.dumps([{"Id": NODE_IMAGE, "RepoDigests": [reference], "Os": "linux"}]), "")})
        ledger = CreationLedger(execute, run_id=RUN_ID)
        try:
            image_id = ledger.resolve_image(reference)
        except PairFixtureError as exc:
            self.fail("cached platform image resolution was rejected: " + str(exc))
        self.assertEqual(image_id, NODE_IMAGE)
        self.assertEqual(calls, [command])

    def test_missing_cached_image_fails_without_pull_or_create(self):
        command = ("image", "inspect", "postgres:15.8")
        execute, calls = self.transport({command: (1, "", "No such image")})
        with self.assertRaises(PairFixtureError):
            CreationLedger(execute, run_id=RUN_ID).resolve_image("postgres:15.8")
        self.assertEqual(calls, [command])

    def test_ambiguous_or_mutable_image_identity_is_rejected(self):
        command = ("image", "inspect", "postgres:15.8")
        for rows in ([{"Id": "postgres:15.8"}], [], [{"Id": NODE_IMAGE}, {"Id": NODE_IMAGE}]):
            with self.subTest(rows=rows):
                execute, calls = self.transport({command: (0, json.dumps(rows), "")})
                with self.assertRaises(PairFixtureError):
                    CreationLedger(execute, run_id=RUN_ID).resolve_image("postgres:15.8")
                self.assertEqual(calls, [command])

    def test_create_records_only_complete_returned_container_id(self):
        command = ("container", "create", "--pull", "never", "--network", NETWORK_NAME, NODE_IMAGE)
        execute, calls = self.transport({command: (0, NODE_ID + "\n", "")})
        ledger = CreationLedger(execute, run_id=RUN_ID)
        try:
            cid = ledger.create("container", command)
        except PairFixtureError as exc:
            self.fail("full returned creation identity was rejected: " + str(exc))
        self.assertEqual(cid, NODE_ID)
        self.assertEqual(ledger.known, {"container": [NODE_ID], "network": []})
        self.assertEqual(ledger.unknown, [])
        self.assertEqual(calls, [command])

    def test_network_create_records_exact_id(self):
        command = ("network", "create", "--internal", "--label", LABEL + "=" + RUN_ID, NETWORK_NAME)
        execute, calls = self.transport({command: (0, NETWORK_ID + "\n", "")})
        ledger = CreationLedger(execute, run_id=RUN_ID)
        try:
            nid = ledger.create("network", command)
        except PairFixtureError as exc:
            self.fail("full network creation identity was rejected: " + str(exc))
        self.assertEqual(nid, NETWORK_ID)
        self.assertEqual(ledger.known, {"container": [], "network": [NETWORK_ID]})
        self.assertEqual(calls, [command])

    def test_ambiguous_create_stdout_is_unknown_and_never_triggers_name_or_label_recovery(self):
        command = ("container", "create", "--pull", "never", "--network", NETWORK_NAME, NODE_IMAGE)
        for stdout in ("", NODE_ID[:12], NODE_ID + "\n" + REST_ID, "order-node-" + RUN_ID):
            with self.subTest(stdout=stdout):
                execute, calls = self.transport({command: (0, stdout, "")})
                ledger = CreationLedger(execute, run_id=RUN_ID)
                with self.assertRaises(PairFixtureError):
                    ledger.create("container", command)
                self.assertEqual(ledger.known, {"container": [], "network": []})
                self.assertEqual(len(ledger.unknown), 1)
                self.assertEqual(ledger.unknown[0]["kind"], "container")
                self.assertEqual(calls, [command])

    def test_create_timeout_is_unknown_and_is_not_retried_or_guessed(self):
        command = ("container", "create", "--pull", "never", "--network", NETWORK_NAME, NODE_IMAGE)
        timeout = subprocess.TimeoutExpired(command, 30)
        execute, calls = self.transport({command: timeout})
        ledger = CreationLedger(execute, run_id=RUN_ID)
        with self.assertRaises(PairFixtureError):
            ledger.create("container", command)
        self.assertEqual(ledger.known, {"container": [], "network": []})
        self.assertEqual(len(ledger.unknown), 1)
        self.assertEqual(ledger.unknown[0]["kind"], "container")
        self.assertEqual(calls, [command])

    def test_nonzero_create_preserves_exit_and_never_claims_no_residual_resources(self):
        command = ("container", "create", "--pull", "never", "--network", NETWORK_NAME, NODE_IMAGE)
        execute, calls = self.transport({command: (125, "", "synthetic create failure")})
        ledger = CreationLedger(execute, run_id=RUN_ID)
        with self.assertRaises(PairFixtureError):
            ledger.create("container", command)
        self.assertEqual(len(ledger.unknown), 1)
        self.assertEqual(ledger.unknown[0]["exitCode"], 125)
        self.assertEqual(calls, [command])


def created_case(role):
    info, expected = container_case(role)
    info["State"] = {"Status": "created", "Running": False, "Paused": False, "Restarting": False, "Dead": False, "Pid": 0, "ExitCode": 0, "Error": ""}
    endpoint = info["NetworkSettings"]["Networks"][NETWORK_NAME]
    for key in ("NetworkID", "EndpointID", "IPAddress", "Gateway"):
        endpoint[key] = ""
    endpoint["IPPrefixLen"] = 0
    expected["phase"] = "created"
    expected["config"] = {"Image": expected["image_id"], "Cmd": ["node", "-e", "setInterval(() => {}, 1000)"] if role == "node" else [role], "Env": ["PUBLIC_FIXTURE=yes"]}
    info["Config"].update(deepcopy(expected["config"]))
    if role != "node":
        info["HostConfig"]["Mounts"] = None
    return info, expected


class PhaseTests(unittest.TestCase):
    def test_environment_order_is_independent_and_equals_inside_values_are_preserved(self):
        info, expected = created_case("node")
        expected["config"]["Env"] = ["ONE=left=right", "TWO="]
        info["Config"]["Env"] = ["TWO=", "ONE=left=right"]
        try:
            validate_created_container(info, expected)
        except PairFixtureError as exc:
            self.fail("exact unique environment key/value pairs were rejected due to order: " + str(exc))

    def test_environment_rejects_duplicate_missing_extra_changed_and_malformed_entries(self):
        invalid = [None, "ONE=x", ["ONE=x", "ONE=x", "TWO=y"], ["ONE=x"],
                   ["ONE=x", "TWO=y", "EXTRA=z"], ["ONE=changed", "TWO=y"],
                   ["ONE=x", "TWO=y=changed"], ["ONE", "TWO=y"], ["=x", "TWO=y"],
                   ["1WRONG=x", "TWO=y"], ["ONE=x", 4], ["ONE=x", "TWO=y\x00"]]
        for value in invalid:
            with self.subTest(value=value):
                info, expected = created_case("node")
                expected["config"]["Env"] = ["ONE=x", "TWO=y"]
                info["Config"]["Env"] = value
                with self.assertRaises(PairFixtureError):
                    validate_created_container(info, expected)

    def test_malformed_expected_environment_is_rejected_before_duplicate_overwrite(self):
        for value in (None, "ONE=x", ["ONE=x", "ONE=x"], ["ONE"], ["=x"], [4]):
            with self.subTest(value=value):
                info, expected = created_case("node")
                info["Config"]["Env"] = deepcopy(value)
                expected["config"]["Env"] = deepcopy(value)
                with self.assertRaises(PairFixtureError):
                    validate_created_container(info, expected)

    def test_created_cleanup_accepts_only_the_same_unique_environment_pairs_after_reorder(self):
        daemon = InspectTransport(roles=("node",))
        info, expected = created_case("node")
        expected["config"]["Env"] = ["ONE=left=right", "TWO="]
        info["Config"]["Env"] = ["TWO=", "ONE=left=right"]
        daemon.containers[NODE_ID] = info
        daemon.expected = [expected]
        daemon.network["Containers"] = {}
        daemon.network_expected["members"] = {}
        resources = OwnedResources(daemon, network=daemon.network_expected, containers=daemon.expected)
        try:
            resources.close()
        except PairFixtureError as exc:
            self.fail("reordered identical environment prevented exact owned cleanup: " + str(exc))
        self.assertEqual(daemon.containers, {})
        self.assertIsNone(daemon.network)
        self.assertEqual(resources.absence, {"containers": {NODE_ID: True}, "network": True})

    def test_created_positive_controls_require_exact_unconnected_phase(self):
        for role in ("postgres", "postgrest", "node"):
            with self.subTest(role=role):
                info, expected = created_case(role)
                before = deepcopy((info, expected))
                try:
                    validate_created_container(info, expected)
                except PairFixtureError as exc:
                    self.fail("valid created-phase metadata was rejected: " + str(exc))
                self.assertEqual((info, expected), before)

    def test_actual_no_bind_mount_null_is_allowed_only_for_pg_and_rest(self):
        # Root inspect-phase-probe-v1: HostConfig.Mounts=null, Mounts=[].
        for role in ("postgres", "postgrest"):
            with self.subTest(role=role):
                info, expected = container_case(role)
                info["HostConfig"]["Mounts"] = None
                try:
                    validate_container(info, expected)
                except PairFixtureError as exc:
                    self.fail("actual exact no-bind metadata was rejected: " + str(exc))

    def test_actual_automatic_ipv4_ipv6_options_are_allowed(self):
        info, expected = network_case()
        info["Options"] = {"com.docker.network.enable_ipv4": "true", "com.docker.network.enable_ipv6": "false"}
        try:
            validate_network(info, expected)
        except PairFixtureError as exc:
            self.fail("actual Docker automatic options were rejected: " + str(exc))

    def test_automatic_options_do_not_allow_extra_masquerade_or_ipv6(self):
        for options in (
            {"com.docker.network.enable_ipv4": "true", "com.docker.network.enable_ipv6": "true"},
            {"com.docker.network.enable_ipv4": "true", "com.docker.network.enable_ipv6": "false", "com.docker.network.bridge.enable_ip_masquerade": "true"},
            {"com.docker.network.enable_ipv4": "false", "com.docker.network.enable_ipv6": "false"},
        ):
            with self.subTest(options=options):
                info, expected = network_case()
                info["Options"] = options
                with self.assertRaises(PairFixtureError):
                    validate_network(info, expected)

    def test_missing_actual_mount_field_and_node_null_mounts_are_rejected(self):
        # Root mount-field-presence.json corrected the earlier dict.get
        # summary: PG/REST HostConfig.Mounts is absent in actual inspect.
        # The required observed top-level Mounts field must still exist.
        for role in ("postgres", "postgrest", "node"):
            with self.subTest(role=role):
                info, expected = container_case(role)
                del info["Mounts"]
                with self.assertRaises(PairFixtureError):
                    validate_container(info, expected)
        info, expected = container_case("node")
        info["HostConfig"]["Mounts"] = None
        with self.assertRaises(PairFixtureError):
            validate_container(info, expected)

    def test_pg_rest_host_mounts_absent_null_empty_are_allowed_with_complete_empty_evidence(self):
        for role in ("postgres", "postgrest"):
            for form in ("absent", "null", "empty"):
                with self.subTest(role=role, form=form):
                    info, expected = container_case(role)
                    if form == "absent":
                        del info["HostConfig"]["Mounts"]
                    else:
                        info["HostConfig"]["Mounts"] = None if form == "null" else []
                    try:
                        validate_container(info, expected)
                    except PairFixtureError as exc:
                        self.fail("actual exact no-bind representation was rejected: " + str(exc))

    def test_pg_rest_absent_host_mounts_never_hides_other_missing_or_unsafe_evidence(self):
        for role in ("postgres", "postgrest"):
            for field in ("Binds", "VolumesFrom", "Tmpfs"):
                with self.subTest(role=role, missing=field):
                    info, expected = container_case(role)
                    del info["HostConfig"]["Mounts"]
                    del info["HostConfig"][field]
                    with self.assertRaises(PairFixtureError):
                        validate_container(info, expected)
            for field, value in (("Binds", ["/root:/unexpected:ro"]), ("VolumesFrom", ["foreign"]), ("Tmpfs", {})):
                with self.subTest(role=role, unsafe=field):
                    info, expected = container_case(role)
                    del info["HostConfig"]["Mounts"]
                    info["HostConfig"][field] = value
                    with self.assertRaises(PairFixtureError):
                        validate_container(info, expected)
        info, expected = container_case("node")
        del info["HostConfig"]["Mounts"]
        with self.assertRaises(PairFixtureError):
            validate_container(info, expected)

    def test_running_cannot_use_created_endpoint_or_missing_running_state(self):
        info, expected = created_case("node")
        expected["phase"] = "running"
        with self.assertRaises(PairFixtureError):
            validate_container(info, expected)
        info, expected = container_case("node")
        del info["State"]
        with self.assertRaises(PairFixtureError):
            validate_container(info, expected)

    def test_created_rejects_started_or_foreign_or_changed_config_and_alias(self):
        changes = [
            (("State", "Status"), "running"), (("State", "Running"), True),
            (("State", "Pid"), 123), (("Name",), "/foreign-name"),
            (("Config", "Labels", LABEL), "foreign-owner"),
            (("Config", "Cmd"), ["sh"]), (("Config", "Env"), ["SECRET_KEY=unexpected"]),
            (("NetworkSettings", "Networks", NETWORK_NAME, "IPAddress"), "172.29.40.4"),
            (("NetworkSettings", "Networks", NETWORK_NAME, "NetworkID"), NETWORK_ID),
            (("NetworkSettings", "Networks", NETWORK_NAME, "Aliases"), ["foreign-node"]),
        ]
        for path, value in changes:
            with self.subTest(path=path):
                info, expected = created_case("node")
                put(info, path, value)
                with self.assertRaises(PairFixtureError):
                    validate_created_container(info, expected)

    def test_partial_creation_cleanup_validates_each_recorded_phase(self):
        daemon = InspectTransport(roles=("postgres", "postgrest"))
        created, expected = created_case("postgrest")
        daemon.containers[REST_ID] = created
        daemon.expected[-1] = expected
        del daemon.network["Containers"][REST_ID]
        del daemon.network_expected["members"][REST_ID]
        resources = OwnedResources(daemon, network=daemon.network_expected, containers=daemon.expected)
        try:
            resources.close()
        except PairFixtureError as exc:
            self.fail("known created and running resources were not safely cleaned: " + str(exc))
        self.assertEqual(daemon.containers, {})
        self.assertIsNone(daemon.network)
        self.assertEqual(resources.absence, {"containers": {PG_ID: True, REST_ID: True}, "network": True})

    def test_created_phase_change_after_preflight_prevents_any_removal(self):
        daemon = InspectTransport(roles=("node",))
        created, expected = created_case("node")
        daemon.containers[NODE_ID] = created
        daemon.expected[0] = expected
        daemon.network["Containers"] = {}
        daemon.network_expected["members"] = {}

        def became_running(current, key, count):
            if key == ("container", NODE_ID) and count == 2:
                current.containers[NODE_ID]["State"]["Running"] = True

        daemon.before_inspect = became_running
        resources = OwnedResources(daemon, network=daemon.network_expected, containers=daemon.expected)
        with self.assertRaises(PairFixtureError):
            resources.close()
        self.assertEqual(daemon.removals, [])
        self.assertGreaterEqual(daemon.inspects.get(("container", NODE_ID), 0), 2)


class ReadinessReviewTests(unittest.TestCase):
    """Transport doubles distinguish the entrypoint socket from final TCP."""

    def factory(self, *, tcp_ready=True):
        pair = PairFactory.__new__(PairFactory)
        pair.pg_image = "postgres:15.8"
        pair.images = {}
        pair.run_id = RUN_ID
        pair.network_name = NETWORK_NAME
        pair.containers = []
        pair.ledger = SimpleNamespace(resolve_image=lambda ref: PINNED_IMAGES[ref], create=lambda *_: NETWORK_ID)
        pair.inspect = lambda *_: network_case(populated=False)[0]
        pair.validate = lambda: None
        pair._create_container = lambda role, *_args, **_kwargs: pair.containers.append(
            {"role": role, "phase": "running", "container_id": PG_ID if role == "postgres" else NODE_ID})
        pair.exec_node = lambda *_: subprocess.CompletedProcess([], 0, "v24.22.3\n", "")
        calls = []

        def transport(args, **kwargs):
            calls.append((args, kwargs))
            tcp = "-h" in args and args[args.index("-h") + 1] == "127.0.0.1"
            available = tcp_ready.pop(0) if isinstance(tcp_ready, list) else tcp_ready
            # An entrypoint Unix socket is already accepting connections.
            return subprocess.CompletedProcess(args, 0 if not tcp or available else 2,
                                               "fixture|150008\n" if not tcp or available else "", "")
        pair.transport = transport
        return pair, calls

    def test_socket_success_does_not_count_as_final_tcp_readiness(self):
        pair, calls = self.factory(tcp_ready=False)
        with patch("pair_fixture.time.monotonic", side_effect=[0, 0, 0, 46]), patch("pair_fixture.time.sleep"):
            with self.assertRaisesRegex(PairFixtureError, "did not become ready"):
                pair.start()
        self.assertEqual(len(calls), 1)

    def test_final_tcp_uses_exact_database_role_and_public_password(self):
        pair, calls = self.factory()
        pair.start()
        args, kwargs = calls[0]
        self.assertIn("-h", args, "readiness still used the entrypoint Unix socket")
        self.assertEqual(args[args.index("-h") + 1], "127.0.0.1")
        self.assertEqual(args[args.index("-U") + 1], "fixture_admin")
        self.assertEqual(args[args.index("-d") + 1], "fixture")
        self.assertIn("PGPASSWORD=" + PUBLIC_PASSWORD, args)
        self.assertLessEqual(kwargs["timeout"], 30)
        self.assertEqual(pair.version, "150008")

    def test_final_tcp_can_become_ready_after_an_initial_refusal(self):
        pair, calls = self.factory(tcp_ready=[False, True])
        with patch("pair_fixture.time.monotonic", side_effect=[0, 0, 0, 1, 1]), patch("pair_fixture.time.sleep"):
            pair.start()
        self.assertEqual(len(calls), 2)
        self.assertTrue(all("-h" in args for args, _ in calls))
        self.assertEqual(pair.version, "150008")


class HelperSourceReviewTests(unittest.TestCase):
    """Only temporary toy Python and pyc files are created by these tests."""

    def exercise(self, *, cached=False, mismatch=False, bytecode_false=False):
        import setup_db
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wallet = root / "scripts/wallet"
            wallet.mkdir(parents=True)
            helper = wallet / "web_payment_fixture.py"
            helper.write_text("VALUE = 'cached'\n" if cached else "VALUE = 'source'\n")
            stamp = helper.stat()
            if cached:
                py_compile.compile(str(helper), doraise=True)
                helper.write_text("VALUE = 'source'\n")
                os.utime(helper, ns=(stamp.st_atime_ns, stamp.st_mtime_ns))
            (wallet / "web_payment_order_fixture.py").write_text("from web_payment_fixture import VALUE\n")
            (wallet / "web_payment_settlement_fixture.py").write_text(
                "from web_payment_fixture import VALUE\n"
                "def settlement_dependencies():\n    raise RuntimeError('toy-source:' + VALUE)\n")
            manifest = {"files": {str(p.relative_to(root)): {"sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                                   for p in wallet.glob("*.py")}}
            if mismatch:
                helper.write_text("VALUE = 'edited'\n")
            caches = {p: p.read_bytes() for p in wallet.rglob("*.pyc")}
            names = ["web_payment_fixture", "web_payment_order_fixture", "web_payment_settlement_fixture"]
            old_path = list(sys.path)
            try:
                with patch.dict(sys.modules):
                    for name in names:
                        sys.modules.pop(name, None)
                    importlib.invalidate_caches()
                    if bytecode_false:
                        sys.dont_write_bytecode = False
                    try:
                        setup_db.setup(None, root, manifest, root, mode="current7")
                    except Exception as exc:
                        self.assertIsInstance(exc, PairFixtureError if mismatch else RuntimeError)
                        self.assertRegex(str(exc), "hash" if mismatch else "toy-source:source")
                    else:
                        self.fail("toy helper did not reach its expected source/hash boundary")
                self.assertEqual({p: p.read_bytes() for p in wallet.rglob("*.pyc")}, caches)
                self.assertIs(sys.dont_write_bytecode, True)
            finally:
                sys.dont_write_bytecode = True
                sys.path[:] = old_path

    def test_source_positive_control(self):
        self.exercise()

    def test_tampered_transitive_cache_cannot_replace_verified_source(self):
        self.exercise(cached=True)

    def test_changed_source_is_rejected_before_helper_execution(self):
        self.exercise(mismatch=True)

    def test_setup_forces_no_bytecode_even_if_caller_disabled_the_flag(self):
        self.exercise(bytecode_false=True)


class RunnerReceiptReviewTests(unittest.TestCase):
    """Exercise main aggregation; all SQL, Docker and child execution is injected."""

    def exercise(self, mode="current7", *, child_exit=0, marker=True, head=None, tamper=False):
        import run as runner
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            logging = root / "logging.json"
            logging.write_text('{"sources":{}}\n')
            node_out = root / ".artifacts/payment-web-order-http/review/node-artifacts"
            fixture = SimpleNamespace(run_id=RUN_ID, images={}, version="150008", network={}, containers=[],
                                      ledger=SimpleNamespace(unknown=[], known={}), uncertain_phase=[],
                                      cleanup=None, start=lambda: None, start_postgrest=lambda: None,
                                      role=lambda _: {"ipv4": "172.29.40.3"}, close=lambda: None)

            def child(_argv, **_kwargs):
                config = json.loads((node_out / "config.json").read_text())
                if tamper:
                    (node_out / "orders-http.cjs").write_text("changed after bundle\n")
                output = "ORDER_HTTP_RESULT " + json.dumps({"guard": {}, "observedDenials": [], "taps": []}) + "\n"
                if marker:
                    output += config["completionMarker"] + "\n"
                return subprocess.CompletedProcess([], child_exit, output, "")
            fixture.exec_node = child
            fixture.sql = lambda *_a, **_kw: subprocess.CompletedProcess([], 0, '{"orders":[]}\norder-http-observer-complete\n', "")

            def process(argv, **_kwargs):
                if argv[0] == "git":
                    return subprocess.CompletedProcess(argv, 0, (head or "a67c927777dfb0f4de18630d7446fde0325eced4") + "\n", "")
                (node_out / "orders-http.cjs").write_text("toy bundle\n")
                return subprocess.CompletedProcess(argv, 0, "", "")

            def hashes(paths):
                return {str(p): runner.PRODUCT.get(str(p.relative_to(root)), "owned-source-hash") for p in paths}

            with ExitStack() as stack:
                for target, value in (("ROOT", root), ("hashes", hashes), ("verify_source", lambda *_: (root, {"sourceCommit": "d" * 40,
                        "dependencySqlSha256": "e" * 64}, {})), ("source_hashes", lambda *_: {}),
                        ("setup", lambda *_a, **_k: {"financialBaseline": {}}), ("PairFactory", lambda *_a, **_k: fixture),
                        ("LocalDocker", lambda *_a: None)):
                    stack.enter_context(patch.object(runner, target, value))
                stack.enter_context(patch.object(runner.subprocess, "run", process))
                exit_code = runner.main(["--postgres-image", "postgres:15.8", "--run-label", "review", "--db-workspace", str(root),
                    "--docker-host", "unix:///toy-socket", "--docker-bin", "/toy-docker", "--node-bin", "/toy-node",
                    "--logging-manifest", str(logging), "--mode", mode])
            receipt = json.loads((node_out.parent / "receipt.json").read_text())
            return exit_code, receipt, hashlib.sha256(logging.read_bytes()).hexdigest()

    def test_diagnostic_marker_is_not_a_final_success_exit(self):
        code, receipt, _ = self.exercise("orders-only1")
        self.assertEqual(code, 3)
        self.assertEqual(receipt["status"], "diagnostic-passed")
        self.assertEqual(receipt["stage"], "completed-diagnostic")
        self.assertIs(receipt["finalEligible"], False)
        self.assertIs(receipt["completed"], True)
        self.assertIs(receipt["observerCompleted"], True)

    def test_current7_success_and_missing_marker_or_child_failure_are_distinct(self):
        for child_exit, marker, expected in ((0, True, 0), (0, False, 1), (9, True, 1)):
            with self.subTest(child_exit=child_exit, marker=marker):
                code, receipt, _ = self.exercise(child_exit=child_exit, marker=marker)
                self.assertEqual(code, expected)
                self.assertIs(receipt["finalEligible"], True)
                self.assertEqual(receipt["nodeExitCode"], child_exit)
                self.assertEqual(receipt["status"], "passed" if expected == 0 else "failed")

    def test_same_head_prefix_cannot_impersonate_the_frozen_commit(self):
        code, receipt, _ = self.exercise(head="a67c927" + "f" * 33)
        self.assertEqual(code, 1)
        self.assertEqual(receipt["stage"], "preflight")
        self.assertEqual(receipt["artifactHashesBefore"], {"orders-http.cjs": None, "network-guard.cjs": None, "config.json": None})
        self.assertEqual(receipt["artifactHashesAfter"], receipt["artifactHashesBefore"])
        self.assertIsNone(receipt["artifactsUnchanged"])

    def test_receipt_records_interpreter_manifest_and_real_artifact_hashes(self):
        code, receipt, manifest_hash = self.exercise()
        self.assertEqual(code, 0)
        self.assertEqual(receipt.get("loggingManifest", {}).get("sha256"), manifest_hash)
        self.assertTrue(Path(receipt["loggingManifest"]["path"]).is_absolute())
        self.assertEqual(receipt["interpreter"]["executable"], sys.executable)
        self.assertEqual(receipt["interpreter"]["version"], sys.version)
        self.assertIs(receipt["interpreter"]["dontWriteBytecode"], True)
        self.assertIn("flags", receipt["interpreter"])
        self.assertIn("argv", receipt["invocation"])
        self.assertEqual(receipt["artifactHashesBefore"]["orders-http.cjs"], hashlib.sha256(b"toy bundle\n").hexdigest())
        self.assertEqual(receipt["artifactHashesBefore"], receipt["artifactHashesAfter"])

    def test_changed_generated_bundle_cannot_report_passed(self):
        code, receipt, _ = self.exercise(tamper=True)
        self.assertEqual(code, 1)
        self.assertIs(receipt["artifactsUnchanged"], False)

    def test_missing_orig_argv_is_unknown_without_losing_the_receipt(self):
        # Python 3.9 startup failed here in the root's actual current7 run.
        # Deletion reproduces attribute absence on newer unit interpreters.
        with patch.object(sys, "orig_argv", None, create=True):
            del sys.orig_argv
            code, receipt, _ = self.exercise()
        self.assertEqual(code, 0)
        self.assertIsNone(receipt["invocation"]["interpreterArgv"])
        self.assertIs(receipt["invocation"]["interpreterArgvAvailable"], False)
        self.assertIn("unavailable", receipt["invocation"]["interpreterArgvUnavailableReason"])
        self.assertEqual(receipt["invocation"]["argv"], sys.argv)
        self.assertEqual(receipt["interpreter"]["executable"], sys.executable)


class GuardTripwireReviewTests(unittest.TestCase):
    def test_resolver_process_and_worker_escapes_are_denied_before_tripwire(self):
        # Root alone runs this subprocess. Each dangerous primitive is first
        # replaced by a throwing tripwire, so the original guard is safe too.
        script = r'''
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const dns = require('node:dns');
const cp = require('node:child_process');
const threads = require('node:worker_threads');
const actions = [];
for (const C of [dns.Resolver, dns.promises.Resolver]) {
  for (const name of Object.getOwnPropertyNames(C.prototype)) {
    if (/^(resolve|reverse)/.test(name) && typeof C.prototype[name] === 'function') {
      C.prototype[name] = () => { throw new Error('TRIPWIRE:dns:' + name); };
      actions.push([C.name + ':' + name, () => Object.create(C.prototype)[name]('example.invalid', () => {})]);
    }
  }
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  cp[name] = () => { throw new Error('TRIPWIRE:process:' + name); };
  actions.push(['process:' + name, () => cp[name]('never-run', [])]);
}
threads.Worker = function() { throw new Error('TRIPWIRE:worker'); };
actions.push(['worker', () => new threads.Worker('never-run')]);
const source = fs.readFileSync(process.argv[1], 'utf8');
vm.runInNewContext(source, { require: name => name === 'node:fs'
  ? { readFileSync: () => JSON.stringify({restIp:'172.29.40.3',restAlias:'order-rest',restPort:3000}) }
  : require(name), globalThis: { fetch: () => {} }, module: { exports: {} }, URL, process });
const failures = [];
for (const [name, action] of actions) {
  try { action(); failures.push(name + ':allowed'); }
  catch (error) { if (!/ORDER_HTTP_NETWORK_DENIED/.test(String(error))) failures.push(name + ':' + error); }
}
assert.deepEqual(failures, []);
console.log('guard-tripwires-complete:' + actions.length);
'''
        node = shutil.which("node")
        self.assertIsNotNone(node, "Root must use the installed Node runtime")
        result = subprocess.run([node, "-e", script, str(Path(__file__).with_name("network-guard.cjs"))],
                                capture_output=True, text=True, timeout=30,
                                env={"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("guard-tripwires-complete:", result.stdout)


if __name__ == "__main__":
    unittest.main()
