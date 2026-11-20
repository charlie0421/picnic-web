"""Unit contracts for the H1 intake-hold HTTP runner (validator, children, reducer).

Run with: python3 -I -B scripts/payment/intake-hold-http/test_run.py

Scope. These fixtures exercise the manifest validator, the owned child
lifecycle and the evidence reducer through isolated inputs and injected
boundaries. They are not SQL, PostgREST, provider or native commit proof. A
fixture ACK is delivery evidence only.

Checkpoints. A missing or unloadable run.py is a setup checkpoint, not a
behavior failure. A0SetupCheckpointTests reports exactly one of
H1_IMPLEMENTATION_ABSENT, H1_SUBJECT_LOAD_FAILED or H1_INTERFACE_ABSENT, and
every subject test is skipped with that same code. A1PairFixtureControlTests
runs the real order-http pair validators and needs no run.py.

Each test docstring names the wrong runner behavior that the test must detect.
"""

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest

sys.dont_write_bytecode = True

HERE = Path(__file__).absolute().parent
ROOT = HERE.parents[2]
SUBJECT_PATH = HERE / "run.py"
PAIR_PATH = ROOT / "scripts/payment/order-http/pair_fixture.py"
PAIR_SHA256 = "a194d142b57a199efa27f33ef78f9aa5ac2886f772d73defdef5848d6ee92a16"
REQUIRED_INTERFACE = ("BoundaryError", "build_manifest", "verify_manifest", "OwnedChildren",
                      "reduce_evidence", "persistable_report", "main")


class Code:
    """Error codes in one place. The approved plan fixes only the first two names."""
    PREFIX = "CONTRACT_PREFIX_MISMATCH"
    SOURCE = "SOURCE_DRIFT"
    MANIFEST_HASH = "MANIFEST_HASH"
    MANIFEST_DUPLICATE = "MANIFEST_DUPLICATE"
    MANIFEST_SET = "MANIFEST_SET"
    HEAD = "HEAD_DRIFT"
    SDK = "SDK_BUNDLE"
    IMAGE = "IMAGE_ID"
    RESOURCE = "RESOURCE_IDENTITY"
    CLEANUP = "CLEANUP_UNPROVEN"
    OWNERSHIP = "CHILD_OWNERSHIP"
    NOT_REAPED = "CHILD_NOT_REAPED"
    EXIT_FAILED = "CHILD_EXIT_FAILED"
    RESTART = "RESTART_UNPROVEN"
    UNOBSERVED = "COMMIT_UNOBSERVED"
    OBSERVER = "OBSERVER_MISMATCH"
    READ_ORDER = "PROTECTED_READ_ORDER"
    CAPTURE = "CAPTURE_DUPLICATE"
    REQUEST = "UNEXPECTED_REQUEST"
    SECRET = "SECRET_LEAK"
    # Accepted by the coordinator after the first list (msg_84f682d1fc18).
    CASE_SET = "CASE_SET_MISMATCH"  # the case list differs from the approved phase list
    CAPTURE_COUNT = "CAPTURE_COUNT_MISMATCH"  # a required capture POST is missing


def load_subject():
    """Return (module, checkpoint, detail). Absence and load errors are setup only."""
    if not SUBJECT_PATH.is_file():
        return None, "H1_IMPLEMENTATION_ABSENT", "missing " + str(SUBJECT_PATH.relative_to(ROOT))
    module = types.ModuleType("intake_hold_http_unit_subject")
    module.__file__ = str(SUBJECT_PATH)
    module.__spec__ = importlib.util.spec_from_loader(module.__name__, None, origin=str(SUBJECT_PATH))
    sys.modules[module.__name__] = module
    try:
        exec(compile(SUBJECT_PATH.read_bytes(), str(SUBJECT_PATH), "exec"), module.__dict__)
    except (Exception, SystemExit) as exc:
        sys.modules.pop(module.__name__, None)
        return None, "H1_SUBJECT_LOAD_FAILED", type(exc).__name__ + ": " + str(exc)
    missing = [name for name in REQUIRED_INTERFACE if not callable(getattr(module, name, None))]
    if missing:
        return None, "H1_INTERFACE_ABSENT", "missing callables: " + ", ".join(missing)
    return module, None, ""


subject, CHECKPOINT, CHECKPOINT_DETAIL = load_subject()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def done(args, code, stdout="", stderr=""):
    return subprocess.CompletedProcess(args, code, stdout, stderr)


# ---------------------------------------------------------------------------
# Independent literals
# ---------------------------------------------------------------------------

RUN_ID = "0b6f7c1e-5d2a-4c3b-9e8f-1a2b3c4d5e6f"
FOREIGN_RUN_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
PAIR_LABEL = "picnic.web-payment-order-http"
NET_NAME = "picnic-order-http-" + RUN_ID
NID = "4" * 64
CID_PG, CID_REST, CID_NODE = "1" * 64, "2" * 64, "3" * 64
IMAGES = {
    "postgres:15.8": "sha256:eb3747f5d0a92195ca486d2f15d9a4ee5e9461b0332fe87fbc59069490a5c659",
    "postgres:17.6": "sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929",
    "public.ecr.aws/supabase/postgrest:v14.8": "sha256:4173b72e0be29cf15349dc827798c3e464c5f2cc7f9c1697022f9cd1874b4c36",
    "node@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54":
        "sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54",
}
REST_REFERENCE = "public.ecr.aws/supabase/postgrest:v14.8"

WEB_HEAD = "1234567890abcdef1234567890abcdef12345678"
DB_HEAD = "abcdef1234567890abcdef1234567890abcdef12"
DB_PRODUCT_COMMIT = "fedcba0987654321fedcba0987654321fedcba09"
KIT_PATH = "supabase/prod-cutover/2026-11-17-web-payment-reconciliation-cron/kit.html"
MIGRATION_DIR = "supabase/migrations/"
# Ordered current10 followed by M1-M5.
CONTRACT_PREFIX = tuple(MIGRATION_DIR + name for name in (
    "20261111224520_web_payment_order_contract.sql",
    "20261112071844_web_payment_charge_lease.sql",
    "20261112081856_web_payment_provider_observation.sql",
    "20261112094913_web_payment_purchase_intake.sql",
    "20261112113100_web_payment_verification_binding.sql",
    "20261112124327_web_payment_verification_result.sql",
    "20261112145247_web_payment_settlement.sql",
    "20261114015304_web_payment_charge_gate.sql",
    "20261115075731_web_payment_provider_binding_read.sql",
    "20261115122716_web_payment_provider_entry.sql",
    "20261117035820_web_payment_durability_ledger.sql",
    "20261117051844_web_payment_submission_results.sql",
    "20261117070424_web_payment_intake_admission.sql",
    "20261117093017_web_payment_reconciliation_queue.sql",
    "20261117120247_web_payment_absence_release.sql",
))
# Selected dependency sources. They are handled separately from the prefix.
DEPENDENCY_SOURCES = tuple(MIGRATION_DIR + name + ".sql" for name in """
20260425161337_baseline_squash
20260611084709_item2_harden_server_only_and_admin_tables
20260710122952_bonus_expiry_single_clock
20260721090000_wallet_core_roles_types
20260721090500_wallet_core_operation_schema
20260721091000_wallet_core_locks_and_credit
20260721091500_wallet_core_bonus_strictness
20260721092500_wallet_core_cotton_schema
20260721093000_wallet_core_cotton_commands
20260721095000_wallet_core_app_reads
20260721095500_wallet_core_release_gates
20260721100000_wallet_promotion_reason_enums
20260721100500_wallet_inbox_audit_alert_schema
20260721101000_promotion_campaign_schema
20260721101500_purchase_reward_schema
20260721102000_wallet_recovery_debt_schema
20260721102500_wallet_debit_repair_schema
20260721103000_wallet_debt_aware_credit
20260721103500_purchase_settlement_commands
20260721104000_purchase_promotion_commands
20260721104500_purchase_refund_commands
20260721105000_wallet_admin_read_rpcs
20260721105500_wallet_admin_command_rpcs
20260721110000_wallet_admin_rbac_and_direct_writer_lockdown
20260721110500_wallet_ops_cron_jobs
20260721111000_wallet_account_anonymization
20260721111500_wallet_promotion_release_gates
20260723021059_align_promotion_surface_contract
20260723023056_harden_promotion_surface_release
20260730120000_wallet_purchase_backlog_alerts_and_dead_retry
20260730150000_purchase_intake_idempotent_replay
20260816120000_vote_v3_linear_bulk_spend
20260821100000_promotion_schedule_v2_schema
20260821103000_promotion_schedule_v2_evaluator_and_math
20260821110000_promotion_schedule_v2_read_rpc
20260821113000_promotion_schedule_v2_admin_read_rpcs
20260821123000_promotion_schedule_v2_grant_snapshot
20260824051000_purchase_analytics_snapshot
20260824060000_purchase_analytics_grant
20260831120000_google_pending_purchase_retry_policy
20260908031648_promotion_v2_rollout_audience
20260909081000_wallet_ops_heartbeat_resolve_adoption
20260909172800_wallet_admin_command_expiry_and_null_safety
20260914070000_wallet_dead_alert_expected_codes
20261019053525_refund_resolver_lock_order
20261022024905_receipts_star_candy_history_rls
20261023023001_enable_user_profiles_rls
20261023073744_purchase_intake_cross_environment_guard
20261028120000_refund_abuse_evaluation
20261029130915_star_lot_ledger
20261102162000_bonus_history_rls
20261105010100_admin_cotton_adjust_permissions
""".split())
DEPENDENCY_SQL_SHA256 = "3541458c927ab4186c2e4da5019016658971b6ee5cc289d956408baad4a6be38"
QUEUE_DEPENDENCY_SQL_SHA256 = "4bbb64e54d0c545220b774aadad5d9addaa275e293988ac65c7ac906c8c3b304"

H1_DIR = "scripts/payment/intake-hold-http/"
CHARGE_DIR = "lib/payment/paypal-charge/"
# Required minimum of named web source pins: the H1 owned paths, the W1-W3
# product modules and the build configuration. The H1 product stage validates
# the actual transitive bundle and native setup closure separately.
WEB_SOURCES = (
    *(H1_DIR + name for name in ("run.py", "test_run.py", "bundle.mjs", "guard.cjs", "seed.sql",
                                 "observer.sql", "faults.sql")),
    "__tests__/integration/payment/intake-hold-postgrest.http.ts",
    *(CHARGE_DIR + name + ".ts" for name in (
        "binding-source", "durability-contract", "orchestrator", "protocol", "provider-entry", "read-cycle",
        "reconciliation-entry", "reconciliation-executor", "reconciliation-repository", "repository",
        "submission-classification", "transport")),
    "app/api/internal/payment/paypal-reconciliation/route.ts",
    "utils/log-event-codes.ts", "types/supabase.ts", "package.json", "package-lock.json", "tsconfig.json",
)
REUSE_SOURCES = ("scripts/payment/order-http/pair_fixture.py", "scripts/payment/order-http/setup_db.py")
SDK_VERSION = "2.112.3"
SDK_FILES = {
    "@supabase/supabase-js": ("node_modules/@supabase/supabase-js/package.json",
                              "node_modules/@supabase/supabase-js/dist/index.cjs"),
    "@supabase/postgrest-js": ("node_modules/@supabase/postgrest-js/package.json",
                               "node_modules/@supabase/postgrest-js/dist/index.cjs"),
}

CANONICAL_CASES = ["first_completed", "eligible_no_response", "actual_facts", "observed_id_matrix"]
FAULT_CASES = ["kill_before_p1", "p1_before_commit", "p1_ack_loss", "restart_xy", "kill_before_complete",
               "complete_ack_loss", "nth_fact_failure", "conflict_and_late"]
P1 = "record_web_payment_submission_result"
P2_OPEN = "open_web_payment_read_cycle"
P2_COMPLETE = "complete_web_payment_read_cycle"
ORDERS = {name: "c0ffee00-0000-4000-8000-0000000000" + format(index, "02d")
          for index, name in enumerate((*CANONICAL_CASES, *FAULT_CASES), 1)}
TOKEN = "unit-cycle-token-7f3a91"
CREDENTIAL = "unit-paypal-client-secret-55d0"
SENTINEL = "Q7pPriv-unit-sentinel"
CHILD_ARGV = ["node", "/fixture/intake-hold-http.cjs"]


# ---------------------------------------------------------------------------
# Setup checkpoint and real pair-fixture controls
# ---------------------------------------------------------------------------

class A0SetupCheckpointTests(unittest.TestCase):
    def test_h1_runner_is_present_loadable_and_exposes_the_agreed_interface(self):
        """Setup checkpoint only. A failure here is absence or load state, not behavior RED."""
        if CHECKPOINT is not None:
            self.fail(CHECKPOINT + ": " + CHECKPOINT_DETAIL)


def control_members():
    return {
        CID_PG: {"Name": "order-http-postgres-" + RUN_ID, "EndpointID": "a" * 64,
                 "IPv4Address": "172.28.0.2/16", "IPv6Address": ""},
        CID_REST: {"Name": "order-http-postgrest-" + RUN_ID, "EndpointID": "b" * 64,
                   "IPv4Address": "172.28.0.3/16", "IPv6Address": ""},
    }


def control_network_record():
    return {"network_id": NID, "network_name": NET_NAME, "run_id": RUN_ID, "label_key": PAIR_LABEL,
            "members": control_members(), "subnet": "172.28.0.0/16", "gateway": "172.28.0.1"}


def control_network_inspect(members):
    return {"Id": NID, "Name": NET_NAME, "Labels": {PAIR_LABEL: RUN_ID}, "Driver": "bridge", "Scope": "local",
            "Internal": True, "EnableIPv6": False, "Attachable": False, "Ingress": False, "Options": {},
            "IPAM": {"Driver": "default", "Options": None,
                     "Config": [{"Subnet": "172.28.0.0/16", "Gateway": "172.28.0.1"}]},
            "Containers": copy.deepcopy(members)}


def control_container_records():
    postgres_tmpfs = {"/tmp": "rw,noexec,nosuid,size=67108864",
                      "/var/lib/postgresql/data": "rw,nosuid,size=268435456",
                      "/var/run/postgresql": "rw,noexec,nosuid,size=16777216"}
    shared = {"run_id": RUN_ID, "label_key": PAIR_LABEL, "network_id": NID, "network_name": NET_NAME,
              "mounts": [], "memory": 536870912, "nano_cpus": 1000000000, "pids_limit": 128, "phase": "running"}
    return [
        {**shared, "role": "postgres", "container_id": CID_PG, "image_id": IMAGES["postgres:15.8"],
         "alias": "order-pg", "tmpfs": postgres_tmpfs, "endpoint_id": "a" * 64, "ipv4": "172.28.0.2"},
        {**shared, "role": "postgrest", "container_id": CID_REST, "image_id": IMAGES[REST_REFERENCE],
         "alias": "order-rest", "tmpfs": {"/tmp": "rw,noexec,nosuid,size=67108864"},
         "endpoint_id": "b" * 64, "ipv4": "172.28.0.3"},
    ]


def control_container_inspect(row):
    return {
        "Id": row["container_id"], "Image": row["image_id"], "Name": "/order-http-" + row["role"] + "-" + RUN_ID,
        "Config": {"Labels": {PAIR_LABEL: RUN_ID}},
        "HostConfig": {"NetworkMode": NET_NAME, "PortBindings": {}, "PublishAllPorts": False, "Privileged": False,
                       "ReadonlyRootfs": True, "Binds": None, "VolumesFrom": None, "ExtraHosts": None, "Dns": [],
                       "Memory": 536870912, "NanoCpus": 1000000000, "PidsLimit": 128,
                       "Tmpfs": copy.deepcopy(row["tmpfs"])},
        "Mounts": [],
        "NetworkSettings": {"Ports": {}, "Networks": {NET_NAME: {
            "GlobalIPv6Address": "", "GlobalIPv6PrefixLen": 0, "IPv6Gateway": "", "Aliases": [row["alias"]],
            "NetworkID": NID, "EndpointID": row["endpoint_id"], "IPAddress": row["ipv4"]}}},
        "State": {"Status": "running", "Running": True, "Paused": False, "Restarting": False, "Dead": False,
                  "ExitCode": 0, "Error": "", "Pid": 4242},
    }


class OwnedDocker:
    """Docker daemon state for one owned pair. Only exact-ID operations exist."""

    def __init__(self):
        self.members = control_members()
        self.containers = {row["container_id"]: control_container_inspect(row)
                           for row in control_container_records()}
        self.network_present = True
        self.unreachable = set()
        self.calls = []

    def __call__(self, args, timeout=None, **kwargs):
        args = list(args)
        self.calls.append(args)
        kind, verb = args[0], args[1]
        if verb == "inspect":
            target = args[2]
            if kind == "network":
                rows = [control_network_inspect(self.members)] if self.network_present and target == NID else []
            else:
                rows = [copy.deepcopy(self.containers[target])] if target in self.containers else []
            return done(args, 0 if rows else 1, json.dumps(rows))
        if verb == "rm":
            target = args[-1]
            if kind == "container":
                del self.containers[target]
                self.members.pop(target, None)
            else:
                self.network_present = False
            return done(args, 0, target + "\n")
        if verb == "ls":
            target = next(item for item in args if item.startswith("id="))[3:]
            if target in self.unreachable:
                return done(args, 1, "", "unit: daemon unavailable")
            present = target in self.containers if kind == "container" else (self.network_present and target == NID)
            return done(args, 0, target + "\n" if present else "")
        raise AssertionError("Unexpected Docker operation: " + repr(args))


class A1PairFixtureControlTests(unittest.TestCase):
    """Real order-http validators. These controls run while run.py is absent."""

    @classmethod
    def setUpClass(cls):
        data = PAIR_PATH.read_bytes()
        cls.source_sha256 = sha(data)
        module = types.ModuleType("h1_control_pair_fixture")
        module.__file__ = str(PAIR_PATH)
        exec(compile(data, str(PAIR_PATH), "exec"), module.__dict__)
        cls.pair = module

    def test_control_executes_the_exact_frozen_pair_helper_bytes(self):
        """Break: the controls or the runner execute an edited pair helper."""
        self.assertEqual(self.source_sha256, PAIR_SHA256)

    def test_control_fixture_image_ids_equal_the_real_pinned_image_set(self):
        """Break: H1 fixtures name an image ID that the real pair helper does not pin."""
        self.assertEqual(set(self.pair.PINNED_IMAGES), set(IMAGES))
        for reference, image_id in IMAGES.items():
            with self.subTest(reference=reference):
                self.assertEqual(self.pair.PINNED_IMAGES[reference], image_id)

    def test_control_exact_owned_network_and_containers_are_authorized(self):
        """Break: the admissible fixture itself is malformed, so refusals prove nothing."""
        self.pair.validate_network(control_network_inspect(control_members()), control_network_record())
        for row in control_container_records():
            with self.subTest(role=row["role"]):
                self.pair.validate_container(control_container_inspect(row), row)

    def test_control_shortened_container_id_and_foreign_network_member_are_refused(self):
        """Break: a guessed CID prefix or an unknown network member is treated as owned."""
        row = control_container_records()[0]
        inspected = control_container_inspect(row)
        row["container_id"] = CID_PG[:12]
        with self.assertRaisesRegex(self.pair.PairFixtureError, "full immutable ID"):
            self.pair.validate_container(inspected, row)
        members = control_members()
        members["f" * 64] = {"Name": "foreign", "EndpointID": "c" * 64, "IPv4Address": "172.28.0.9/16",
                             "IPv6Address": ""}
        with self.assertRaisesRegex(self.pair.PairFixtureError, "foreign network member"):
            self.pair.validate_network(control_network_inspect(members), control_network_record())

    def test_control_cleanup_removes_only_exact_ids_and_records_true_absence(self):
        """Break: cleanup searches by name or label, or reports absence without a query."""
        docker = OwnedDocker()
        owned = self.pair.OwnedResources(docker, network=control_network_record(),
                                         containers=control_container_records())
        owned.close()
        self.assertEqual([call for call in docker.calls if call[1] == "rm"],
                         [["container", "rm", "--force", "--volumes", CID_REST],
                          ["container", "rm", "--force", "--volumes", CID_PG],
                          ["network", "rm", NID]])
        self.assertEqual(owned.absence, {"containers": {CID_PG: True, CID_REST: True}, "network": True})

    def test_control_inaccessible_absence_query_is_not_a_cleanup_claim(self):
        """Break: a successful rm is reported as absence when the exact-ID query failed."""
        docker = OwnedDocker()
        docker.unreachable.add(CID_PG)
        owned = self.pair.OwnedResources(docker, network=control_network_record(),
                                         containers=control_container_records())
        with self.assertRaisesRegex(self.pair.PairFixtureError, "absence was not established"):
            owned.close()
        self.assertEqual(owned.absence, {"containers": {CID_PG: None, CID_REST: True}, "network": True})

    def test_control_foreign_member_prevents_every_removal(self):
        """Break: cleanup deletes part of a set that contains an unverified resource."""
        docker = OwnedDocker()
        docker.members["f" * 64] = {"Name": "foreign", "EndpointID": "c" * 64, "IPv4Address": "172.28.0.9/16",
                                    "IPv6Address": ""}
        owned = self.pair.OwnedResources(docker, network=control_network_record(),
                                         containers=control_container_records())
        with self.assertRaises(self.pair.PairFixtureError):
            owned.close()
        self.assertEqual([call for call in docker.calls if call[1] == "rm"], [])
        self.assertEqual(owned.absence, {"containers": {CID_PG: False, CID_REST: False}, "network": False})


# ---------------------------------------------------------------------------
# Subject boundaries
# ---------------------------------------------------------------------------

class SubjectCase(unittest.TestCase):
    def setUp(self):
        if CHECKPOINT is not None:
            self.skipTest(CHECKPOINT + " (setup checkpoint, not behavior RED)")

    def refuses(self, code, call):
        with self.assertRaises(subject.BoundaryError) as caught:
            call()
        self.assertEqual(caught.exception.code, code)


class GitBoundary:
    """External Git answers for two roots. Source selection stays in the runner."""

    def __init__(self, heads, blobs):
        self.heads, self.blobs, self.calls = dict(heads), blobs, []
        self.modified = {}  # root -> tracked paths that Git reports as modified

    def status(self, root, paths=None):
        return "".join(" M " + name + "\n" for name in self.modified.get(root, ())
                       if paths is None or name in paths)

    def __call__(self, argv, **kwargs):
        argv = list(argv)
        self.calls.append(argv)
        if argv[:2] != ["git", "-C"] or argv[2] not in self.heads:
            raise AssertionError("Unexpected Git root: " + repr(argv))
        root, tail = argv[2], argv[3:]
        if tail == ["rev-parse", "HEAD"]:
            return done(argv, 0, self.heads[root] + "\n")
        if len(tail) == 2 and tail[0] == "show" and tail[1].startswith("HEAD:"):
            blob = self.blobs[root].get(tail[1][5:])
            return done(argv, 128 if blob is None else 0, blob or b"", b"")
        if len(tail) == 4 and tail[:3] == ["ls-files", "--error-unmatch", "--"]:
            return done(argv, 0 if tail[3] in self.blobs[root] else 1, tail[3] + "\n")
        if tail == ["status", "--porcelain=v1", "--untracked-files=no"]:
            return done(argv, 0, self.status(root))
        if tail[:4] == ["status", "--porcelain=v1", "--untracked-files=all", "--"]:
            return done(argv, 0, self.status(root, tail[4:]))
        if len(tail) == 4 and tail[:2] == ["merge-base", "--is-ancestor"]:
            return done(argv, 0, "")
        raise AssertionError("Unexpected Git operation: " + repr(tail))


class ImageDocker:
    """Local image inspection only. A manifest check must not create resources."""

    def __init__(self, images):
        self.images, self.calls = dict(images), []

    def __call__(self, args, timeout=None, **kwargs):
        args = list(args)
        self.calls.append(args)
        if len(args) == 3 and args[:2] == ["image", "inspect"]:
            image_id = self.images.get(args[2])
            if image_id is None:
                return done(args, 1, "[]", "unit: no such image")
            return done(args, 0, json.dumps([{"Id": image_id}]))
        raise AssertionError("Unexpected Docker operation during a manifest check: " + repr(args))


class Unavailable:
    """Records every boundary call and reports the boundary as unavailable."""

    def __init__(self):
        self.calls = []

    def __call__(self, args, **kwargs):
        self.calls.append(list(args))
        return done(list(args), 1, "", "unit: boundary unavailable")


class ProcessBoundary:
    """Execution boundary. It returns the actual-process records that the test scripts."""

    def __init__(self, spawns=(), waits=None):
        self.spawns, self.waits, self.calls = list(spawns), dict(waits or {}), []

    def spawn(self, role, argv):
        self.calls.append(("spawn", role, tuple(argv)))
        return copy.deepcopy(self.spawns.pop(0))

    def kill(self, record):
        self.calls.append(("kill", record["pid"], record["startId"]))

    def wait(self, record):
        self.calls.append(("wait", record["pid"], record["startId"]))
        return copy.deepcopy(self.waits[record["startId"]])


# ---------------------------------------------------------------------------
# Manifest validator
# ---------------------------------------------------------------------------

class ManifestCase(SubjectCase):
    def setUp(self):
        super().setUp()
        temp = tempfile.TemporaryDirectory(prefix="intake-hold-unit-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.web, self.db = self.root / "web", self.root / "db"
        self.web_bytes = {name: ("unit web " + name).encode() for name in (*WEB_SOURCES, *REUSE_SOURCES)}
        self.sdk_bytes = {}
        for package, (package_json, bundle) in SDK_FILES.items():
            self.sdk_bytes[package_json] = json.dumps({"name": package, "version": SDK_VERSION}).encode()
            self.sdk_bytes[bundle] = ("unit bundle " + package).encode()
        self.db_bytes = {name: ("unit db " + name).encode()
                         for name in (*CONTRACT_PREFIX, *DEPENDENCY_SOURCES, KIT_PATH)}
        for base, files in ((self.web, {**self.web_bytes, **self.sdk_bytes}), (self.db, self.db_bytes)):
            for name, data in files.items():
                self.put(base, name, data)
        self.git = GitBoundary({str(self.web): WEB_HEAD, str(self.db): DB_HEAD},
                               {str(self.web): dict(self.web_bytes), str(self.db): dict(self.db_bytes)})
        self.docker = ImageDocker(IMAGES)
        self.manifest = {
            "webHead": WEB_HEAD, "dbHead": DB_HEAD, "dbProductCommit": DB_PRODUCT_COMMIT,
            "kit": {"path": KIT_PATH, "sha256": sha(self.db_bytes[KIT_PATH])},
            "contractPrefix": [{"path": name, "sha256": sha(self.db_bytes[name])} for name in CONTRACT_PREFIX],
            "dependencySources": [{"path": name, "sha256": sha(self.db_bytes[name])} for name in DEPENDENCY_SOURCES],
            "dependencySqlSha256": DEPENDENCY_SQL_SHA256, "queueDependencySqlSha256": QUEUE_DEPENDENCY_SQL_SHA256,
            "webSources": {name: sha(self.web_bytes[name]) for name in WEB_SOURCES},
            "reuseSources": {name: sha(self.web_bytes[name]) for name in REUSE_SOURCES},
            "sdk": {package: {"version": SDK_VERSION, "files": {name: sha(self.sdk_bytes[name]) for name in names}}
                    for package, names in SDK_FILES.items()},
            "images": dict(IMAGES),
        }
        self.path = self.root / "c-http-manifest.json"
        self.seal()

    def put(self, base, name, data):
        path = base / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def seal(self):
        self.path.write_text(json.dumps(self.manifest))
        self.pin = sha(self.path.read_bytes())

    def verify(self):
        return subject.verify_manifest(self.path, self.pin, web_root=self.web, db_root=self.db,
                                       git=self.git, docker=self.docker)


class ManifestValidatorTests(ManifestCase):
    def test_exact_current10_then_m1_to_m5_manifest_is_accepted(self):
        """Break: the validator refuses the admissible manifest, so refusals prove nothing."""
        result = self.verify()
        self.assertEqual((result["webHead"], result["dbHead"]), (WEB_HEAD, DB_HEAD))
        self.assertEqual(len(result["contractPrefix"]), 15)
        self.assertEqual(result["contractPrefix"][10]["path"],
                         "supabase/migrations/20261117035820_web_payment_durability_ledger.sql")
        self.assertEqual(result["contractPrefix"][14]["path"],
                         "supabase/migrations/20261117120247_web_payment_absence_release.sql")

    def test_missing_reordered_duplicated_or_extended_prefix_is_refused(self):
        """Break: a count or set check accepts a prefix without M3, or M2 before M1."""
        original = copy.deepcopy(self.manifest["contractPrefix"])
        mutations = {
            "missing-m3": original[:12] + original[13:],
            "missing-first-current10": original[1:],
            "m2-before-m1": original[:10] + [original[11], original[10]] + original[12:],
            "duplicate-m5": original + [original[14]],
            "extra-stage": original + [{"path": MIGRATION_DIR + "20261120000000_extra.sql", "sha256": "a" * 64}],
        }
        for name, prefix in mutations.items():
            with self.subTest(mutation=name):
                self.manifest["contractPrefix"] = prefix
                self.seal()
                self.refuses(Code.PREFIX, self.verify)

    def test_builder_refuses_a_checkout_without_one_prefix_stage(self):
        """Break: the manifest builder emits a shorter prefix when an M stage is absent."""
        (self.db / CONTRACT_PREFIX[12]).unlink()
        del self.git.blobs[str(self.db)][CONTRACT_PREFIX[12]]
        self.refuses(Code.PREFIX, lambda: subject.build_manifest(
            web_root=self.web, db_root=self.db, git=self.git, docker=self.docker))

    def test_actual_source_bytes_that_differ_from_the_manifest_are_refused(self):
        """Break: the validator compares manifest hashes with each other, not with disk bytes."""
        targets = ((self.db, CONTRACT_PREFIX[14], self.db_bytes), (self.db, KIT_PATH, self.db_bytes),
                   (self.db, DEPENDENCY_SOURCES[0], self.db_bytes),
                   (self.web, CHARGE_DIR + "orchestrator.ts", self.web_bytes),
                   (self.web, REUSE_SOURCES[0], self.web_bytes))
        for base, name, originals in targets:
            with self.subTest(source=name):
                self.put(base, name, b"changed after the manifest")
                self.refuses(Code.SOURCE, self.verify)
                self.put(base, name, originals[name])
        self.assertEqual(self.verify()["webHead"], WEB_HEAD)

    def test_recorded_hash_that_differs_from_unchanged_bytes_is_refused(self):
        """Break: a re-pinned manifest is trusted without hashing the real file."""
        self.manifest["reuseSources"][REUSE_SOURCES[1]] = "a" * 64
        self.seal()
        self.refuses(Code.SOURCE, self.verify)

    def test_actual_web_or_db_head_drift_is_refused(self):
        """Break: the recorded HEAD is trusted and the actual checkout HEAD is not read."""
        for root in (self.web, self.db):
            with self.subTest(root=root.name):
                previous = self.git.heads[str(root)]
                self.git.heads[str(root)] = "f" * 40
                self.refuses(Code.HEAD, self.verify)
                self.git.heads[str(root)] = previous

    def test_unrelated_tracked_modification_in_either_checkout_is_refused(self):
        """Break: only the listed paths are checked, so a dirty tracked W or D checkout runs."""
        for root in (self.web, self.db):
            with self.subTest(root=root.name):
                self.git.modified[str(root)] = ["docs/unrelated-change.html"]
                self.refuses(Code.SOURCE, self.verify)
                self.git.modified.clear()
        self.assertEqual(self.verify()["dbHead"], DB_HEAD)

    def test_manifest_bytes_must_equal_the_approved_hash(self):
        """Break: the runner rehashes a changed manifest and approves it itself."""
        self.path.write_text(self.path.read_text() + "\n")
        self.refuses(Code.MANIFEST_HASH, self.verify)

    def test_duplicate_manifest_key_is_refused(self):
        """Break: last-key-wins parsing hides a second webHead."""
        raw = '{"webHead":"' + "a" * 40 + '",' + json.dumps(self.manifest)[1:]
        self.path.write_text(raw)
        self.pin = sha(raw.encode())
        self.refuses(Code.MANIFEST_DUPLICATE, self.verify)

    def test_missing_extra_or_malformed_manifest_fields_are_refused(self):
        """Break: loose field checks let a manifest drop a source or add an unknown field."""
        original = copy.deepcopy(self.manifest)
        for mutation in ("extra-field", "missing-kit", "malformed-dependency-hash", "missing-web-source",
                         "extra-sdk-package", "prefix-row-extra-key"):
            with self.subTest(mutation=mutation):
                self.manifest = copy.deepcopy(original)
                if mutation == "extra-field":
                    self.manifest["approvedBy"] = "unit"
                elif mutation == "missing-kit":
                    del self.manifest["kit"]
                elif mutation == "malformed-dependency-hash":
                    self.manifest["dependencySqlSha256"] = "not-a-hash"
                elif mutation == "missing-web-source":
                    del self.manifest["webSources"][CHARGE_DIR + "reconciliation-executor.ts"]
                elif mutation == "extra-sdk-package":
                    self.manifest["sdk"]["@supabase/auth-js"] = {"version": SDK_VERSION, "files": {}}
                else:
                    self.manifest["contractPrefix"][0]["approved"] = True
                self.seal()
                self.refuses(Code.MANIFEST_SET, self.verify)

    def test_installed_sdk_bundle_bytes_must_equal_the_manifest(self):
        """Break: the SDK is validated by package name only, not by installed bundle bytes."""
        for package, (_, bundle) in SDK_FILES.items():
            with self.subTest(package=package):
                self.put(self.web, bundle, b"another installed bundle")
                self.refuses(Code.SDK, self.verify)
                self.put(self.web, bundle, self.sdk_bytes[bundle])

    def test_installed_sdk_version_must_equal_the_manifest_version(self):
        """Break: matching file hashes hide a manifest version that the package does not have."""
        package_json = SDK_FILES["@supabase/postgrest-js"][0]
        data = json.dumps({"name": "@supabase/postgrest-js", "version": "2.112.4"}).encode()
        self.put(self.web, package_json, data)
        self.manifest["sdk"]["@supabase/postgrest-js"]["files"][package_json] = sha(data)
        self.seal()
        self.refuses(Code.SDK, self.verify)

    def test_actual_local_image_id_must_equal_the_manifest_for_each_reference(self):
        """Break: an image tag is trusted, so a retagged PostgreSQL or PostgREST image runs."""
        for reference in ("postgres:15.8", "postgres:17.6", REST_REFERENCE):
            with self.subTest(reference=reference, state="different"):
                self.docker.images[reference] = "sha256:" + "d" * 64
                self.refuses(Code.IMAGE, self.verify)
                self.docker.images[reference] = IMAGES[reference]
            with self.subTest(reference=reference, state="not-cached"):
                del self.docker.images[reference]
                self.refuses(Code.IMAGE, self.verify)
                self.docker.images[reference] = IMAGES[reference]

    def test_manifest_image_id_must_be_the_pinned_full_id(self):
        """Break: a manifest and a daemon that agree on a wrong image ID pass together."""
        self.manifest["images"]["postgres:17.6"] = "sha256:" + "d" * 64
        self.docker.images["postgres:17.6"] = "sha256:" + "d" * 64
        self.seal()
        self.refuses(Code.IMAGE, self.verify)


class CliTests(SubjectCase):
    def run_main(self, argv, git, docker, process):
        try:
            return subject.main(argv, git=git, docker=docker, process=process)
        except SystemExit as exc:
            return exc.code

    def test_unapproved_image_or_phase_is_refused_before_any_boundary_call(self):
        """Break: an unknown image or phase reaches Git, Docker or a child process."""
        for image, phase in (("postgres:16.4", "canonical"), ("postgres:15.8", "smoke")):
            with self.subTest(image=image, phase=phase):
                git, docker, process = Unavailable(), Unavailable(), ProcessBoundary()
                code = self.run_main(["run", "--image", image, "--phase", phase, "--manifest", "/nonexistent.json",
                                      "--manifest-sha256", "0" * 64, "--run-label", "unit"], git, docker, process)
                self.assertNotIn(code, (0, None))
                self.assertEqual((git.calls, docker.calls, process.calls), ([], [], []))

    def test_manifest_hash_mismatch_stops_before_resource_creation_or_child_spawn(self):
        """Break: the run starts containers or a child before the manifest is verified."""
        with tempfile.TemporaryDirectory(prefix="intake-hold-cli-") as temp:
            manifest = Path(temp) / "manifest.json"
            manifest.write_text("{}")
            git, docker, process = Unavailable(), Unavailable(), ProcessBoundary()
            code = self.run_main(["run", "--image", "postgres:15.8", "--phase", "fault", "--manifest", str(manifest),
                                  "--manifest-sha256", "0" * 64, "--run-label", "unit-fault"], git, docker, process)
        self.assertNotIn(code, (0, None))
        self.assertEqual([call for call in docker.calls if call[:2] != ["image", "inspect"]], [])
        self.assertEqual(process.calls, [])


# ---------------------------------------------------------------------------
# Owned child lifecycle
# ---------------------------------------------------------------------------

OWNER = {"runId": RUN_ID, "containerId": CID_NODE}


def record(pid, start_id, run_id=RUN_ID, container_id=CID_NODE):
    return {"pid": pid, "startId": start_id, "runId": run_id, "containerId": container_id}


KILLED = {"exitCode": 137, "signal": "SIGKILL"}


class OwnedChildrenTests(SubjectCase):
    def children(self, spawns, waits=None):
        self.process = ProcessBoundary(spawns, waits)
        return subject.OwnedChildren(self.process, owner=dict(OWNER))

    def finish_child(self, exit_code, signal):
        result = {"exitCode": exit_code, "signal": signal}
        children = self.children([record(4101, "start-4101")], {"start-4101": result})
        children.spawn("canonical", CHILD_ARGV)
        commands = []
        run = object.__new__(subject.PhaseRun)
        run.roles = {"canonical": types.SimpleNamespace(send=commands.append)}
        run.children = children
        try:
            return run.finish("canonical")
        finally:
            self.assertEqual(commands, [{"op": "exit"}])
            self.assertEqual(children.trail[-1]["event"], "wait")
            self.assertEqual(children.trail[-1]["exitCode"], exit_code)
            self.assertEqual(children.trail[-1]["signal"], signal)

    def test_normal_finish_accepts_exit_zero_without_signal(self):
        """Break: a clean exit is refused even though the process ended successfully."""
        self.assertEqual(self.finish_child(0, None), {"exitCode": 0, "signal": None})

    def test_normal_finish_refuses_nonzero_exit(self):
        """Break: a child that failed during teardown can leave the phase successful."""
        self.refuses(Code.EXIT_FAILED, lambda: self.finish_child(1, None))

    def test_normal_finish_refuses_signal_exit(self):
        """Break: a child killed during normal teardown can leave the phase successful."""
        self.refuses(Code.EXIT_FAILED, lambda: self.finish_child(143, "SIGTERM"))

    def test_kill_wait_then_fresh_identity_is_a_valid_multi_process_trail(self):
        """Break: the valid restart is refused, or the trail omits a real boundary event."""
        children = self.children([record(4101, "start-4101"), record(4102, "start-4102")], {"start-4101": KILLED})
        children.spawn("A", CHILD_ARGV)
        children.kill("A")
        children.wait("A")
        children.spawn("B", CHILD_ARGV)
        proof = children.restart_proof("A", "B")
        self.assertEqual((proof["killed"]["pid"], proof["killed"]["startId"]), (4101, "start-4101"))
        self.assertEqual((proof["fresh"]["pid"], proof["fresh"]["startId"]), (4102, "start-4102"))
        self.assertEqual(self.process.calls, [
            ("spawn", "A", ("node", "/fixture/intake-hold-http.cjs")), ("kill", 4101, "start-4101"),
            ("wait", 4101, "start-4101"), ("spawn", "B", ("node", "/fixture/intake-hold-http.cjs"))])
        self.assertEqual([(row["event"], row["role"]) for row in children.trail],
                         [("spawn", "A"), ("kill", "A"), ("wait", "A"), ("spawn", "B")])
        self.assertEqual((children.trail[0]["pid"], children.trail[0]["startId"]), (4101, "start-4101"))
        self.assertEqual((children.trail[2]["exitCode"], children.trail[2]["signal"]), (137, "SIGKILL"))

    def test_spawn_record_from_another_run_or_container_is_not_owned(self):
        """Break: any PID that the boundary returns is adopted and later killed."""
        for foreign in (record(4101, "start-4101", run_id=FOREIGN_RUN_ID),
                        record(4101, "start-4101", container_id="9" * 64),
                        {"pid": 4101, "startId": "start-4101"}):
            with self.subTest(record=foreign):
                children = self.children([foreign])

                def flow():
                    children.spawn("A", CHILD_ARGV)
                    children.kill("A")

                self.refuses(Code.OWNERSHIP, flow)
                self.assertEqual([call[0] for call in self.process.calls], ["spawn"])

    def test_kill_or_proof_for_a_role_that_was_never_spawned_is_refused(self):
        """Break: a fabricated record or a general kill reaches a process that is not owned."""
        children = self.children([record(4101, "start-4101")], {"start-4101": KILLED})
        children.spawn("A", CHILD_ARGV)
        self.refuses(Code.OWNERSHIP, lambda: children.kill("ghost"))
        children.kill("A")
        children.wait("A")
        self.refuses(Code.OWNERSHIP, lambda: children.restart_proof("A", "ghost"))
        self.assertEqual(self.process.calls, [("spawn", "A", ("node", "/fixture/intake-hold-http.cjs")),
                                              ("kill", 4101, "start-4101"), ("wait", 4101, "start-4101")])

    def test_restart_without_an_observed_termination_is_not_reaped(self):
        """Break: a kill request alone is accepted as proof that the process ended."""
        waits = {"missing-wait": None, "still-running": {"exitCode": None, "signal": None}}
        for name, result in waits.items():
            with self.subTest(case=name):
                children = self.children([record(4101, "start-4101"), record(4102, "start-4102")],
                                         {"start-4101": result})

                def flow():
                    children.spawn("A", CHILD_ARGV)
                    children.kill("A")
                    if result is not None:
                        children.wait("A")
                    children.spawn("B", CHILD_ARGV)
                    children.restart_proof("A", "B")

                self.refuses(Code.NOT_REAPED, flow)

    def test_restart_without_the_owned_kill_is_unproven(self):
        """Break: a process that exited by itself is reported as the injected kill."""
        children = self.children([record(4101, "start-4101"), record(4102, "start-4102")],
                                 {"start-4101": {"exitCode": 0, "signal": None}})

        def flow():
            children.spawn("A", CHILD_ARGV)
            children.wait("A")
            children.spawn("B", CHILD_ARGV)
            children.restart_proof("A", "B")

        self.refuses(Code.RESTART, flow)

    def test_repeated_pid_or_start_identity_is_not_a_fresh_process(self):
        """Break: a repeated or fabricated PID is accepted as the restarted process."""
        fresh = {"same-pid-same-start": record(4101, "start-4101"),
                 "same-pid-new-start": record(4101, "start-9999"),
                 "new-pid-same-start": record(4102, "start-4101")}
        for name, second in fresh.items():
            with self.subTest(case=name):
                children = self.children([record(4101, "start-4101"), second], {"start-4101": KILLED})

                def flow():
                    children.spawn("A", CHILD_ARGV)
                    children.kill("A")
                    children.wait("A")
                    children.spawn("B", CHILD_ARGV)
                    children.restart_proof("A", "B")

                self.refuses(Code.RESTART, flow)

    def test_fresh_process_spawned_before_the_observed_termination_is_unproven(self):
        """Break: two live processes are reported as kill and restart."""
        children = self.children([record(4101, "start-4101"), record(4102, "start-4102")], {"start-4101": KILLED})

        def flow():
            children.spawn("A", CHILD_ARGV)
            children.spawn("B", CHILD_ARGV)
            children.kill("A")
            children.wait("A")
            children.restart_proof("A", "B")

        self.refuses(Code.RESTART, flow)


# ---------------------------------------------------------------------------
# Evidence reducer
# ---------------------------------------------------------------------------

def post(seq, role):
    return {"seq": seq, "kind": "provider", "method": "POST", "operation": "CAPTURE", "process": role}


def get(seq, role):
    return {"seq": seq, "kind": "provider", "method": "GET", "operation": "ORDER_READ", "process": role}


def rpc(seq, role, name, attempt, delivery="ACK"):
    """delivery is transport evidence: ACK, ACK_LOST or FAILED_BEFORE_COMMIT."""
    return {"seq": seq, "kind": "rpc", "rpc": name, "attempt": attempt, "process": role,
            "connection": "driver:" + role, "delivery": delivery}


def claim(name, attempt, state="COMMITTED"):
    return {"rpc": name, "attempt": attempt, "state": state}


def seen(seq, case, name, attempt, state="COMMITTED"):
    return {"seq": seq, "order": ORDERS[case], "rpc": name, "attempt": attempt, "state": state,
            "connection": "observer:1"}


def child(event, seq, role, pid, **extra):
    return {"event": event, "seq": seq, "role": role, "pid": pid, "startId": "start-" + str(pid),
            "runId": RUN_ID, "containerId": CID_NODE, **extra}


def resources():
    return {"runId": RUN_ID,
            "network": {"id": NID, "name": NET_NAME, "owned": True, "absent": True},
            "containers": [{"role": "postgres", "id": CID_PG, "owned": True, "absent": True},
                           {"role": "postgrest", "id": CID_REST, "owned": True, "absent": True},
                           {"role": "node", "id": CID_NODE, "owned": True, "absent": True}]}


def read_cycle(case, role, start, attempt=1, complete="ACK"):
    """OPEN commit, observer row, one GET, COMPLETE and its observer row."""
    state = "ABSENT" if complete == "FAILED_BEFORE_COMMIT" else "COMMITTED"
    tape = [rpc(start, role, P2_OPEN, attempt), get(start + 20, role),
            rpc(start + 30, role, P2_COMPLETE, attempt, complete)]
    claims = [claim(P2_OPEN, attempt), claim(P2_COMPLETE, attempt, state)]
    observations = [seen(start + 10, case, P2_OPEN, attempt), seen(start + 40, case, P2_COMPLETE, attempt, state)]
    return tape, claims, observations


def one_case(case, tape, claims, observations):
    return {"order": ORDERS[case], "tape": tape, "commitClaims": claims, "observations": observations}


def classified(case, role, start, delivery="ACK"):
    """One synthetic capture POST, then P1 and its observer row."""
    state = "ABSENT" if delivery == "FAILED_BEFORE_COMMIT" else "COMMITTED"
    return ([post(start, role), rpc(start + 10, role, P1, 1, delivery)], [claim(P1, 1, state)],
            [seen(start + 20, case, P1, 1, state)])


def with_cycle(case, role, start, **cycle):
    tape, claims, observations = classified(case, role, start)
    more = read_cycle(case, cycle.pop("reader", role), start + 30, **cycle)
    return one_case(case, tape + more[0], claims + more[1], observations + more[2])


def canonical_receipt():
    first = one_case("first_completed", *classified("first_completed", "c-A", 100))
    first["tape"][1]["token"] = TOKEN
    return {
        "phase": "canonical", "image": "postgres:15.8", "runLabel": "unit-pg15-canonical",
        "manifestSha256": "9" * 64, "expectedCases": list(CANONICAL_CASES),
        "cases": {"first_completed": first,
                  "eligible_no_response": with_cycle("eligible_no_response", "c-A", 200),
                  "actual_facts": one_case("actual_facts", *classified("actual_facts", "c-A", 300)),
                  "observed_id_matrix": with_cycle("observed_id_matrix", "c-A", 400)},
        "children": [child("spawn", 10, "c-A", 4201), child("wait", 900, "c-A", 4201, exitCode=0, signal=None)],
        "restartProofs": [], "resources": resources(), "unexpectedRequests": [],
    }


def fault_receipt():
    kill_before_p1 = one_case("kill_before_p1", [post(110, "k1-A")], [claim(P1, 1, "ABSENT")],
                              [seen(150, "kill_before_p1", P1, 1, "ABSENT")])
    restart_xy = with_cycle("restart_xy", "xy-A", 340, reader="xy-B")
    restart_xy["tape"][1]["delivery"] = "ACK_LOST"
    for row in restart_xy["tape"][2:] + restart_xy["observations"][1:]:
        row["seq"] += 30
    kill_before_complete = one_case("kill_before_complete", *classified("kill_before_complete", "kc-A", 510))
    kill_before_complete["tape"] += [rpc(540, "kc-A", P2_OPEN, 1), get(560, "kc-A")]
    kill_before_complete["commitClaims"].append(claim(P2_OPEN, 1))
    kill_before_complete["observations"].append(seen(550, "kill_before_complete", P2_OPEN, 1))
    second = read_cycle("kill_before_complete", "kc-B", 600, attempt=2)
    kill_before_complete["tape"] += second[0]
    kill_before_complete["commitClaims"] += second[1]
    kill_before_complete["observations"] += second[2]
    conflict = with_cycle("conflict_and_late", "f-main", 900)
    conflict["tape"].append(rpc(980, "f-main", P2_COMPLETE, 2))
    conflict["commitClaims"].append(claim(P2_COMPLETE, 2))
    conflict["observations"].append(seen(985, "conflict_and_late", P2_COMPLETE, 2))
    return {
        "phase": "fault", "image": "postgres:17.6", "runLabel": "unit-pg17-fault",
        "manifestSha256": "9" * 64, "expectedCases": list(FAULT_CASES),
        "cases": {
            "kill_before_p1": kill_before_p1,
            "p1_before_commit": one_case("p1_before_commit",
                                         *classified("p1_before_commit", "f-main", 200, "FAILED_BEFORE_COMMIT")),
            "p1_ack_loss": one_case("p1_ack_loss", *classified("p1_ack_loss", "xy-A", 300, "ACK_LOST")),
            "restart_xy": restart_xy,
            "kill_before_complete": kill_before_complete,
            "complete_ack_loss": with_cycle("complete_ack_loss", "f-main", 700, complete="ACK_LOST"),
            "nth_fact_failure": with_cycle("nth_fact_failure", "f-main", 800, complete="FAILED_BEFORE_COMMIT"),
            "conflict_and_late": conflict,
        },
        "children": [
            child("spawn", 10, "f-main", 5100),
            child("spawn", 100, "k1-A", 5101), child("kill", 120, "k1-A", 5101),
            child("wait", 130, "k1-A", 5101, **KILLED), child("spawn", 140, "k1-B", 5102),
            child("spawn", 290, "xy-A", 5103), child("kill", 380, "xy-A", 5103),
            child("wait", 385, "xy-A", 5103, **KILLED), child("spawn", 390, "xy-B", 5104),
            child("spawn", 500, "kc-A", 5105), child("kill", 570, "kc-A", 5105),
            child("wait", 580, "kc-A", 5105, **KILLED), child("spawn", 590, "kc-B", 5106),
            child("wait", 990, "f-main", 5100, exitCode=0, signal=None),
            child("wait", 991, "k1-B", 5102, exitCode=0, signal=None),
            child("wait", 992, "xy-B", 5104, exitCode=0, signal=None),
            child("wait", 993, "kc-B", 5106, exitCode=0, signal=None),
        ],
        "restartProofs": [{"killed": "k1-A", "fresh": "k1-B"}, {"killed": "xy-A", "fresh": "xy-B"},
                          {"killed": "kc-A", "fresh": "kc-B"}],
        "resources": resources(), "unexpectedRequests": [],
    }


def child_row(receipt, event, role):
    return next(row for row in receipt["children"] if (row["event"], row["role"]) == (event, role))


class EvidenceCase(SubjectCase):
    def reduce(self, receipt):
        return subject.reduce_evidence(receipt)

    def refused(self, code, receipt):
        self.refuses(code, lambda: self.reduce(receipt))


class A2EvidenceFixtureControlTests(unittest.TestCase):
    """Independent fixture control. It needs no run.py."""

    def test_control_fixture_timelines_are_the_hand_checked_literals(self):
        """Break: a fixture builder shifts an event, so an unsafe case tests another order."""
        case = fault_receipt()["cases"]["restart_xy"]
        self.assertEqual([(row["seq"], row["process"], row.get("rpc", row.get("operation")), row.get("delivery"))
                          for row in case["tape"]],
                         [(340, "xy-A", "CAPTURE", None), (350, "xy-A", P1, "ACK_LOST"),
                          (400, "xy-B", P2_OPEN, "ACK"), (420, "xy-B", "ORDER_READ", None),
                          (430, "xy-B", P2_COMPLETE, "ACK")])
        self.assertEqual([(row["seq"], row["rpc"], row["attempt"], row["state"]) for row in case["observations"]],
                         [(360, P1, 1, "COMMITTED"), (410, P2_OPEN, 1, "COMMITTED"),
                          (440, P2_COMPLETE, 1, "COMMITTED")])
        case = canonical_receipt()["cases"]["eligible_no_response"]
        self.assertEqual([row["seq"] for row in case["tape"]], [200, 210, 230, 250, 260])
        self.assertEqual([row["seq"] for row in case["observations"]], [220, 240, 270])
        self.assertEqual(sorted(fault_receipt()["cases"]), sorted(FAULT_CASES))
        self.assertEqual(len(set(ORDERS.values())), 12)


class EvidenceControlTests(EvidenceCase):
    def test_admissible_canonical_and_fault_receipts_reduce_to_the_approved_case_lists(self):
        """Break: the reducer refuses admissible evidence, or reports cases that it did not check."""
        canonical = self.reduce(canonical_receipt())
        self.assertEqual((canonical["phase"], canonical["caseIds"]), ("canonical", [
            "first_completed", "eligible_no_response", "actual_facts", "observed_id_matrix"]))
        fault = self.reduce(fault_receipt())
        self.assertEqual((fault["phase"], fault["caseIds"]), ("fault", [
            "kill_before_p1", "p1_before_commit", "p1_ack_loss", "restart_xy", "kill_before_complete",
            "complete_ack_loss", "nth_fact_failure", "conflict_and_late"]))


class CaseSetTests(EvidenceCase):
    def test_required_cases_come_from_the_phase_not_from_the_receipt_claim(self):
        """Break: a receipt that drops a fault case and its own expectation still passes."""
        receipt = fault_receipt()
        del receipt["cases"]["restart_xy"]
        receipt["expectedCases"].remove("restart_xy")
        self.refused(Code.CASE_SET, receipt)

    def test_unknown_or_cross_phase_case_is_refused(self):
        """Break: an extra case, or a canonical list under the fault phase, is accepted."""
        receipt = canonical_receipt()
        receipt["cases"]["bonus_case"] = copy.deepcopy(receipt["cases"]["actual_facts"])
        receipt["expectedCases"].append("bonus_case")
        self.refused(Code.CASE_SET, receipt)
        receipt = canonical_receipt()
        receipt["phase"] = "fault"
        self.refused(Code.CASE_SET, receipt)


class CommitObserverTests(EvidenceCase):
    def test_delivered_ack_without_an_observer_row_is_not_commit_proof(self):
        """Break: the fixture ACK or the driver's own claim is counted as a commit."""
        receipt = canonical_receipt()
        receipt["cases"]["first_completed"]["observations"] = []
        self.refused(Code.UNOBSERVED, receipt)

    def test_required_proof_comes_from_the_case_even_when_claim_and_observer_are_both_omitted(self):
        """Break: proof is checked only for claims that the receipt lists, so omitting both passes."""
        for name, receipt, case_id in (("p1-commit", canonical_receipt(), "first_completed"),
                                       ("p1-absence-after-kill", fault_receipt(), "kill_before_p1")):
            with self.subTest(required=name):
                case = receipt["cases"][case_id]
                case["commitClaims"] = []
                case["observations"] = []
                self.refused(Code.UNOBSERVED, receipt)

    def test_lost_ack_needs_the_observer_row_to_claim_a_commit(self):
        """Break: post-commit ACK loss is claimed without a row read on another connection."""
        receipt = fault_receipt()
        receipt["cases"]["p1_ack_loss"]["observations"] = []
        self.refused(Code.UNOBSERVED, receipt)

    def test_pre_commit_failure_needs_observed_absence_at_the_expected_point(self):
        """Break: a pre-commit failure is reported as ABSENT without an observer read."""
        receipt = fault_receipt()
        receipt["cases"]["p1_before_commit"]["observations"] = []
        self.refused(Code.UNOBSERVED, receipt)
        receipt = fault_receipt()
        receipt["cases"]["kill_before_p1"]["observations"] = []
        self.refused(Code.UNOBSERVED, receipt)

    def test_observer_state_must_agree_with_the_claim(self):
        """Break: a pre-commit failure passes although the observer saw the row, or the reverse."""
        receipt = fault_receipt()
        receipt["cases"]["p1_before_commit"]["observations"][0]["state"] = "COMMITTED"
        self.refused(Code.OBSERVER, receipt)
        receipt = fault_receipt()
        receipt["cases"]["p1_ack_loss"]["observations"][0]["state"] = "ABSENT"
        self.refused(Code.OBSERVER, receipt)

    def test_observer_row_must_bind_the_exact_order_rpc_and_attempt(self):
        """Break: a row from another case, RPC or attempt satisfies this commit claim."""
        for field, value in (("order", ORDERS["eligible_no_response"]), ("rpc", P2_OPEN), ("attempt", 2)):
            with self.subTest(field=field):
                receipt = canonical_receipt()
                receipt["cases"]["first_completed"]["observations"][0][field] = value
                self.refused(Code.OBSERVER, receipt)

    def test_observer_row_read_before_the_actual_commit_is_stale(self):
        """Break: a row that was read before the RPC was sent proves that RPC's commit."""
        receipt = canonical_receipt()
        receipt["cases"]["first_completed"]["observations"][0]["seq"] = 105
        self.refused(Code.OBSERVER, receipt)

    def test_observer_must_use_a_connection_distinct_from_the_driver(self):
        """Break: the writer's own connection or callback order is used as the observer."""
        receipt = canonical_receipt()
        receipt["cases"]["first_completed"]["observations"][0]["connection"] = "driver:c-A"
        self.refused(Code.OBSERVER, receipt)


class ProtectedReadTests(EvidenceCase):
    def test_get_before_the_committed_read_cycle_open_is_refused(self):
        """Break: the provider GET runs before the P2 open commit that protects it."""
        receipt = canonical_receipt()
        receipt["cases"]["eligible_no_response"]["tape"][3]["seq"] = 225
        self.refused(Code.READ_ORDER, receipt)

    def test_read_cycle_open_before_the_p1_commit_is_refused(self):
        """Break: the read cycle opens before the P1 classification commit is observed."""
        receipt = canonical_receipt()
        case = receipt["cases"]["eligible_no_response"]
        case["tape"][2]["seq"] = 204
        case["observations"][1]["seq"] = 206
        self.refused(Code.READ_ORDER, receipt)

    def test_same_process_with_a_failed_or_unacknowledged_p1_makes_no_get(self):
        """Break: a process that never received the P1 ACK still performs the follow-up GET."""
        for case_id, role in (("p1_before_commit", "f-main"), ("p1_ack_loss", "xy-A")):
            with self.subTest(case=case_id):
                receipt = fault_receipt()
                case = receipt["cases"][case_id]
                # f-main: OPEN 230, row 240, GET 250. xy-A: OPEN 321, row 331, GET 341, before its kill at 380.
                tape, claims, observations = read_cycle(case_id, role, 230 if case_id == "p1_before_commit" else 321)
                case["tape"] += tape
                case["commitClaims"] += claims
                case["observations"] += observations
                self.refused(Code.READ_ORDER, receipt)

    def test_second_get_inside_one_read_cycle_is_refused(self):
        """Break: one open cycle authorizes more than one provider GET."""
        receipt = canonical_receipt()
        receipt["cases"]["eligible_no_response"]["tape"].insert(4, get(255, "c-A"))
        self.refused(Code.READ_ORDER, receipt)

    def test_complete_before_its_get_is_refused(self):
        """Break: a completion is recorded for a read that had not happened."""
        receipt = canonical_receipt()
        case = receipt["cases"]["eligible_no_response"]
        case["tape"][3]["seq"] = 265
        self.refused(Code.READ_ORDER, receipt)


class RequestTests(EvidenceCase):
    def test_second_capture_post_in_the_same_process_is_refused(self):
        """Break: a duplicate capture in one process is hidden by a per-case total."""
        receipt = canonical_receipt()
        receipt["cases"]["first_completed"]["tape"].insert(1, post(104, "c-A"))
        self.refused(Code.CAPTURE, receipt)

    def test_second_capture_post_by_the_restarted_process_is_refused(self):
        """Break: capture POSTs are counted per process, so the restart charges again."""
        receipt = fault_receipt()
        receipt["cases"]["restart_xy"]["tape"].insert(2, post(395, "xy-B"))
        self.refused(Code.CAPTURE, receipt)

    def test_missing_required_capture_post_is_refused(self):
        """Break: a case that needs one capture POST passes with none on its tape."""
        receipt = canonical_receipt()
        tape = receipt["cases"]["first_completed"]["tape"]
        self.assertEqual((tape[0]["kind"], tape[0]["operation"]), ("provider", "CAPTURE"))
        del tape[0]
        self.refused(Code.CAPTURE_COUNT, receipt)

    def test_unapproved_provider_operation_or_rpc_on_the_tape_is_refused(self):
        """Break: only the unexpectedRequests list is read, so an unapproved tape row passes."""
        injected = {
            "provider-create": {"seq": 95, "kind": "provider", "method": "POST", "operation": "CREATE",
                                "process": "c-A"},
            "direct-receive-rpc": {"seq": 125, "kind": "rpc", "rpc": "receive_web_payment_purchase", "attempt": 1,
                                   "process": "c-A", "connection": "driver:c-A", "delivery": "ACK"},
        }
        for name, row in injected.items():
            with self.subTest(injected=name):
                receipt = canonical_receipt()
                tape = receipt["cases"]["first_completed"]["tape"]
                tape.append(row)
                tape.sort(key=lambda item: item["seq"])
                self.assertEqual(receipt["unexpectedRequests"], [])
                self.refused(Code.REQUEST, receipt)

    def test_request_outside_the_owned_destinations_is_refused(self):
        """Break: a recorded real-provider or external network request does not fail the run."""
        receipt = canonical_receipt()
        receipt["unexpectedRequests"] = [{"destination": "api-m.paypal.com:443", "method": "POST"}]
        self.refused(Code.REQUEST, receipt)


class ResourceTests(EvidenceCase):
    def test_guessed_or_unowned_resource_identity_is_refused(self):
        """Break: a short CID, a name-only network or an unverified owner enters the ledger."""
        mutations = {
            "short-cid": lambda r: r["containers"][0].update(id=CID_PG[:12]),
            "name-only-network": lambda r: r["network"].update(id=None),
            "unowned-container": lambda r: r["containers"][2].update(owned=False),
        }
        for name, mutate in mutations.items():
            with self.subTest(mutation=name):
                receipt = canonical_receipt()
                mutate(receipt["resources"])
                self.refused(Code.RESOURCE, receipt)

    def test_absence_that_was_not_queried_or_not_true_is_no_cleanup_claim(self):
        """Break: an inaccessible absence query (None) or a present resource passes as cleaned."""
        for target, value in (("network", None), ("network", False), ("container", None), ("container", False)):
            with self.subTest(target=target, value=value):
                receipt = canonical_receipt()
                row = receipt["resources"]["network"] if target == "network" else receipt["resources"]["containers"][1]
                row["absent"] = value
                self.refused(Code.CLEANUP, receipt)


class RestartEvidenceTests(EvidenceCase):
    def test_restart_proof_with_a_repeated_pid_or_start_identity_is_refused(self):
        """Break: the receipt reuses the killed PID for the fresh process and still passes."""
        receipt = fault_receipt()
        for row in receipt["children"]:
            if row["role"] == "xy-B":
                row["pid"] = 5103
        self.refused(Code.RESTART, receipt)
        receipt = fault_receipt()
        for row in receipt["children"]:
            if row["role"] == "xy-B":
                row["startId"] = "start-5103"
        self.refused(Code.RESTART, receipt)

    def test_killed_process_without_an_observed_wait_is_not_reaped(self):
        """Break: the receipt has a kill event and no termination result."""
        receipt = fault_receipt()
        receipt["children"].remove(child_row(receipt, "wait", "kc-A"))
        self.refused(Code.NOT_REAPED, receipt)
        receipt = fault_receipt()
        child_row(receipt, "wait", "kc-A").update(exitCode=None, signal=None)
        self.refused(Code.NOT_REAPED, receipt)

    def test_restart_proof_without_the_owned_kill_is_refused(self):
        """Break: a normal exit is reported as the fault-injection kill."""
        receipt = fault_receipt()
        receipt["children"].remove(child_row(receipt, "kill", "k1-A"))
        child_row(receipt, "wait", "k1-A").update(exitCode=0, signal=None)
        self.refused(Code.RESTART, receipt)

    def test_two_process_case_without_its_restart_proof_is_refused(self):
        """Break: events from process B are accepted without proof that A ended first."""
        receipt = fault_receipt()
        receipt["restartProofs"].remove({"killed": "xy-A", "fresh": "xy-B"})
        self.refused(Code.RESTART, receipt)

    def test_fresh_process_spawned_before_the_killed_process_ended_is_refused(self):
        """Break: an overlapping second process is reported as a restart."""
        receipt = fault_receipt()
        child_row(receipt, "spawn", "kc-B")["seq"] = 575
        self.refused(Code.RESTART, receipt)

    def test_child_from_another_run_or_without_a_spawn_record_is_not_owned(self):
        """Break: tape events from an unowned or unrecorded process count as evidence."""
        receipt = fault_receipt()
        child_row(receipt, "spawn", "xy-B")["runId"] = FOREIGN_RUN_ID
        self.refused(Code.OWNERSHIP, receipt)
        receipt = canonical_receipt()
        for row in receipt["cases"]["actual_facts"]["tape"]:
            row["process"] = "ghost"
            if row["kind"] == "rpc":
                row["connection"] = "driver:ghost"
        self.refused(Code.OWNERSHIP, receipt)


# ---------------------------------------------------------------------------
# Persisted report
# ---------------------------------------------------------------------------

class PersistedReportTests(SubjectCase):
    SECRETS = (TOKEN, CREDENTIAL, SENTINEL)

    def report(self, receipt):
        return subject.persistable_report(receipt, secrets=self.SECRETS)

    def test_raw_token_is_replaced_by_its_sha256_and_input_is_not_changed(self):
        """Break: the raw token is persisted, or the hash is not the token's SHA-256."""
        receipt = canonical_receipt()
        before = copy.deepcopy(receipt)
        report = self.report(receipt)
        text = json.dumps(report, sort_keys=True)
        for secret in self.SECRETS:
            self.assertNotIn(secret, text)
        entry = report["cases"]["first_completed"]["tape"][1]
        self.assertEqual(entry["tokenSha256"], hashlib.sha256(b"unit-cycle-token-7f3a91").hexdigest())
        self.assertNotIn("token", entry)
        self.assertEqual(entry["rpc"], "record_web_payment_submission_result")
        self.assertEqual(receipt, before)

    def test_secret_in_any_other_field_is_refused_and_not_persisted(self):
        """Break: a token, credential or sentinel in free text is written to the report."""
        mutations = {
            "sentinel-in-tape-text": lambda r: r["cases"]["actual_facts"]["tape"][1].update(
                errorText="provider detail " + SENTINEL),
            "credential-in-resources": lambda r: r["resources"]["containers"][1].update(
                env=["PGRST_JWT_SECRET=" + CREDENTIAL]),
            "token-in-observation-text": lambda r: r["cases"]["first_completed"]["observations"][0].update(
                note="retry with " + TOKEN),
            "sentinel-as-key": lambda r: r["resources"]["network"].update({SENTINEL: "x"}),
        }
        for name, mutate in mutations.items():
            with self.subTest(mutation=name):
                receipt = canonical_receipt()
                mutate(receipt)
                self.refuses(Code.SECRET, lambda: self.report(receipt))


if __name__ == "__main__":
    unittest.main(verbosity=2)
