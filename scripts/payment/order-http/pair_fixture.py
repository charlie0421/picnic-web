"""Authorization boundary for the isolated PG/PostgREST/Node fixture.

Validators accept only pinned ownership and isolation evidence. They perform
no Docker, filesystem or network operations and never mutate that evidence.
"""

import re
import uuid
from copy import deepcopy
import json
import subprocess
import ipaddress
from pathlib import Path
import time


LABEL = "picnic.web-payment-order-http"


class PairFixtureError(RuntimeError):
    """Isolation or resource identity could not be established."""


def _require(condition, reason):
    if not condition:
        raise PairFixtureError(reason)


def _object(value, description):
    _require(isinstance(value, dict), description + " must be an object")
    return value


def _hex_id(value, description, *, image=False):
    pattern = r"sha256:[0-9a-f]{64}" if image else r"[0-9a-f]{64}"
    _require(isinstance(value, str) and re.fullmatch(pattern, value) is not None,
             description + " must be a full immutable ID")
    return value


def _owner(info, expected):
    _object(info, "inspect result")
    _object(expected, "expected identity")
    run_id = expected.get("run_id")
    try:
        _require(isinstance(run_id, str) and str(uuid.UUID(run_id)) == run_id,
                 "Invalid run UUID")
    except (ValueError, AttributeError) as exc:
        raise PairFixtureError("Invalid run UUID") from exc
    _require(expected.get("label_key") == LABEL, "Unknown ownership label")


def _match_label(labels, expected):
    _require(_object(labels, "ownership labels").get(LABEL) == expected["run_id"],
             "Run ownership mismatch; no deletion authorized")


def _environment(entries):
    _require(isinstance(entries, list), "Environment evidence must be a string list")
    values = {}
    for entry in entries:
        _require(isinstance(entry, str) and "=" in entry and "\x00" not in entry,
                 "Malformed environment entry")
        key, value = entry.split("=", 1)
        _require(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) is not None and key not in values,
                 "Invalid or duplicate environment key")
        values[key] = value
    return values


def _container_configuration(info, expected):
    """Shared immutable configuration; endpoint authorization is phase-specific."""
    _owner(info, expected)
    _require(expected.get("role") in ("postgres", "postgrest", "node"), "Unknown container role")
    cid = _hex_id(expected.get("container_id"), "Expected container ID")
    image = _hex_id(expected.get("image_id"), "Expected platform image ID", image=True)
    network_id = _hex_id(expected.get("network_id"), "Expected network ID")
    _require(info.get("Id") == cid and info.get("Image") == image,
             "Container or platform image identity mismatch; no deletion authorized")
    config = _object(info.get("Config"), "container configuration")
    _match_label(config.get("Labels"), expected)
    _require(info.get("Name") == "/order-http-" + expected["role"] + "-" + expected["run_id"],
             "Owned container name differs")
    if "config" in expected:
        wanted_config = _object(expected["config"], "expected container configuration")
        _require(all(_environment(config.get(key)) == _environment(value) if key == "Env" else config.get(key) == value
                     for key, value in wanted_config.items()),
                 "Container image/command/environment configuration differs")

    host = _object(info.get("HostConfig"), "host configuration")
    name = expected.get("network_name")
    _require(isinstance(name, str) and name == "picnic-order-http-" + expected["run_id"],
             "Unexpected owned network name")
    _require(host.get("NetworkMode") == name, "Container does not use the exact owned network")
    _require("PortBindings" in host and host["PortBindings"] in ({}, None),
             "Requested port publication is forbidden even when Docker exposes no port")
    for key, value in (("PublishAllPorts", False), ("Privileged", False), ("ReadonlyRootfs", True)):
        _require(host.get(key) is value, "Unsafe or missing " + key)
    _require("Binds" in host and "VolumesFrom" in host and host["Binds"] in (None, [])
             and host["VolumesFrom"] in (None, []), "Legacy bind/volume evidence is missing or unsafe")
    _require(host.get("ExtraHosts") in (None, []) and host.get("Dns") in (None, []),
             "Custom host and DNS routes are forbidden")
    for key, expected_key in (("Memory", "memory"), ("NanoCpus", "nano_cpus"), ("PidsLimit", "pids_limit")):
        wanted = expected.get(expected_key)
        _require(type(wanted) is int and wanted > 0 and type(host.get(key)) is int
                 and host[key] == wanted, "Missing or different resource limit: " + key)

    tmpfs = _object(expected.get("tmpfs"), "expected tmpfs")
    allowed_tmpfs = {"/tmp", "/var/lib/postgresql/data", "/var/run/postgresql"} if expected["role"] == "postgres" else {"/tmp"}
    _require(set(tmpfs) == allowed_tmpfs and host.get("Tmpfs") == tmpfs,
             "Missing or additional tmpfs mount or different options")
    mounts = info.get("Mounts")
    wanted_mounts = expected.get("mounts")
    _require(isinstance(mounts, list) and isinstance(wanted_mounts, list), "Invalid mount evidence")
    _require(len(wanted_mounts) == (2 if expected["role"] == "node" else 0),
             "Unexpected role mount count")
    mount_keys = ("Type", "Source", "Destination", "RW", "Propagation")
    observed_mounts = []
    expected_host_mounts = []
    for mount in mounts:
        mount = _object(mount, "mount")
        _require(mount.get("Type") == "bind" and mount.get("RW") is False
                 and mount.get("Propagation") == "rprivate", "Writable, shared or unexpected mount")
        observed_mounts.append({key: mount.get(key) for key in mount_keys})
    for mount in wanted_mounts:
        mount = _object(mount, "expected mount")
        _require(mount.get("Type") == "bind" and mount.get("RW") is False
                 and mount.get("Propagation") == "rprivate", "Invalid expected readonly mount")
        expected_host_mounts.append({"Type": "bind", "Source": mount.get("Source"),
                                    "Target": mount.get("Destination"), "ReadOnly": True})
    _require(observed_mounts == wanted_mounts, "Readonly artifact/dependency mounts do not match")
    if wanted_mounts:
        _require({m["Destination"] for m in wanted_mounts} == {"/fixture", "/deps/node_modules"},
                 "Only fixture artifacts and installed dependencies may be mounted")
    host_mounts = host.get("Mounts")
    if host_mounts is None and expected["role"] in ("postgres", "postgrest") and not mounts and not wanted_mounts:
        # Root mount-field-presence.json proves the key is absent, while the
        # observed top-level Mounts and explicit Binds/VolumesFrom are empty.
        # Only this PG/REST no-bind case accepts absent/null; Node never does.
        host_mounts = []
    _require(isinstance(host_mounts, list) and len(host_mounts) == len(expected_host_mounts),
             "Requested mount evidence is missing or has extra mounts")
    for mount, wanted in zip(host_mounts, expected_host_mounts):
        mount = _object(mount, "requested mount")
        _require(all(mount.get(key) == value for key, value in wanted.items())
                 and mount.get("ReadOnly") is True, "Requested mount differs from observed readonly mount")

    settings = _object(info.get("NetworkSettings"), "network settings")
    ports = _object(settings.get("Ports"), "actual port bindings")
    _require(all(value is None or value == [] for value in ports.values()), "Actual host port publication is forbidden")
    networks = _object(settings.get("Networks"), "container networks")
    _require(set(networks) == {name}, "A container must have exactly one owned network")
    endpoint = _object(networks[name], "network endpoint")
    _require(endpoint.get("GlobalIPv6Address") == "" and endpoint.get("GlobalIPv6PrefixLen") == 0
             and endpoint.get("IPv6Gateway") == "", "IPv6 must be absent")
    alias = expected.get("alias")
    aliases = endpoint.get("Aliases")
    _require(isinstance(alias, str) and bool(alias) and isinstance(aliases, list)
             and alias in aliases, "The owned service alias is missing")
    return endpoint, network_id


def _container_state(info, phase):
    state = _object(info.get("State"), "container state")
    _require(state.get("Status") == phase and state.get("Running") is (phase == "running")
             and state.get("Paused") is False and state.get("Restarting") is False
             and state.get("Dead") is False and state.get("ExitCode") == 0
             and state.get("Error") == "", "Missing or changed container phase")
    pid = state.get("Pid")
    _require(type(pid) is int and (pid > 0 if phase == "running" else pid == 0), "Container PID differs from its phase")


def validate_container(info, expected):
    """Authorize a running container with the exact pinned network endpoint."""
    endpoint, network_id = _container_configuration(info, expected)
    _require(expected.get("phase", "running") == "running", "Running validation requires a running record")
    _container_state(info, "running")
    endpoint_id = _hex_id(expected.get("endpoint_id"), "Expected endpoint ID")
    _require(endpoint.get("NetworkID") == network_id and endpoint.get("EndpointID") == endpoint_id,
             "Network or endpoint identity mismatch")
    _require(isinstance(expected.get("ipv4"), str) and bool(expected["ipv4"])
             and endpoint.get("IPAddress") == expected["ipv4"], "Unexpected internal IPv4 address")


def validate_network(info, expected):
    """Authorize the exact internal bridge and its complete endpoint set."""
    _owner(info, expected)
    network_id = _hex_id(expected.get("network_id"), "Expected network ID")
    name = expected.get("network_name")
    _require(isinstance(name, str) and name == "picnic-order-http-" + expected["run_id"],
             "Unexpected owned network name")
    _require(info.get("Id") == network_id and info.get("Name") == name,
             "Network identity mismatch; no deletion authorized")
    _match_label(info.get("Labels"), expected)
    _require(info.get("Driver") == "bridge" and info.get("Scope") == "local", "Only a local bridge is allowed")
    for key, value in (("Internal", True), ("EnableIPv6", False), ("Attachable", False), ("Ingress", False)):
        _require(info.get(key) is value, "Unsafe or missing network field: " + key)
    _require(info.get("Options") in ({}, {"com.docker.network.enable_ipv4": "true", "com.docker.network.enable_ipv6": "false"}),
             "Network options and masquerade exceptions are forbidden")
    ipam = _object(info.get("IPAM"), "IPAM")
    _require(ipam.get("Driver") == "default" and ipam.get("Options") in (None, {}), "Unexpected IPAM configuration")
    _require(isinstance(expected.get("subnet"), str) and isinstance(expected.get("gateway"), str)
             and ipam.get("Config") == [{"Subnet": expected["subnet"], "Gateway": expected["gateway"]}],
             "Network subnet/gateway configuration differs")
    members = _object(info.get("Containers"), "network members")
    wanted_members = _object(expected.get("members"), "expected network members")
    _require(set(members) == set(wanted_members), "Missing or foreign network member; no deletion authorized")
    for cid, wanted in wanted_members.items():
        _hex_id(cid, "Member container ID")
        wanted = _object(wanted, "expected member")
        member = _object(members[cid], "network member")
        _hex_id(wanted.get("EndpointID"), "Expected member endpoint ID")
        _require(all(isinstance(wanted.get(key), str) and member.get(key) == wanted[key]
                     for key in ("Name", "EndpointID", "IPv4Address", "IPv6Address")),
                 "Network member identity/address differs")
        _require(wanted["IPv6Address"] == "", "Member IPv6 must be absent")


class OwnedResources:
    """Revalidate and remove only exact resources recorded after creation.

    The transport accepts Docker arguments and timeout=30. This class never
    discovers deletion targets by label, name, shortened ID or global listing.
    """

    def __init__(self, transport, *, network, containers):
        self.transport = transport
        self.network = deepcopy(network)
        self.containers = deepcopy(containers)
        self.absence = {"containers": {row.get("container_id"): None for row in self.containers}, "network": None}
        self.cleanup_error = None

    def _call(self, args):
        try:
            result = self.transport(args, timeout=30)
        except (OSError, TimeoutError) as exc:
            raise PairFixtureError("Owned resource command failed: " + " ".join(args[:2])) from exc
        _require(type(result.returncode) is int and result.returncode == 0,
                 "Owned resource command failed: " + " ".join(args[:2]) + " exit=" + str(result.returncode))
        return result

    def _inspect(self, kind, resource_id):
        result = self._call([kind, "inspect", resource_id])
        try:
            rows = json.loads(result.stdout)
        except (TypeError, ValueError) as exc:
            raise PairFixtureError("Invalid resource inspection; no deletion authorized") from exc
        _require(isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict),
                 "Ambiguous resource inspection; no deletion authorized")
        return rows[0]

    def _ledger(self):
        _object(self.network, "recorded network identity")
        _owner({}, self.network)
        _hex_id(self.network.get("network_id"), "Recorded network ID")
        members = _object(self.network.get("members"), "recorded network members")
        cids = []
        running_cids = []
        for row in self.containers:
            _object(row, "recorded container identity")
            _hex_id(row.get("container_id"), "Recorded container ID")
            _hex_id(row.get("image_id"), "Recorded platform image ID", image=True)
            _require(row.get("run_id") == self.network["run_id"]
                     and row.get("network_id") == self.network["network_id"]
                     and row.get("network_name") == self.network.get("network_name"),
                     "Container ledger belongs to another run or network")
            cids.append(row["container_id"])
            phase = row.get("phase", "running")
            _require(phase in ("created", "running"), "Unknown recorded container phase")
            if phase == "running":
                running_cids.append(row["container_id"])
        _require(len(set(cids)) == len(cids) and set(running_cids) == set(members),
                 "Incomplete or duplicate resource ledger; no deletion authorized")

    def _validate_container(self, row):
        info = self._inspect("container", row["container_id"])
        if row.get("phase", "running") == "created":
            validate_created_container(info, row)
        else:
            validate_container(info, row)

    def _absence_query(self, kind, resource_id):
        _hex_id(resource_id, "Absence query ID")
        args = [kind, "ls"]
        if kind == "container":
            args.append("--all")
        args += ["--no-trunc", "--filter", "id=" + resource_id, "--format", "{{.ID}}"]
        output = self._call(args).stdout
        _require(isinstance(output, str), "Invalid absence query result")
        ids = output.splitlines()
        _require(ids == [] or ids == [resource_id], "Ambiguous absence query result")
        return not ids

    def _observe_absence(self):
        # Each exact ID gets its own successful query. A daemon/parse error
        # remains None, even if a preceding rm reported success.
        for cid in self.absence["containers"]:
            self.absence["containers"][cid] = None
            try:
                self.absence["containers"][cid] = self._absence_query("container", cid)
            except Exception:
                pass
        self.absence["network"] = None
        try:
            self.absence["network"] = self._absence_query("network", self.network.get("network_id"))
        except Exception:
            pass

    def close(self):
        self.cleanup_error = None
        try:
            self._ledger()
            # Preflight the whole set before any destructive command. A
            # single unknown/foreign resource leaves the entire set intact.
            validate_network(self._inspect("network", self.network["network_id"]), self.network)
            for row in self.containers:
                self._validate_container(row)
            remaining = deepcopy(self.network)
            for row in reversed(self.containers):
                # Pin ownership and endpoint membership again immediately
                # before deleting this exact immutable CID.
                validate_network(self._inspect("network", remaining["network_id"]), remaining)
                self._validate_container(row)
                self._call(["container", "rm", "--force", "--volumes", row["container_id"]])
                if row.get("phase", "running") == "running":
                    del remaining["members"][row["container_id"]]
            validate_network(self._inspect("network", remaining["network_id"]), remaining)
            self._call(["network", "rm", remaining["network_id"]])
        except Exception as exc:
            self.cleanup_error = exc
            if not isinstance(exc, PairFixtureError):
                self.cleanup_error = PairFixtureError("Owned resource cleanup failed")
                self.cleanup_error.__cause__ = exc
        finally:
            self._observe_absence()
        if self.cleanup_error is not None:
            raise self.cleanup_error
        if self.absence["network"] is not True or any(value is not True for value in self.absence["containers"].values()):
            self.cleanup_error = PairFixtureError("Owned resource absence was not established")
            raise self.cleanup_error

    def run(self, operation):
        """Keep the original exception and traceback when cleanup also fails."""
        try:
            result = operation()
        except BaseException:
            try:
                self.close()
            except BaseException as cleanup_error:
                self.cleanup_error = cleanup_error
            raise
        self.close()
        return result


class CreationLedger:
    """Pin local platform images and retain uncertain create results."""

    def __init__(self, transport, *, run_id):
        self.transport = transport
        self.run_id = run_id
        self.known = {"container": [], "network": []}
        self.unknown = []
        self.images = {}

    def resolve_image(self, reference):
        try:
            result = self.transport(["image", "inspect", reference], timeout=30)
            _require(result.returncode == 0, "Required cached image is unavailable; no pull allowed")
            rows = json.loads(result.stdout)
            _require(isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict),
                     "Ambiguous local image inspection")
            image_id = _hex_id(rows[0].get("Id"), "Local platform image ID", image=True)
            self.images[reference] = rows[0]
            return image_id
        except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
            raise PairFixtureError("Local image inspection failed; no pull allowed") from exc

    def create(self, kind, args):
        _require(kind in self.known and list(args[:2]) == [kind, "create"], "Unsupported resource creation")
        unknown = {"kind": kind, "exitCode": None, "runId": self.run_id}
        try:
            result = self.transport(args, timeout=30)
            unknown["exitCode"] = result.returncode
            _require(result.returncode == 0, "Resource creation failed; possible residual resource")
            resource_id = _hex_id(result.stdout.strip(), "Returned creation ID")
        except Exception as exc:
            unknown["error"] = type(exc).__name__
            self.unknown.append(unknown)
            if isinstance(exc, PairFixtureError):
                raise
            raise PairFixtureError("Creation result is unknown; no retry or guessed cleanup allowed") from exc
        self.known[kind].append(resource_id)
        return resource_id


def validate_created_container(info, expected):
    """Authorize an exact created CID, without treating it as connected."""
    endpoint, _ = _container_configuration(info, expected)
    _require(expected.get("phase") == "created", "Created validation requires an explicit created record")
    config = _object(expected.get("config"), "expected created configuration")
    _require({"Image", "Cmd", "Env"}.issubset(config), "Created configuration evidence is incomplete")
    _container_state(info, "created")
    _require(all(endpoint.get(key) == "" for key in ("NetworkID", "EndpointID", "IPAddress", "Gateway"))
             and endpoint.get("IPPrefixLen") == 0, "Created container is already connected or endpoint evidence is missing")


PINNED_IMAGES = {
    "postgres:15.8": "sha256:eb3747f5d0a92195ca486d2f15d9a4ee5e9461b0332fe87fbc59069490a5c659",
    "postgres:17.6": "sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929",
    "public.ecr.aws/supabase/postgrest:v14.8": "sha256:4173b72e0be29cf15349dc827798c3e464c5f2cc7f9c1697022f9cd1874b4c36",
    "node@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54": "sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54",
}
REST_IMAGE = "public.ecr.aws/supabase/postgrest:v14.8"
NODE_IMAGE = next(key for key in PINNED_IMAGES if key.startswith("node@"))
PUBLIC_PASSWORD = "public-fixture-only"
PUBLIC_JWT_SECRET = "public-order-http-fixture-hs256-secret-not-a-credential"


class PairFactory:
    """One owned internal bridge, pinned PG/PostgREST and a Node keepalive.

    The host supplies the transport. SQL and the HTTP child run only after
    every execution target passes a fresh running-phase validation.
    """

    def __init__(self, transport, *, pg_image, artifact_dir, modules_dir):
        _require(pg_image in ("postgres:15.8", "postgres:17.6"), "Unsupported PostgreSQL image")
        self.transport = transport
        self.pg_image = pg_image
        self.run_id = str(uuid.uuid4())
        self.network_name = "picnic-order-http-" + self.run_id
        self.artifact_dir = Path(artifact_dir).resolve(strict=True)
        self.modules_dir = Path(modules_dir).resolve(strict=True)
        root = Path(__file__).resolve().parents[3]
        _require(self.artifact_dir.is_relative_to(root / ".artifacts/payment-web-order-http")
                 and self.artifact_dir.name == "node-artifacts", "Only owned Node artifacts may be mounted")
        _require(self.modules_dir == (root / "node_modules").resolve(strict=True)
                 and self.modules_dir.is_dir(), "Only the installed node_modules may be mounted")
        self.ledger = CreationLedger(transport, run_id=self.run_id)
        self.network = None
        self.containers = []
        self.images = {}
        self.cleanup = None
        self.uncertain_phase = []

    def command(self, args, *, timeout=30, input=None, check=True):
        result = self.transport(args, timeout=timeout, **({"input": input} if input is not None else {}))
        if check:
            _require(result.returncode == 0, "Fixture command failed: " + " ".join(args[:2]) + " exit=" + str(result.returncode))
        return result

    def inspect(self, kind, resource_id):
        result = self.command([kind, "inspect", resource_id])
        try:
            rows = json.loads(result.stdout)
        except (ValueError, TypeError) as exc:
            raise PairFixtureError("Invalid owned inspect result") from exc
        _require(isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict), "Ambiguous owned inspect result")
        return rows[0]

    def validate(self):
        _require(self.network is not None and not self.uncertain_phase and not self.ledger.unknown,
                 "Unknown resource or phase prevents execution")
        validate_network(self.inspect("network", self.network["network_id"]), self.network)
        for row in self.containers:
            if row["phase"] == "created":
                validate_created_container(self.inspect("container", row["container_id"]), row)
            else:
                validate_container(self.inspect("container", row["container_id"]), row)

    def _create_container(self, role, reference, env, *, cmd=None):
        self.validate()
        alias = {"postgres": "order-pg", "postgrest": "order-rest", "node": "order-node"}[role]
        image = self.images[reference]
        image_config = self.ledger.images[reference]["Config"]
        tmpfs = {"/tmp": "rw,noexec,nosuid,size=67108864"}
        if role == "postgres":
            tmpfs.update({"/var/lib/postgresql/data": "rw,nosuid,size=268435456",
                          "/var/run/postgresql": "rw,noexec,nosuid,size=16777216"})
        mounts = []
        if role == "node":
            mounts = [{"Type": "bind", "Source": str(source), "Destination": dest, "RW": False, "Propagation": "rprivate"}
                      for source, dest in ((self.artifact_dir, "/fixture"), (self.modules_dir, "/deps/node_modules"))]
        args = ["container", "create", "--pull", "never", "--name", "order-http-" + role + "-" + self.run_id,
                "--network", self.network_name, "--network-alias", alias, "--label", LABEL + "=" + self.run_id,
                "--memory", "536870912", "--cpus", "1", "--pids-limit", "128", "--read-only"]
        for target, options in tmpfs.items():
            args += ["--tmpfs", target + ":" + options]
        for mount in mounts:
            _require("," not in mount["Source"], "Mount paths containing commas are unsupported")
            args += ["--mount", "type=bind,src=" + mount["Source"] + ",dst=" + mount["Destination"] + ",readonly"]
        for key, value in env.items():
            args += ["-e", key + "=" + value]
        args += [image, *(cmd or [])]
        cid = self.ledger.create("container", args)
        expected_env = [key + "=" + value for key, value in env.items()]
        expected_env += [item for item in image_config.get("Env", []) if item.split("=", 1)[0] not in env]
        row = {"role": role, "container_id": cid, "run_id": self.run_id, "label_key": LABEL,
               "image_id": image, "network_id": self.network["network_id"], "network_name": self.network_name,
               "alias": alias, "mounts": mounts, "tmpfs": tmpfs, "memory": 536870912, "nano_cpus": 1000000000,
               "pids_limit": 128, "phase": "created",
               "config": {"Image": image, "Cmd": cmd or image_config.get("Cmd"),
                          "Env": expected_env}}
        # Retain exact known CID even if its configuration inspection fails.
        self.containers.append(row)
        validate_created_container(self.inspect("container", cid), row)
        validate_network(self.inspect("network", self.network["network_id"]), self.network)
        try:
            self.command(["container", "start", cid])
            info = self.inspect("container", cid)
            endpoint = info["NetworkSettings"]["Networks"][self.network_name]
            running = {**row, "phase": "running", "endpoint_id": endpoint["EndpointID"], "ipv4": endpoint["IPAddress"]}
            subnet = ipaddress.IPv4Network(self.network["subnet"])
            _require(ipaddress.IPv4Address(running["ipv4"]) in subnet, "Running endpoint is outside the owned subnet")
            validate_container(info, running)
            network = self.inspect("network", self.network["network_id"])
            member = network["Containers"][cid]
            _require(member.get("Name") == info["Name"].removeprefix("/")
                     and member.get("EndpointID") == running["endpoint_id"]
                     and member.get("IPv4Address") == running["ipv4"] + "/" + str(subnet.prefixlen),
                     "Running member does not match the created container")
            candidate_network = deepcopy(self.network)
            candidate_network["members"][cid] = deepcopy(member)
            validate_network(network, candidate_network)
        except BaseException:
            self.uncertain_phase.append(cid)
            raise
        row.update(running)
        self.network = candidate_network
        return row

    def start(self):
        for reference in (self.pg_image, REST_IMAGE, NODE_IMAGE):
            image_id = self.ledger.resolve_image(reference)
            _require(image_id == PINNED_IMAGES[reference], "Cached platform image differs from the approved image")
            self.images[reference] = image_id
        nid = self.ledger.create("network", ["network", "create", "--internal", "--label", LABEL + "=" + self.run_id, self.network_name])
        raw = self.inspect("network", nid)
        config = raw.get("IPAM", {}).get("Config", [])
        _require(isinstance(config, list) and len(config) == 1, "Owned bridge needs one IPv4 subnet")
        subnet = ipaddress.IPv4Network(config[0]["Subnet"])
        _require(subnet.is_private and ipaddress.IPv4Address(config[0]["Gateway"]) in subnet, "Unsafe bridge address range")
        self.network = {"network_id": nid, "network_name": self.network_name, "run_id": self.run_id,
                        "label_key": LABEL, "members": {}, "subnet": str(subnet), "gateway": config[0]["Gateway"]}
        validate_network(raw, self.network)
        self._create_container("postgres", self.pg_image, {"POSTGRES_USER": "fixture_admin", "POSTGRES_DB": "fixture", "POSTGRES_PASSWORD": PUBLIC_PASSWORD})
        self._create_container("node", NODE_IMAGE, {"NODE_PATH": "/deps/node_modules", "NODE_ENV": "test"}, cmd=["node", "-e", "setInterval(() => {}, 1000)"])
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            ready = self.sql("select current_database(),current_setting('server_version_num');", check=False,
                             timeout=min(30, max(.1, deadline - time.monotonic())), tcp=True)
            if ready.returncode == 0:
                expected_version = "150008" if self.pg_image == "postgres:15.8" else "170006"
                _require(ready.stdout.strip() == "fixture|" + expected_version, "Wrong database or actual PostgreSQL version")
                self.version = expected_version
                break
            time.sleep(.2)
        else:
            raise PairFixtureError("Owned PostgreSQL did not become ready within 45 seconds")
        node = self.exec_node(["node", "--version"])
        _require(node.stdout.strip() == "v24.22.3", "Unexpected Node runtime version")
        return self

    def role(self, role):
        rows = [row for row in self.containers if row["role"] == role]
        _require(len(rows) == 1 and rows[0]["phase"] == "running", "Missing running execution target: " + role)
        return rows[0]

    def sql(self, text, *, user="fixture_admin", check=True, timeout=30, tcp=False):
        _require(user in ("fixture_admin", "postgres"), "Unknown fixture SQL role")
        _require(not tcp or user == "fixture_admin", "TCP readiness requires the fixture administrator")
        self.validate()
        cid = self.role("postgres")["container_id"]
        return self.command(["exec", "-i", "-e", "PGOPTIONS=-c statement_timeout=15000 -c lock_timeout=1000 -c plpgsql.check_asserts=on",
                             *(["-e", "PGPASSWORD=" + PUBLIC_PASSWORD] if tcp else []),
                             cid, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
                             *(["-h", "127.0.0.1", "-p", "5432", "-w"] if tcp else []), "-U", user, "-d", "fixture"],
                            input=text, check=check, timeout=timeout)

    def start_postgrest(self):
        self._create_container("postgrest", REST_IMAGE, {
            "PGRST_DB_URI": "postgres://authenticator:" + PUBLIC_PASSWORD + "@order-pg:5432/fixture",
            "PGRST_DB_SCHEMAS": "public", "PGRST_DB_ANON_ROLE": "anon", "PGRST_JWT_SECRET": PUBLIC_JWT_SECRET,
            "PGRST_SERVER_HOST": "0.0.0.0", "PGRST_SERVER_PORT": "3000", "PGRST_DB_POOL": "1", "PGRST_LOG_LEVEL": "warn"})
        self.validate()
        result = self.command(["exec", self.role("postgrest")["container_id"], "postgrest", "--version"])
        _require(re.search(r"\b14\.8\b", result.stdout + result.stderr) is not None, "Wrong actual PostgREST version")

    def exec_node(self, argv, *, check=True):
        self.validate()
        return self.command(["exec", self.role("node")["container_id"], *argv], check=check)

    def close(self):
        # An uncertain create/start may leave an unrecorded member. Never
        # replace strict preflight with a name or label cleanup search.
        if self.network is None:
            _require(not any(self.ledger.known.values()) and not self.ledger.unknown,
                     "Unknown/unfinished network creation; resources preserved")
            return
        self.cleanup = OwnedResources(self.transport, network=self.network, containers=self.containers)
        self.cleanup.close()
        _require(not self.ledger.unknown and not self.uncertain_phase, "Uncertain creation/phase remains recorded")
