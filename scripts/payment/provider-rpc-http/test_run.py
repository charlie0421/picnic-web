"""Root-run unit contracts for the D1 binding HTTP harness.

Run with python3 -I -B. These fixtures describe transport outcomes, not SQL
or provider proof. Only root runs this suite and the actual HTTP measurement.
Each test names a wrong branch in the runner that it must detect.
"""

import copy
from contextlib import contextmanager, redirect_stderr, redirect_stdout
import hashlib
import importlib.util
import io
import json
import marshal
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


HERE = Path(__file__).absolute().parent
SUBJECT_PATH = HERE / "run.py"
# An absent body is intentionally an absent-import checkpoint, not behavior RED.
SUBJECT_BYTES = SUBJECT_PATH.read_bytes()
subject = types.ModuleType("provider_rpc_http_unit_subject")
subject.__file__ = str(SUBJECT_PATH)
subject.__spec__ = importlib.util.spec_from_loader(subject.__name__, None, origin=str(SUBJECT_PATH))
sys.modules[subject.__name__] = subject
exec(compile(SUBJECT_BYTES, str(SUBJECT_PATH), "exec"), subject.__dict__)

HEAD = "1234567890abcdef1234567890abcdef12345678"
DB_HEAD = "471b278cb57835973c3b24748f74898d03cef968"
REUSE = {
    "pair_fixture": "scripts/payment/order-http/pair_fixture.py",
    "setup_db": "scripts/payment/order-http/setup_db.py",
    "order_http_run": "scripts/payment/order-http/run.py",
    "charge_context_run": "scripts/payment/charge-context-http/run.py",
}
FROZEN = (*REUSE.values(), "lib/payment/paypal-charge/binding-source.ts", "lib/payment/paypal-charge/repository.ts")
OWNED = (
    "scripts/payment/provider-rpc-http/run.py", "scripts/payment/provider-rpc-http/test_run.py",
    "scripts/payment/provider-rpc-http/guard.cjs", "scripts/payment/provider-rpc-http/bundle.mjs",
    "scripts/payment/provider-rpc-http/seed.sql", "scripts/payment/provider-rpc-http/observer.sql",
    "scripts/payment/provider-rpc-http/rotate.sql", "scripts/payment/provider-rpc-http/stop.sql",
    "__tests__/integration/payment/provider-binding-postgrest.http.ts",
)
INSTALLED = (
    "node_modules/@supabase/supabase-js/package.json", "node_modules/@supabase/supabase-js/dist/index.cjs",
    "node_modules/@supabase/postgrest-js/package.json", "node_modules/@supabase/postgrest-js/dist/index.cjs",
)
MIGRATIONS = (
    "20261111224520_web_payment_order_contract.sql", "20261112071844_web_payment_charge_lease.sql",
    "20261112081856_web_payment_provider_observation.sql", "20261112094913_web_payment_purchase_intake.sql",
    "20261112113100_web_payment_verification_binding.sql", "20261112124327_web_payment_verification_result.sql",
    "20261112145247_web_payment_settlement.sql", "20261114015304_web_payment_charge_gate.sql",
    "20261115075731_web_payment_provider_binding_read.sql", "20261115122716_web_payment_provider_entry.sql",
)
FINANCIAL = (
    "receipts", "star_candy_history", "star_candy_bonus_history", "wallet_financial_operations",
    "wallet_credit_operations", "wallet_credit_allocations", "wallet_debit_operations", "wallet_debit_allocations",
    "wallet_debit_bucket_allocations", "wallet_repair_operations", "wallet_recovery_debts", "wallet_recovery_debt_events",
    "wallet_provider_event_inbox", "wallet_provider_verification_attestations", "purchase_reward_snapshots",
    "purchase_reward_allocations", "purchase_promotion_resolutions", "purchase_promotion_resolution_events",
    "purchase_promotion_awards", "purchase_promotion_resolution_inputs", "wallet_promotion_time_attestations",
    "purchase_refund_events", "purchase_refund_allocations", "cotton_candy_grants", "cotton_candy_ledger",
    "wallet_star_lots", "wallet_star_spend_allocations", "wallet_star_lot_retirements", "wallet_star_lot_applications",
    "wallet_star_lot_violations", "wallet_bonus_projection_violations",
)
FULL = (
    "web_payment_verification_seals", "web_payment_verification_results", "web_payment_settlement_leases",
    "web_payment_settlement_outcomes", "web_payment_full_verification_proofs", "web_payment_settlements",
)
ACTORS = {"A": "d155aa01-0000-4000-8000-000000000001", "B": "d155aa01-0000-4000-8000-000000000002",
          "C": "d155aa01-0000-4000-8000-000000000003"}
BINDING1 = "d155bb01-0000-4000-8000-000000000001"
BINDING2 = "d155bb01-0000-4000-8000-000000000002"
CID = ["1" * 64, "2" * 64, "3" * 64]
NID = "4" * 64
LABELS = ("B1", "B2", "B3", "B4", "NF_OTHER", "NF_UNKNOWN", "NF_NULL_ACTOR", "NF_NULL_ORDER", "NF_NULL_BOTH")
ENTRY = "__tests__/integration/payment/provider-binding-postgrest.http.ts"
RESULT_PREFIX = "PROVIDER_RPC_HTTP_RESULT "
PARTIAL_PREFIX = "PROVIDER_RPC_HTTP_PARTIAL_RESULT "
MARKERS = {"A": "unit-complete-A", "B": "unit-complete-B", "C": "unit-complete-C"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def cases():
    orders = {name: "d155cc01-0000-4000-8000-00000000000" + str(n)
              for n, name in enumerate(("B1", "B2", "B3", "B4"), 1)}
    return [
        {"label": "B1", "actor": ACTORS["A"], "order": orders["B1"]},
        {"label": "B2", "actor": ACTORS["A"], "order": orders["B2"]},
        {"label": "B3", "actor": ACTORS["A"], "order": orders["B3"]},
        {"label": "B4", "actor": ACTORS["C"], "order": orders["B4"]},
        {"label": "NF_OTHER", "actor": ACTORS["B"], "order": orders["B1"]},
        {"label": "NF_UNKNOWN", "actor": ACTORS["A"], "order": "d155cc09-0000-4000-8000-000000000099"},
        {"label": "NF_NULL_ACTOR", "actor": None, "order": orders["B1"]},
        {"label": "NF_NULL_ORDER", "actor": ACTORS["A"], "order": None},
        {"label": "NF_NULL_BOTH", "actor": None, "order": None},
    ]


def native_values():
    small = lambda outcome: {"contract_version": "web-payment-provider-binding.v1", "outcome": outcome,
                             "charge_authority": False}
    b1 = {**small("FOUND"), "order_id": cases()[0]["order"],
          "context_id": "d155dd01-0000-4000-8000-000000000001", "quote_id": "d155ee01-0000-4000-8000-000000000001",
          "quote_hash": "a" * 64, "provider": "PAYPAL", "environment": "SANDBOX", "billing_country": "US",
          "scope": {"account_id": "unit-account-v1", "merchant_id": "unit-merchant-v1"},
          "binding_id": BINDING1, "binding_version": "1", "binding_hash": "b" * 64,
          "credential_ref": "unit-paypal-v1", "expected_application": {"paypal_client_id": "unit-client-v1"}}
    b4 = {**b1, "order_id": cases()[3]["order"], "context_id": "d155dd01-0000-4000-8000-000000000004",
          "quote_id": "d155ee01-0000-4000-8000-000000000004", "provider": "PORTONE", "environment": "TEST",
          "billing_country": "KR", "scope": {"merchant_id": "unit-portone", "store_id": "unit-store",
          "channel_id": "unit-channel", "channel_type": "TEST"}, "expected_application": None}
    values = {"B1": b1, "B2": small("CONTEXT_REQUIRED"), "B3": small("VERIFICATION_BINDING_REQUIRED"), "B4": b4}
    values.update({label: small("NOT_FOUND") for label in LABELS[4:]})
    return {label: {"ok": True, "value": value} for label, value in values.items()}


def binding_value():
    return {"orderId": cases()[0]["order"], "contextId": "d155dd01-0000-4000-8000-000000000001",
            "provider": "PAYPAL", "environment": "SANDBOX", "billingCountry": "US",
            "scope": {"account_id": "unit-account-v1", "merchant_id": "unit-merchant-v1"},
            "bindingId": BINDING1, "bindingVersion": "1", "bindingHash": "b" * 64,
            "credentialRef": "unit-paypal-v1", "expectedPayPalClientId": "unit-client-v1"}


def controls():
    return {
        "web_payment_provider_settings": [
            {"provider": "PAYPAL", "environment": "SANDBOX", "mode": "OPEN", "allow_charge": True,
             "allow_new_orders": True, "verification_binding_id": BINDING1, "paypal_account_id": "unit-account-v1",
             "paypal_merchant_id": "unit-merchant-v1", "settings_version": 1, "untouched": "keep"},
            {"provider": "PORTONE", "environment": "TEST", "mode": "OPEN", "allow_charge": True,
             "allow_new_orders": True, "verification_binding_id": BINDING1, "untouched": "keep"}],
        "web_payment_verification_bindings": [{"id": BINDING1, "provider": "PAYPAL", "environment": "SANDBOX",
            "binding_version": 1, "credential_ref": "unit-paypal-v1", "binding_hash": "b" * 64}],
        "user_profiles": [{"id": value, "deleted_at": None, "nickname": key} for key, value in ACTORS.items()],
    }


def rotated_control():
    result = controls()
    result["web_payment_provider_settings"][0].update(verification_binding_id=BINDING2,
        paypal_account_id="unit-account-v2", paypal_merchant_id="unit-merchant-v2")
    result["web_payment_verification_bindings"].append({"id": BINDING2, "provider": "PAYPAL", "environment": "SANDBOX",
        "binding_version": 2, "credential_ref": "unit-paypal-v2", "binding_hash": "c" * 64})
    return result


def stopped_control():
    result = rotated_control()
    for row in result["web_payment_provider_settings"]:
        row.update(mode="CLOSED", allow_charge=False, allow_new_orders=False)
    result["user_profiles"][2]["deleted_at"] = "2026-11-16T00:00:00+00:00"
    return result


def observation(label="baselineA", control=None, control_digest="c" * 64):
    return {"label": label, "sessionUser": "fixture_admin", "currentUser": "fixture_admin", "timezone": "UTC",
            "productDigest": "d" * 64, "controlDigest": control_digest,
            "controlState": copy.deepcopy(controls() if control is None else control),
            "financialCounts": {name: 0 for name in FINANCIAL}, "fullCounts": {name: 0 for name in FULL},
            "financialZero": True, "fullZero": True, "aclValid": True, "native": native_values()}


def sdk_headers(method="POST"):
    # SDK external-fetch input, before Node fetch adds wire defaults such as */*.
    return {"accept": None, "prefer": None, "contentType": "application/json" if method == "POST" else None,
            "contentProfile": "public" if method == "POST" else None,
            "acceptProfile": "public" if method == "GET" else None,
            "apikeyMatches": True, "authorizationMatches": True, "clientInfoVersion": "2.112.3"}


def http_result(phase="A"):
    native = native_values()
    source_values = {"B1": {"ok": True, "value": binding_value()},
        "B2": {"ok": True, "value": {"kind": "CONTEXT_REQUIRED"}},
        "B3": {"ok": True, "value": {"kind": "VERIFICATION_BINDING_REQUIRED"}},
        "B4": {"ok": False, "name": "ChargeRepositoryError", "stage": "RESPONSE"},
        "NF_OTHER": {"ok": True, "value": {"kind": "NOT_FOUND"}},
        "NF_UNKNOWN": {"ok": True, "value": {"kind": "NOT_FOUND"}}}
    source = [{"label": label, "method": "POST", "fetchCount": 1, "result": value}
              for label, value in source_values.items()]
    taps = [{"label": row["label"], "method": "POST", "status": 200, "retryHeader": None,
             "injected": False, "upstream": True, "sdkHeaders": sdk_headers(),
             "response": copy.deepcopy(native[row["label"]]["value"])} for row in source]
    direct = [{"label": label, "role": "service", "method": method, "status": 200,
               "response": copy.deepcopy(native[label]["value"]), "retryHeader": None}
              for label in LABELS for method in (("POST",) if label.startswith("NF_NULL") else ("POST", "GET"))]
    direct += [{"label": "B1", "role": role, "method": method, "status": status,
                "response": {"code": "42501", "message": "permission denied", "details": None, "hint": None},
                "retryHeader": None} for role, status in (("anon", 401), ("authenticated", 403)) for method in ("GET", "POST")]
    retry = {}
    if phase == "A":
        retry = {"R_OFF": {"fetchCount": 1, "tapCount": 1, "upstreamCount": 0, "headers": [None], "error": True},
                 "R_DEF": {"fetchCount": 4, "tapCount": 4, "upstreamCount": 0, "headers": [None, "1", "2", "3"], "error": True}}
        for label, count in (("R_OFF", 1), ("R_DEF", 4)):
            taps += [{"label": label, "method": "GET", "status": 503,
                      "retryHeader": None if n == 0 else str(n), "injected": True, "upstream": False,
                      "response": {"code": "UNIT_RETRY_503"}, "retryAfter": "0",
                      "sdkHeaders": sdk_headers("GET")} for n in range(count)]
    return {"phase": phase, "source": source, "direct": direct, "taps": taps, "retry": retry,
            "counts": {"source": 6, "direct": 19, "fixedProxy": 7 if phase == "A" else 6, "postgrest": 25},
            "guard": {"blocked": ["http", "http-address", "rpc-path", "http-address"]},
            "executionPins": {"bundleSha256": "e" * 64, "guardSha256": "f" * 64,
                                                          "entryDeliverySha256": "a" * 64}}


def complete_receipt():
    observations = {}
    for phase, control, digest in (("A", controls(), "c" * 64), ("B", rotated_control(), "e" * 64),
                                   ("C", stopped_control(), "f" * 64)):
        for prefix in ("baseline", "after"):
            observations[prefix + phase] = observation(prefix + phase, control, digest)
    return {"phaseSet": "d1", "installedContractLevel": "current10", "suiteContractLevel": None,
            "originalError": None, "ownedContainerIds": CID[:], "ownedNetworkId": NID,
            "unknownCreation": [], "uncertainPhase": [], "fixtureCases": cases(), "actors": ACTORS,
            "phases": {phase: {"exitCode": 0, "completed": True, "result": http_result(phase)} for phase in "ABC"},
            "observations": observations,
            "sourcesBefore": {"web:" + name: "a" * 64 for name in (*FROZEN, *OWNED, *INSTALLED)},
            "dbSourcesBefore": {"db-source-" + str(n): "b" * 64 for n in range(97)},
            "artifactHashesBefore": {name: "c" * 64 for name in ("provider-binding-http.cjs", "guard.cjs", "config.json", "bundle-inputs.json")},
            "cacheBefore": {}, "nativeInputHashes": {"native-" + phase + ".json": "d" * 64 for phase in "ABC"}}


class TemporarySource(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="provider-rpc-unit-")
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
        self.data = {
            "pair_fixture": b"LOADS=['pair_fixture']\nVALUE='source-not-pyc'\n",
            "setup_db": b"import pair_fixture\nLOADS=pair_fixture.LOADS+['setup_db']\n",
            "order_http_run": b"import setup_db\nLOADS=setup_db.LOADS+['order_http_run']\n",
            "charge_context_run": b"import order_http_run\nLOADS=order_http_run.LOADS+['charge_context_run']\n",
        }
        self.pins = {relative: sha(self.data[name]) for name, relative in REUSE.items()}
        for name, relative in REUSE.items():
            self.put(relative, self.data[name])

    def enter(self):
        with subject.verified_reuse(self.root, self.pins):
            pass

    def test_executes_four_verified_snapshots_in_dependency_order_and_restores_host_state(self):
        """Break: wrong load order, unverified import, or leaked interpreter/module state."""
        before = (sys.dont_write_bytecode, sys.path[:], sys.meta_path[:])
        with subject.verified_reuse(self.root, self.pins) as modules:
            self.assertEqual(modules["charge_context_run"].LOADS,
                             ["pair_fixture", "setup_db", "order_http_run", "charge_context_run"])
            self.assertTrue(sys.dont_write_bytecode)
            for name, relative in REUSE.items():
                module = modules[name]
                self.assertIs(sys.modules[name], module)
                self.assertEqual((module.__file__, module.__spec__.origin), (str(self.root / relative),) * 2)
                self.assertIs(module.__loader__, module.__spec__.loader)
                self.assertIsNotNone(module.__loader__)
                self.assertIsNone(module.__cached__)
        self.assertEqual((sys.dont_write_bytecode, sys.path, sys.meta_path), before)
        self.assertTrue(all(name not in sys.modules for name in REUSE))

    def test_prebound_each_of_four_names_is_refused_without_overwrite(self):
        """Break: preloaded helper code bypasses its byte pin."""
        for name in REUSE:
            with self.subTest(name=name):
                previous = types.ModuleType(name)
                sys.modules[name] = previous
                try:
                    self.refuses("MODULE_PREBOUND", self.enter)
                    self.assertIs(sys.modules[name], previous)
                finally:
                    sys.modules.pop(name, None)

    def test_fourth_hash_mismatch_refuses_before_first_helper_side_effect(self):
        """Break: verifying one module at a time executes earlier unapproved closure."""
        self.put(REUSE["pair_fixture"], b"raise AssertionError('must-not-execute')\n")
        self.pins[REUSE["pair_fixture"]] = sha((self.root / REUSE["pair_fixture"]).read_bytes())
        self.put(REUSE["charge_context_run"], b"changed\n")
        self.refuses("SOURCE_HASH", self.enter)
        self.assertTrue(all(name not in sys.modules for name in REUSE))

    def test_missing_or_extra_reuse_source_cannot_expand_execution_authority(self):
        """Break: caller-controlled source sets permit an extra executable helper."""
        self.pins["scripts/extra.py"] = "a" * 64
        self.refuses("REUSE_SET", self.enter)
        del self.pins["scripts/extra.py"]
        del self.pins[REUSE["setup_db"]]
        self.refuses("REUSE_SET", self.enter)

    def test_pyc_is_neither_read_nor_rewritten_and_bytecode_policy_is_restored(self):
        """Break: SourceFileLoader chooses a timestamp-valid poisoned pyc."""
        path = self.root / REUSE["pair_fixture"]
        cache = Path(importlib.util.cache_from_source(str(path)))
        cache.parent.mkdir()
        poison = importlib.util.MAGIC_NUMBER + struct.pack("<III", 0, int(path.stat().st_mtime), path.stat().st_size)
        poison += marshal.dumps(compile("raise AssertionError('poisoned-pyc')", str(path), "exec"))
        cache.write_bytes(poison)
        previous = sys.dont_write_bytecode
        try:
            sys.dont_write_bytecode = False
            with subject.verified_reuse(self.root, self.pins) as modules:
                self.assertEqual(modules["pair_fixture"].VALUE, "source-not-pyc")
            self.assertFalse(sys.dont_write_bytecode)
            self.assertEqual(cache.read_bytes(), poison)
            self.assertEqual(list(self.root.rglob("*.pyc")), [cache])
        finally:
            sys.dont_write_bytecode = previous

    def test_helper_import_or_consumer_exception_tears_down_and_preserves_original(self):
        """Break: partial imports survive or teardown masks the first exception."""
        for failing_import in (False, True):
            with self.subTest(failing_import=failing_import):
                if failing_import:
                    data = b"import order_http_run\nraise ValueError('original-import')\n"
                    self.put(REUSE["charge_context_run"], data)
                    self.pins[REUSE["charge_context_run"]] = sha(data)
                before = (sys.dont_write_bytecode, sys.path[:], sys.meta_path[:])
                with self.assertRaisesRegex(ValueError, "original-(import|consumer)"):
                    with subject.verified_reuse(self.root, self.pins):
                        raise ValueError("original-consumer")
                self.assertEqual((sys.dont_write_bytecode, sys.path, sys.meta_path), before)
                self.assertTrue(all(name not in sys.modules for name in REUSE))

    def test_source_file_or_parent_symlink_is_refused_before_execution(self):
        """Break: resolve() launders a symlink into an approved path."""
        path = self.root / REUSE["pair_fixture"]
        data = path.read_bytes()
        target = self.put("outside.py", data)
        path.unlink()
        path.symlink_to(target)
        self.refuses("SOURCE_PATH", self.enter)
        path.unlink()
        path.write_bytes(data)
        moved = path.parent.with_name("saved")
        path.parent.rename(moved)
        path.parent.symlink_to(moved, target_is_directory=True)
        self.refuses("SOURCE_PATH", self.enter)


class GitBoundary:
    """External Git responses; all source selection/validation remains real."""
    def __init__(self, root, blobs, head=HEAD, untracked=()):
        self.root, self.blobs, self.head = root, blobs, head
        self.untracked, self.dirty, self.calls = set(untracked), set(), []
        self.failure = None

    def __call__(self, argv, **kwargs):
        self.calls.append(list(argv))
        if list(argv[:3]) != ["git", "-C", str(self.root)]:
            raise AssertionError("Unexpected Git root: " + repr(argv))
        tail = list(argv[3:])
        if self.failure and tail[:1] == [self.failure]:
            return subprocess.CompletedProcess(argv, 128, "", "transport failure")
        if tail == ["rev-parse", "HEAD"]:
            return subprocess.CompletedProcess(argv, 0, self.head + "\n", "")
        if len(tail) == 2 and tail[0] == "show" and tail[1].startswith("HEAD:"):
            name = tail[1][5:]
            return subprocess.CompletedProcess(argv, 0 if name in self.blobs else 128, self.blobs.get(name, b""), b"")
        if len(tail) == 4 and tail[:3] == ["ls-files", "--error-unmatch", "--"]:
            return subprocess.CompletedProcess(argv, int(tail[3] in self.untracked), tail[3] + "\n", "")
        if len(tail) == 5 and tail[:4] == ["status", "--porcelain=v1", "--untracked-files=all", "--"]:
            name = tail[4]
            prefix = "?? " if name in self.untracked else " M " if name in self.dirty else ""
            return subprocess.CompletedProcess(argv, 0, prefix + name + "\n" if prefix else "", "")
        raise AssertionError("Unexpected Git operation: " + repr(tail))


class WebManifestTests(TemporarySource):
    def setUp(self):
        super().setUp()
        self.blobs = {name: ("unit source " + name).encode() for name in (*FROZEN, *OWNED, *INSTALLED)}
        for name, data in self.blobs.items():
            self.put(name, data)
        self.manifest = {"webHead": HEAD, "frozenFiles": {p: sha(self.blobs[p]) for p in FROZEN},
                         "ownedFiles": {p: sha(self.blobs[p]) for p in OWNED},
                         "installedFiles": {p: sha(self.blobs[p]) for p in INSTALLED}}
        self.manifest_path = self.root / "web-approved.json"
        self.git = GitBoundary(self.root, self.blobs, untracked=OWNED)
        self.seal()

    def seal(self):
        self.manifest_path.write_text(json.dumps(self.manifest))
        self.pin = sha(self.manifest_path.read_bytes())

    def verify(self, head=HEAD):
        return subject.verify_web(self.root, self.manifest_path, self.pin, head, git=self.git)

    def test_pinned_owned_nine_may_be_untracked_while_frozen_six_are_tracked_clean(self):
        """Break: whole-tree clean checks reject approved new9 or inspect unrelated files."""
        self.put("docs/unrelated.html", b"not part of this source closure")
        result = self.verify()
        self.assertEqual(result["webHead"], HEAD)
        self.assertEqual(result["ownedState"][OWNED[0]], {"tracked": False, "dirty": True})
        self.assertEqual(set(result["sources"]), set((*FROZEN, *OWNED, *INSTALLED)))
        self.assertEqual(result["manifestSha256"], self.pin)
        self.assertFalse(any("docs/unrelated.html" in command for command in self.git.calls))

    def test_owned_dirty_tracked_source_still_requires_approved_bytes(self):
        """Break: treating owned as editable bypasses the caller's byte approval."""
        self.git.untracked.remove(OWNED[0])
        self.git.dirty.add(OWNED[0])
        self.assertEqual(self.verify()["ownedState"][OWNED[0]], {"tracked": True, "dirty": True})
        self.put(OWNED[0], b"changed after approval")
        self.refuses("SOURCE_HASH", self.verify)

    def test_full_explicit_and_actual_heads_must_all_match(self):
        """Break: implicit, abbreviated or stale HEAD silently selects a different source."""
        for head in (None, "", HEAD[:12], "f" * 40):
            with self.subTest(head=head):
                self.refuses("WEB_HEAD", lambda: self.verify(head))
        self.git.head = "a" * 40
        self.refuses("WEB_HEAD", self.verify)

    def test_manifest_byte_pin_fields_and_duplicate_keys_are_enforced(self):
        """Break: self-repinning, unknown fields or last-key-wins weakens approval."""
        self.manifest_path.write_text(self.manifest_path.read_text() + "\n")
        self.refuses("MANIFEST_HASH", self.verify)
        self.manifest["extra"] = True
        self.seal()
        self.refuses("MANIFEST_SET", self.verify)
        del self.manifest["extra"]
        raw = '{"webHead":"' + "a" * 40 + '",' + json.dumps(self.manifest)[1:]
        self.manifest_path.write_text(raw)
        self.pin = sha(raw.encode())
        self.refuses("MANIFEST_DUPLICATE", self.verify)

    def test_missing_extra_cross_category_and_d2_sources_are_refused(self):
        """Break: a supplied manifest expands D1 into another executable graph."""
        original = copy.deepcopy(self.manifest)
        for mutation in ("missing", "extra", "cross", "d2"):
            with self.subTest(mutation=mutation):
                self.manifest = copy.deepcopy(original)
                if mutation == "missing":
                    self.manifest["frozenFiles"].pop(FROZEN[0])
                elif mutation == "extra":
                    self.manifest["ownedFiles"]["scripts/extra.py"] = "a" * 64
                elif mutation == "cross":
                    self.manifest["ownedFiles"][FROZEN[0]] = self.manifest["frozenFiles"].pop(FROZEN[0])
                else:
                    self.manifest["frozenFiles"]["lib/payment/paypal-charge/provider-entry.ts"] = "a" * 64
                self.seal()
                self.refuses("MANIFEST_SET", self.verify)

    def test_path_alias_traversal_symlink_and_nonregular_sources_are_refused(self):
        """Break: path normalization or symlink following bypasses closure identity."""
        original = copy.deepcopy(self.manifest)
        for name in ("/tmp/source.py", "../source.py", "./" + FROZEN[0], "scripts/../source.py"):
            with self.subTest(name=name):
                self.manifest = copy.deepcopy(original)
                self.manifest["frozenFiles"][name] = self.manifest["frozenFiles"].pop(FROZEN[0])
                self.seal()
                self.refuses("SOURCE_PATH", self.verify)
        self.manifest = original
        self.seal()
        path = self.root / OWNED[0]
        target = self.put("alternate.py", path.read_bytes())
        path.unlink()
        path.symlink_to(target)
        self.refuses("SOURCE_PATH", self.verify)
        path.unlink()
        path.mkdir()
        self.refuses("SOURCE_PATH", self.verify)

    def test_frozen_dirty_untracked_and_head_blob_mismatch_cannot_be_approved(self):
        """Break: matching working bytes substitutes for clean tracked HEAD evidence."""
        path = FROZEN[0]
        self.git.dirty.add(path)
        self.refuses("FROZEN_DIRTY", self.verify)
        self.git.dirty.clear()
        self.git.untracked.add(path)
        self.refuses("FROZEN_TRACKING", self.verify)
        self.git.untracked.remove(path)
        self.blobs[path] = b"different HEAD blob"
        self.refuses("FROZEN_HEAD_BLOB", self.verify)

    def test_git_query_failure_is_not_untracked_or_clean_evidence(self):
        """Break: Git transport errors are converted into a valid source state."""
        for command in ("ls-files", "status"):
            with self.subTest(command=command):
                self.git.failure = command
                self.refuses("GIT_STATUS", self.verify)


class DbManifestTests(TemporarySource):
    def setUp(self):
        super().setUp()
        self.db = self.root / "db"
        self.db.mkdir()
        self.blobs = {"supabase/migrations/" + name: ("unit SQL " + name).encode() for name in MIGRATIONS}
        self.blobs.update({"scripts/wallet/unit-source-" + str(n) + ".py": b"# synthetic source\n" for n in range(87)})
        for name, data in self.blobs.items():
            path = self.db / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.manifest = {"root": str(self.db), "sourceCommit": DB_HEAD, "dependencySqlSha256": "e" * 64,
                         "files": {name: {"sha256": sha(data)} for name, data in self.blobs.items()}}
        self.path = self.root / "db-approved.json"
        self.git = GitBoundary(self.db, self.blobs, DB_HEAD)
        self.seal()

    def seal(self):
        self.path.write_text(json.dumps(self.manifest))
        self.pin = sha(self.path.read_bytes())

    def verify(self):
        with patch.object(subject, "ROOT", self.root), patch.object(subject, "DB_ROOT", self.db):
            return subject.verify_db(self.db, self.path, self.pin, git=self.git)

    def test_current97_uses_approved_manifest_dependency_pin_instead_of_old_hardcoded_pin(self):
        """Break: old93, oldHEAD or old dependency constants govern the new runner."""
        root, manifest, sources = self.verify()
        self.assertEqual(root, self.db)
        self.assertEqual(manifest["sourceCommit"], DB_HEAD)
        self.assertEqual(manifest["dependencySqlSha256"], "e" * 64)
        self.assertEqual(len(sources), 97)

    def test_wrong_root_head_count_fields_or_malformed_pin_is_refused(self):
        """Break: count-only or loose-field checks accept another DB closure."""
        original = copy.deepcopy(self.manifest)
        for mutation in ("root", "head", "count96", "count98", "fields", "pin"):
            with self.subTest(mutation=mutation):
                self.manifest = copy.deepcopy(original)
                if mutation == "root":
                    self.manifest["root"] = "/tmp/another-db"
                elif mutation == "head":
                    self.manifest["sourceCommit"] = "a" * 40
                elif mutation == "count96":
                    self.manifest["files"].pop(next(iter(self.manifest["files"])))
                elif mutation == "count98":
                    self.manifest["files"]["extra.sql"] = {"sha256": "a" * 64}
                elif mutation == "fields":
                    self.manifest["extra"] = True
                else:
                    self.manifest["dependencySqlSha256"] = "not-a-hash"
                self.seal()
                self.refuses("DB_MANIFEST_IDENTITY", self.verify)

    def test_db_manifest_rewrite_is_not_self_approved(self):
        """Break: a changed manifest is rehashed instead of compared to root's pin."""
        self.path.write_text(self.path.read_text() + "\n")
        self.refuses("DB_MANIFEST_HASH", self.verify)

    def test_db_actual_head_dirty_untracked_and_head_bytes_are_checked(self):
        """Break: DB working files alone stand in for original tracked clean sources."""
        name = next(iter(self.blobs))
        self.git.head = "f" * 40
        self.refuses("DB_HEAD", self.verify)
        self.git.head = DB_HEAD
        for state in (self.git.dirty, self.git.untracked):
            state.add(name)
            self.refuses("DB_GIT_SOURCE", self.verify)
            state.clear()
        self.blobs[name] = b"HEAD mismatch"
        self.refuses("DB_GIT_SOURCE", self.verify)

    def test_db_byte_change_and_symlink_fail_before_helper_loading(self):
        """Break: a verified manifest permits changed or redirected DB source bytes."""
        name = next(iter(self.blobs))
        path = self.db / name
        path.write_bytes(b"unapproved SQL")
        self.refuses("DB_SOURCE_HASH", self.verify)
        target = self.put("other.sql", self.blobs[name])
        path.unlink()
        path.symlink_to(target)
        self.refuses("SOURCE_PATH", self.verify)


class ScriptedSql:
    """Fake only the pair's external SQL/Node process boundary."""
    def __init__(self, outcomes=()):
        self.outcomes, self.calls = list(outcomes), []

    def sql(self, sql, **kwargs):
        self.calls.append((sql, kwargs))
        if not self.outcomes:
            raise AssertionError("Unexpected SQL call")
        result = self.outcomes.pop(0)
        if isinstance(result, BaseException):
            raise result
        return subprocess.CompletedProcess([], *result)


class SetupTests(TemporarySource):
    def test_migration_missing_duplicate_extra_or_out_of_order_refuses_before_sql(self):
        """Break: malformed current10 plan reaches a partially installed DB."""
        plans = (MIGRATIONS[:-1], (*MIGRATIONS, MIGRATIONS[-1]), tuple(reversed(MIGRATIONS)),
                 (*MIGRATIONS[:-1], "upgrade-fixture.sql"))
        for names in plans:
            with self.subTest(names=names):
                self.refuses("MIGRATIONS10", lambda: subject.validate_migrations(names))
        self.assertEqual(tuple(subject.validate_migrations(MIGRATIONS)), MIGRATIONS)

    def test_sql_nonzero_and_marker_failure_remain_distinct_and_keep_logs(self):
        """Break: SQL stderr/exit or a missing positive-control marker is swallowed."""
        for outcome, code in (((7, "SQL original stdout\n", "SQL original stderr\n"), "SQL_STAGE_FAILURE"),
                              ((0, "not-the-marker\n", ""), "SQL_STAGE_MARKER")):
            with self.subTest(code=code):
                pair = ScriptedSql([outcome])
                evidence = {}
                self.refuses(code, lambda: subject.install_sql(pair, self.root, "engine", b"unit sql", user="postgres",
                    marker="positive-refund-control-complete", evidence=evidence))
                self.assertEqual((self.root / "engine.log").read_text(), outcome[1] + outcome[2])
                self.assertEqual(evidence["sqlStages"]["engine"]["exitCode"], outcome[0])

    def test_current10_delivers_exact_order_roles_and_no_upgrade_or_test_guc(self):
        """Break: wrong setup role/order, gate upgrade fixture or picnic.* GUC leaks in."""
        db = self.root / "db"
        db.mkdir()
        bootstrap = "scripts/wallet/fixtures/web-payment-orders-bootstrap.sql"
        engine = "scripts/wallet/fixtures/web-payment-settlement-engine-control.sql"
        payloads = {bootstrap: b"unit-bootstrap", engine: b"unit-engine"}
        payloads.update({"supabase/migrations/" + name: ("unit-" + name).encode() for name in MIGRATIONS})
        selected = [db / ("dep-" + str(n) + ".sql") for n in range(48)]
        for path in selected:
            payloads[str(path.relative_to(db))] = b"unit dependency source"
        for name, data in payloads.items():
            path = db / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        definitions = "unit-selected-dependency-sql"
        manifest = {"dependencySqlSha256": sha(definitions.encode()),
                    "files": {name: {"sha256": sha(data)} for name, data in payloads.items()}}
        seed_rel = "scripts/payment/provider-rpc-http/seed.sql"
        self.put(seed_rel, b"unit-seed")
        seed_rows = "\n".join(json.dumps(row) for row in cases()[:4]) + "\nPROVIDER_RPC_SEED_COMPLETE\n"
        outcomes = [(0, "", ""), (0, "", ""), (0, "positive-refund-control-complete\n", "")]
        outcomes += [(0, "", "")] * 11 + [(0, seed_rows, "")]
        pair = ScriptedSql(outcomes)
        order = types.SimpleNamespace(BOOTSTRAP=db / bootstrap)
        settlement = types.SimpleNamespace(settlement_dependencies=lambda: (definitions, selected))

        @contextmanager
        def helper_boundary(root, approved):
            self.assertEqual((root, approved), (db, manifest))
            with patch.dict(sys.modules, {"web_payment_order_fixture": order, "web_payment_settlement_fixture": settlement}):
                yield

        modules = {"setup_db": types.SimpleNamespace(verified_helpers=helper_boundary),
                   "pair_fixture": types.SimpleNamespace(PUBLIC_PASSWORD="public-fixture-only")}
        evidence = {}
        with patch.object(subject, "ROOT", self.root):
            actual = subject.setup_current10(pair, modules, db, manifest, self.root,
                {seed_rel: sha(b"unit-seed")}, evidence)
        self.assertEqual(actual, cases())
        self.assertEqual(len(pair.calls), 15)
        delivered = [(sql.decode() if isinstance(sql, bytes) else sql, kwargs["user"]) for sql, kwargs in pair.calls]
        self.assertEqual(delivered[:3], [("unit-bootstrap", "fixture_admin"), (definitions, "fixture_admin"), ("unit-engine", "postgres")])
        self.assertEqual(delivered[3:13], [("unit-" + name, "postgres") for name in MIGRATIONS])
        self.assertEqual(delivered[-1], ("unit-seed", "postgres"))
        self.assertIn("create role authenticator", delivered[-2][0])
        self.assertEqual(delivered[-2][1], "fixture_admin")
        self.assertFalse(any("picnic." in sql or "upgrade" in sql for sql, _ in delivered))
        self.assertEqual(evidence["installedContractLevel"], "current10")
        self.assertIsNone(evidence["suiteContractLevel"])


class BundleTests(TemporarySource):
    def test_correct_delivery_hex_with_wrong_metafile_entry_byte_count_is_refused(self):
        """Break: matching entry hex hides a truncated or mismatched bundler input."""
        entry = b"independent entry"
        inputs = {ENTRY: {"bytes": len(entry) - 1},
                  "lib/payment/paypal-charge/binding-source.ts": {"bytes": 10},
                  "lib/payment/paypal-charge/repository.ts": {"bytes": 20},
                  "server-only-marker:server-only": {"bytes": 0}}
        self.refuses("BUNDLE_DELIVERY", lambda: subject.verify_bundle(
            {"entryDeliveryHex": entry.hex(), "metafile": {"inputs": inputs}}, entry))

    def test_exact_actual_input_closure_passes_but_any_additional_input_is_refused(self):
        """Break: host build silently widens from the approved binding consumer graph."""
        entry = b"unit entry snapshot"
        meta = {"entryDeliveryHex": entry.hex(), "esbuildVersion": "unit-version", "metafile": {"inputs": {
            ENTRY: {"bytes": len(entry)}, "lib/payment/paypal-charge/binding-source.ts": {"bytes": 10},
            "lib/payment/paypal-charge/repository.ts": {"bytes": 20}, "server-only-marker:server-only": {"bytes": 0}}}}
        result = subject.verify_bundle(meta, entry)
        self.assertEqual(set(result["inputPaths"]), {ENTRY, "lib/payment/paypal-charge/binding-source.ts",
                         "lib/payment/paypal-charge/repository.ts", "server-only-marker:server-only"})
        meta["metafile"]["inputs"]["lib/payment/paypal-charge/provider-entry.ts"] = {"bytes": 1}
        self.refuses("BUNDLE_INPUTS", lambda: subject.verify_bundle(meta, entry))

    def test_mismatched_entry_delivery_or_missing_product_input_is_refused(self):
        """Break: manifest prose replaces the actual in-memory entry/metafile evidence."""
        meta = {"entryDeliveryHex": b"wrong".hex(), "esbuildVersion": "unit-version", "metafile": {"inputs": {}}}
        self.refuses("BUNDLE_DELIVERY", lambda: subject.verify_bundle(meta, b"right"))
        meta["entryDeliveryHex"] = b"right".hex()
        self.refuses("BUNDLE_INPUTS", lambda: subject.verify_bundle(meta, b"right"))


class ObserverTests(TemporarySource):
    def observe(self, value=None, exit_code=0, suffix="PROVIDER_RPC_OBSERVER_COMPLETE\n", extra=""):
        payload = observation() if value is None else value
        stdout = "PROVIDER_RPC_OBSERVATION " + json.dumps(payload) + "\n" + extra + suffix
        pair = ScriptedSql([(exit_code, stdout, "original observer stderr")])
        result = subject.observe(pair, self.root, "baselineA", cases(), b"unit-observer-source", {})
        self.assertEqual(pair.calls[0][1], {"user": "fixture_admin", "check": False})
        return result

    def test_observer_accepts_exact_d1_admin_rollback_result_and_native9(self):
        """Break: observer uses product RPC transport or loses its native nine-case evidence."""
        self.assertEqual(self.observe(), observation())

    def test_observer_sql_exit_marker_and_duplicate_payload_fail_separately(self):
        """Break: a failed SQL command, partial rollback or last JSON line is treated as proof."""
        self.refuses("SQL_STAGE_FAILURE", lambda: self.observe(exit_code=3))
        self.refuses("SQL_STAGE_MARKER", lambda: self.observe(suffix="missing-marker\n"))
        self.refuses("OBSERVER_RESULT", lambda: self.observe(extra="PROVIDER_RPC_OBSERVATION {}\n"))

    def test_observer_requires_admin_utc_exact_native_labels_and_zero_relation_sets(self):
        """Break: broad observer shape checks permit wrong role, absent cases or fabricated zero."""
        for mutation in ("session", "current", "timezone", "native", "financial", "full", "extra-financial", "d2-state"):
            with self.subTest(mutation=mutation):
                value = observation()
                if mutation == "session":
                    value["sessionUser"] = "postgres"
                elif mutation == "current":
                    value["currentUser"] = "service_role"
                elif mutation == "timezone":
                    value["timezone"] = "Asia/Seoul"
                elif mutation == "native":
                    value["native"].pop("NF_NULL_BOTH")
                elif mutation == "financial":
                    value["financialCounts"]["receipts"] = 1
                elif mutation == "full":
                    value["fullCounts"].pop("web_payment_settlements")
                elif mutation == "extra-financial":
                    value["financialCounts"]["future-table"] = 0
                else:
                    value["orderFacts"] = {}
                self.refuses("OBSERVER_RESULT", lambda: self.observe(value))


class ResultTests(TemporarySource):
    def parse(self, phase="A", result=None, marker=None, extra="", exit_code=0):
        text = RESULT_PREFIX + json.dumps(http_result(phase) if result is None else result) + "\n"
        text += (MARKERS[phase] if marker is None else marker) + "\n" + extra
        child = subprocess.CompletedProcess([], exit_code, text, "original node stderr")
        return subject.parse_result(phase, child, {"completionMarkers": MARKERS})

    def test_all_three_exact_phase_markers_and_results_are_accepted(self):
        """Break: a two-phase parser drops D1 phase C or adopts a foreign phase."""
        for phase in "ABC":
            self.assertEqual(self.parse(phase)["phase"], phase)

    def test_child_exit_precedes_even_a_complete_marker_and_result(self):
        """Break: marker-only success overwrites the original failed Node exit."""
        self.refuses("PHASE_EXIT", lambda: self.parse(exit_code=9))

    def test_missing_duplicate_or_cross_phase_marker_is_refused(self):
        """Break: count>=1 or any-phase completion accepts partial/cross-phase output."""
        for marker, extra in (("", ""), (MARKERS["A"], MARKERS["A"] + "\n"),
                              (MARKERS["A"], MARKERS["B"] + "\n")):
            with self.subTest(marker=marker, extra=extra):
                self.refuses("PHASE_MARKER", lambda: self.parse(marker=marker, extra=extra))

    def test_duplicate_partial_invalid_json_and_wrong_phase_results_are_refused(self):
        """Break: last-result-wins or accepting partial output manufactures completion."""
        for extra in (RESULT_PREFIX + "{}\n", PARTIAL_PREFIX + "{}\n"):
            self.refuses("PHASE_RESULT", lambda: self.parse(extra=extra))
        self.refuses("PHASE_RESULT", lambda: self.parse(result={"phase": "B"}))
        child = subprocess.CompletedProcess([], 0, RESULT_PREFIX + "{broken\n" + MARKERS["A"], "")
        self.refuses("PHASE_RESULT", lambda: subject.parse_result("A", child, {"completionMarkers": MARKERS}))

    def test_missing_payload_with_marker_is_not_completion(self):
        """Break: completion marker alone bypasses case and tap evidence."""
        child = subprocess.CompletedProcess([], 0, MARKERS["A"] + "\n", "")
        self.refuses("PHASE_RESULT", lambda: subject.parse_result("A", child, {"completionMarkers": MARKERS}))


class HttpMatrixTests(TemporarySource):
    def verify(self, phase="A", result=None, native=None):
        return subject.validate_http(phase, http_result(phase) if result is None else result,
                                     native_values() if native is None else native, cases())

    def test_exact_source_direct_acl_matrix_all_phases_and_separate_retry_observation(self):
        """Break: old case counts, proxy-only proof or retry injections inflate DB reach."""
        for phase in "ABC":
            actual = self.verify(phase)
            self.assertEqual(actual["postgrestRequests"], 25)
            self.assertEqual(actual["fixedProxyTaps"], 7 if phase == "A" else 6)
            self.assertEqual(actual["serviceDirect"], 15)
            self.assertEqual(actual["aclDirect"], 4)

    def test_guard_report_requires_the_exact_four_ordered_probe_denials(self):
        """Break: missing, malformed or extra denials are accepted after SDK errors are swallowed."""
        reports = (None, {}, {"blocked": []}, {"blocked": None}, {"blocked": "http"},
                   {"blocked": ["http", "rpc-path", "http-address", "http-address"]},
                   {"blocked": ["http", "http-address", "rpc-path"]},
                   {"blocked": ["http", "http-address", "rpc-path", "http-address", "tcp"]},
                   {"blocked": ["http", "http-address", "rpc-path", {"kind": "http-address"}]})
        for phase in "ABC":
            for report in reports:
                with self.subTest(phase=phase, report=report):
                    result = http_result(phase)
                    result["guard"] = report
                    self.refuses("HTTP_GUARD", lambda: self.verify(phase, result=result))
            result = http_result(phase)
            result.pop("guard")
            self.refuses("HTTP_GUARD", lambda: self.verify(phase, result=result))

    def test_sdk_semantic_headers_accept_literal_post_and_get_contracts(self):
        """Break: SDK input headers are confused with Node fetch wire defaults."""
        result = http_result()
        for row in result["taps"]:
            row["sdkHeaders"] = ({"accept": None, "prefer": None, "contentType": "application/json",
                "contentProfile": "public", "acceptProfile": None, "apikeyMatches": True,
                "authorizationMatches": True, "clientInfoVersion": "2.112.3"} if row["method"] == "POST" else
                {"accept": None, "prefer": None, "contentType": None, "contentProfile": None,
                 "acceptProfile": "public", "apikeyMatches": True, "authorizationMatches": True,
                 "clientInfoVersion": "2.112.3"})
        self.assertEqual(self.verify(result=result)["postgrestRequests"], 25)

    def test_sdk_semantic_header_drift_cannot_be_masked_by_proxy_rewrite(self):
        """Break: profile, representation, credentials or SDK-version drift is silently rewritten."""
        mutations = (("accept", "application/vnd.pgrst.object+json"), ("prefer", "return=minimal"),
                     ("contentType", "text/plain"), ("contentProfile", "private"),
                     ("acceptProfile", "private"), ("apikeyMatches", False), ("apikeyMatches", 1),
                     ("authorizationMatches", False), ("clientInfoVersion", "2.112.4"))
        for label in ("B1", "R_OFF", "R_DEF"):
            for key, value in mutations:
                with self.subTest(label=label, key=key, value=value):
                    result = http_result()
                    next(row for row in result["taps"] if row["label"] == label)["sdkHeaders"][key] = value
                    self.refuses("HTTP_HEADERS", lambda: self.verify(result=result))

    def test_sdk_semantic_header_metadata_missing_malformed_or_extra_is_refused(self):
        """Break: partial metadata or arbitrary unvalidated header fields become evidence."""
        for value in (None, [], {}, {**sdk_headers(), "rawAuthorization": "must-not-record"}):
            with self.subTest(value=value):
                result = http_result()
                result["taps"][0]["sdkHeaders"] = value
                self.refuses("HTTP_HEADERS", lambda: self.verify(result=result))
        result = http_result()
        result["taps"][0].pop("sdkHeaders")
        self.refuses("HTTP_HEADERS", lambda: self.verify(result=result))

    def test_source_exact_binding_version_kind_portone_error_and_fetch_once_are_required(self):
        """Break: consumer passes wrong binding, numeric version, wrong kind or extra fetch."""
        mutations = ((0, "numeric"), (0, "binding"), (1, "kind"), (3, "portone"), (4, "kind"), (0, "fetch"))
        for index, mutation in mutations:
            with self.subTest(index=index, mutation=mutation):
                result = http_result()
                row = result["source"][index]
                if mutation == "numeric":
                    row["result"]["value"]["bindingVersion"] = 1
                elif mutation == "binding":
                    row["result"]["value"]["bindingId"] = BINDING2
                elif mutation == "kind":
                    row["result"]["value"]["kind"] = "FOUND"
                elif mutation == "portone":
                    row["result"] = {"ok": True, "value": binding_value()}
                else:
                    row["fetchCount"] = 2
                self.refuses("HTTP_SOURCE", lambda: self.verify(result=result))

    def test_null_cases_cannot_be_moved_into_consumer_source_matrix(self):
        """Break: null-as-string cast is reported as real consumer HTTP coverage."""
        result = http_result()
        result["source"][-1]["label"] = "NF_NULL_BOTH"
        self.refuses("HTTP_SOURCE", lambda: self.verify(result=result))

    def test_service_get_post_and_null_post_must_match_native_exactly(self):
        """Break: status-only proof ignores GET/POST divergence or nullable owner behavior."""
        for label, method in (("B1", "GET"), ("B4", "POST"), ("NF_NULL_BOTH", "POST")):
            with self.subTest(label=label, method=method):
                result = http_result()
                row = next(row for row in result["direct"] if row["label"] == label and row["method"] == method and row["role"] == "service")
                row["response"]["outcome"] = "wrong"
                self.refuses("HTTP_NATIVE_PARITY", lambda: self.verify(result=result))

    def test_acl_uses_actual_non2xx_and_42501_without_assuming_status_401_403(self):
        """Break: hardcoded ACL statuses reject valid errors or accept an unrelated failure."""
        result = http_result()
        for row in result["direct"]:
            if row["role"] != "service":
                row["status"] = 418
        self.assertEqual(self.verify(result=result)["aclDirect"], 4)
        result["direct"][-1]["response"]["code"] = "PGRST999"
        self.refuses("HTTP_ACL", lambda: self.verify(result=result))
        result = http_result()
        result["direct"][-1]["status"] = 200
        self.refuses("HTTP_ACL", lambda: self.verify(result=result))

    def test_duplicate_missing_case_method_and_proxy_tap_cannot_be_hidden_by_summary_counts(self):
        """Break: trusting count fields accepts duplicated coverage and missing taps."""
        for area in ("source", "direct", "taps"):
            with self.subTest(area=area):
                result = http_result()
                result[area][0] = copy.deepcopy(result[area][1])
                self.refuses("HTTP_SOURCE" if area == "source" else "HTTP_CASES" if area == "direct" else "HTTP_TAPS",
                             lambda: self.verify(result=result))
        result = http_result()
        result["counts"]["postgrest"] = 26
        self.refuses("HTTP_COUNTS", lambda: self.verify(result=result))

    def test_off_retry_is_exactly_one_injection_without_header_or_upstream(self):
        """Break: retry(false) evidence permits extra attempts, retry headers or DB forwarding."""
        for key, value in (("fetchCount", 2), ("tapCount", 2), ("upstreamCount", 1), ("headers", ["1"]), ("error", False)):
            with self.subTest(key=key):
                result = http_result()
                result["retry"]["R_OFF"][key] = value
                self.refuses("HTTP_RETRY", lambda: self.verify(result=result))

    def test_default_retry_records_observed_attempts_instead_of_asserting_source_prediction(self):
        """Break: source-predicted four attempts is mislabeled as measured DB evidence."""
        result = http_result()
        result["retry"]["R_DEF"] = {"fetchCount": 2, "tapCount": 2, "upstreamCount": 0,
                                     "headers": [None, "1"], "error": True}
        result["taps"] = [row for row in result["taps"] if row["label"] != "R_DEF"] + [
            {"label": "R_DEF", "method": "GET", "status": 503, "retryHeader": header,
             "injected": True, "upstream": False, "response": {"code": "UNIT_RETRY_503"}, "retryAfter": "0",
             "sdkHeaders": sdk_headers("GET")}
            for header in (None, "1")]
        self.assertEqual(self.verify(result=result)["postgrestRequests"], 25)
        result["retry"]["R_DEF"]["upstreamCount"] = 1
        self.refuses("HTTP_RETRY", lambda: self.verify(result=result))

    def test_retry_injection_cannot_be_added_to_later_phases_or_forwarded(self):
        """Break: B/C inherit A retry cases or synthetic failures reach PostgREST."""
        result = http_result("B")
        result["retry"] = http_result()["retry"]
        self.refuses("HTTP_RETRY", lambda: self.verify("B", result=result))
        result = http_result()
        next(row for row in result["taps"] if row["label"] == "R_OFF")["upstream"] = True
        self.refuses("HTTP_TAPS", lambda: self.verify(result=result))


class ControlTests(TemporarySource):
    def test_rotation_rejects_portone_changes_and_non_v2_binding_versions(self):
        """Break: rotation alters the other provider or introduces a non-v2 binding."""
        for version in (None, 1, 3, "2", True):
            with self.subTest(version=version):
                after = rotated_control()
                after["web_payment_verification_bindings"][-1]["binding_version"] = version
                self.assertFalse(subject.control_changes_allowed("rotate", controls(), after, ACTORS))
        after = rotated_control()
        after["web_payment_provider_settings"][1]["verification_binding_id"] = BINDING2
        self.assertFalse(subject.control_changes_allowed("rotate", controls(), after, ACTORS))

    def test_rotation_allows_only_current_paypal_scope_pointer_and_one_new_binding(self):
        """Break: rotation rewrites frozen binding rows or arbitrary control state."""
        before, after = controls(), rotated_control()
        self.assertTrue(subject.control_changes_allowed("rotate", before, after, ACTORS))
        original = copy.deepcopy(after)
        for mutation in ("existing-binding", "profile", "setting", "extra-binding", "missing-binding"):
            with self.subTest(mutation=mutation):
                after = copy.deepcopy(original)
                if mutation == "existing-binding":
                    after["web_payment_verification_bindings"][0]["credential_ref"] = "changed"
                elif mutation == "profile":
                    after["user_profiles"][0]["nickname"] = "changed"
                elif mutation == "setting":
                    after["web_payment_provider_settings"][0]["untouched"] = "changed"
                elif mutation == "extra-binding":
                    after["web_payment_verification_bindings"].append({"id": "foreign"})
                else:
                    after["web_payment_verification_bindings"].pop(0)
                self.assertFalse(subject.control_changes_allowed("rotate", before, after, ACTORS))

    def test_stop_requires_closed_flags_and_only_actor_c_deleted_without_scope_rotation(self):
        """Break: broad field stripping permits scope drift, another actor or an ineffective stop."""
        before, after = rotated_control(), stopped_control()
        self.assertTrue(subject.control_changes_allowed("stop", before, after, ACTORS))
        original = copy.deepcopy(after)
        for mutation in ("scope", "actor-a", "open", "enabled", "binding"):
            with self.subTest(mutation=mutation):
                after = copy.deepcopy(original)
                if mutation == "scope":
                    after["web_payment_provider_settings"][0]["paypal_account_id"] = "wrong"
                elif mutation == "actor-a":
                    after["user_profiles"][0]["deleted_at"] = "2026-11-16"
                elif mutation == "open":
                    after["web_payment_provider_settings"][0]["mode"] = "OPEN"
                elif mutation == "enabled":
                    after["web_payment_provider_settings"][1]["allow_charge"] = True
                else:
                    after["web_payment_verification_bindings"][0]["binding_hash"] = "a" * 64
                self.assertFalse(subject.control_changes_allowed("stop", before, after, ACTORS))


class CleanupTransport:
    """Inspect/remove/absence responses for one independent synthetic ledger."""
    def __init__(self):
        self.calls = []
        self.run_id = "d155aa00-0000-4000-8000-000000000001"
        self.name = "picnic-order-http-" + self.run_id
        self.label = "picnic.web-payment-order-http"
        self.records, self.expected = {}, []
        members = {}
        for index, role in enumerate(("postgres", "postgrest", "node")):
            cid, endpoint, address = CID[index], str(index + 5) * 64, "172.29.40." + str(index + 2)
            alias = {"postgres": "order-pg", "postgrest": "order-rest", "node": "order-node"}[role]
            image = "sha256:" + str(index + 6) * 64
            mounts = [] if role != "node" else [
                {"Type": "bind", "Source": "/unit/artifacts", "Destination": "/fixture", "RW": False, "Propagation": "rprivate"},
                {"Type": "bind", "Source": "/unit/modules", "Destination": "/deps/node_modules", "RW": False, "Propagation": "rprivate"}]
            tmpfs = {"/tmp": "rw,noexec,nosuid,size=67108864"}
            if role == "postgres":
                tmpfs.update({"/var/lib/postgresql/data": "rw,nosuid,size=268435456",
                              "/var/run/postgresql": "rw,noexec,nosuid,size=16777216"})
            row = {"role": role, "phase": "running", "container_id": cid, "image_id": image,
                   "run_id": self.run_id, "label_key": self.label, "network_id": NID, "network_name": self.name,
                   "alias": alias, "endpoint_id": endpoint, "ipv4": address, "mounts": mounts, "tmpfs": tmpfs,
                   "memory": 536870912, "nano_cpus": 1000000000, "pids_limit": 128}
            self.expected.append(copy.deepcopy(row))
            self.records[cid] = {"Id": cid, "Name": "/order-http-" + role + "-" + self.run_id, "Image": image,
                "Config": {"Labels": {self.label: self.run_id}},
                "State": {"Status": "running", "Running": True, "Paused": False, "Restarting": False,
                          "Dead": False, "Pid": 100, "ExitCode": 0, "Error": ""},
                "Mounts": mounts, "HostConfig": {"NetworkMode": self.name, "PortBindings": {},
                    "PublishAllPorts": False, "Privileged": False, "ReadonlyRootfs": True, "Binds": None,
                    "VolumesFrom": None, "ExtraHosts": None, "Dns": [], "Memory": 536870912,
                    "NanoCpus": 1000000000, "PidsLimit": 128, "Tmpfs": tmpfs,
                    "Mounts": [{"Type": "bind", "Source": m["Source"], "Target": m["Destination"], "ReadOnly": True} for m in mounts]},
                "NetworkSettings": {"Ports": {}, "Networks": {self.name: {"NetworkID": NID,
                    "EndpointID": endpoint, "IPAddress": address, "GlobalIPv6Address": "", "GlobalIPv6PrefixLen": 0,
                    "IPv6Gateway": "", "Aliases": [alias]}}}}
            members[cid] = {"Name": "order-http-" + role + "-" + self.run_id, "EndpointID": endpoint,
                            "IPv4Address": address + "/24", "IPv6Address": ""}
        self.network = {"network_id": NID, "network_name": self.name, "run_id": self.run_id,
                        "label_key": self.label, "members": copy.deepcopy(members),
                        "subnet": "172.29.40.0/24", "gateway": "172.29.40.1"}
        self.network_info = {"Id": NID, "Name": self.name, "Driver": "bridge", "Scope": "local", "Internal": True,
            "EnableIPv6": False, "Attachable": False, "Ingress": False, "Labels": {self.label: self.run_id},
            "Options": {}, "IPAM": {"Driver": "default", "Options": None,
            "Config": [{"Subnet": "172.29.40.0/24", "Gateway": "172.29.40.1"}]}, "Containers": members}
        self.network_exists = True

    def __call__(self, args, *, timeout=30, **kwargs):
        args = list(args)
        self.calls.append(args)
        if timeout != 30 or kwargs:
            raise AssertionError("Unexpected external cleanup options")
        if args[:2] == ["container", "inspect"] and len(args) == 3:
            output = json.dumps([self.records[args[2]]])
        elif args[:2] == ["network", "inspect"] and args[2:] == [NID]:
            output = json.dumps([self.network_info])
        elif args[:4] == ["container", "rm", "--force", "--volumes"] and args[4:] in ([cid] for cid in CID):
            del self.records[args[4]]
            del self.network_info["Containers"][args[4]]
            output = args[4]
        elif args == ["network", "rm", NID]:
            self.network_exists = False
            output = NID
        elif len(args) == 8 and args[:5] == ["container", "ls", "--all", "--no-trunc", "--filter"] and args[6:] == ["--format", "{{.ID}}"]:
            cid = args[5].removeprefix("id=")
            if args[5] != "id=" + cid or cid not in CID:
                raise AssertionError("Non-ledger absence query")
            output = cid + "\n" if cid in self.records else ""
        elif args == ["network", "ls", "--no-trunc", "--filter", "id=" + NID, "--format", "{{.ID}}"]:
            output = NID + "\n" if self.network_exists else ""
        else:
            raise AssertionError("Unauthorized Docker discovery/removal: " + repr(args))
        return subprocess.CompletedProcess(args, 0, output, "")


class CleanupTests(TemporarySource):
    @contextmanager
    def factory(self):
        # Execute the real frozen factory through the new verified loader.
        # No old harness main or test helper is called, and no Docker exists.
        repo = HERE.parents[2]
        pins = {
            REUSE["pair_fixture"]: "a194d142b57a199efa27f33ef78f9aa5ac2886f772d73defdef5848d6ee92a16",
            REUSE["setup_db"]: "3bff4c99679e446c8d00486b6bc1dcc8be7326d449a6a100a02889cfe37dfac6",
            REUSE["order_http_run"]: "809fde33a906d59df1ebda4313d8ec928e9e99465ed2004f2dbf667ff703c9eb",
            REUSE["charge_context_run"]: "0a4b798219a0ff9f1dbc3eabf2f8796e2956951a40163ba775392fb603a6712c"}
        with subject.verified_reuse(repo, pins) as modules:
            transport = CleanupTransport()
            factory_type = modules["pair_fixture"].PairFactory
            pair = object.__new__(factory_type)
            pair.transport, pair.run_id = transport, transport.run_id
            pair.network = copy.deepcopy(transport.network)
            pair.containers = copy.deepcopy(transport.expected)
            pair.ledger = modules["pair_fixture"].CreationLedger(transport, run_id=transport.run_id)
            pair.ledger.known = {"container": CID[:], "network": [NID]}
            pair.uncertain_phase, pair.images, pair.cleanup = [], {}, None
            yield pair, transport

    def test_failed_network_cleanup_retains_detached_partial_absence_and_explicit_cause(self):
        """Break: failed close discards known CID absence and the transport's explicit cause."""
        with self.factory() as (pair, transport):
            def fault(args, **kwargs):
                if args == ["network", "rm", NID]:
                    raise OSError("synthetic network removal fault")
                if args[:2] == ["network", "ls"]:
                    raise OSError("synthetic network observation unavailable")
                return transport(args, **kwargs)

            pair.transport = fault
            receipt = complete_receipt()
            original = {"type": "BoundaryError", "code": "HTTP_SOURCE", "message": "first HTTP failure"}
            receipt["originalError"] = copy.deepcopy(original)
            result = subject.finalize(receipt, cleanup=lambda: subject.cleanup_owned(pair, receipt),
                snapshot=lambda: {"sources": receipt["sourcesBefore"], "dbSources": receipt["dbSourcesBefore"],
                    "artifacts": receipt["artifactHashesBefore"], "cache": {},
                    "nativeInputs": receipt["nativeInputHashes"]})
            expected = {"containers": {CID[0]: True, CID[1]: True, CID[2]: True}, "network": None}
            self.assertEqual(receipt.get("absenceObserved"), expected)
            self.assertEqual(result.get("absenceObserved"), expected)
            self.assertIsNot(receipt["absenceObserved"], pair.cleanup.absence)
            pair.cleanup.absence["containers"][CID[0]] = False
            self.assertEqual(result["absenceObserved"], expected)
            self.assertEqual(receipt["absenceObserved"], expected)
            self.assertEqual((result["status"], result["exitCode"], result["absenceComplete"]), ("failed", 1, False))
            self.assertIsNone(result["absence"])
            self.assertEqual(result["originalError"], original)
            self.assertEqual(result["cleanupError"].get("cause"),
                {"type": "OSError", "code": "OPERATION_FAILED", "message": "synthetic network removal fault"})
            self.assertEqual(transport.records, {})

    def test_partial_cleanup_preserves_present_unknown_and_absent_cid_states(self):
        """Break: detailed partial absence is normalized into all-true or all-unknown."""
        with self.factory() as (pair, transport):
            def fault(args, **kwargs):
                if args == ["container", "rm", "--force", "--volumes", CID[1]]:
                    raise OSError("synthetic second removal fault")
                if args[:2] == ["container", "ls"] and "id=" + CID[0] in args:
                    raise OSError("synthetic exact-ID observation unavailable")
                return transport(args, **kwargs)

            pair.transport = fault
            receipt = {}
            with self.assertRaises(Exception):
                subject.cleanup_owned(pair, receipt)
            self.assertEqual(receipt.get("absenceObserved"),
                {"containers": {CID[0]: None, CID[1]: False, CID[2]: True}, "network": False})

    def test_uncertain_phase_refuses_before_external_cleanup_or_absence_fabrication(self):
        """Break: start uncertainty is cleaned up or receives fabricated absence proof."""
        with self.factory() as (pair, transport):
            pair.uncertain_phase = [CID[1]]
            receipt = {}
            self.refuses("UNCERTAIN_PHASE", lambda: subject.cleanup_owned(pair, receipt))
            self.assertEqual(transport.calls, [])
            self.assertNotIn("absenceObserved", receipt)

    def test_runner_cleanup_uses_real_factory_exact_cid3_network1_without_name_label_search(self):
        """Break: the new cleanup wrapper invents targets or skips owned factory revalidation."""
        with self.factory() as (pair, transport):
            receipt = {}
            absence = subject.cleanup_owned(pair, receipt)
            self.assertEqual(absence, {"containers": {cid: True for cid in CID}, "network": True})
            self.assertEqual(receipt["ownedContainerIds"], CID)
            self.assertEqual(receipt["ownedNetworkId"], NID)
            removes = [args for args in transport.calls if args[1] == "rm"]
            self.assertEqual(removes, [["container", "rm", "--force", "--volumes", cid] for cid in reversed(CID)] + [["network", "rm", NID]])
            self.assertFalse(any(any("label=" in arg or "name=" in arg for arg in args) for args in transport.calls))

    def test_unknown_creation_is_preserved_and_refused_before_any_removal_or_discovery(self):
        """Break: failed/uncertain create triggers guessed cleanup or a second creation attempt."""
        with self.factory() as (pair, transport):
            pair.ledger.unknown.append({"kind": "container", "exitCode": None, "runId": pair.run_id})
            receipt = {}
            self.refuses("UNKNOWN_CREATION", lambda: subject.cleanup_owned(pair, receipt))
            self.assertEqual(transport.calls, [])
            self.assertEqual(receipt["unknownCreation"], pair.ledger.unknown)

    def test_foreign_resource_configuration_prevents_every_delete(self):
        """Break: receipt identity or expected labels substitute for actual inspected ownership."""
        with self.factory() as (pair, transport):
            transport.records[CID[1]]["HostConfig"]["Privileged"] = True
            with self.assertRaises(Exception):
                subject.cleanup_owned(pair, {})
            self.assertEqual([args for args in transport.calls if args[1] == "rm"], [])


class FinalReceiptTests(TemporarySource):
    def setUp(self):
        super().setUp()
        self.receipt = complete_receipt()
        self.events = []
        self.absence = {"containers": {cid: True for cid in CID}, "network": True}
        self.after = {"sources": copy.deepcopy(self.receipt["sourcesBefore"]),
                      "dbSources": copy.deepcopy(self.receipt["dbSourcesBefore"]),
                      "artifacts": copy.deepcopy(self.receipt["artifactHashesBefore"]), "cache": {},
                      "nativeInputs": copy.deepcopy(self.receipt["nativeInputHashes"])}
        self.cleanup_error = self.snapshot_error = None

    def finish(self):
        def cleanup():
            self.events.append("cleanup")
            if self.cleanup_error:
                raise self.cleanup_error
            return self.absence

        def snapshot():
            self.events.append("snapshot")
            if self.snapshot_error:
                raise self.snapshot_error
            return self.after

        return subject.finalize(self.receipt, cleanup=cleanup, snapshot=snapshot)

    def test_complete_d1_passes_only_after_exact_cleanup_and_all_final_snapshots(self):
        """Break: passing receipt is emitted before resource/source/cache verification."""
        before = copy.deepcopy(self.receipt)
        result = self.finish()
        self.assertEqual((result["status"], result["exitCode"]), ("passed", 0))
        self.assertEqual(self.events, ["cleanup", "snapshot"])
        self.assertEqual(self.receipt, before)

    def test_finalizer_revalidates_guard_denials_after_phase_completion(self):
        """Break: a completed phase bypasses final independent guard validation."""
        self.receipt["phases"]["C"]["result"]["guard"]["blocked"].append("tcp")
        result = self.finish()
        self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
        self.assertEqual(result.get("validationError", {}).get("code"), "HTTP_GUARD")

    def test_error_summary_bounds_explicit_cause_without_recursive_exception_dump(self):
        """Break: cause details disappear or arbitrary exception chains enter the receipt."""
        inner = ValueError("must-not-recurse")
        cause = subject.BoundaryError("LOCAL_TRANSPORT", "x" * 900)
        cause.__cause__ = inner
        outer = RuntimeError("cleanup wrapper")
        outer.__cause__ = cause
        summary = subject.error(outer)
        self.assertEqual({key: summary[key] for key in ("type", "code", "message")},
            {"type": "RuntimeError", "code": "OPERATION_FAILED", "message": "cleanup wrapper"})
        self.assertEqual(summary.get("cause"),
            {"type": "BoundaryError", "code": "LOCAL_TRANSPORT", "message": "x" * 512})
        self.assertNotIn("must-not-recurse", json.dumps(summary))

    def test_original_error_is_preserved_when_cleanup_and_snapshot_both_fail(self):
        """Break: cleanup failure overwrites the original SQL/HTTP failure."""
        self.receipt["originalError"] = {"code": "SQL_STAGE_FAILURE", "type": "BoundaryError", "message": "original-sql"}
        self.cleanup_error, self.snapshot_error = RuntimeError("cleanup-second"), OSError("snapshot-third")
        result = self.finish()
        self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
        self.assertEqual(result["originalError"]["message"], "original-sql")
        self.assertEqual(result["cleanupError"]["message"], "cleanup-second")
        self.assertEqual(result["sourceVerificationError"]["message"], "snapshot-third")
        self.assertEqual(self.events, ["cleanup", "snapshot"])

    def test_absence_needs_exact_three_unique_full_cids_and_true_network_evidence(self):
        """Break: rm success, partial/extra IDs or unknown absence is treated as cleanup."""
        for mutation in ("missing", "foreign", "network", "container", "duplicate-id", "short-id", "no-network-id"):
            with self.subTest(mutation=mutation):
                self.receipt = complete_receipt()
                self.absence = {"containers": {cid: True for cid in CID}, "network": True}
                if mutation == "missing":
                    self.absence["containers"].pop(CID[0])
                elif mutation == "foreign":
                    self.absence["containers"]["5" * 64] = True
                elif mutation == "network":
                    self.absence["network"] = None
                elif mutation == "container":
                    self.absence["containers"][CID[0]] = False
                elif mutation == "duplicate-id":
                    self.receipt["ownedContainerIds"][0] = CID[1]
                elif mutation == "short-id":
                    self.receipt["ownedContainerIds"][0] = CID[0][:12]
                else:
                    self.receipt.pop("ownedNetworkId")
                self.assertEqual(self.finish()["exitCode"], 1)

    def test_unknown_creation_uncertain_phase_metadata_and_missing_original_error_fail_closed(self):
        """Break: unknown creates, uncertain starts or missing first-error evidence pass."""
        for key, value in (("unknownCreation", [{"kind": "container", "exitCode": None}]),
                           ("uncertainPhase", [CID[0]]), ("metadataError", {"message": "unknown ledger"}),
                           ("phaseSet", "d2"), ("installedContractLevel", "current8"), ("suiteContractLevel", "gate")):
            with self.subTest(key=key):
                self.receipt = complete_receipt()
                self.receipt[key] = value
                self.assertEqual(self.finish()["exitCode"], 1)
        self.receipt = complete_receipt()
        self.receipt.pop("originalError")
        self.assertEqual(self.finish()["exitCode"], 1)

    def test_source_db_sdk_artifact_cache_and_native_input_changes_each_fail(self):
        """Break: only one source family or the bundle is verified after execution."""
        for area in ("sources", "dbSources", "artifacts", "cache", "nativeInputs"):
            with self.subTest(area=area):
                saved = copy.deepcopy(self.after)
                key = next(iter(self.after[area]), "new.pyc")
                self.after[area][key] = "9" * 64
                self.assertEqual(self.finish()["exitCode"], 1)
                self.after = saved

    def test_every_phase_exit_completion_matrix_and_observation_is_required(self):
        """Break: partial phases or successful markers without valid results are enough."""
        for phase in "ABC":
            for mutation in ("exit", "complete", "missing-phase", "missing-result", "missing-observation"):
                with self.subTest(phase=phase, mutation=mutation):
                    self.receipt = complete_receipt()
                    if mutation == "exit":
                        self.receipt["phases"][phase]["exitCode"] = 7
                    elif mutation == "complete":
                        self.receipt["phases"][phase]["completed"] = False
                    elif mutation == "missing-phase":
                        self.receipt["phases"].pop(phase)
                    elif mutation == "missing-result":
                        self.receipt["phases"][phase].pop("result")
                    else:
                        self.receipt["observations"].pop("after" + phase)
                    self.assertEqual(self.finish()["exitCode"], 1)

    def test_product_control_and_native_are_immutable_inside_every_phase(self):
        """Break: D1 read changes state or native output but matching summary flags hide it."""
        for phase in "ABC":
            for mutation in ("productDigest", "controlDigest", "native"):
                with self.subTest(phase=phase, mutation=mutation):
                    self.receipt = complete_receipt()
                    row = self.receipt["observations"]["after" + phase]
                    if mutation == "native":
                        row["native"]["B1"]["value"]["binding_version"] = "2"
                    else:
                        row[mutation] = "0" * 64
                    self.assertEqual(self.finish()["exitCode"], 1)

    def test_control_operations_cannot_mutate_product_or_live_substitute_frozen_b1(self):
        """Break: rotation/stop changes product rows or substitutes current settings identity."""
        for phase in "BC":
            for mutation in ("product", "frozen-native", "control"):
                with self.subTest(phase=phase, mutation=mutation):
                    self.receipt = complete_receipt()
                    for prefix in ("baseline", "after"):
                        row = self.receipt["observations"][prefix + phase]
                        if mutation == "product":
                            row["productDigest"] = "0" * 64
                        elif mutation == "frozen-native":
                            row["native"]["B1"]["value"]["binding_id"] = BINDING2
                        else:
                            row["controlState"]["user_profiles"][0]["nickname"] = "changed"
                    self.assertEqual(self.finish()["exitCode"], 1)

    def test_all31_financial_and_full6_counts_must_be_exact_zero_not_truthy_summaries(self):
        """Break: false zero claims, missing relations or boolean counts hide financial rows."""
        for field in ("financialCounts", "fullCounts"):
            for mutation in ("nonzero", "missing", "extra", "boolean"):
                with self.subTest(field=field, mutation=mutation):
                    self.receipt = complete_receipt()
                    counts_row = self.receipt["observations"]["afterC"][field]
                    name = next(iter(counts_row))
                    if mutation == "nonzero":
                        counts_row[name] = 1
                    elif mutation == "missing":
                        counts_row.pop(name)
                    elif mutation == "extra":
                        counts_row["unapproved_relation"] = 0
                    else:
                        counts_row[name] = False
                    self.assertEqual(self.finish()["exitCode"], 1)


class D1Boundary:
    """Unit-only dependency API and external process responses; no SQL or HTTP proof.

    Real main, source selectors/loaders, setup, observer, parser and finalizer
    consume these files and responses. No subject function is replaced.
    """
    def __init__(self, root):
        self.root, self.db = root, root / "db"
        self.db.mkdir()
        self.events, self.seed = [], cases()[:4]
        self.http_failure = self.after_failure = self.frozen_failure = False
        self.definitions = "unit-selected-dependency-sql"
        self.bootstrap = "scripts/wallet/fixtures/web-payment-orders-bootstrap.sql"
        self.engine = "scripts/wallet/fixtures/web-payment-settlement-engine-control.sql"
        self.selected = [self.db / ("dep-" + str(n) + ".sql") for n in range(48)]
        db_bytes = {self.bootstrap: b"bootstrap-fixture", self.engine: b"engine-fixture"}
        db_bytes.update({"supabase/migrations/" + name: ("migration-fixture-" + name).encode() for name in MIGRATIONS})
        db_bytes.update({str(path.relative_to(self.db)): b"dependency-fixture" for path in self.selected})
        db_bytes.update({"unused-" + str(n) + ".sql": b"unselected-fixture" for n in range(37)})
        for name, data in db_bytes.items():
            self.write(self.db, name, data)
        self.db_manifest = {"root": str(self.db), "sourceCommit": DB_HEAD,
            "dependencySqlSha256": sha(self.definitions.encode()),
            "files": {name: {"sha256": sha(data)} for name, data in db_bytes.items()}}
        self.db_path = self.write(root, "db-approved.json", json.dumps(self.db_manifest).encode())
        self.db_git = GitBoundary(self.db, db_bytes, DB_HEAD)
        self.blobs = {name: ("unit source " + name).encode() for name in (*FROZEN, *OWNED, *INSTALLED)}
        self.blobs.update({REUSE["pair_fixture"]: b"from provider_rpc_main_boundary import PairFactory, PUBLIC_PASSWORD\n",
            REUSE["setup_db"]: b"from provider_rpc_main_boundary import verified_helpers\n",
            REUSE["order_http_run"]: b"from provider_rpc_main_boundary import LocalDocker, jwt, interpreter_evidence\n",
            REUSE["charge_context_run"]: b"# No legacy harness is invoked.\n"})
        for name in INSTALLED:
            if name.endswith("package.json"):
                self.blobs[name] = b'{"version":"2.112.3"}'
        for name in ("seed", "observer", "rotate", "stop"):
            self.blobs["scripts/payment/provider-rpc-http/" + name + ".sql"] = (name + "-fixture").encode()
        for name, data in self.blobs.items():
            self.write(root, name, data)
        self.reuse_pins = {name: sha(self.blobs[name]) for name in REUSE.values()}
        self.product_pins = {name: sha(self.blobs[name]) for name in FROZEN if name not in REUSE.values()}
        self.installed_pins = {name: sha(self.blobs[name]) for name in INSTALLED}
        self.web_git = GitBoundary(root, self.blobs, untracked=OWNED)
        self.seal_web()
        self.pair = types.SimpleNamespace(containers=[{"container_id": cid} for cid in CID],
            network={"network_id": NID}, ledger=types.SimpleNamespace(unknown=[]), uncertain_phase=[],
            images={}, cleanup=None, run_id="unit-main-owned-pair", version="150008",
            start=lambda: self.events.append("start"), start_postgrest=lambda: self.events.append("postgrest"),
            role=lambda role: {"ipv4": "172.29.40.3"} if role == "postgrest" else self.unexpected(role),
            sql=self.sql, exec_node=self.exec_node, close=self.close)

    @staticmethod
    def write(root, name, data):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    @staticmethod
    def unexpected(value):
        raise AssertionError("Unexpected dependency call: " + repr(value))

    def seal_web(self):
        self.web_manifest = {"webHead": HEAD, "frozenFiles": {p: sha(self.blobs[p]) for p in FROZEN},
            "ownedFiles": {p: sha(self.blobs[p]) for p in OWNED},
            "installedFiles": {p: sha(self.blobs[p]) for p in INSTALLED}}
        self.web_path = self.write(self.root, "web-approved.json", json.dumps(self.web_manifest).encode())

    @contextmanager
    def helpers(self, root, manifest):
        if root != self.db or manifest != self.db_manifest:
            self.unexpected((root, manifest))
        order = types.SimpleNamespace(BOOTSTRAP=self.db / self.bootstrap)
        settlement = types.SimpleNamespace(settlement_dependencies=lambda: (self.definitions, self.selected))
        with patch.dict(sys.modules, {"web_payment_order_fixture": order, "web_payment_settlement_fixture": settlement}):
            yield

    def sql(self, text, *, user, check):
        if check is not False or user not in ("postgres", "fixture_admin"):
            self.unexpected((user, check))
        if text == "seed-fixture":
            self.events.append("seed")
            stdout = "\n".join(json.dumps(row) for row in self.seed) + "\nPROVIDER_RPC_SEED_COMPLETE\n"
        elif text.endswith("observer-fixture"):
            label = text.split("set provider_rpc.observation_label to '", 1)[1].split("'", 1)[0]
            self.events.append(label)
            if label == "afterA" and self.after_failure:
                return subprocess.CompletedProcess([], 8, "synthetic after observer failure", "")
            phase = label[-1]
            control, control_digest = {"A": (controls(), "c" * 64), "B": (rotated_control(), "e" * 64),
                                       "C": (stopped_control(), "f" * 64)}[phase]
            value = observation(label, control, control_digest)
            if label == "baselineB" and self.frozen_failure:
                value["native"]["B1"]["value"]["binding_id"] = BINDING2
            stdout = "PROVIDER_RPC_OBSERVATION " + json.dumps(value) + "\nPROVIDER_RPC_OBSERVER_COMPLETE\n"
        elif text in ("rotate-fixture", "stop-fixture"):
            kind = text.split("-", 1)[0]
            self.events.append(kind)
            stdout = "PROVIDER_RPC_" + kind.upper() + "_COMPLETE\n"
        elif text == "engine-fixture":
            stdout = "positive-refund-control-complete\n"
        elif text in ("bootstrap-fixture", self.definitions) or text.startswith(("migration-fixture-", "create role authenticator")):
            stdout = ""
        else:
            return self.unexpected(text)
        return subprocess.CompletedProcess([], 0, stdout, "")

    def exec_node(self, argv, *, check):
        phase = argv[4]
        config = json.loads((self.node_out / "config.json").read_text())
        native_path = self.node_out / ("native-" + phase + ".json")
        if argv[:4] != ["node", "--require", "/fixture/guard.cjs", "/fixture/provider-binding-http.cjs"] or check is not False or argv[5] != sha(native_path.read_bytes()):
            return self.unexpected(argv)
        self.events.append("http" + phase)
        result = http_result(phase)
        result["executionPins"] = config["executionPins"]
        return subprocess.CompletedProcess([], 9 if self.http_failure else 0,
            RESULT_PREFIX + json.dumps(result) + "\n" + config["completionMarkers"][phase] + "\n", "")

    def close(self):
        self.events.append("cleanup")
        self.pair.cleanup = types.SimpleNamespace(absence={"containers": {cid: True for cid in CID}, "network": True})

    def command(self, argv, **kwargs):
        if argv[0] == "git":
            return (self.web_git if argv[2] == str(self.root) else self.db_git)(argv, **kwargs)
        if argv[:3] != ["/unit-node", "--input-type=module", "-"]:
            return self.unexpected(argv)
        self.events.append("bundle")
        self.node_out = Path(argv[3])
        entry = bytes.fromhex(argv[4])
        inputs = {ENTRY: {"bytes": len(entry)}, "lib/payment/paypal-charge/binding-source.ts": {"bytes": 10},
            "lib/payment/paypal-charge/repository.ts": {"bytes": 20}, "server-only-marker:server-only": {"bytes": 0}}
        self.write(self.node_out, "provider-binding-http.cjs", b"unit bundled dependency output")
        self.write(self.node_out, "bundle-inputs.json", json.dumps({"entryDeliveryHex": entry.hex(),
            "metafile": {"inputs": inputs}, "esbuildVersion": "unit-version"}).encode())
        return subprocess.CompletedProcess(argv, 0, "", "")

    def pair_factory(self, transport, **kwargs):
        expected = {"pg_image": "postgres:15.8", "artifact_dir": self.node_out,
                    "modules_dir": self.root / "node_modules"}
        if transport != self.command or kwargs != expected:
            return self.unexpected((transport, kwargs))
        return self.pair

    def local_docker(self, binary, host, out):
        if binary != "/unit-docker" or host != "unix:///unit-no-socket" or out != self.node_out.parent:
            return self.unexpected((binary, host, out))
        return self.command

    def run(self, label="unit-main-flow"):
        boundary = types.SimpleNamespace(PairFactory=self.pair_factory,
            PUBLIC_PASSWORD="public-fixture-only", verified_helpers=self.helpers,
            LocalDocker=self.local_docker, jwt=lambda *args, **kwargs: "public-unit-fixture-token",
            interpreter_evidence=lambda: {"unitDependency": True})
        argv = ["--phase-set", "d1", "--postgres-image", "postgres:15.8", "--run-label", label,
            "--db-workspace", str(self.db), "--docker-host", "unix:///unit-no-socket",
            "--web-head", HEAD, "--web-manifest", str(self.web_path),
            "--web-manifest-sha256", sha(self.web_path.read_bytes()), "--db-manifest", str(self.db_path),
            "--db-manifest-sha256", sha(self.db_path.read_bytes()), "--docker-bin", "/unit-docker", "--node-bin", "/unit-node"]
        with patch.object(subject, "ROOT", self.root), patch.object(subject, "DB_ROOT", self.db), \
             patch.object(subject, "REUSE_PINS", self.reuse_pins), patch.object(subject, "PRODUCT_PINS", self.product_pins), \
             patch.object(subject, "INSTALLED_PINS", self.installed_pins), patch.object(subject, "_command", self.command), \
             patch.dict(sys.modules, {"provider_rpc_main_boundary": boundary}), redirect_stdout(io.StringIO()):
            code = subject.main(argv)
        receipt = self.root / ".artifacts/payment-web-order-http" / ("provider-rpc-" + label) / "receipt.json"
        return code, json.loads(receipt.read_text())


class AddedSetupTests(TemporarySource):
    def test_seed_count_duplicate_order_and_extra_key_fail_real_setup(self):
        """Break: invalid seed rows reach HTTP despite a successful SQL completion marker."""
        for mutation in ("count", "duplicate-order", "extra-key"):
            with self.subTest(mutation=mutation):
                directory = self.root / mutation
                directory.mkdir()
                boundary = D1Boundary(directory)
                if mutation == "count":
                    boundary.seed.pop()
                elif mutation == "duplicate-order":
                    boundary.seed[1]["order"] = boundary.seed[0]["order"]
                else:
                    boundary.seed[0]["extra"] = True
                modules = {"setup_db": types.SimpleNamespace(verified_helpers=boundary.helpers),
                    "pair_fixture": types.SimpleNamespace(PUBLIC_PASSWORD="public-fixture-only")}
                with patch.object(subject, "ROOT", directory):
                    self.refuses("FIXTURE_CASES", lambda: subject.setup_current10(boundary.pair, modules, boundary.db,
                        boundary.db_manifest, directory, boundary.web_manifest["ownedFiles"], {}))


class MainFlowTests(TemporarySource):
    def test_real_main_completes_control_baseline_http_after_sequence_and_final_receipt(self):
        """Break: a phase/control/after observer is reordered, skipped or never finalized."""
        boundary = D1Boundary(self.root)
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["status"], receipt["stage"]), (0, "passed", "http-phases-complete"))
        self.assertEqual(boundary.events, ["bundle", "start", "seed", "baselineA", "postgrest", "httpA", "afterA",
            "rotate", "baselineB", "httpB", "afterB", "stop", "baselineC", "httpC", "afterC", "cleanup"])
        self.assertEqual(set(receipt["phases"]), {"A", "B", "C"})
        self.assertTrue(receipt["absenceComplete"])
        self.assertTrue(receipt["sourcesUnchanged"] and receipt["dbSourcesUnchanged"])
        self.assertEqual(receipt["phases"]["C"]["measuredCounts"]["postgrestRequests"], 25)

    def test_real_main_preserves_http_first_error_and_after_observer_secondary_error(self):
        """Break: after-observer failure masks HTTP failure or stops cleanup and final snapshots."""
        boundary = D1Boundary(self.root)
        boundary.http_failure = boundary.after_failure = True
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["status"], receipt["stage"]), (1, "failed", "http-A"))
        self.assertEqual(receipt["originalError"]["code"], "PHASE_EXIT")
        self.assertEqual([row["code"] for row in receipt["secondaryErrors"]], ["SQL_STAGE_FAILURE"])
        self.assertEqual(boundary.events[-3:], ["httpA", "afterA", "cleanup"])
        self.assertNotIn("rotate", boundary.events)
        self.assertTrue(receipt["absenceComplete"] and receipt["sourcesUnchanged"])

    def test_real_main_after_observer_failure_becomes_first_error_after_valid_http(self):
        """Break: a valid HTTP result suppresses its failed after observer."""
        boundary = D1Boundary(self.root)
        boundary.after_failure = True
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["originalError"]["code"]), (1, "SQL_STAGE_FAILURE"))
        self.assertTrue(receipt["phases"]["A"]["completed"])
        self.assertNotIn("secondaryErrors", receipt)
        self.assertEqual(boundary.events[-3:], ["httpA", "afterA", "cleanup"])
        self.assertNotIn("rotate", boundary.events)

    def test_real_main_refuses_changed_frozen_native_before_next_http(self):
        """Break: rotation switches frozen binding responses before HTTP phase B."""
        boundary = D1Boundary(self.root)
        boundary.frozen_failure = True
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["originalError"]["code"]), (1, "FROZEN_NATIVE"))
        self.assertEqual(boundary.events[-3:], ["rotate", "baselineB", "cleanup"])
        self.assertNotIn("httpB", boundary.events)

    def test_real_main_runtime_pin_refuses_reapproved_other_product_bytes_before_db(self):
        """Break: a caller-approved manifest overrides the harness's frozen runtime pin."""
        boundary = D1Boundary(self.root)
        name = "lib/payment/paypal-charge/binding-source.ts"
        boundary.blobs[name] = b"reapproved but different product source"
        boundary.write(self.root, name, boundary.blobs[name])
        boundary.seal_web()
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["originalError"]["code"], receipt["stage"]), (1, "FROZEN_RUNTIME_PIN", "web-preflight"))
        self.assertEqual(boundary.events, [])
        self.assertEqual(boundary.db_git.calls, [])


class CliTests(TemporarySource):
    def test_d2_is_refused_before_any_manifest_read_db_or_docker_command(self):
        """Break: D1 accepts a d2 stub or reads DB/Docker before rejecting it."""
        argv = ["--phase-set", "d2", "--postgres-image", "postgres:15.8", "--run-label", "unit-d2",
                "--db-workspace", "/must-not-read-db", "--docker-host", "unix:///must-not-connect.sock",
                "--web-head", HEAD, "--web-manifest", "/must-not-read-web", "--web-manifest-sha256", "a" * 64,
                "--db-manifest", "/must-not-read-db-manifest", "--db-manifest-sha256", "b" * 64,
                "--docker-bin", "/must-not-exec-docker", "--node-bin", "/must-not-exec-node"]
        with patch.object(subject, "ROOT", self.root), patch.object(subject, "_command", side_effect=AssertionError("external process reached")), redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as caught:
                subject.main(argv)
        self.assertEqual(caught.exception.code, 2)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_d1_bad_web_manifest_records_first_preflight_failure_without_db_or_docker(self):
        """Break: main bypasses web approval or masks first failure with cleanup absence."""
        manifest = self.put("bad-web.json", b"{}")
        argv = ["--phase-set", "d1", "--postgres-image", "postgres:15.8", "--run-label", "unit-web-fail",
                "--db-workspace", "/must-not-read-db", "--docker-host", "unix:///must-not-connect.sock",
                "--web-head", HEAD, "--web-manifest", str(manifest), "--web-manifest-sha256", sha(b"{}"),
                "--db-manifest", "/must-not-read-db-manifest", "--db-manifest-sha256", "b" * 64,
                "--docker-bin", "/must-not-exec-docker", "--node-bin", "/must-not-exec-node"]
        with patch.object(subject, "ROOT", self.root), patch.object(subject, "_command", side_effect=AssertionError("external process reached")), redirect_stdout(io.StringIO()):
            self.assertEqual(subject.main(argv), 1)
        receipt_path = self.root / ".artifacts/payment-web-order-http/provider-rpc-unit-web-fail/receipt.json"
        result = json.loads(receipt_path.read_text())
        self.assertEqual(result["originalError"]["code"], "MANIFEST_SET")
        self.assertEqual(result["stage"], "web-preflight")
        self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
        self.assertNotIn("cleanupError", result)


if __name__ == "__main__":
    unittest.main()
