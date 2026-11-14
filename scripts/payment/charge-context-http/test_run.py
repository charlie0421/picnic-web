"""Coordinator-only tests for the charge-context HTTP execution boundary.

Run: python3 -I -B scripts/payment/charge-context-http/test_run.py -v
Every test names the incorrect behavior it must detect. Temporary Python and
manifest fixtures do not replace the real DB getter or the frozen factory.
"""

import copy
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import importlib.util
import io
import json
import marshal
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
SUBJECT_PATH = HERE / "run.py"
# Compile the exact bytes read here, rather than importing an adjacent pyc.
# This bootstraps the subject only; all reuse-loader assertions call the subject.
SUBJECT_BYTES = SUBJECT_PATH.read_bytes()
subject = types.ModuleType("charge_context_http_run_tests_subject")
subject.__file__ = str(SUBJECT_PATH)
subject.__cached__ = None
subject.__spec__ = importlib.util.spec_from_loader(subject.__name__, loader=None, origin=str(SUBJECT_PATH))
sys.modules[subject.__name__] = subject
exec(compile(SUBJECT_BYTES, str(SUBJECT_PATH), "exec"), subject.__dict__)

HEAD = "1234567890abcdef1234567890abcdef12345678"
FROZEN = (
    "__tests__/integration/payment/orders-postgrest.http.ts",
    "scripts/payment/order-http/run.py", "scripts/payment/order-http/pair_fixture.py",
    "scripts/payment/order-http/setup_db.py", "scripts/payment/order-http/test_pair_fixture.py",
    "scripts/payment/order-http/bundle.mjs", "scripts/payment/order-http/network-guard.cjs",
    "scripts/payment/order-http/auth-fixture.ts", "scripts/payment/order-http/seed.sql",
    "scripts/payment/order-http/assert.sql", "lib/payment/server-order.ts",
    "lib/payment/server-order-repository.ts", "app/api/payment/orders/route.ts",
    "utils/log-event-codes.ts", "__tests__/lib/payment/server-order.test.ts",
    "__tests__/lib/payment/server-order-repository.test.ts", "__tests__/api/payment/orders.test.ts",
    "types/supabase.ts",
)
OWNED = (
    "scripts/payment/charge-context-http/run.py", "scripts/payment/charge-context-http/test_run.py",
    "scripts/payment/charge-context-http/guard.cjs", "scripts/payment/charge-context-http/bundle.mjs",
    "scripts/payment/charge-context-http/seed.sql", "scripts/payment/charge-context-http/privileged.sql",
    "scripts/payment/charge-context-http/stop.sql", "scripts/payment/charge-context-http/observer.sql",
    "__tests__/integration/payment/charge-context-postgrest.http.ts",
)
INSTALLED = (
    "node_modules/@supabase/supabase-js/package.json",
    "node_modules/@supabase/supabase-js/dist/index.cjs",
    "node_modules/@supabase/postgrest-js/package.json",
    "node_modules/@supabase/postgrest-js/dist/index.cjs",
)
REUSE = {
    "pair_fixture": "scripts/payment/order-http/pair_fixture.py",
    "setup_db": "scripts/payment/order-http/setup_db.py",
    "order_http_run": "scripts/payment/order-http/run.py",
}
CID_PG, CID_REST, CID_NODE = "1" * 64, "2" * 64, "3" * 64


def sha(data):
    return hashlib.sha256(data).hexdigest()


class TemporarySource(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="charge-context-contract-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def put(self, relative, data):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def refuses(self, code, call):
        with self.assertRaises(subject.BoundaryError) as caught:
            call()
        self.assertEqual(caught.exception.code, code)


class ReuseLoaderTests(TemporarySource):
    def setUp(self):
        super().setUp()
        # Imports and side effects are intentionally tiny, hand-written fixtures.
        self.data = {
            "pair_fixture": b"LOADS = ['pair_fixture']\nVALUE = 'verified-pair'\n",
            "setup_db": b"import pair_fixture\nLOADS = pair_fixture.LOADS + ['setup_db']\n",
            "order_http_run": b"import pair_fixture\nimport setup_db\nLOADS = setup_db.LOADS + ['order_http_run']\nVALUE = pair_fixture.VALUE\n",
        }
        self.pins = {}
        for name, relative in REUSE.items():
            self.put(relative, self.data[name])
            self.pins[relative] = sha(self.data[name])

    def test_source_loader_ignores_matching_timestamp_poisoned_pyc(self):
        """Wrong branch: ordinary import executes a timestamp-valid poisoned pyc."""
        path = self.root / REUSE["pair_fixture"]
        cache = Path(importlib.util.cache_from_source(str(path)))
        cache.parent.mkdir()
        stat = path.stat()
        poison = importlib.util.MAGIC_NUMBER + struct.pack("<III", 0, int(stat.st_mtime), stat.st_size)
        poison += marshal.dumps(compile("VALUE='poison-pyc'\nLOADS=['poison']\n", str(path), "exec"))
        cache.write_bytes(poison)
        with subject.verified_reuse(self.root, self.pins) as modules:
            self.assertEqual(modules["order_http_run"].VALUE, "verified-pair")
        self.assertEqual(cache.read_bytes(), poison, "loader must neither execute nor delete the existing cache")

    def test_module_order_and_loader_spec_file_cached_identities_are_real(self):
        """Wrong branch: setup/run imports unverified modules or claims a fake loader."""
        with subject.verified_reuse(self.root, self.pins) as modules:
            self.assertEqual(modules["order_http_run"].LOADS, ["pair_fixture", "setup_db", "order_http_run"])
            for name, relative in REUSE.items():
                module = modules[name]
                self.assertIs(sys.modules[name], module)
                self.assertEqual(module.__file__, str(self.root / relative))
                self.assertEqual(module.__spec__.origin, str(self.root / relative))
                self.assertIs(module.__loader__, module.__spec__.loader)
                self.assertIsNotNone(module.__loader__)
                self.assertIsNone(module.__cached__)
        self.assertTrue(all(name not in sys.modules for name in REUSE))

    def test_existing_sys_modules_binding_is_rejected_without_overwrite(self):
        """Wrong branch: cached bindings bypass verification or get silently replaced."""
        for name in REUSE:
            with self.subTest(name=name):
                prior = types.ModuleType(name)
                sys.modules[name] = prior
                try:
                    self.refuses("MODULE_PREBOUND", lambda: self.enter_reuse())
                    self.assertIs(sys.modules[name], prior)
                finally:
                    sys.modules.pop(name, None)

    def enter_reuse(self):
        with subject.verified_reuse(self.root, self.pins):
            pass

    def test_hash_mismatch_is_rejected_before_any_source_side_effect(self):
        """Wrong branch: compile/exec occurs before all three source hashes match."""
        self.put(REUSE["pair_fixture"], b"raise AssertionError('unverified source executed')\n")
        self.refuses("SOURCE_HASH", self.enter_reuse)
        self.assertTrue(all(name not in sys.modules for name in REUSE))

    def test_symlink_parent_and_symlink_file_are_not_verified_sources(self):
        """Wrong branch: resolving a symlink turns it into an approved source path."""
        original = self.root / REUSE["pair_fixture"]
        target = self.put("alternate.py", self.data["pair_fixture"])
        original.unlink()
        original.symlink_to(target)
        self.refuses("SOURCE_PATH", self.enter_reuse)
        original.unlink()
        original.write_bytes(self.data["pair_fixture"])
        parent = original.parent
        moved = parent.with_name("saved-source")
        parent.rename(moved)
        parent.symlink_to(moved, target_is_directory=True)
        self.refuses("SOURCE_PATH", self.enter_reuse)

    def test_missing_or_extra_loader_source_cannot_expand_the_three_module_contract(self):
        """Wrong branch: a manifest-selected module name expands the executable closure."""
        self.pins["scripts/payment/order-http/extra.py"] = sha(b"VALUE=1\n")
        self.put("scripts/payment/order-http/extra.py", b"VALUE=1\n")
        self.refuses("REUSE_SET", self.enter_reuse)
        self.pins.pop("scripts/payment/order-http/extra.py")
        self.pins.pop(REUSE["setup_db"])
        self.refuses("REUSE_SET", self.enter_reuse)

    def test_import_failure_removes_only_new_bindings_and_keeps_original_exception(self):
        """Wrong branch: a partly imported helper survives or masks its source error."""
        data = b"import pair_fixture\nraise ValueError('fixture-import-original')\n"
        self.put(REUSE["setup_db"], data)
        self.pins[REUSE["setup_db"]] = sha(data)
        with self.assertRaisesRegex(ValueError, "^fixture-import-original$"):
            self.enter_reuse()
        self.assertTrue(all(name not in sys.modules for name in REUSE))

    def test_loading_does_not_write_new_pyc_even_when_caller_enabled_bytecode(self):
        """Wrong branch: a reused import consults ordinary bytecode-writing machinery."""
        previous = sys.dont_write_bytecode
        try:
            sys.dont_write_bytecode = False
            with subject.verified_reuse(self.root, self.pins) as modules:
                self.assertEqual(modules["order_http_run"].VALUE, "verified-pair")
            self.assertEqual(list(self.root.rglob("*.pyc")), [])
        finally:
            sys.dont_write_bytecode = previous


class GitBoundary:
    """Only the external Git command boundary is injected; selection stays real."""

    def __init__(self, root, blobs):
        self.root, self.blobs = root, blobs
        self.head, self.dirty, self.untracked = HEAD, set(), set(OWNED)
        self.calls = []

    def __call__(self, argv, **kwargs):
        self.calls.append(list(argv))
        prefix = ["git", "-C", str(self.root)]
        if list(argv[:3]) != prefix:
            raise AssertionError("Unexpected Git root/command: " + repr(argv))
        tail = list(argv[3:])
        if tail == ["rev-parse", "HEAD"]:
            return subprocess.CompletedProcess(argv, 0, self.head + "\n", "")
        if len(tail) == 2 and tail[0] == "show" and tail[1].startswith("HEAD:"):
            path = tail[1][5:]
            if path not in self.blobs:
                return subprocess.CompletedProcess(argv, 128, b"", b"not tracked")
            return subprocess.CompletedProcess(argv, 0, self.blobs[path], b"")
        if len(tail) == 4 and tail[:3] == ["ls-files", "--error-unmatch", "--"]:
            path = tail[3]
            return subprocess.CompletedProcess(argv, 1 if path in self.untracked else 0, path + "\n", "")
        if len(tail) == 5 and tail[:4] == ["status", "--porcelain=v1", "--untracked-files=all", "--"]:
            path = tail[4]
            status = "?? " if path in self.untracked else " M " if path in self.dirty else ""
            return subprocess.CompletedProcess(argv, 0, status + path + "\n" if status else "", "")
        raise AssertionError("Unexpected Git operation: " + repr(tail))


class WebManifestTests(TemporarySource):
    def setUp(self):
        super().setUp()
        self.blobs = {path: ("synthetic source: " + path + "\n").encode() for path in FROZEN + OWNED + INSTALLED}
        for path, data in self.blobs.items():
            self.put(path, data)
        self.manifest = {"webHead": HEAD, "frozenFiles": {p: sha(self.blobs[p]) for p in FROZEN},
                         "ownedFiles": {p: sha(self.blobs[p]) for p in OWNED},
                         "installedFiles": {p: sha(self.blobs[p]) for p in INSTALLED}}
        self.manifest_path = self.root / "root-approved.json"
        self.git = GitBoundary(self.root, self.blobs)
        self.seal()

    def seal(self):
        self.manifest_path.write_text(json.dumps(self.manifest))
        self.manifest_sha = sha(self.manifest_path.read_bytes())

    def verify(self, head=HEAD):
        return subject.verify_web(self.root, self.manifest_path, self.manifest_sha, head, git=self.git)

    def test_exact_head_and_pinned_new9_allow_untracked_owned_sources(self):
        """Wrong branch: whole-tree cleanliness rejects the approved untracked new9."""
        self.put("docs/unrelated.html", b"unrelated pre-existing document")
        self.put(".artifacts/unrelated/cache", b"not a validation source")
        result = self.verify()
        self.assertEqual(result["webHead"], HEAD)
        self.assertEqual(result["ownedState"][OWNED[0]], {"tracked": False, "dirty": True})
        self.assertEqual(result["manifestSha256"], self.manifest_sha)
        self.assertTrue(all("docs/unrelated.html" not in argv for argv in self.git.calls))

    def test_tracked_modified_owned_file_is_allowed_only_at_approved_hash(self):
        """Wrong branch: owned changes bypass hash checking or require HEAD equality."""
        self.git.untracked.remove(OWNED[0])
        self.git.dirty.add(OWNED[0])
        result = self.verify()
        self.assertEqual(result["ownedState"][OWNED[0]], {"tracked": True, "dirty": True})
        self.put(OWNED[0], b"different new runner")
        self.refuses("SOURCE_HASH", self.verify)

    def test_head_prefix_different_full_head_and_implicit_head_are_rejected(self):
        """Wrong branch: abbreviated or automatically adopted HEAD changes evidence identity."""
        for head in (HEAD[:12], None, "", "a" * 40):
            with self.subTest(head=head):
                self.refuses("WEB_HEAD", lambda: self.verify(head))
        self.git.head = HEAD[:-1] + "9"
        self.refuses("WEB_HEAD", self.verify)

    def test_manifest_bytes_change_cannot_update_its_own_approval_pin(self):
        """Wrong branch: the runner auto-accepts a rewritten manifest hash."""
        self.manifest_path.write_text(self.manifest_path.read_text() + "\n")
        self.refuses("MANIFEST_HASH", self.verify)

    def test_duplicate_manifest_json_key_is_not_silently_last_write_wins(self):
        """Wrong branch: duplicate source/identity fields hide an alternate pin."""
        raw = json.dumps(self.manifest)
        raw = '{"webHead":"' + "a" * 40 + '",' + raw[1:]
        self.manifest_path.write_text(raw)
        self.manifest_sha = sha(raw.encode())
        self.refuses("MANIFEST_DUPLICATE", self.verify)

    def test_missing_extra_and_cross_category_source_paths_cannot_expand_allowlist(self):
        """Wrong branch: a manifest supplied by the caller defines arbitrary approved paths."""
        original = copy.deepcopy(self.manifest)
        for mutation in ("missing", "extra", "cross-category"):
            with self.subTest(mutation=mutation):
                self.manifest = copy.deepcopy(original)
                if mutation == "missing":
                    self.manifest["frozenFiles"].pop(FROZEN[0])
                elif mutation == "extra":
                    self.manifest["ownedFiles"]["scripts/arbitrary.py"] = "0" * 64
                else:
                    self.manifest["ownedFiles"][FROZEN[0]] = self.manifest["frozenFiles"].pop(FROZEN[0])
                self.seal()
                self.refuses("MANIFEST_SET", self.verify)

    def test_absolute_traversal_and_normalized_alias_paths_are_rejected(self):
        """Wrong branch: path normalization accepts aliases before checking the fixed set."""
        original = copy.deepcopy(self.manifest)
        for path in ("/tmp/outside.py", "../outside.py", "scripts/payment/../order-http/run.py", "./" + FROZEN[0]):
            with self.subTest(path=path):
                self.manifest = copy.deepcopy(original)
                self.manifest["frozenFiles"][path] = self.manifest["frozenFiles"].pop(FROZEN[0])
                self.seal()
                self.refuses("SOURCE_PATH", self.verify)

    def test_frozen_dirty_untracked_or_head_blob_mismatch_is_rejected(self):
        """Wrong branch: working-tree equality substitutes for tracked clean HEAD equality."""
        path = FROZEN[0]
        self.git.dirty.add(path)
        self.refuses("FROZEN_DIRTY", self.verify)
        self.git.dirty.clear()
        self.git.untracked.add(path)
        self.refuses("FROZEN_TRACKING", self.verify)
        self.git.untracked.remove(path)
        self.git.blobs = dict(self.blobs, **{path: b"different HEAD blob"})
        self.refuses("FROZEN_HEAD_BLOB", self.verify)

    def test_installed_entry_hash_and_source_symlink_are_not_exempt_from_pins(self):
        """Wrong branch: Git-untracked dependency entries or symlinks escape the pin gate."""
        self.put(INSTALLED[0], b"changed installed package")
        self.refuses("SOURCE_HASH", self.verify)
        self.put(INSTALLED[0], self.blobs[INSTALLED[0]])
        original = self.root / OWNED[0]
        target = self.put("same-bytes.py", self.blobs[OWNED[0]])
        original.unlink()
        original.symlink_to(target)
        self.refuses("SOURCE_PATH", self.verify)


class MainPreflightTests(TemporarySource):
    """Call the real main; inject only a temporary root and external commands."""

    def setUp(self):
        super().setUp()
        # These inert fixtures must never be imported: each case fails the web
        # source gate before loading reusable Python or touching DB sources.
        self.blobs = {path: ("synthetic main-preflight source: " + path + "\n").encode()
                      for path in FROZEN + OWNED + INSTALLED}
        for path, data in self.blobs.items():
            self.put(path, data)
        self.manifest = {"webHead": HEAD, "frozenFiles": {p: sha(self.blobs[p]) for p in FROZEN},
                         "ownedFiles": {p: sha(self.blobs[p]) for p in OWNED},
                         "installedFiles": {p: sha(self.blobs[p]) for p in INSTALLED}}
        self.manifest_path = self.put("approved-web.json", json.dumps(self.manifest).encode())
        self.manifest_before = self.manifest_path.read_bytes()
        self.manifest_sha = sha(self.manifest_before)
        # Web preflight must fail first. There is no DB factory or synthetic
        # success implementation in this unit, and this DB source is not read.
        self.db_manifest = self.put("unused-db.json", b"{}\n")
        self.git = GitBoundary(self.root, self.blobs)
        self.external_attempts = []

    def process(self, argv, **kwargs):
        if argv and argv[0] == "git":
            return self.git(argv, **kwargs)
        self.external_attempts.append(list(argv))
        raise AssertionError("Preflight attempted an external process before source approval: " + repr(argv))

    def spawn_tripwire(self, *args, **kwargs):
        self.external_attempts.append(["unexpected-Popen", repr(args), repr(kwargs)])
        raise AssertionError("Preflight bypassed the injected command boundary with Popen")

    def exercise(self, expected_code):
        label = "unit-main-preflight"
        receipt_path = self.root / ".artifacts/payment-web-order-http" / ("charge-context-" + label) / "receipt.json"
        argv = ["--postgres-image", "postgres:15.8", "--run-label", label,
                "--db-workspace", "/Users/charlie.hyun/orca/workspaces/picnic-supabase/web-payment-contract",
                "--docker-host", "unix:///unused-preflight/docker.sock",
                "--docker-bin", "/unused-preflight/docker", "--node-bin", "/unused-preflight/node",
                "--web-head", HEAD, "--web-manifest", str(self.manifest_path),
                "--web-manifest-sha256", self.manifest_sha,
                "--db-manifest", str(self.db_manifest),
                "--db-manifest-sha256", sha(b"{}\n")]
        with patch.object(subject, "ROOT", self.root), patch.object(subprocess, "run", self.process), \
                patch.object(subprocess, "Popen", self.spawn_tripwire), \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            code = subject.main(argv)
        self.assertEqual(code, 1, "preflight refusal must return the failed runner exit")
        self.assertTrue(receipt_path.is_file(),
                        "main must persist the original preflight cause, not return an unrecorded CONTRACT_MISSING exit")
        receipt = json.loads(receipt_path.read_bytes())
        self.assertEqual((receipt["status"], receipt["exitCode"]), ("failed", 1))
        self.assertEqual(receipt["originalError"]["code"], expected_code)
        self.assertEqual(receipt["originalError"]["type"], "BoundaryError")
        self.assertEqual(self.external_attempts, [], "no bundle, Docker or child command is authorized after failed web preflight")
        self.assertFalse((receipt_path.parent / "node-artifacts/config.json").exists())
        self.assertEqual(self.manifest_path.read_bytes(), self.manifest_before, "main must not repair its own approval pin")

    def test_main_full_head_mismatch_records_original_cause_without_starting_factory(self):
        """Wrong branch: main ignores the real HEAD gate or drops its error receipt before returning 1."""
        self.git.head = HEAD[:-1] + "9"
        self.exercise("WEB_HEAD")

    def test_main_manifest_approval_hash_mismatch_is_not_self_approved_or_unrecorded(self):
        """Wrong branch: main derives its approval hash from the same untrusted bytes it reads."""
        self.manifest_sha = "0" * 64
        self.exercise("MANIFEST_HASH")

    def test_main_changed_frozen_source_fails_before_reuse_loading_or_external_commands(self):
        """Wrong branch: main starts a factory or loads stale helpers before verifying all source bytes."""
        self.put(FROZEN[0], b"changed source outside the approved manifest\n")
        self.exercise("SOURCE_HASH")

    def test_main_forces_private_umask_before_creating_artifact_directories(self):
        """Break: artifacts inherit a permissive caller umask before main restricts it."""
        masks = []
        original_mkdir = Path.mkdir
        def mkdir(path, *args, **kwargs):
            self.assertEqual(masks, [0o077], "artifact creation preceded the required private umask")
            return original_mkdir(path, *args, **kwargs)
        with patch.object(subject.os, "umask", lambda mask: masks.append(mask)), patch.object(Path, "mkdir", mkdir):
            self.git.head = "0" * 40
            self.exercise("WEB_HEAD")

    def test_first_term_disables_followup_term_before_error_recording(self):
        """Break: another TERM interrupts original-error recording before finally protects cleanup."""
        observed = []
        previous = subject.signal.getsignal(subject.signal.SIGTERM)

        def terminate_at_command_boundary(argv, **kwargs):
            handler = subject.signal.getsignal(subject.signal.SIGTERM)
            try:
                handler(subject.signal.SIGTERM, None)
            except subject.BoundaryError:
                observed.append(subject.signal.getsignal(subject.signal.SIGTERM))
                raise

        self.process = terminate_at_command_boundary
        self.exercise("TERMINATED")
        self.assertEqual(observed, [subject.signal.SIG_IGN])
        self.assertEqual(subject.signal.getsignal(subject.signal.SIGTERM), previous)


CONFIG = {"completionMarkers": {"A": "CHARGE_CONTEXT_HTTP_COMPLETE_fixture_A_81",
                                "B": "CHARGE_CONTEXT_HTTP_COMPLETE_fixture_B_92"}}


class PhaseTests(unittest.TestCase):
    def child(self, *, phase="A", exit_code=0, markers=1, payload=None, prefix="CHARGE_CONTEXT_HTTP_RESULT "):
        payload = {"phase": phase, "taps": []} if payload is None else payload
        output = prefix + json.dumps(payload) + "\n" + (CONFIG["completionMarkers"][phase] + "\n") * markers
        return subprocess.CompletedProcess(["node", "/fixture/charge-context-http.cjs", phase], exit_code, output, "")

    def refuse(self, code, phase, child, config=CONFIG):
        with self.assertRaises(subject.BoundaryError) as caught:
            subject.parse_phase(phase, child, config)
        self.assertEqual(caught.exception.code, code)

    def test_each_phase_requires_its_own_single_marker_and_preserves_shared_config(self):
        """Wrong branch: phase B overwrites config or accepts phase A completion."""
        before = copy.deepcopy(CONFIG)
        self.assertEqual(subject.parse_phase("A", self.child(), CONFIG), {"phase": "A", "taps": []})
        self.assertEqual(subject.parse_phase("B", self.child(phase="B"), CONFIG), {"phase": "B", "taps": []})
        self.assertEqual(CONFIG, before)

    def test_nonzero_child_with_valid_marker_is_failure(self):
        """Wrong branch: completion text overrides the child's failing exit status."""
        self.refuse("PHASE_EXIT", "A", self.child(exit_code=7))

    def test_missing_duplicate_other_phase_and_substring_markers_are_failures(self):
        """Wrong branch: substring matching or another phase's marker satisfies completion."""
        for child in (self.child(markers=0), self.child(markers=2), self.child(phase="B"),
                      subprocess.CompletedProcess([], 0, "prefix-" + CONFIG["completionMarkers"]["A"] + "\n", "")):
            with self.subTest(stdout=child.stdout):
                self.refuse("PHASE_MARKER", "A", child)

    def test_partial_duplicate_malformed_or_wrong_phase_result_cannot_report_completion(self):
        """Wrong branch: last-result-wins hides partial, malformed or mismatched output."""
        marker = CONFIG["completionMarkers"]["A"] + "\n"
        outputs = (
            "CHARGE_CONTEXT_HTTP_PARTIAL_RESULT {}\n" + marker,
            'CHARGE_CONTEXT_HTTP_RESULT {"phase":"A","taps":[]}\n' * 2 + marker,
            "CHARGE_CONTEXT_HTTP_RESULT {broken\n" + marker,
            'CHARGE_CONTEXT_HTTP_RESULT {"phase":"B","taps":[]}\n' + marker,
        )
        for output in outputs:
            with self.subTest(stdout=output):
                self.refuse("PHASE_RESULT", "A", subprocess.CompletedProcess([], 0, output, ""))

    def test_invalid_phase_or_reused_completion_marker_is_rejected(self):
        """Wrong branch: an arbitrary argv phase or shared marker aliases A and B."""
        self.refuse("PHASE_CONFIG", "C", self.child())
        shared = {"completionMarkers": {"A": "same", "B": "same"}}
        self.refuse("PHASE_CONFIG", "A", self.child(), shared)


def stop_state():
    # Literal policy inputs: only the two non-LIVE rows and C.deleted_at may change.
    return {"web_payment_provider_settings": [
        {"provider": "PAYPAL", "environment": "SANDBOX", "mode": "OPEN", "allow_charge": True,
         "allow_new_orders": True, "verification_binding_id": "binding-a", "paypal_account_id": "account-a",
         "paypal_merchant_id": "merchant-a", "currency": "USD", "is_current_environment": True},
        {"provider": "PORTONE", "environment": "TEST", "mode": "OPEN", "allow_charge": True,
         "allow_new_orders": True, "verification_binding_id": "binding-b", "portone_merchant_id": "merchant-b",
         "portone_store_id": "store-b", "portone_channel_id": "channel-b", "currency": "KRW"},
        {"provider": "PAYPAL", "environment": "LIVE", "mode": "CLOSED", "allow_charge": False},
        {"provider": "PORTONE", "environment": "LIVE", "mode": "CLOSED", "allow_charge": False}],
        "user_profiles": [
            {"id": "c755aa01-0000-4000-8000-000000000001", "deleted_at": None, "nickname": "actor-a"},
            {"id": "c755aa01-0000-4000-8000-000000000002", "deleted_at": None, "nickname": "actor-b"},
            {"id": "c755aa01-0000-4000-8000-000000000003", "deleted_at": None, "nickname": "actor-c"}],
        "web_payment_orders": [{"id": "order-a", "row_version": 1}]}


class StopPolicyTests(unittest.TestCase):
    def test_stop_allows_only_named_non_live_fields_and_actor_c_deletion_without_mutating_inputs(self):
        """Break: rejecting an approved stop, or erasing fields in the caller's baseline."""
        before = stop_state()
        after = copy.deepcopy(before)
        after["web_payment_provider_settings"][0].update(mode="CLOSED", allow_charge=False,
            allow_new_orders=False, verification_binding_id="rotated", paypal_account_id="rotated",
            paypal_merchant_id="rotated")
        after["web_payment_provider_settings"][1].update(mode="CLOSED", allow_charge=False,
            allow_new_orders=False, verification_binding_id="rotated", portone_merchant_id="rotated",
            portone_store_id="rotated", portone_channel_id="rotated")
        after["user_profiles"][2]["deleted_at"] = "2026-11-14T01:02:03Z"
        saved = copy.deepcopy((before, after))
        self.assertTrue(subject._stop_allowed(before, after))
        self.assertEqual((before, after), saved)

    def test_non_allowlisted_sandbox_test_fields_and_every_live_setting_change_are_rejected(self):
        """Break: ignoring currency/current-environment or extending stop authority to LIVE."""
        for index, key, value in ((0, "currency", "KRW"), (0, "is_current_environment", False),
                                  (1, "currency", "USD"), (1, "new_field", "injected"),
                                  (2, "mode", "OPEN"), (2, "allow_charge", True),
                                  (3, "mode", "OPEN"), (3, "paypal_account_id", "rotated")):
            with self.subTest(index=index, field=key):
                before = stop_state()
                after = copy.deepcopy(before)
                after["web_payment_provider_settings"][index][key] = value
                self.assertFalse(subject._stop_allowed(before, after))

    def test_actor_a_b_deletion_actor_c_other_fields_and_order_change_are_rejected(self):
        """Break: treating every profile/order field as mutable during stop."""
        for table, index, key, value in (("user_profiles", 0, "deleted_at", "deleted"),
                                       ("user_profiles", 1, "deleted_at", "deleted"),
                                       ("user_profiles", 2, "nickname", "changed"),
                                       ("web_payment_orders", 0, "row_version", 2)):
            with self.subTest(table=table, index=index, field=key):
                before = stop_state()
                after = copy.deepcopy(before)
                after[table][index][key] = value
                self.assertFalse(subject._stop_allowed(before, after))


def parity_fixture():
    # Hand-labelled request orders are independent of the native/HTTP response.
    requests = [
        ("F1", "10000000-0000-4000-8000-000000000001"), ("F2", "10000000-0000-4000-8000-000000000002"),
        ("F3", "10000000-0000-4000-8000-000000000003"), ("F4", "10000000-0000-4000-8000-000000000004"),
        ("F5", "10000000-0000-4000-8000-000000000005"), ("F6", "10000000-0000-4000-8000-000000000006"),
        ("F7", "10000000-0000-4000-8000-000000000007"), ("F8", "10000000-0000-4000-8000-000000000008"),
        ("F9", "10000000-0000-4000-8000-000000000009"), ("F10", "10000000-0000-4000-8000-000000000010"),
        ("F11", "10000000-0000-4000-8000-000000000011"), ("H1", "10000000-0000-4000-8000-000000000012"),
        ("H2", "10000000-0000-4000-8000-000000000013"), ("NF_OTHER", "10000000-0000-4000-8000-000000000002"),
        ("NF_UNKNOWN", "10000000-0000-4000-8000-000000000099"),
        ("NF_NULL_ACTOR", "10000000-0000-4000-8000-000000000002"), ("NF_NULL_ORDER", None), ("NF_NULL_BOTH", None)]
    expected_cases, native, rows = [], {}, []
    for label, order in requests:
        expected_cases.append({"label": label, "actor": None if label in ("NF_NULL_ACTOR", "NF_NULL_BOTH")
                               else "c755aa01-0000-4000-8000-000000000001", "order": order})
        if label == "H2":
            envelope = {"ok": False, "code": "P0001", "message": "WEB_PAYMENT_CHARGE_CONTEXT_BINDING_INVALID"}
            response = {"code": "P0001", "details": None, "hint": None, "message": "WEB_PAYMENT_CHARGE_CONTEXT_BINDING_INVALID"}
        else:
            response = ({"contract_version": "web-payment-charge-context.v1", "outcome": "NOT_FOUND", "charge_authority": False}
                        if label.startswith("NF_") else {"outcome": "FOUND", "order_id": order, "review_required": label in ("F6", "F7")})
            envelope = {"ok": True, "value": copy.deepcopy(response)}
        native[label] = envelope
        for method in (("POST",) if label.startswith("NF_NULL") else ("GET", "POST")):
            rows.append({"label": label, "method": method, "status": 400 if label == "H2" else 200,
                         "response": copy.deepcopy(response)})
    return {"cases": rows, "taps": [None] * 53, "direct": [None] * 8,
            "counts": {"proxy": 53, "direct": 8, "cases": 33}}, native, expected_cases


class HttpParityTests(unittest.TestCase):
    def test_valid_33_method_label_combinations_match_independent_request_orders(self):
        """Break: rejecting the 15 GET/POST and three POST-only approved combinations."""
        result, native, requests = parity_fixture()
        self.assertIsNone(subject._http_parity(result, native, requests))

    def test_matching_native_http_swapped_f6_f7_orders_are_rejected(self):
        """Break: trusting two matching wrong answers instead of the requested order."""
        result, native, requests = parity_fixture()
        native["F6"]["value"], native["F7"]["value"] = native["F7"]["value"], native["F6"]["value"]
        for row in result["cases"]:
            if row["label"] in ("F6", "F7"):
                row["response"] = copy.deepcopy(native[row["label"]]["value"])
        with self.assertRaises(subject.BoundaryError):
            subject._http_parity(result, native, requests)

    def test_duplicate_label_method_cannot_replace_a_missing_combination_at_count33(self):
        """Break: trusting row count while F1/POST or an entire F2 pair is missing."""
        for target, replacement in ((1, 0), (2, 0), (32, 31)):
            with self.subTest(target=target):
                result, native, requests = parity_fixture()
                result["cases"][target] = copy.deepcopy(result["cases"][replacement])
                with self.assertRaises(subject.BoundaryError):
                    subject._http_parity(result, native, requests)

    def test_missing_case_bad_method_or_wrong_http_native_payload_is_rejected(self):
        """Break: accepting a missing row, an unapproved method, or divergent response."""
        for mutation in ("missing", "method", "payload", "h2-code", "h2-message"):
            with self.subTest(mutation=mutation):
                result, native, requests = parity_fixture()
                if mutation == "missing": result["cases"].pop()
                elif mutation == "method": result["cases"][0]["method"] = "DELETE"
                elif mutation == "payload": result["cases"][0]["response"]["order_id"] = "wrong-order"
                else:
                    row = next(row for row in result["cases"] if row["label"] == "H2")
                    row["response"]["code" if mutation == "h2-code" else "message"] = "wrong"
                with self.assertRaises(subject.BoundaryError):
                    subject._http_parity(result, native, requests)

    def test_h2_details_hint_extra_or_missing_key_cannot_leak_even_when_code_message_match(self):
        """Break: checking only code/message and allowing quote data in H2's remaining body."""
        for key, value in (("details", "quote-private"), ("hint", "order-private"), ("quote_id", "leaked"), ("details", ...)):
            with self.subTest(key=key, value=value):
                result, native, requests = parity_fixture()
                row = next(row for row in result["cases"] if row["label"] == "H2")
                if value is ...: row["response"].pop(key)
                else: row["response"][key] = value
                with self.assertRaises(subject.BoundaryError):
                    subject._http_parity(result, native, requests)


class ObserverTests(TemporarySource):
    def setUp(self):
        super().setUp()
        self.put("observer.sql", b"select 'inert-observer-boundary';\n")
        self.cases = [{"label": "F6"}, {"label": "H2"}, {"label": "NF_NULL_ACTOR"}]
        # The external SQL response is literal input; _install/_observe stay real.
        self.observation = {"label": "afterA", "sessionUser": "fixture_admin", "currentUser": "fixture_admin", "timezone": "UTC",
            "digest": "a" * 64, "state": {}, "financialZero": True, "fullZero": True, "aclValid": True,
            "financialCounts": {name: 0 for name in ("receipts", "star_candy_history", "star_candy_bonus_history",
                "wallet_financial_operations", "wallet_credit_operations", "wallet_credit_allocations", "wallet_debit_operations",
                "wallet_debit_allocations", "wallet_debit_bucket_allocations", "wallet_repair_operations", "wallet_recovery_debts",
                "wallet_recovery_debt_events", "wallet_provider_event_inbox", "wallet_provider_verification_attestations",
                "purchase_reward_snapshots", "purchase_reward_allocations", "purchase_promotion_resolutions", "purchase_promotion_resolution_events",
                "purchase_promotion_awards", "purchase_promotion_resolution_inputs", "wallet_promotion_time_attestations", "purchase_refund_events",
                "purchase_refund_allocations", "cotton_candy_grants", "cotton_candy_ledger", "wallet_star_lots", "wallet_star_spend_allocations",
                "wallet_star_lot_retirements", "wallet_star_lot_applications", "wallet_star_lot_violations", "wallet_bonus_projection_violations")},
            "fullCounts": {name: 0 for name in ("web_payment_verification_seals", "web_payment_verification_results", "web_payment_settlement_leases",
                "web_payment_settlement_outcomes", "web_payment_full_verification_proofs", "web_payment_settlements")},
            "native": {"F6": {"ok": True, "value": {"outcome": "FOUND"}},
                "H2": {"ok": False, "code": "P0001", "message": "WEB_PAYMENT_CHARGE_CONTEXT_BINDING_INVALID"},
                "NF_NULL_ACTOR": {"ok": True, "value": {"contract_version": "web-payment-charge-context.v1", "outcome": "NOT_FOUND", "charge_authority": False}}}}

    def sql(self, sql, *, user, check):
        self.assertEqual((user, check), ("fixture_admin", False))
        return subprocess.CompletedProcess([], 0, "CHARGE_CONTEXT_OBSERVATION " + json.dumps(self.observation)
                                           + "\nCHARGE_CONTEXT_OBSERVER_COMPLETE\n", "")

    def observe(self):
        return subject._observe(types.SimpleNamespace(sql=self.sql), self.root, self.root, "afterA", self.cases)

    def test_complete_zero_counts_native_envelopes_and_marker_are_accepted(self):
        """Break: discarding the SQL response rather than validating and retaining evidence."""
        self.assertEqual(self.observe(), self.observation)

    def test_wrong_31_or_6_count_nonzero_bool_and_missing_native_label_fail_closed(self):
        """Break: trusting count flags instead of exact count shape/value and label coverage."""
        original = copy.deepcopy(self.observation)
        for field, mutation in (("financialCounts", "missing"), ("fullCounts", "extra"),
                                ("financialCounts", "nonzero"), ("fullCounts", "bool"), ("native", "missing")):
            with self.subTest(field=field, mutation=mutation):
                self.observation = copy.deepcopy(original)
                rows = self.observation[field]
                if mutation == "missing": rows.pop(next(iter(rows)))
                elif mutation == "extra": rows["unapproved"] = 0
                else: rows[next(iter(rows))] = True if mutation == "bool" else 1
                with self.assertRaises(subject.BoundaryError): self.observe()

    def test_malformed_top_level_counts_native_or_envelope_raise_boundary_error(self):
        """Break: leaking KeyError/TypeError instead of a fixed observer boundary refusal."""
        original = copy.deepcopy(self.observation)
        for field, value in ((None, []), (None, {}), ("financialCounts", []), ("fullCounts", None),
                             ("native", []), ("native", {"F6": None, "H2": {}, "NF_NULL_ACTOR": {}})):
            with self.subTest(field=field, value=value):
                self.observation = copy.deepcopy(original)
                if field is None: self.observation = value
                else: self.observation[field] = value
                with self.assertRaises(subject.BoundaryError): self.observe()


class DbManifestBoundaryTests(TemporarySource):
    def setUp(self):
        super().setUp()
        self.db_path = Path("/Users/charlie.hyun/orca/workspaces/picnic-supabase/web-payment-contract")
        self.manifest_path = self.put("db.json", b"{}\n")

    def verify(self, path=None, approved="34c338874cdfd0590838671686747ba178f8c0ac882e0583a3e916dd40cd98a5"):
        # Intercept all inspection of the real D root; no D file or process is touched.
        original_dir, original_link = Path.is_dir, Path.is_symlink
        def is_dir(path): return True if path == self.db_path else original_dir(path)
        def is_link(path): return False if path == self.db_path else original_link(path)
        def process(*args, **kwargs): raise AssertionError("invalid DB input reached an external process")
        with patch.object(subject, "ROOT", self.root), patch.object(Path, "is_dir", is_dir), \
                patch.object(Path, "is_symlink", is_link), patch.object(subprocess, "run", process):
            return subject._verify_db(self.db_path, path or self.manifest_path, approved)

    def test_outside_web_manifest_gets_source_path_boundary_before_read(self):
        """Break: relative_to raises a generic ValueError or an outside path is read."""
        self.refuses("SOURCE_PATH", lambda: self.verify(Path("/not-approved/db-manifest.json")))

    def test_wrong_approval_or_changed_bytes_are_not_self_approved(self):
        """Break: computing approval from the caller's bytes instead of the fixed root pin."""
        for approved in (None, "", "0" * 64, "34c338874cdfd0590838671686747ba178f8c0ac882e0583a3e916dd40cd98a5"):
            with self.subTest(approved=approved): self.refuses("DB_MANIFEST_HASH", lambda: self.verify(approved=approved))

    def test_missing_manifest_and_symlink_are_refused_without_db_access(self):
        """Break: using an unavailable or symlinked W manifest as authority."""
        self.refuses("SOURCE_PATH", lambda: self.verify(self.root / "missing.json"))
        alias = self.root / "alias.json"
        alias.symlink_to(self.manifest_path)
        self.refuses("SOURCE_PATH", lambda: self.verify(alias))

    def test_db_root_input_cannot_select_another_workspace(self):
        """Break: an arbitrary existing directory supplies executable DB sources."""
        self.refuses("DB_ROOT", lambda: subject._verify_db(self.root, self.manifest_path, "0" * 64))

    def test_db_manifest_nonobject_and_missing_or_extra_93_source_closure_fail_closed(self):
        """Break: malformed identity or 92/94 sources bypass the hardcoded 93-source policy."""
        base = {"root": "/Users/charlie.hyun/orca/workspaces/picnic-supabase/web-payment-contract",
                "sourceCommit": "e0ba366ba3b02e151b9fb2ab8e3a272af72d2ae5",
                "dependencySqlSha256": "f6791fffdeaba348bf1e15dcd72460113ed0a8b64748c8eb290bae4cc3f78a2c",
                "files": {"scripts/wallet/input-%d.sql" % n: {"sha256": "a" * 64} for n in range(93)}}
        invalid = [None, [], {}, dict(base, root="/tmp/arbitrary-db"), dict(base, sourceCommit="0" * 40),
                   dict(base, dependencySqlSha256="0" * 64), dict(base, files=[])]
        for count in (92, 94):
            invalid.append(dict(base, files={"scripts/wallet/input-%d.sql" % n: {"sha256": "a" * 64} for n in range(count)}))
        for value in invalid:
            with self.subTest(value_type=type(value).__name__):
                self.refuses("DB_MANIFEST_IDENTITY", lambda: subject._validate_db_manifest(value))


class PinnedConsumptionTests(TemporarySource):
    def test_returns_the_single_verified_byte_snapshot_without_a_second_read(self):
        """Break: verifying one read and returning a later unverified read for execution."""
        data = b"select 1;\n"
        path = self.put("owned.sql", data)
        original = Path.read_bytes
        reads = []
        def read(candidate):
            if candidate == path:
                reads.append(candidate)
                return data if len(reads) == 1 else b"select unsafe_second_read;\n"
            return original(candidate)
        with patch.object(Path, "read_bytes", read):
            self.assertEqual(subject._read_pinned(self.root, "owned.sql", {"owned.sql": sha(data)}), b"select 1;\n")
        self.assertEqual(len(reads), 1)

    def test_changed_execution_bytes_cannot_use_an_earlier_preflight_hash(self):
        """Break: consuming changed SQL/guard/entry bytes after preflight approved earlier bytes."""
        self.put("owned.sql", b"select changed;\n")
        self.refuses("SOURCE_HASH", lambda: subject._read_pinned(self.root, "owned.sql", {"owned.sql": sha(b"select 1;\n")}))

    def test_missing_pin_traversal_and_symlink_cannot_supply_execution_bytes(self):
        """Break: arbitrary input paths enlarge the fixed executable source closure."""
        self.put("owned.sql", b"select 1;\n")
        self.refuses("SOURCE_HASH", lambda: subject._read_pinned(self.root, "owned.sql", {}))
        self.refuses("SOURCE_PATH", lambda: subject._read_pinned(self.root, "../outside.sql", {"../outside.sql": "a" * 64}))
        alias = self.root / "alias.sql"
        alias.symlink_to(self.root / "owned.sql")
        self.refuses("SOURCE_PATH", lambda: subject._read_pinned(self.root, "alias.sql", {"alias.sql": sha(b"select 1;\n")}))


class RuntimeFlagTests(unittest.TestCase):
    def test_nonisolated_or_bytecode_enabled_invocation_is_rejected(self):
        """Break: setting dont_write_bytecode at runtime impersonates the real -I/-B flags."""
        for isolated, no_bytecode in ((0, 0), (0, 1), (1, 0)):
            with self.subTest(isolated=isolated, no_bytecode=no_bytecode):
                with self.assertRaises(subject.BoundaryError) as caught:
                    subject._runtime_flags(types.SimpleNamespace(isolated=isolated, dont_write_bytecode=no_bytecode, safe_path=True))
                self.assertEqual(caught.exception.code, "INTERPRETER_FLAGS")

    def test_measured_safe_path_is_retained_and_missing_safe_path_is_disclosed(self):
        """Break: claiming safe_path was measured on an interpreter without that flag."""
        measured = subject._runtime_flags(types.SimpleNamespace(isolated=1, dont_write_bytecode=1, safe_path=True))
        self.assertEqual(measured["safePath"], True)
        self.assertEqual(measured["safePathObserved"], True)
        old = subject._runtime_flags(types.SimpleNamespace(isolated=1, dont_write_bytecode=1))
        self.assertIsNone(old["safePath"])
        self.assertEqual(old["safePathObserved"], False)
        self.assertIn("unavailable", old["compatibilityLimit"])


class CleanupBoundaryTests(unittest.TestCase):
    def test_metadata_exception_still_attempts_factory_close_and_retains_original_error(self):
        """Break: reading pair metadata raises before the existing factory can clean up."""
        events = []
        class Pair:
            @property
            def containers(self): raise RuntimeError("metadata-unavailable")
            def close(self):
                events.append("factory-close")
                raise OSError("controlled-close-failure")
        handlers = {15: "original-handler"}
        signals = types.SimpleNamespace(SIGTERM=15, SIG_IGN="ignored",
            getsignal=lambda number: handlers[number], signal=lambda number, handler: handlers.__setitem__(number, handler))
        receipt = {"originalError": {"type": "RuntimeError", "message": "original-http"}}
        with self.assertRaisesRegex(OSError, "^controlled-close-failure$"):
            subject._cleanup_pair(Pair(), receipt, signals=signals)
        self.assertEqual(events, ["factory-close"])
        self.assertEqual(receipt["originalError"]["message"], "original-http")
        self.assertEqual(receipt["metadataError"]["message"], "metadata-unavailable")
        self.assertEqual(handlers[15], "original-handler")

    def test_repeated_term_is_ignored_during_factory_close_and_previous_handler_is_restored(self):
        """Break: a second TERM can interrupt cleanup or the caller's handler is lost."""
        handlers = {15: "previous-handler"}
        during = []
        class Pair:
            containers = []
            ledger = types.SimpleNamespace(unknown=[])
            uncertain_phase = None
            run_id = "controlled-run"
            images = {}
            network = None
            def close(self):
                during.append(handlers[15])
                raise OSError("controlled-close-stop")
        signals = types.SimpleNamespace(SIGTERM=15, SIG_IGN="ignored",
            getsignal=lambda number: handlers[number], signal=lambda number, handler: handlers.__setitem__(number, handler))
        with self.assertRaisesRegex(OSError, "^controlled-close-stop$"):
            subject._cleanup_pair(Pair(), {"originalError": None}, signals=signals)
        self.assertEqual(during, ["ignored"])
        self.assertEqual(handlers[15], "previous-handler")


def complete_receipt():
    # Four hand-derived observations: stop changes A -> B, each HTTP phase is read-only.
    observation = {"digest": "before-stop", "financialZero": True, "fullZero": True, "aclValid": True,
                   "native": {"F9": {"ok": True, "value": {"outcome": "FOUND", "actor_deleted": False}}}}
    after_stop = dict(observation, digest="after-stop",
                      native={"F9": {"ok": True, "value": {"outcome": "FOUND", "actor_deleted": True}}})
    return {"phases": {"A": {"completed": True, "exitCode": 0}, "B": {"completed": True, "exitCode": 0}},
            "observations": {"baselineA": observation, "afterA": copy.deepcopy(observation),
                             "baselineB": after_stop, "afterB": copy.deepcopy(after_stop)},
            "stopChangesAllowed": True, "originalError": None,
            "ownedContainerIds": [CID_PG, CID_REST, CID_NODE], "unknownCreation": [],
            "sourcesBefore": {"frozen.py": "a" * 64},
            "artifactHashesBefore": {"charge-context-http.cjs": "b" * 64,
                                     "guard.cjs": "c" * 64, "config.json": "d" * 64}}


class FinalizationTests(unittest.TestCase):
    def setUp(self):
        self.receipt = complete_receipt()
        self.absence = {"containers": {CID_PG: True, CID_REST: True, CID_NODE: True}, "network": True}
        self.events = []
        self.cleanup_error = None
        self.snapshot_error = None
        self.after = {"sources": {"frozen.py": "a" * 64},
                      "artifacts": {"charge-context-http.cjs": "b" * 64, "guard.cjs": "c" * 64, "config.json": "d" * 64}}

    def cleanup(self):
        # External factory authority: no test-side recreation of cleanup selection.
        self.events.append("cleanup")
        if self.cleanup_error:
            raise self.cleanup_error
        return copy.deepcopy(self.absence)

    def snapshot(self):
        # External filesystem observation only; aggregation remains in the subject.
        self.events.append("snapshot")
        if self.snapshot_error:
            raise self.snapshot_error
        return copy.deepcopy(self.after)

    def finish(self):
        return subject.finalize_receipt(self.receipt, cleanup=self.cleanup, snapshot=self.snapshot)

    def test_complete_four_observations_allow_stop_difference_and_require_cleanup(self):
        """Wrong branch: compares A and B digests or reports pass before cleanup evidence."""
        result = self.finish()
        self.assertEqual((result["status"], result["exitCode"]), ("passed", 0))
        self.assertEqual(result["absence"], self.absence)
        self.assertEqual(self.events, ["cleanup", "snapshot"])

    def test_original_failure_survives_successful_cleanup_and_cannot_become_pass(self):
        """Wrong branch: successful cleanup erases the original HTTP failure."""
        self.receipt["originalError"] = {"type": "BoundaryError", "message": "original-native-parity"}
        result = self.finish()
        self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
        self.assertEqual(result["originalError"], {"type": "BoundaryError", "message": "original-native-parity"})
        self.assertEqual(self.events, ["cleanup", "snapshot"])

    def test_cleanup_error_is_recorded_separately_from_original_error(self):
        """Wrong branch: a finally exception replaces the operation's failure cause."""
        self.receipt["originalError"] = {"type": "RuntimeError", "message": "original-seed-role"}
        self.cleanup_error = RuntimeError("cleanup-inspect-unknown")
        result = self.finish()
        self.assertEqual(result["originalError"]["message"], "original-seed-role")
        self.assertEqual(result["cleanupError"], {"type": "RuntimeError", "message": "cleanup-inspect-unknown"})
        self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
        self.assertEqual(self.events, ["cleanup", "snapshot"])

    def test_cleanup_unknown_missing_foreign_or_present_cid_cannot_pass(self):
        """Wrong branch: empty/all truthiness or rm exit status substitutes for exact absence."""
        for bad in (None, {"containers": {}, "network": True},
                    {"containers": {CID_PG: True, CID_REST: True, CID_NODE: None}, "network": True},
                    {"containers": {CID_PG: True, CID_REST: True, CID_NODE: False}, "network": True},
                    {"containers": {CID_PG: True, CID_REST: True, CID_NODE: True, "f" * 64: True}, "network": True},
                    {"containers": {CID_PG: True, CID_REST: True, CID_NODE: True}, "network": None}):
            with self.subTest(absence=bad):
                self.absence = bad
                result = self.finish()
                self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))

    def test_source_artifact_or_config_mutation_overrides_other_success(self):
        """Wrong branch: only the bundle, or only the first source snapshot, is checked."""
        for area, path in (("sources", "frozen.py"), ("artifacts", "charge-context-http.cjs"),
                           ("artifacts", "guard.cjs"), ("artifacts", "config.json")):
            with self.subTest(area=area, path=path):
                previous = self.after[area][path]
                self.after[area][path] = "f" * 64
                result = self.finish()
                self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
                self.after[area][path] = previous

    def test_snapshot_exception_still_fails_after_cleanup_without_masking_original(self):
        """Wrong branch: final hash read failure silently skips source verification."""
        self.receipt["originalError"] = {"type": "RuntimeError", "message": "original-http"}
        self.snapshot_error = OSError("source-disappeared")
        result = self.finish()
        self.assertEqual(result["originalError"]["message"], "original-http")
        self.assertEqual(result["sourceVerificationError"], {"type": "OSError", "message": "source-disappeared"})
        self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
        self.assertEqual(self.events, ["cleanup", "snapshot"])

    def test_missing_observation_phase_or_unknown_creation_is_never_complete(self):
        """Wrong branch: partial phase/observer output is accepted as complete HTTP coverage."""
        for missing in ("baselineA", "afterA", "baselineB", "afterB", "phaseB", "unknownCreation"):
            with self.subTest(missing=missing):
                self.receipt = complete_receipt()
                if missing == "phaseB":
                    self.receipt["phases"].pop("B")
                elif missing == "unknownCreation":
                    self.receipt["unknownCreation"] = ["node-create-timeout"]
                else:
                    self.receipt["observations"].pop(missing)
                result = self.finish()
                self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))

    def test_within_phase_mutation_financial_full_acl_or_stop_violation_fails(self):
        """Wrong branch: phase markers hide state mutation, financial rows or ACL drift."""
        cases = (("afterA", "digest", "mutated"), ("afterB", "digest", "mutated"),
                 ("baselineA", "financialZero", False), ("afterA", "fullZero", False),
                 ("baselineB", "aclValid", False), ("afterB", "financialZero", None))
        for name, key, value in cases:
            with self.subTest(observation=name, field=key):
                self.receipt = complete_receipt()
                self.receipt["observations"][name][key] = value
                self.assertEqual(self.finish()["exitCode"], 1)
        self.receipt = complete_receipt()
        self.receipt["stopChangesAllowed"] = False
        self.assertEqual(self.finish()["exitCode"], 1)

    def test_same_digest_cannot_hide_same_phase_native_response_change(self):
        """Break: checking only digest permits native envelope drift after HTTP."""
        for phase, deleted in (("A", True), ("B", False)):
            with self.subTest(phase=phase):
                self.receipt = complete_receipt()
                self.receipt["observations"]["after" + phase]["native"]["F9"]["value"]["actor_deleted"] = deleted
                self.assertEqual((self.finish()["status"], self.finish()["exitCode"]), ("failed", 1))


# Root executes this VM harness. All unsafe original operations are replaced
# before evaluating the actual guard source. A permitted wrapper reaches a
# throwing external sentinel; a forbidden wrapper must stop before that point.
# This tests cooperative wrappers only, not an adversarial-code sandbox.
GUARD_HARNESS = r"""
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const { isIP } = require('node:net');
const source = fs.readFileSync(process.argv[1], 'utf8');
const actions = JSON.parse(process.argv[2]);
const unsafe = [];
function sentinel(kind) {
  return function() { unsafe.push(kind); const e = new Error('external-boundary:' + kind); e.code = 'EXTERNAL_SENTINEL'; throw e; };
}
function Socket() {}
Socket.prototype.connect = sentinel('tcp');
function Server() {}
Server.prototype.listen = sentinel('listen');
function Datagram() {}
Datagram.prototype.send = sentinel('udp-send');
const net = {isIP, Socket, Server, _normalizeArgs: a => [typeof a[0] === 'object' ? a[0] : {port:a[0],host:a[1]}]};
const http = {request:sentinel('http-request'), get:sentinel('http-get')};
const https = {request:sentinel('https-request'),get:sentinel('https-get')};
const tls = {connect:sentinel('tls')};
const http2 = {connect:sentinel('http2')};
const dgram = {Socket:Datagram, createSocket:sentinel('udp-create')};
const resolveNames = ['resolve','resolve4','resolve6','resolveAny','resolveCaa','resolveCname',
 'resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse'];
function Resolver() {}
function PromiseResolver() {}
const dns = {promises:{Resolver:PromiseResolver},Resolver};
for (const owner of [dns,dns.promises,Resolver.prototype,PromiseResolver.prototype]) {
  const names = owner === dns || owner === dns.promises ? ['lookup','lookupService',...resolveNames] : resolveNames;
  for (const name of names) owner[name] = sentinel('resolver:' + name);
}
const cp = {};
for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) cp[name] = sentinel('child:' + name);
const threads = {Worker:sentinel('worker')};
const config = {restIp:'172.29.40.3',restAlias:'order-rest',restPort:3000};
const modules = {'node:net':net,'node:http':http,'node:https':https,'node:tls':tls,'node:http2':http2,
 'node:dns':dns,'node:dgram':dgram,'node:child_process':cp,'node:worker_threads':threads,
 'node:fs':{readFileSync:(path,enc) => {
   if(path !== '/fixture/config.json' || enc !== 'utf8') throw new Error('unexpected config read');
   return JSON.stringify(config);
 }}};
const sandbox = {require:name=>{if(!(name in modules))throw new Error('unexpected require:'+name);return modules[name];},
 module:{exports:{}},URL,process:{nextTick:process.nextTick.bind(process)},fetch:sentinel('fetch')};
let loaded = false;
try { vm.runInNewContext(source,sandbox,{filename:process.argv[1]}); loaded = true; }
catch(e) { console.log(JSON.stringify({loadError:{code:e.code||null,message:e.message},unsafe})); }
if (loaded) {
 (async()=>{
  const guard=sandbox.module.exports, results=[];
  for(const a of actions) {
   const start=unsafe.length;
   try {
    let value;
    if(a.kind==='register') value=guard.allowProxy(a.port);
    else if(a.kind==='fetch') value=await sandbox.fetch(a.url,{method:a.method});
    else if(a.kind==='request') value=http.request(a.options||a.url,a.options?undefined:{method:a.method});
    else if(a.kind==='get') value=http.get(a.url);
    else if(a.kind==='tcp') value=new Socket().connect(a.options);
    else if(a.kind==='listen') value=new Server().listen(a.options);
    else if(a.kind==='dns') {
     const owner=a.owner==='plain'?dns:a.owner==='promise'?dns.promises:a.owner==='resolver'?new Resolver():new PromiseResolver();
     if(a.method==='lookup' && a.owner==='plain') value=await new Promise((resolve,reject)=>owner.lookup(a.host,a.options||{},(e,address,family)=>e?reject(e):resolve({address,family})));
     else value=await owner[a.method](a.host,a.options||{});
    } else if(a.kind==='child') value=cp[a.method]('unused');
    else if(a.kind==='worker') value=new threads.Worker('unused');
    else if(a.kind==='https') value=https[a.method](a.url);
    else if(a.kind==='tls') value=tls.connect({host:'example.invalid',port:443});
    else if(a.kind==='http2') value=http2.connect('https://example.invalid');
    else if(a.kind==='udp') value=a.method==='send'?new Datagram().send('unused',9,'example.invalid'):dgram.createSocket('udp4');
    else throw new Error('unknown test action');
    results.push({ok:true,value:value===undefined?null:value,unsafe:unsafe.length-start});
   } catch(e) {results.push({ok:false,code:e.code||null,message:e.message,unsafe:unsafe.length-start});}
  }
  console.log(JSON.stringify({results,report:guard.report(),unsafe}));
 })().catch(e=>{console.error(e.stack);process.exitCode=1;});
}
"""


class GuardTests(unittest.TestCase):
    def guard(self, actions):
        node = shutil.which("node")
        if node is None:
            raise RuntimeError("Infrastructure: installed Node is required; no installation is authorized")
        result = subprocess.run([node, "-e", GUARD_HARNESS, str(HERE / "guard.cjs"), json.dumps(actions)],
                                text=True, capture_output=True, timeout=15,
                                env={"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "NODE_ENV": "test"})
        if result.returncode:
            raise RuntimeError("Guard harness infrastructure error: " + result.stderr)
        data = json.loads(result.stdout)
        if "loadError" in data:
            raise RuntimeError("Guard missing-contract/infrastructure: " + json.dumps(data["loadError"]))
        return data

    def denied(self, rows):
        for row in rows:
            self.assertFalse(row["ok"])
            self.assertTrue(row["message"].startswith("CHARGE_CONTEXT_HTTP_NETWORK_DENIED:"), row)
            self.assertEqual(row["unsafe"], 0, "forbidden request reached the throwing external sentinel")

    def test_topology_alias_is_denied_before_any_http_socket_or_dns_transport(self):
        """Break: treating order-rest topology metadata as usable Node transport authority."""
        actions = [
            {"kind": "fetch", "method": "GET", "url": "http://order-rest:3000/rpc/get_web_payment_charge_context"},
            {"kind": "request", "method": "POST", "url": "http://order-rest:3000/rpc/get_web_payment_charge_context"},
            {"kind": "tcp", "options": {"host": "order-rest", "port": 3000}},
            {"kind": "dns", "owner": "promise", "method": "lookup", "host": "order-rest"},
        ]
        data = self.guard(actions)
        self.denied(data["results"])
        self.assertEqual(data["unsafe"], [])

    def test_exact_getter_get_post_and_registered_proxy_reach_only_external_sentinels(self):
        """Wrong branch: accepted getter paths/methods are denied or rewritten to another target."""
        query = "?p_actor_user_id=aaaaaaaa-0000-4000-8000-000000000001&p_order_id=bbbbbbbb-0000-4000-8000-000000000002"
        actions = [{"kind": "register", "port": 41001}]
        for kind in ("fetch", "request"):
            for method in ("GET", "POST"):
                for base, path in (("http://172.29.40.3:3000", "/rpc/"),
                                   ("http://127.0.0.1:41001", "/rest/v1/rpc/")):
                    actions.append({"kind": kind, "method": method, "url": base + path + "get_web_payment_charge_context" + (query if method == "GET" else "")})
        data = self.guard(actions)
        self.assertTrue(data["results"][0]["ok"])
        for row in data["results"][1:]:
            self.assertEqual((row["code"], row["unsafe"]), ("EXTERNAL_SENTINEL", 1))

    def test_query_projection_duplicates_bad_uuid_and_post_query_are_denied(self):
        """Wrong branch: arbitrary query keys/duplicates or POST query smuggle an alternate RPC call."""
        queries = ("?select=*", "?order=id", "?unknown=x", "?p_order_id=not-uuid",
                   "?p_order_id=null&p_order_id=null", "?p_order_id=", "?p_actor_user_id=undefined")
        actions = [{"kind": kind, "method": "GET", "url": "http://172.29.40.3:3000/rpc/get_web_payment_charge_context" + query}
                   for kind in ("fetch", "request") for query in queries]
        actions.append({"kind": "fetch", "method": "POST", "url": "http://172.29.40.3:3000/rpc/get_web_payment_charge_context?p_order_id=null"})
        self.denied(self.guard(actions)["results"])

    def test_get_null_or_omitted_arguments_reach_transport_as_diagnostics(self):
        """Wrong branch: guard treats JS GET null/undefined diagnostics as forbidden POST null cases."""
        data = self.guard([{"kind": "fetch", "method": "GET", "url": "http://172.29.40.3:3000/rpc/get_web_payment_charge_context" + query}
                           for query in ("", "?p_order_id=null", "?p_actor_user_id=null&p_order_id=null")])
        for row in data["results"]:
            self.assertEqual((row["code"], row["unsafe"]), ("EXTERNAL_SENTINEL", 1))

    def test_other_rpc_table_path_method_scheme_userinfo_fragment_and_host_are_denied(self):
        """Wrong branch: raw-address approval bypasses HTTP method/path/query constraints."""
        urls = ("http://172.29.40.3:3000/rpc/create_web_payment_order", "http://172.29.40.3:3000/web_payment_orders",
                "http://172.29.40.3:3000/rpc/get_web_payment_charge_context/", "http://172.29.40.3:3000/rpc/%67et_web_payment_charge_context",
                "https://172.29.40.3:3000/rpc/get_web_payment_charge_context", "http://user@172.29.40.3:3000/rpc/get_web_payment_charge_context",
                "http://172.29.40.3:3000/rpc/get_web_payment_charge_context#x", "http://example.invalid:3000/rpc/get_web_payment_charge_context",
                "http://127.0.0.1:54322/rpc/get_web_payment_charge_context", "http://172.29.40.3:3001/rpc/get_web_payment_charge_context")
        actions = [{"kind": kind, "method": "GET", "url": url} for kind in ("fetch", "request") for url in urls]
        actions += [{"kind": "fetch", "method": method, "url": "http://172.29.40.3:3000/rpc/get_web_payment_charge_context"}
                    for method in ("PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")]
        self.denied(self.guard(actions)["results"])

    def test_http_request_options_cannot_bypass_getter_query_validation(self):
        """Wrong branch: only URL-string requests are guarded while option objects bypass validation."""
        actions = [{"kind": "request", "options": {"hostname": "172.29.40.3", "port": 3000, "method": "GET", "path": path}}
                   for path in ("/rpc/get_web_payment_charge_context?select=*", "/web_payment_orders", "/rpc/other")]
        self.denied(self.guard(actions)["results"])

    def test_proxy_registration_is_once_only_and_rejects_shared_or_invalid_ports(self):
        """Wrong branch: invalid, shared54322 or second proxy registration expands address authority."""
        self.denied(self.guard([{"kind": "register", "port": port} for port in (0, -1, 65536, 54322, "41001", None)])["results"])
        data = self.guard([{"kind": "register", "port": 41001}, {"kind": "register", "port": 41002}])
        self.assertTrue(data["results"][0]["ok"])
        self.denied(data["results"][1:])

    def test_raw_socket_address_and_loopback_port_zero_listen_are_separate_boundaries(self):
        """Wrong branch: raw sockets gain external/Unix access or listeners bind wildcard/fixed ports."""
        actions = [{"kind": "register", "port": 41001},
                   {"kind": "tcp", "options": {"host": "172.29.40.3", "port": 3000}},
                   {"kind": "tcp", "options": {"host": "127.0.0.1", "port": 41001}},
                   {"kind": "listen", "options": {"host": "127.0.0.1", "port": 0}},
                   {"kind": "tcp", "options": {"host": "example.invalid", "port": 443}},
                   {"kind": "tcp", "options": {"path": "/var/run/docker.sock"}},
                   {"kind": "tcp", "options": {"host": "127.0.0.1", "port": 54322}},
                   {"kind": "listen", "options": {"host": "0.0.0.0", "port": 0}},
                   {"kind": "listen", "options": {"host": "127.0.0.1", "port": 41001}}]
        rows = self.guard(actions)["results"]
        for row in rows[1:4]:
            self.assertEqual((row["code"], row["unsafe"]), ("EXTERNAL_SENTINEL", 1))
        self.denied(rows[4:])

    def test_resolver_prototypes_child_seven_worker_tls_udp_and_http_get_stop_before_tripwire(self):
        """Wrong branch: alternate DNS/process/worker entry points escape the cooperative wrappers."""
        resolve_names = ("resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname",
                         "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse")
        actions = [{"kind": "dns", "owner": owner, "method": name, "host": "example.invalid"}
                   for owner in ("plain", "promise", "resolver", "promise-resolver")
                   for name in (("lookup", "lookupService") + resolve_names if owner in ("plain", "promise") else resolve_names)]
        actions += [{"kind": "child", "method": name} for name in ("spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork")]
        actions += [{"kind": "worker"}, {"kind": "tls"}, {"kind": "http2"},
                    {"kind": "udp", "method": "send"}, {"kind": "udp", "method": "createSocket"},
                    {"kind": "https", "method": "get", "url": "https://example.invalid"},
                    {"kind": "https", "method": "request", "url": "https://example.invalid"},
                    {"kind": "get", "url": "http://example.invalid"}]
        data = self.guard(actions)
        # 16 plain + 16 promises + 14 Resolver + 14 promises.Resolver + 7 child + 8 other.
        self.assertEqual(len(data["results"]), 75)
        self.denied(data["results"])
        self.assertEqual(data["unsafe"], [])

    def test_literal_lookup_uses_no_resolver_and_preserves_ipv4_family_results(self):
        """Wrong branch: even approved numeric lookup invokes DNS or returns an IPv6 address."""
        rows = self.guard([
            {"kind": "dns", "owner": "plain", "method": "lookup", "host": "127.0.0.1"},
            {"kind": "dns", "owner": "promise", "method": "lookup", "host": "172.29.40.3", "options": {"all": True}},
            {"kind": "dns", "owner": "promise", "method": "lookup", "host": "172.29.40.3", "options": {"family": 6}},
        ])["results"]
        self.assertEqual(rows[0], {"ok": True, "value": {"address": "127.0.0.1", "family": 4}, "unsafe": 0})
        self.assertEqual(rows[1], {"ok": True, "value": [{"address": "172.29.40.3", "family": 4}], "unsafe": 0})
        self.assertEqual((rows[2]["code"], rows[2]["unsafe"]), ("EAI_ADDRFAMILY", 0))


if __name__ == "__main__":
    unittest.main()
