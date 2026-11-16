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
    def test_unknown_phase_is_refused_before_any_manifest_read_db_or_docker_command(self):
        """Break: an unknown phase reaches manifest, DB or Docker work."""
        argv = ["--phase-set", "d3", "--postgres-image", "postgres:15.8", "--run-label", "unit-unknown",
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


# D2 fixtures are independent literals. They are protocol inputs to the real
# runner, never an SDK double or an implementation of the SQL state machine.
D2_ENTRY = "__tests__/integration/payment/provider-bridge-postgrest.http.ts"
D2_FROZEN = (*FROZEN, "lib/payment/paypal-charge/provider-entry.ts",
             "lib/payment/paypal-charge/orchestrator.ts", "lib/payment/paypal-charge/protocol.ts")
D2_OWNED = (*OWNED[:-1], D2_ENTRY)
D2_BUNDLE = (D2_ENTRY, "lib/payment/paypal-charge/binding-source.ts",
             "lib/payment/paypal-charge/provider-entry.ts", "lib/payment/paypal-charge/repository.ts",
             "lib/payment/paypal-charge/orchestrator.ts", "lib/payment/paypal-charge/protocol.ts",
             "server-only-marker:server-only")
D2_RPC = {
    "getter": "get_web_payment_charge_context", "prepare": "prepare_web_payment_provider_context",
    "binding": "get_web_payment_provider_binding", "entry": "authorize_web_payment_provider_entry",
    "bind": "bind_web_payment_provider_identity", "record": "record_web_payment_observation",
    "claim": "claim_web_payment_charge", "intent": "record_web_payment_submission_intent",
    "receive": "receive_web_payment_purchase",
}
D2_LABELS = ("F1", "F2", "F3", "F4a", "F4b", "F5", "F5prime", "F6", "F7",
             "L1-CLAIM", "N-A", "N-B", "N-C", "ORD-ACL")
D2_TABLES = ("web_payment_orders", "web_payment_quotes", "web_payment_provider_contexts",
             "web_payment_provider_links", "web_payment_observations", "web_payment_charge_attempts",
             "web_payment_purchase_intakes", "products", *FINANCIAL, *FULL)
D2_PROBES = ["http", "http-address", "rpc-path", "http-address", "rpc-method", "rpc-method", "rpc-query", "rpc-query", "rpc-method"]
# Column order: contexts, ORDER links, CAPTURE links, observations, attempts,
# intent present, payment, settlement, exact version delta, intake/inbox/receipt.
# N-* deliberately has no correctness row: only ownership and safety bounds.
D2_STATE = {
    "F1": (1, 1, 1, 2, 1, True, "SUBMISSION_UNKNOWN", "INTAKE_PENDING", 3, 1),
    "F2": (1, 1, 0, 1, 0, False, "NOT_SUBMITTED", "NOT_INTAKE", 0, 0),
    "F3": (1, 0, 0, 0, 0, False, "NOT_SUBMITTED", "NOT_INTAKE", 0, 0),
    "F4a": (1, 1, 0, 1, 0, False, "NOT_SUBMITTED", "NOT_INTAKE", 0, 0),
    "F4b": (1, 1, 0, 2, 0, False, "NOT_SUBMITTED", "NOT_INTAKE", 0, 0),
    "F5": (1, 1, 0, 1, 1, True, "SUBMISSION_UNKNOWN", "NOT_INTAKE", 2, 0),
    "F5prime": (1, 1, 0, 1, 1, True, "SUBMISSION_UNKNOWN", "NOT_INTAKE", 2, 0),
    "F6": (1, 0, 0, 1, 0, False, "NOT_SUBMITTED", "NOT_INTAKE", 0, 0),
    "F7": (1, 0, 0, 0, 0, False, "NOT_SUBMITTED", "NOT_INTAKE", 0, 0),
    "L1-CLAIM": (1, 1, 0, 1, 1, False, "NOT_SUBMITTED", "NOT_INTAKE", 1, 0),
    "ORD-ACL": (0, 0, 0, 0, 0, False, "NOT_SUBMITTED", "NOT_INTAKE", 0, 0),
}
# Exact RPC order per sequential case; F4 lanes use separate lane numbers.
# Setup requests reach PostgREST but are excluded from measuredProxy counts.
D2_TAP_PLAN = {
    "A": {
        "F1": ("F1", "", "getter prepare binding entry bind getter prepare binding claim intent bind receive"),
        "F2": ("F2", "", "getter prepare binding entry getter prepare binding entry bind"),
        "F3a": ("F3", "", "getter prepare binding entry"),
        "F4a": ("F4a", "prepare getter", "getter prepare binding entry bind"),
        "F4b": ("F4b", "prepare getter", "getter prepare binding entry bind"),
        "F4b-refusal": ("F4b", "", "getter entry"),
        "F5": ("F5", "", "getter prepare binding entry bind getter prepare binding claim intent getter prepare binding getter claim"),
        "F5prime": ("F5prime", "", "getter prepare binding entry bind getter prepare binding claim intent getter prepare binding"),
        "F6": ("F6", "getter prepare binding entry record getter", "getter binding entry claim"),
        "F7a": ("F7", "", "prepare"),
        "L1a": ("F1", "", "binding entry entry entry entry"),
        "L1-CLAIM": ("L1-CLAIM", "getter prepare binding entry bind getter claim getter binding", "entry"),
        "L1b": ("F5", "", "binding entry"),
        "N-A": ("N-A", "", "getter prepare binding entry bind getter prepare binding claim intent record getter prepare binding"),
        "N-B": ("N-B", "", "getter prepare binding entry bind getter prepare binding claim intent record getter prepare binding"),
        "N-C": ("N-C", "", "getter prepare binding entry bind getter prepare binding claim intent bind getter prepare binding"),
    },
    "B": {"F7b": ("F7", "", "getter prepare binding entry")},
    "C": {"F3b": ("F3", "", "getter prepare binding entry"),
          "C-READS": (None, "", "")},
}
D2_COUNTS = {
    "A": {"scenarios": 16, "setupProxy": 19, "measuredProxy": 130, "direct": 24, "postgrest": 173},
    "B": {"scenarios": 1, "setupProxy": 0, "measuredProxy": 4, "direct": 0, "postgrest": 4},
    "C": {"scenarios": 2, "setupProxy": 0, "measuredProxy": 32, "direct": 0, "postgrest": 32},
}


def d2_id(label, kind="order"):
    # Synthetic identifiers only; no expectation uses a subject helper.
    group = {"order": "cc", "context": "dd", "quote": "ee", "key": "ff", "attempt": "ab"}[kind]
    return "d255" + group + "01-0000-4000-8000-" + str(D2_LABELS.index(label) + 1).zfill(12)


def d2_cases():
    return cases() + [{"label": label, "actor": ACTORS["A"], "order": d2_id(label)} for label in D2_LABELS]


def d2_native(label, prepared=True):
    binding = {"contract_version": "web-payment-provider-binding.v1", "outcome": "CONTEXT_REQUIRED", "charge_authority": False}
    context = {"contract_version": "web-payment-charge-context.v1", "outcome": "FOUND", "charge_authority": False,
        "order_id": d2_id(label), "provider": "PAYPAL", "environment": "SANDBOX", "row_version": "7",
        "payment_state": "NOT_SUBMITTED", "settlement_state": "NOT_INTAKE", "actor_deleted": False,
        "quote_id": d2_id(label, "quote"), "quote_hash": "a" * 64, "product_id": "UNIT-PRODUCT",
        "amount_minor": "123", "currency": "USD", "quantity": "1", "quote_expires_at": "2026-11-16T04:59:00.123456+00:00",
        "context_id": d2_id(label, "context") if prepared else None, "verification_binding_present": prepared,
        "provider_order_id": None, "provider_capture_id": None, "payment_id": None,
        "attempt_id": None, "submission_intent_recorded": False, "review_required": False}
    if prepared:
        binding = {**native_values()["B1"]["value"], "order_id": d2_id(label), "context_id": d2_id(label, "context"),
                   "quote_id": d2_id(label, "quote")}
    return {"binding": binding, "context": context}


def d2_observation(label="baselineA"):
    after_a = label != "baselineA"
    phase = label[-1]
    control, control_digest = {"A": (controls(), "c" * 64), "B": (rotated_control(), "e" * 64),
                               "C": (stopped_control(), "f" * 64)}[phase]
    result = observation(label, control, control_digest)
    result.update(phaseSet="d2", productDigest=("8" if after_a else "7") * 64,
                  orderFacts={}, productState={name: [] for name in D2_TABLES}, bridgeNative={})
    # Catalog observations are external SQL output, not a SQL/ACL simulator.
    result["entryCatalog"] = {
        "signature": "authorize_web_payment_provider_entry(uuid,uuid,uuid,uuid,text)",
        "owner": "wallet_command_owner", "securityDefiner": True, "volatility": "v",
        "proconfig": ['search_path=""'], "executeGrantees": ["wallet_command_owner", "service_role"],
        "publicExecute": False, "effectiveExecute": {"service_role": True, "anon": False,
            "authenticated": False, "wallet_test": False, "wallet_state_owner": False,
            "wallet_attestation_owner": False}}
    state = result["productState"]
    # Fixed outside rows protect D1 seeds and an independent non-owned order.
    state["products"] = [{"id": "UNIT-PRODUCT", "product_type": "consumable", "web_price_usd": "1.23"}]
    state["web_payment_orders"] = [{"id": row["order"], "user_id": row["actor"], "row_version": "7",
        "payment_state": "NOT_SUBMITTED", "settlement_state": "NOT_INTAKE", "immutable": "D1-seed"} for row in cases()[:4]]
    state["web_payment_orders"].append({"id": "d255cc99-0000-4000-8000-000000000099", "user_id": ACTORS["B"],
        "row_version": "7", "payment_state": "NOT_SUBMITTED", "settlement_state": "NOT_INTAKE", "immutable": "non-owned"})
    for name in D2_LABELS:
        values = D2_STATE.get(name, (1, 1, 0, 1, 1, True, "SUBMISSION_UNKNOWN", "NOT_INTAKE", 2, 0)) if after_a else (0, 0, 0, 0, 0, False, "NOT_SUBMITTED", "NOT_INTAKE", 0, 0)
        contexts, orders, captures, observed, attempts, intent, payment, settlement, delta, intake = values
        links = ([{"identityKind": "ORDER", "externalId": "ORDER" + name.replace("-", "").upper()}] if orders else [])
        if captures:
            links.append({"identityKind": "CAPTURE", "externalId": "CAPTUREF1"})
        facts = []
        if observed:
            facts.append({"source": "CREATE_RESPONSE", "identityKind": "ORDER", "outcome": "RECORDED", "reasonCode": None})
        if name == "F1" and after_a:
            facts.append({"source": "SUBMIT_RESPONSE", "identityKind": "CAPTURE", "outcome": "RECORDED", "reasonCode": None})
        elif name == "F4b" and after_a:
            facts.append({"source": "CREATE_RESPONSE", "identityKind": "ORDER", "outcome": "REVIEW_REQUIRED", "reasonCode": "IDENTITY_ALREADY_BOUND"})
        elif name == "F6" and after_a:
            facts[0].update(outcome="REVIEW_REQUIRED", reasonCode="PROVIDER_SCOPE_MISMATCH")
        fact = {"orderId": d2_id(name), "contextCount": contexts, "links": links, "observations": facts,
                "attemptCount": attempts, "submissionIntentRecorded": intent, "paymentState": payment,
                "settlementState": settlement, "rowVersion": str(7 + delta),
                "intakeCount": intake, "inboxCount": intake, "receiptCount": intake}
        result["orderFacts"][name] = fact
        order = {"id": d2_id(name), "user_id": ACTORS["A"], "row_version": fact["rowVersion"],
                 "payment_state": payment, "settlement_state": settlement, "quote_id": d2_id(name, "quote"), "immutable": "keep"}
        state["web_payment_orders"].append(order)
        state["web_payment_quotes"].append({"id": d2_id(name, "quote"), "order_id": d2_id(name), "quote_hash": "a" * 64})
        if contexts:
            state["web_payment_provider_contexts"].append({"id": d2_id(name, "context"), "order_id": d2_id(name),
                "user_id": ACTORS["A"], "quote_id": d2_id(name, "quote"), "create_request_key": d2_id(name, "key"),
                "verification_binding_id": BINDING1})
        for index, item in enumerate(links):
            state["web_payment_provider_links"].append({"id": d2_id(name, "context" if index == 0 else "key"),
                "context_id": d2_id(name, "context"), "identity_kind": item["identityKind"], "external_id": item["externalId"]})
        for index, item in enumerate(facts):
            state["web_payment_observations"].append({"id": d2_id(name, "quote" if index == 0 else "attempt"),
                "context_id": d2_id(name, "context"), "requested_context_id": d2_id(name, "context"),
                "source": item["source"], "outcome": item["outcome"], "reason_code": item["reasonCode"],
                "evidence": {"order_id": d2_id(name), "identity_kind": item["identityKind"]}})
        if attempts:
            state["web_payment_charge_attempts"].append({"id": d2_id(name, "attempt"), "order_id": d2_id(name),
                "submission_intent_at": "2026-11-16T04:45:00+00:00" if intent else None})
        result["bridgeNative"][name] = d2_native(name, bool(contexts))
        result["bridgeNative"][name]["context"].update(row_version=fact["rowVersion"], payment_state=payment,
            settlement_state=settlement, context_id=d2_id(name, "context") if contexts else None,
            attempt_id=d2_id(name, "attempt") if attempts else None, submission_intent_recorded=intent,
            provider_order_id=links[0]["externalId"] if orders else None,
            provider_capture_id="CAPTUREF1" if captures else None,
            review_required=any(item["outcome"] == "REVIEW_REQUIRED" for item in facts))
    if after_a:
        state["receipts"] = [{"id": "1", "user_id": ACTORS["A"], "verification_data": {"order_id": d2_id("F1")}}]
        state["wallet_provider_event_inbox"] = [{"id": "d255bb99-0000-4000-8000-000000000001",
            "idempotency_key": "web-payment.purchase.v2:" + d2_id("F1")}]
        state["web_payment_purchase_intakes"] = [{"order_id": d2_id("F1"), "receipt_id": "1",
            "inbox_id": "d255bb99-0000-4000-8000-000000000001"}]
        result["financialCounts"].update(receipts=1, wallet_provider_event_inbox=1)
    return result


def d2_entry_args(label="F1"):
    return {"p_actor_user_id": ACTORS["A"], "p_order_id": d2_id(label), "p_context_id": d2_id(label, "context"),
            "p_create_request_key": d2_id(label, "key"), "p_binding_hash": "b" * 64}


def d2_rpc_args(op, label):
    actor = {"p_actor_user_id": ACTORS["A"], "p_order_id": d2_id(label)}
    if op == "entry":
        return d2_entry_args(label)
    if op in ("getter", "prepare", "binding"):
        return actor
    if op in ("bind", "record"):
        return {"p_context_id": d2_id(label, "context"), "p_evidence": {"source": "CREATE_RESPONSE",
            "key": "ORDER:UNIT:CREATED", "payload_hash": "a" * 64, "provider": "PAYPAL", "environment": "SANDBOX",
            "identity_kind": "ORDER", "external_id": "UNIT", "parent_external_id": None, "order_id": d2_id(label),
            "user_id": ACTORS["A"], "quote_hash": "a" * 64, "order_reference": "v2:" + d2_id(label),
            "scope": {"account_id": "unit-account-v1", "merchant_id": "unit-merchant-v1"},
            "amount_minor": "123", "currency": "USD", "status": "CREATED"}}
    if op == "receive":
        return {"p_order_id": d2_id(label), "p_observation_id": d2_id(label, "context")}
    command = {**actor, "p_expected_version": "7", "p_action": "CAPTURE"}
    if op == "intent":
        # Tap projection: Node checks the raw capability against the claim
        # before forwarding; neither the raw lease nor OAuth/JWT is recorded.
        command.update(p_expected_version="8", p_attempt_id=d2_id(label, "attempt"),
                       p_lease_token="<redacted>", p_fencing_version="1")
    return command


def d2_outcomes(name):
    ready = lambda label, replay=False: {"kind": "PROVIDER_ORDER_READY", "providerOrderId": "ORDER" + label.replace("-", "").upper(), "replayed": replay}
    return copy.deepcopy({
        "F1": [ready("F1"), {"kind": "INTAKE_PENDING", "replayed": False}],
        "F2": [{"kind": "SUBMISSION_UNKNOWN"}, ready("F2", True)], "F3a": [{"kind": "SUBMISSION_UNKNOWN"}],
        "F4a": [ready("F4a", True), ready("F4a", True)],
        "F4b": [ready("F4b", True), {"kind": "REVIEW_REQUIRED"}],
        "F4b-refusal": [{"kind": "REVIEW_REQUIRED"}, {"kind": "ORDER_LINKED"}],
        "F5": [ready("F5"), {"kind": "SUBMISSION_UNKNOWN"}, {"kind": "SUBMISSION_UNKNOWN"}, {"kind": "LOOKUP_ONLY"}],
        "F5prime": [ready("F5prime"), {"kind": "SUBMISSION_UNKNOWN"}, {"kind": "UNAVAILABLE", "stage": "LOOKUP"}],
        "F6": [{"kind": "REVIEW_REQUIRED"}, {"kind": "BLOCKED", "reason": "REVIEW_REQUIRED"}, {"kind": "BLOCKED", "reason": "REVIEW_REQUIRED"}],
        "F7a": [{"kind": "PREPARED", "replayed": False}],
        "L1a": [{"kind": "BLOCKED", "reason": "CONTEXT_MISMATCH"}, {"kind": "BLOCKED", "reason": "CONTEXT_MISMATCH"},
                 {"kind": "BLOCKED", "reason": "BINDING_MISMATCH"}, {"kind": "ORDER_LINKED"}],
        "L1-CLAIM": [{"kind": "ORDER_LINKED"}], "L1b": [{"kind": "ORDER_LINKED"}],
        "N-A": [ready("N-A"), {"kind": "REVIEW_REQUIRED"}, {"kind": "SUBMISSION_UNKNOWN"}],
        "N-B": [ready("N-B"), {"kind": "REVIEW_REQUIRED"}, {"kind": "SUBMISSION_UNKNOWN"}],
        "N-C": [ready("N-C"), {"kind": "REVIEW_REQUIRED"}, {"kind": "SUBMISSION_UNKNOWN"}],
        "F7b": [{"kind": "BLOCKED", "reason": "VERIFICATION_BINDING_CHANGED"}],
        "F3b": [{"kind": "BLOCKED", "reason": "ORDERS_CLOSED"}], "C-READS": [],
    }[name])


# Per-case fake transport call facts (token, create, get, capture), setup first.
D2_FAKE_COUNTS = {
    "F1": ((0, 0, 0, 0), (2, 1, 1, 1)), "F2": ((0, 0, 0, 0), (2, 2, 0, 0)),
    "F3a": ((0, 0, 0, 0), (1, 1, 0, 0)), "F4a": ((0, 0, 0, 0), (2, 2, 0, 0)),
    "F4b": ((0, 0, 0, 0), (2, 2, 0, 0)), "F4b-refusal": ((0, 0, 0, 0), (0, 0, 0, 0)),
    "F5": ((0, 0, 0, 0), (3, 1, 2, 0)), "F5prime": ((0, 0, 0, 0), (3, 1, 3, 1)),
    "F6": ((1, 1, 0, 0), (0, 0, 0, 0)), "F7a": ((0, 0, 0, 0), (0, 0, 0, 0)),
    "L1a": ((0, 0, 0, 0), (0, 0, 0, 0)), "L1-CLAIM": ((1, 1, 0, 0), (0, 0, 0, 0)),
    "L1b": ((0, 0, 0, 0), (0, 0, 0, 0)), "N-A": ((0, 0, 0, 0), (3, 1, 2, 1)),
    "N-B": ((0, 0, 0, 0), (3, 1, 2, 1)), "N-C": ((0, 0, 0, 0), (3, 1, 2, 1)),
    "F7b": ((0, 0, 0, 0), (1, 0, 0, 0)), "F3b": ((0, 0, 0, 0), (1, 0, 0, 0)),
    "C-READS": ((0, 0, 0, 0), (0, 0, 0, 0)),
}


def d2_response(op, label, name, index, scope, lane):
    """Hand-selected external RPC envelopes, not a simulated database."""
    if op == "getter":
        prepared = not (index == 0 and name not in ("F4a", "F4b", "F4b-refusal", "F7b", "F3b"))
        value = d2_native(label, prepared)["context"]
        if name in ("F7b", "F3b"):
            return d2_observation("baselineB" if name == "F7b" else "baselineC")["bridgeNative"][label]["context"]
        if (index >= 5 and name not in ("F6", "F4a", "F4b")) or name == "F4b-refusal":
            value["provider_order_id"] = "ORDER" + label.replace("-", "").upper()
        if name == "F6" and (scope == "measured" or index == 5):
            value["review_required"] = True
        if name == "F4b-refusal":
            value["review_required"] = True
        if (name in ("F5", "F5prime") and index >= 10) or (name in ("N-A", "N-B", "N-C") and index == 11):
            value.update(row_version="9", payment_state="SUBMISSION_UNKNOWN", attempt_id=d2_id(label, "attempt"), submission_intent_recorded=True)
        if name == "L1-CLAIM" and index == 7:
            value.update(row_version="8", attempt_id=d2_id(label, "attempt"))
        return value
    if op == "binding":
        return d2_native(label)["binding"]
    if op == "prepare":
        fresh = scope == "setup" and index == 0 and name in ("F4a", "F4b")
        fresh = fresh or name == "F7a" or (index == 1 and name not in ("F4a", "F4b", "F7b", "F3b"))
        return {"outcome": "PREPARED", "replayed": not fresh, "context_id": d2_id(label, "context"),
            "order_id": d2_id(label), "quote_id": d2_id(label, "quote"), "quote_hash": "a" * 64,
            "provider": "PAYPAL", "environment": "SANDBOX",
            "scope": {"account_id": "unit-account-v1", "merchant_id": "unit-merchant-v1"},
            "settings_version": "31", "create_request_key": d2_id(label, "key"), "payment_id": None}
    if op == "entry":
        small = {"contract_version": "web-payment-provider-entry.v1", "charge_authority": False}
        if name in ("F4b-refusal", "L1-CLAIM", "L1b") or (name == "L1a" and index == 4):
            return {**small, "outcome": "ORDER_LINKED"}
        reason = {"F6": "REVIEW_REQUIRED", "F7b": "VERIFICATION_BINDING_CHANGED", "F3b": "ORDERS_CLOSED"}.get(name)
        if name == "F6" and scope == "setup":
            reason = None
        if name == "L1a" and index in (1, 2, 3):
            reason = "BINDING_MISMATCH" if index == 3 else "CONTEXT_MISMATCH"
        if reason:
            return {**small, "outcome": "BLOCKED", "safe_reason_code": reason}
        return {**small, "outcome": "AUTHORIZED", "order_id": d2_id(label), "context_id": d2_id(label, "context"),
            "create_request_key": d2_id(label, "key"), "quote_hash": "a" * 64,
            "binding_hash": "b" * 64, "entry_not_after": "2026-11-16T04:59:00.123456+00:00"}
    if op in ("bind", "record"):
        reason = "PROVIDER_SCOPE_MISMATCH" if name == "F6" else "IDENTITY_ALREADY_BOUND" if name == "F4b" and lane == 1 else None
        return {"outcome": "REVIEW_REQUIRED" if reason else "RECORDED", "reason_code": reason, "trust": "SERVER_REPORTED",
                "observation_id": d2_id(label, "attempt" if (name == "F4b" and lane == 1) or (name == "F1" and index == 10) else "quote"),
                "replayed": name == "F4a" and lane == 1}
    if op in ("claim", "intent"):
        if name == "F6":
            return {"decision": "BLOCKED", "safe_reason_code": "REVIEW_REQUIRED"}
        if name == "F5" and op == "claim" and index == 14:
            return {"decision": "LOOKUP_ONLY", "safe_reason_code": "SUBMISSION_UNKNOWN", "attempt_id": d2_id(label, "attempt"),
                "provider_request_key": d2_id(label, "attempt"), "fencing_version": "1", "row_version": "9", "quote_hash": "a" * 64}
        return {"decision": "SUBMIT", "safe_reason_code": "INTENT_RECORDED" if op == "intent" else "LEASE_CLAIMED",
            "attempt_id": d2_id(label, "attempt"), "lease_token": d2_id(label, "key"), "fencing_version": "1",
            "row_version": "9" if op == "intent" else "8", "provider_request_key": d2_id(label, "attempt"),
            "submit_not_after": "2026-11-16T04:46:00.123456+00:00", "quote_hash": "a" * 64}
    return {"outcome": "INTAKE_PENDING", "replayed": False, "order_id": d2_id(label),
            "inbox_id": "d255bb99-0000-4000-8000-000000000001", "receipt_id": "1", "coverage": "SCOPE_ONLY", "grant_eligible": False}


def d2_paypal_body(label, capture=False, bad_payee=False):
    body = {"id": "ORDER" + label.replace("-", "").upper(), "status": "COMPLETED" if capture else "CREATED",
        "intent": "CAPTURE", "purchase_units": [{"custom_id": "v2:" + d2_id(label),
            "amount": {"value": "1.23", "currency_code": "USD"},
            "payee": {"merchant_id": "different-merchant" if bad_payee else "unit-merchant-v1"},
            "payments": {"captures": []}}]}
    if capture:
        body["purchase_units"][0]["payments"]["captures"] = [{"id": "CAPTURE" + label.replace("-", "").upper(),
            "status": "COMPLETED", "amount": {"value": "2.34" if label == "N-A" else "1.23", "currency_code": "USD"}}]
        if label in ("N-A", "N-C"):
            body["status"] = "FUTURE_ORDER"
        if label == "N-B":
            body["intent"] = "AUTHORIZE"
    return body


def d2_result(phase="A"):
    taps, scenarios = [], []
    for name, (label, setup, measured) in D2_TAP_PLAN[phase].items():
        for scope, sequence in (("setup", setup), ("measured", measured)):
            for lane in range(2 if name in ("F4a", "F4b") and scope == "measured" else 1):
                for index, op in enumerate(sequence.split()):
                    args = d2_rpc_args(op, label)
                    response = d2_response(op, label, name, index, scope, lane)
                    if name == "F5" and op == "claim" and index == 14:
                        args["p_expected_version"] = "9"
                    if name == "L1a" and op == "entry":
                        if index == 1:
                            args["p_context_id"] = d2_id("F2", "context")
                        elif index == 2:
                            args["p_create_request_key"] = d2_id("F2", "key")
                        elif index == 3:
                            args["p_binding_hash"] = "c" * 64
                    if op in ("bind", "record"):
                        evidence = args["p_evidence"]
                        evidence["external_id"] = "ORDER" + label.replace("-", "").upper() + ("OTHER" if name == "F4b" and lane == 1 else "")
                        if name == "F6":
                            evidence["scope"]["merchant_id"] = "different-merchant"
                        if (name == "F1" and index == 10) or (name == "N-C" and index == 10):
                            evidence.update(source="SUBMIT_RESPONSE", identity_kind="CAPTURE", external_id="CAPTURE" + label.replace("-", "").upper(),
                                parent_external_id="ORDER" + label.replace("-", "").upper(), status="COMPLETED")
                        elif name in ("N-A", "N-B") and op == "record":
                            evidence.update(source="SUBMIT_RESPONSE", status="FUTURE_ORDER" if name == "N-A" else "COMPLETED")
                        evidence["key"] = evidence["identity_kind"] + ":" + evidence["external_id"] + ":" + evidence["status"]
                    taps.append({"label": name, "orderLabel": label, "scope": scope, "lane": lane, "step": index,
                        "rpc": D2_RPC[op], "method": "POST", "args": args, "status": 200, "response": response,
                        "upstream": True, "injected": False, "retryHeader": None,
                        "sdkHeaders": sdk_headers(), "incomingHeaders": {**sdk_headers(), "accept": "*/*"},
                        "leaseTokenMatchesClaim": True if op == "intent" else None,
                        "downstreamDestroyed": name == "F5" and op == "intent"})
        fake = []
        for scope, counts_row in zip(("setup", "measured"), D2_FAKE_COUNTS[name]):
            for method, count in zip(("requestToken", "createOrder", "getOrder", "captureOrder"), counts_row):
                for index in range(count):
                    response = {"kind": "TOKEN_AVAILABLE"}
                    if method in ("createOrder", "getOrder", "captureOrder"):
                        unknown = (method == "createOrder" and ((name == "F2" and index == 0) or name == "F3a"))
                        unknown = unknown or (method == "captureOrder" and name == "F5prime")
                        unknown = unknown or (method == "getOrder" and ((name == "F5prime" and index > 0)
                            or (name in ("N-A", "N-B", "N-C") and index == 1)))
                        body = d2_paypal_body(label, method == "captureOrder", name == "F6")
                        if method == "getOrder":
                            body["status"] = "APPROVED"
                        if name == "F4b" and method == "createOrder" and index == 1:
                            body["id"] += "OTHER"
                        response = {"kind": "TRANSPORT_UNKNOWN"} if unknown else {"kind": "RESPONSE", "status": 200, "body": body}
                    fake.append({"scope": scope, "method": method, "requestKey": d2_id(label, "key")
                        if method == "createOrder" else d2_id(label, "attempt") if method == "captureOrder" else None,
                        "providerOrderId": "ORDER" + label.replace("-", "").upper() if label else None, "response": response})
        scenario = {"label": name, "orderLabel": label, "outcomes": d2_outcomes(name), "fakeCalls": fake, "setupEvidence": None}
        if name in ("F4a", "F4b"):
            scenario.update(setupEvidence={"prepared": {"kind": "PREPARED", "replayed": False,
                "contextId": d2_id(label, "context"), "createRequestKey": d2_id(label, "key")},
                "getter": {"contextId": d2_id(label, "context"), "verificationBindingPresent": True,
                    "providerOrderId": None, "reviewRequired": False, "attemptId": None, "submissionIntentRecorded": False}},
                barrier={"arrivals": 2, "released": True, "timedOut": False})
        elif name == "F6":
            scenario["setupEvidence"] = {"outcome": {"kind": "REVIEW_REQUIRED"}, "createCount": 1,
                "reasonObserved": "PROVIDER_SCOPE_MISMATCH", "getter": {"reviewRequired": True,
                    "providerOrderId": None, "attemptId": None, "paymentState": "NOT_SUBMITTED"}}
        elif name == "L1-CLAIM":
            scenario["setupEvidence"] = {"claim": {"kind": "SUBMIT"}, "providerOrderId": "ORDERL1CLAIM",
                "attemptId": d2_id(label, "attempt"), "submissionIntentRecorded": False,
                "paymentState": "NOT_SUBMITTED", "rowVersion": "8", "reviewRequired": False}
        scenarios.append(scenario)
    if phase == "C":
        for label in D2_LABELS:
            for op in ("getter", "binding"):
                taps.append({"label": "C-READS", "orderLabel": label, "scope": "measured", "lane": 0,
                    "step": len(taps), "rpc": D2_RPC[op], "method": "POST", "args": d2_rpc_args(op, label),
                    "status": 200, "response": d2_observation("afterC")["bridgeNative"][label]["context" if op == "getter" else "binding"],
                    "upstream": True, "injected": False, "retryHeader": None, "sdkHeaders": sdk_headers(),
                    "incomingHeaders": {**sdk_headers(), "accept": "*/*"}, "leaseTokenMatchesClaim": None, "downstreamDestroyed": False})
    direct = []
    if phase == "A":
        for role in ("anon", "authenticated"):
            for op, rpc in D2_RPC.items():
                direct.append({"label": "ORD-ACL", "role": role, "rpc": rpc, "args": d2_rpc_args(op, "ORD-ACL"), "method": "POST", "status": 418,
                    "response": {"code": "42501"}, "retryHeader": None})
        for op in ("getter", "binding"):
            direct.append({"label": "ORD-ACL", "role": "service", "rpc": D2_RPC[op], "method": "GET", "status": 200,
                "query": d2_rpc_args(op, "ORD-ACL"),
                "response": d2_native("ORD-ACL", False)["context" if op == "getter" else "binding"], "retryHeader": None})
        entry_body = {"contract_version": "web-payment-provider-entry.v1", "outcome": "BLOCKED",
                      "charge_authority": False, "safe_reason_code": "CONTEXT_REQUIRED"}
        for method in ("GET", "POST"):
            direct.append({"label": "ORD-ACL", "role": "service", "rpc": D2_RPC["entry"], "method": method,
                "status": 200, "response": copy.deepcopy(entry_body),
                "query" if method == "GET" else "args": d2_entry_args("ORD-ACL"), "retryHeader": None})
        for role in ("anon", "authenticated"):
            direct.append({"label": "ORD-ACL", "role": role, "rpc": D2_RPC["entry"], "method": "GET",
                "status": 418, "response": {"code": "42501"}, "query": d2_entry_args("ORD-ACL"), "retryHeader": None})
        for row in direct:
            row.update(rawBody=json.dumps(row["response"], separators=(",", ":")), parseError=None)
    findings = [{"label": label, "status": "OBSERVED_OPEN", "facts": d2_observation("afterA")["orderFacts"][label]}
                for label in ("N-A", "N-B", "N-C")] if phase == "A" else []
    return {"phase": phase, "phaseSet": "d2", "source": [], "direct": direct, "taps": taps,
            "scenarios": scenarios, "counts": copy.deepcopy(D2_COUNTS[phase]), "openFindings": findings,
            "guard": {"blocked": D2_PROBES[:]}, "executionPins": http_result()["executionPins"],
            "nativeTimestampEvidence": {"timezone": "UTC", "entryNotAfter": "2026-11-16T04:59:00.123456+00:00"}}


def d2_receipt():
    result = complete_receipt()
    result.update(phaseSet="d2", fixtureCases=d2_cases(),
        sourcesBefore={"web:" + name: "a" * 64 for name in (*D2_FROZEN, *D2_OWNED, *INSTALLED)},
        artifactHashesBefore={"provider-bridge-http.cjs": "e" * 64, "guard.cjs": "f" * 64,
                              "config.json": "c" * 64, "bundle-inputs.json": "c" * 64},
        observations={prefix + phase: d2_observation(prefix + phase) for phase in "ABC" for prefix in ("baseline", "after")},
        phases={phase: {"exitCode": 0, "completed": True, "result": d2_result(phase)} for phase in "ABC"})
    return result


class D2SourceTests(TemporarySource):
    def setUp(self):
        super().setUp()
        self.blobs = {name: ("unit d2 source " + name).encode() for name in (*D2_FROZEN, *D2_OWNED, *INSTALLED)}
        for name, data in self.blobs.items():
            self.put(name, data)
        self.manifest = {"webHead": HEAD, "frozenFiles": {p: sha(self.blobs[p]) for p in D2_FROZEN},
                         "ownedFiles": {p: sha(self.blobs[p]) for p in D2_OWNED},
                         "installedFiles": {p: sha(self.blobs[p]) for p in INSTALLED}}
        self.path = self.root / "d2-approved.json"
        self.git = GitBoundary(self.root, self.blobs, untracked=D2_OWNED)

    def verify(self):
        self.path.write_text(json.dumps(self.manifest))
        return subject.verify_web(self.root, self.path, sha(self.path.read_bytes()), HEAD, git=self.git, phase_set="d2")

    def test_d2_manifest_consumes_exact_frozen9_owned9_and_installed4(self):
        """Break: D2 uses D1 closure or omits its actual orchestrator/entry/protocol."""
        value = self.verify()
        self.assertEqual(set(value["sources"]), set((*D2_FROZEN, *D2_OWNED, *INSTALLED)))
        self.assertEqual(set(value["frozenState"]), set(D2_FROZEN))
        self.assertNotIn(ENTRY, value["sources"])

    def test_each_added_product_must_be_tracked_clean_and_equal_to_head_blob(self):
        """Break: a newly frozen product gets weaker checks than D1 reuse/product."""
        for name in D2_FROZEN[-3:]:
            for condition, code in (("dirty", "FROZEN_DIRTY"), ("untracked", "FROZEN_TRACKING"), ("blob", "FROZEN_HEAD_BLOB")):
                with self.subTest(name=name, condition=condition):
                    if condition == "dirty":
                        self.git.dirty.add(name)
                    elif condition == "untracked":
                        self.git.untracked.add(name)
                    else:
                        self.blobs[name] = b"unapproved HEAD blob"
                    self.refuses(code, self.verify)
                    self.git.dirty.discard(name)
                    self.git.untracked.discard(name)
                    self.blobs[name] = ("unit d2 source " + name).encode()

    def test_d2_closure_rejects_d1_entry_transport_and_any_additional_source(self):
        """Break: selecting D2 silently widens executable input authority."""
        original = copy.deepcopy(self.manifest)
        for name in (ENTRY, "lib/payment/paypal-charge/transport.ts", "scripts/new-helper.py"):
            with self.subTest(name=name):
                self.manifest = copy.deepcopy(original)
                self.manifest["ownedFiles"][name] = "a" * 64
                self.refuses("MANIFEST_SET", self.verify)
        self.manifest = copy.deepcopy(original)
        self.manifest["frozenFiles"].pop(D2_FROZEN[-1])
        self.refuses("MANIFEST_SET", self.verify)

    def test_d2_bundle_requires_exact_seven_actual_inputs_and_delivery_bytes(self):
        """Break: D2 accepts missing product code, type-only transport or wrong entry."""
        entry = b"independent d2 bridge entry"
        meta = {"entryDeliveryHex": entry.hex(), "metafile": {"inputs": {
            name: {"bytes": len(entry) if name == D2_ENTRY else 10} for name in D2_BUNDLE}}}
        result = subject.verify_bundle(meta, entry, phase_set="d2")
        self.assertEqual(result["inputPaths"], sorted(D2_BUNDLE))
        for name in ("lib/payment/paypal-charge/transport.ts", ENTRY, "lib/extra.ts"):
            changed = copy.deepcopy(meta)
            changed["metafile"]["inputs"][name] = {"bytes": 1}
            self.refuses("BUNDLE_INPUTS", lambda: subject.verify_bundle(changed, entry, phase_set="d2"))
        for name in D2_BUNDLE:
            changed = copy.deepcopy(meta)
            changed["metafile"]["inputs"].pop(name)
            self.refuses("BUNDLE_INPUTS", lambda: subject.verify_bundle(changed, entry, phase_set="d2"))
        changed = copy.deepcopy(meta)
        changed["metafile"]["inputs"][D2_ENTRY]["bytes"] -= 1
        self.refuses("BUNDLE_DELIVERY", lambda: subject.verify_bundle(changed, entry, phase_set="d2"))

    def test_d2_cases_require_fourteen_distinct_owned_orders_beside_unchanged_d1_nine(self):
        """Break: a D2 order is reused across scenarios or displaces D1 native coverage."""
        result = subject.validate_cases(d2_cases(), phase_set="d2")
        self.assertEqual(set(result), set((*LABELS, *D2_LABELS)))
        for mutation in ("missing", "duplicate", "order-alias", "d1-alias", "null", "extra"):
            with self.subTest(mutation=mutation):
                value = d2_cases()
                if mutation == "missing":
                    value.pop()
                elif mutation == "duplicate":
                    value[-1] = copy.deepcopy(value[-2])
                elif mutation == "order-alias":
                    value[-1]["order"] = value[-2]["order"]
                elif mutation == "d1-alias":
                    value[-1]["order"] = value[0]["order"]
                elif mutation == "null":
                    value[-1]["actor"] = None
                else:
                    value[-1]["extra"] = True
                self.refuses("FIXTURE_CASES", lambda: subject.validate_cases(value, phase_set="d2"))


class D2RequestPolicyTests(TemporarySource):
    """Python runner policy checks; actual JS guard execution is root-owned."""
    config = {"restIp": "172.29.40.3", "restPort": 3000, "proxyPort": 41235}

    def request(self, rpc, method="POST", proxy=False, query=None):
        base = "http://127.0.0.1:41235/rest/v1/rpc/" if proxy else "http://172.29.40.3:3000/rpc/"
        return {"url": base + rpc, "method": method, "query": [] if query is None else query}

    def check(self, request):
        return subject.validate_request_policy(request, self.config, phase_set="d2")

    def test_exact_nine_rpc_post_surface_is_accepted_on_owned_direct_and_proxy(self):
        """Break: D1-only policy blocks actual D2 calls or silently omits an RPC."""
        for rpc in D2_RPC.values():
            for proxy in (False, True):
                with self.subTest(rpc=rpc, proxy=proxy):
                    self.assertIsNone(self.check(self.request(rpc, proxy=proxy)))

    def test_stable_two_gets_require_exact_two_lowercase_uuid_queries(self):
        """Break: partial/duplicate GET arguments reach a different overload or owner."""
        query = [("p_actor_user_id", ACTORS["A"]), ("p_order_id", d2_id("ORD-ACL"))]
        for op in ("getter", "binding"):
            for proxy in (False, True):
                self.assertIsNone(self.check(self.request(D2_RPC[op], "GET", proxy, query)))
                for bad in ([], query[:1], query + query[:1], query + [("extra", "1")],
                            [("p_actor_user_id", "null"), query[1]], [("p_actor_user_id", ACTORS["A"].upper()), query[1]]):
                    self.refuses("HTTP_POLICY", lambda: self.check(self.request(D2_RPC[op], "GET", proxy, bad)))

    def test_direct_entry_get_exception_requires_exact_five_uuid_hash_arguments(self):
        """Break: the sole volatile GET probe gains proxy or query expansion authority."""
        query = list(d2_entry_args("ORD-ACL").items())
        self.assertIsNone(self.check(self.request(D2_RPC["entry"], "GET", False, query)))
        self.refuses("HTTP_POLICY", lambda: self.check(self.request(D2_RPC["entry"], "GET", True, query)))
        for bad in ([], query[:-1], query + query[:1], query + [("extra", "1")],
                    [(key, "z" * 64 if key == "p_binding_hash" else value) for key, value in query],
                    [(key, "invalid" if key == "p_context_id" else value) for key, value in query]):
            self.refuses("HTTP_POLICY", lambda: self.check(self.request(D2_RPC["entry"], "GET", False, bad)))

    def test_other_rpc_methods_credentials_addresses_and_extra_policy_keys_are_denied(self):
        """Break: method/path/credential parsing widens the approved local surface."""
        for rpc in ("create_web_payment_order", "claim_web_payment_purchase", "unknown", D2_RPC["entry"] + "/"):
            self.refuses("HTTP_POLICY", lambda: self.check(self.request(rpc)))
        for op in ("prepare", "bind", "record", "claim", "intent", "receive"):
            self.refuses("HTTP_POLICY", lambda: self.check(self.request(D2_RPC[op], "GET")))
        for method in ("HEAD", "OPTIONS", "DELETE", "PATCH", "PUT"):
            self.refuses("HTTP_POLICY", lambda: self.check(self.request(D2_RPC["getter"], method)))
        for url in ("https://172.29.40.3:3000/rpc/", "http://user:pass@172.29.40.3:3000/rpc/",
                    "http://order-rest:3000/rpc/", "http://127.0.0.1:54322/rpc/", "http://172.29.40.4:3000/rpc/"):
            value = self.request(D2_RPC["getter"])
            value["url"] = url + D2_RPC["getter"]
            self.refuses("HTTP_POLICY", lambda: self.check(value))
        for field, value in (("query", [("p_order_id", d2_id("F1"))]), ("credential", "must-not-record")):
            request = self.request(D2_RPC["getter"])
            request[field] = value
            self.refuses("HTTP_POLICY", lambda: self.check(request))


class D2ResultTests(TemporarySource):
    def parse(self, phase="A", result=None, extra="", marker=None, exit_code=0):
        text = RESULT_PREFIX + json.dumps(d2_result(phase) if result is None else result) + "\n"
        text += (MARKERS[phase] if marker is None else marker) + "\n" + extra
        return subject.parse_result(phase, subprocess.CompletedProcess([], exit_code, text, "node stderr"),
                                    {"phaseSet": "d2", "completionMarkers": MARKERS}, phase_set="d2")

    def test_complete_d2_results_parse_in_all_three_phases(self):
        """Break: D2 is parsed through a D1-only result contract."""
        for phase in "ABC":
            self.assertEqual(self.parse(phase), d2_result(phase))

    def test_d2_missing_duplicate_foreign_and_partial_markers_or_results_fail(self):
        """Break: successful output from another phase or a partial result is reused."""
        for marker, extra, code in (("", "", "PHASE_MARKER"), (MARKERS["A"], MARKERS["A"] + "\n", "PHASE_MARKER"),
            (MARKERS["A"], MARKERS["B"] + "\n", "PHASE_MARKER"),
            (MARKERS["A"], RESULT_PREFIX + "{}\n", "PHASE_RESULT"),
            (MARKERS["A"], PARTIAL_PREFIX + "{}\n", "PHASE_RESULT")):
            self.refuses(code, lambda: self.parse(marker=marker, extra=extra))
        self.refuses("PHASE_EXIT", lambda: self.parse(exit_code=9))
        for result in ({"phase": "A"}, http_result(), {**d2_result(), "phaseSet": "d1"}, {**d2_result(), "scenarios": None}):
            self.refuses("PHASE_RESULT", lambda: self.parse(result=result))

    def test_d2_observer_reads_admin_exact_schema_without_claiming_sql_proof(self):
        """Break: D2 observer is rejected by D1 financial-zero rules or loses raw rows."""
        for label in ("baselineA", "afterA", "baselineB", "afterB", "baselineC", "afterC"):
            value = d2_observation(label)
            pair = ScriptedSql([(0, "PROVIDER_RPC_OBSERVATION " + json.dumps(value) + "\nPROVIDER_RPC_OBSERVER_COMPLETE\n", "")])
            actual = subject.observe(pair, self.root, label, d2_cases(), b"external-observer", {}, phase_set="d2")
            self.assertEqual(actual, value)
            self.assertEqual(pair.calls[0][1], {"user": "fixture_admin", "check": False})

    def test_d2_observer_requires_full_order_native_and_table_evidence(self):
        """Break: missing order rows, labels or observer identity are treated as measurement."""
        for field in ("orderFacts", "productState", "bridgeNative", "financialCounts", "fullCounts", "timezone"):
            with self.subTest(field=field):
                value = d2_observation("afterA")
                value.pop(field)
                pair = ScriptedSql([(0, "PROVIDER_RPC_OBSERVATION " + json.dumps(value) + "\nPROVIDER_RPC_OBSERVER_COMPLETE\n", "")])
                self.refuses("OBSERVER_RESULT", lambda: subject.observe(pair, self.root, "afterA", d2_cases(),
                    b"external-observer", {}, phase_set="d2"))


class D2HttpTests(TemporarySource):
    def verify(self, phase="A", result=None):
        return subject.validate_http(phase, d2_result(phase) if result is None else result,
            d2_observation("baseline" + phase), d2_cases(), phase_set="d2")

    def test_d2_exact_per_phase_counts_separate_setup_from_measured_and_direct(self):
        """Break: setup is counted twice, injections count as DB reach or a phase is skipped."""
        for phase, expected in (("A", (173, 19, 130, 24)), ("B", (4, 0, 4, 0)), ("C", (32, 0, 32, 0))):
            actual = self.verify(phase)
            self.assertEqual(tuple(actual[key] for key in ("postgrestRequests", "setupProxyTaps", "measuredProxyTaps", "directRequests")), expected)

    def test_d2_missing_duplicate_extra_scenario_or_tap_fails_despite_summary_counts(self):
        """Break: trusting count summaries hides omitted or additional real traffic."""
        for area in ("scenarios", "taps", "direct"):
            for mutation in ("missing", "duplicate", "extra"):
                value = d2_result()
                if mutation == "missing":
                    value[area].pop()
                elif mutation == "duplicate":
                    value[area][0] = copy.deepcopy(value[area][1])
                else:
                    value[area].append(copy.deepcopy(value[area][0]))
                self.refuses("D2_HTTP", lambda: self.verify(result=value))
        value = d2_result()
        value["counts"]["measuredProxy"] = 149
        self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_rpc_order_method_arguments_upstream_and_retry_are_independently_checked(self):
        """Break: right totals hide wrong calls, tuple drift, retry or non-forwarded traffic."""
        for mutation in ("rpc", "order", "method", "actor", "extra-arg", "upstream", "retry", "status"):
            value = d2_result()
            tap = value["taps"][0]
            if mutation == "rpc":
                tap["rpc"] = "create_web_payment_order"
            elif mutation == "order":
                value["taps"][0], value["taps"][1] = value["taps"][1], value["taps"][0]
            elif mutation == "method":
                tap["method"] = "GET"
            elif mutation == "actor":
                tap["args"]["p_actor_user_id"] = ACTORS["B"]
            elif mutation == "extra-arg":
                tap["args"]["p_unapproved"] = True
            elif mutation == "upstream":
                tap["upstream"] = False
            elif mutation == "retry":
                tap["retryHeader"] = "1"
            else:
                tap["status"] = 503
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_f4_prepared_setup_two_replay_lanes_and_two_arrival_barrier_are_required(self):
        """Break: fresh-context competition or a timed-out single CREATE is labeled F4 success."""
        for name in ("F4a", "F4b"):
            for mutation in ("fresh", "linked", "review", "attempt", "intent", "context", "one-arrival", "timeout", "unreleased", "lane-key"):
                value = d2_result()
                row = next(row for row in value["scenarios"] if row["label"] == name)
                getter = row["setupEvidence"]["getter"]
                if mutation == "fresh":
                    row["setupEvidence"]["prepared"]["replayed"] = True
                elif mutation == "linked":
                    getter["providerOrderId"] = "ALREADYLINKED"
                elif mutation == "review":
                    getter["reviewRequired"] = True
                elif mutation == "attempt":
                    getter["attemptId"] = d2_id(name, "attempt")
                elif mutation == "intent":
                    getter["submissionIntentRecorded"] = True
                elif mutation == "context":
                    getter["contextId"] = d2_id("F1", "context")
                elif mutation == "one-arrival":
                    row["barrier"]["arrivals"] = 1
                elif mutation == "timeout":
                    row["barrier"]["timedOut"] = True
                elif mutation == "unreleased":
                    row["barrier"]["released"] = False
                else:
                    next(t for t in value["taps"] if t["label"] == name and t["lane"] == 1 and t["rpc"] == D2_RPC["entry"])["args"]["p_context_id"] = d2_id("F1", "context")
                self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_f4_same_identity_replay_and_different_identity_multiset_are_distinct(self):
        """Break: F4a gains a second identity or F4b fixes scheduling to a particular winner."""
        value = d2_result()
        row = next(row for row in value["scenarios"] if row["label"] == "F4b")
        row["outcomes"].reverse()
        self.assertEqual(self.verify(result=value)["postgrestRequests"], 173)
        next(outcome for outcome in row["outcomes"] if outcome["kind"] == "PROVIDER_ORDER_READY")["providerOrderId"] = "ORDERF4BOTHER"
        self.assertEqual(self.verify(result=value)["postgrestRequests"], 173)
        row["outcomes"] = [{"kind": "REVIEW_REQUIRED"}, {"kind": "REVIEW_REQUIRED"}]
        self.refuses("D2_HTTP", lambda: self.verify(result=value))
        value = d2_result()
        next(row for row in value["scenarios"] if row["label"] == "F4a")["outcomes"][1]["providerOrderId"] = "ANOTHERID"
        self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_f4_actual_prepare_replay_and_entry_echo_must_match_setup_tuple_in_both_lanes(self):
        """Break: summary setup/barrier flags hide a fresh prepare or a different actual entry tuple."""
        for name in ("F4a", "F4b"):
            for lane in (0, 1):
                for field, bad in (("replayed", False), ("context_id", d2_id("F1", "context")),
                                   ("create_request_key", d2_id("F1", "key"))):
                    value = d2_result()
                    tap = next(t for t in value["taps"] if t["label"] == name and t["scope"] == "measured"
                               and t["lane"] == lane and t["rpc"] == D2_RPC["prepare"])
                    tap["response"][field] = bad
                    self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_f5_requires_upstream_200_then_destroyed_intent_response_and_capture_zero(self):
        """Break: a pre-commit disconnect or a second POST is presented as lost-commit recovery."""
        for mutation in ("upstream", "status", "destroyed", "capture", "lookup-only"):
            value = d2_result()
            tap = next(t for t in value["taps"] if t["label"] == "F5" and t["rpc"] == D2_RPC["intent"])
            row = next(row for row in value["scenarios"] if row["label"] == "F5")
            if mutation == "upstream":
                tap["upstream"] = False
            elif mutation == "status":
                tap["status"] = 503
            elif mutation == "destroyed":
                tap["downstreamDestroyed"] = False
            elif mutation == "capture":
                row["fakeCalls"].append({"scope": "measured", "method": "captureOrder", "requestKey": d2_id("F5", "attempt"), "providerOrderId": "ORDERF5"})
            else:
                row["outcomes"][-1] = {"kind": "SUBMIT"}
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_f5prime_and_each_open_n_case_allow_exactly_one_cumulative_capture(self):
        """Break: ambiguity or repeated capture sends zero or multiple provider capture POSTs."""
        for name in ("F5prime", "N-A", "N-B", "N-C"):
            for count in (0, 2):
                value = d2_result()
                row = next(row for row in value["scenarios"] if row["label"] == name)
                capture = next(call for call in row["fakeCalls"] if call["method"] == "captureOrder")
                row["fakeCalls"] = [call for call in row["fakeCalls"] if call["method"] != "captureOrder"] + [copy.deepcopy(capture) for _ in range(count)]
                self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_open_n_cases_retain_exact_scripted_capture_fact_and_unknown_create_replays(self):
        """Break: N-* is measured using a GET or a different response class instead of the approved capture fact."""
        for name, mutation in (("N-A", "status"), ("N-A", "amount"), ("N-B", "intent"), ("N-C", "amount")):
            value = d2_result()
            row = next(row for row in value["scenarios"] if row["label"] == name)
            body = next(call for call in row["fakeCalls"] if call["method"] == "captureOrder")["response"]["body"]
            if mutation == "status":
                body["status"] = "COMPLETED"
            elif mutation == "intent":
                body["intent"] = "CAPTURE"
            else:
                body["purchase_units"][0]["payments"]["captures"][0]["amount"]["value"] = "1.23" if name == "N-A" else "2.34"
            self.refuses("D2_HTTP", lambda: self.verify(result=value))
        for name in ("F2", "F3a"):
            value = d2_result()
            row = next(row for row in value["scenarios"] if row["label"] == name)
            next(call for call in row["fakeCalls"] if call["method"] == "createOrder")["response"] = {
                "kind": "RESPONSE", "status": 200, "body": d2_paypal_body("F2" if name == "F2" else "F3")}
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_f6_requires_stored_review_setup_and_separate_fast_refusal_entry_claim(self):
        """Break: getter fast refusal is counted as gate/claim parity or fabricated REVIEW setup."""
        for mutation in ("no-review", "linked", "attempt", "payment", "reason", "entry", "claim", "prepare"):
            value = d2_result()
            row = next(row for row in value["scenarios"] if row["label"] == "F6")
            if mutation == "no-review":
                row["setupEvidence"]["getter"]["reviewRequired"] = False
            elif mutation == "linked":
                row["setupEvidence"]["getter"]["providerOrderId"] = "ALREADYLINKED"
            elif mutation == "attempt":
                row["setupEvidence"]["getter"]["attemptId"] = d2_id("F6", "attempt")
            elif mutation == "payment":
                row["setupEvidence"]["getter"]["paymentState"] = "SUBMISSION_UNKNOWN"
            elif mutation == "reason":
                row["setupEvidence"]["reasonObserved"] = None
            elif mutation in ("entry", "claim"):
                row["outcomes"][1 if mutation == "entry" else 2] = {"kind": "AUTHORIZED"}
            else:
                next(t for t in value["taps"] if t["label"] == "F6" and t["scope"] == "measured")["rpc"] = D2_RPC["prepare"]
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_l1_tuple_precedence_and_claim_only_intent_classes_cannot_be_merged(self):
        """Break: ORDER_LINKED absorbs a bad tuple or the two setup classes alias."""
        for mutation in ("context", "key", "hash", "claim-intent", "claim-payment", "claim-version"):
            value = d2_result()
            if mutation in ("context", "key", "hash"):
                row = next(row for row in value["scenarios"] if row["label"] == "L1a")
                row["outcomes"][{"context": 0, "key": 1, "hash": 2}[mutation]] = {"kind": "ORDER_LINKED"}
            else:
                setup = next(row for row in value["scenarios"] if row["label"] == "L1-CLAIM")["setupEvidence"]
                setup[{"claim-intent": "submissionIntentRecorded", "claim-payment": "paymentState", "claim-version": "rowVersion"}[mutation]] = {"claim-intent": True, "claim-payment": "SUBMISSION_UNKNOWN", "claim-version": "9"}[mutation]
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_acl_exact18_and_service_stable2_actual_status_are_required(self):
        """Break: guessed statuses, another SQL error or omitted RPCs masquerade as ACL proof."""
        self.assertEqual(self.verify()["directRequests"], 24)
        for mutation in ("acl-2xx", "acl-code", "stable-status", "entry-status", "entry-proxy", "entry-query"):
            value = d2_result()
            stable = next(row for row in value["direct"] if row["role"] == "service" and row["rpc"] == D2_RPC["binding"])
            entry = next(row for row in value["direct"] if row["role"] == "service" and row["rpc"] == D2_RPC["entry"] and row["method"] == "GET")
            if mutation == "acl-2xx":
                value["direct"][0]["status"] = 200
            elif mutation == "acl-code":
                value["direct"][0]["response"]["code"] = "P0001"
            elif mutation == "stable-status":
                stable["status"] = 503
            elif mutation == "entry-status":
                entry["status"] = 503
            elif mutation == "entry-proxy":
                entry["proxy"] = True
            else:
                entry["query"].pop("p_binding_hash")
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_guard_denials_and_sdk_incoming_semantic_projection_are_exact(self):
        """Break: swallowed network denials, header drift or proxy rewrite hides extra traffic."""
        for area in ("sdkHeaders", "incomingHeaders"):
            for key, new in (("accept", "object+json"), ("prefer", "return=minimal"), ("contentType", "text/plain"),
                ("contentProfile", "private"), ("acceptProfile", "private"), ("apikeyMatches", False),
                ("authorizationMatches", 1), ("clientInfoVersion", "next")):
                value = d2_result()
                value["taps"][0][area][key] = new
                self.refuses("D2_HTTP", lambda: self.verify(result=value))
        for blocked in ([], D2_PROBES[:-1], D2_PROBES + ["tcp"], list(reversed(D2_PROBES))):
            value = d2_result()
            value["guard"]["blocked"] = blocked
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_taps_reject_raw_credentials_and_require_intent_capability_match_projection(self):
        """Break: tap metadata leaks a bearer/credential or hides a mismatched raw lease."""
        for mutation in ("authorization", "secret", "raw-lease", "lease-mismatch"):
            value = d2_result()
            tap = next(t for t in value["taps"] if t["rpc"] == D2_RPC["intent"])
            if mutation == "authorization":
                tap["authorization"] = "Bearer must-not-record"
            elif mutation == "secret":
                tap["clientSecret"] = "must-not-record"
            elif mutation == "raw-lease":
                tap["args"]["p_lease_token"] = d2_id("F1", "key")
            else:
                tap["leaseTokenMatchesClaim"] = False
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_create_keys_and_capture_keys_follow_separate_prepared_and_attempt_identities(self):
        """Break: provider idempotency keys change during same-key replay or alias CREATE/CAPTURE."""
        for name, method in (("F2", "createOrder"), ("F4a", "createOrder"), ("F4b", "createOrder"), ("F1", "captureOrder")):
            value = d2_result()
            row = next(row for row in value["scenarios"] if row["label"] == name)
            next(call for call in row["fakeCalls"] if call["method"] == method)["requestKey"] = d2_id("ORD-ACL", "key")
            self.refuses("D2_HTTP", lambda: self.verify(result=value))

    def test_d2_phase_b_c_refusals_queries_and_timestamp_observations_are_not_dropped(self):
        """Break: rotation/stop permits CREATE or omits frozen binding/status queries."""
        for phase in "BC":
            value = d2_result(phase)
            value["scenarios"][0]["outcomes"] = [{"kind": "PROVIDER_ORDER_READY"}]
            self.refuses("D2_HTTP", lambda: self.verify(phase, value))
        value = d2_result("C")
        next(t for t in value["taps"] if t["label"] == "C-READS" and t["rpc"] == D2_RPC["binding"] and t["orderLabel"] == "F1")["response"]["binding_version"] = 1
        self.refuses("D2_HTTP", lambda: self.verify("C", value))
        value = d2_result()
        value.pop("nativeTimestampEvidence")
        self.refuses("D2_HTTP", lambda: self.verify(result=value))


class D2StateTests(TemporarySource):
    def verify(self, phase="A", before=None, after=None, result=None):
        return subject.validate_d2_state(phase, d2_observation("baseline" + phase) if before is None else before,
            d2_observation("after" + phase) if after is None else after,
            d2_result(phase) if result is None else result, d2_cases())

    def test_d2_phase_a_allows_exact_owned_changes_and_later_phases_are_read_only(self):
        """Break: D1 equality rejects allowed bridge writes or D2 grants mutation in B/C."""
        for phase in "ABC":
            self.assertIsNone(self.verify(phase))

    def test_each_known_order_single_state_count_or_intent_mismatch_is_refused(self):
        """Break: aggregate digests replace exact per-order end-state validation."""
        for label in D2_STATE:
            for field, bad in (("contextCount", 2), ("attemptCount", 2), ("paymentState", "WRONG"),
                ("settlementState", "GRANTED"), ("submissionIntentRecorded", None), ("intakeCount", 2),
                ("inboxCount", 2), ("receiptCount", 2)):
                with self.subTest(label=label, field=field):
                    after = d2_observation("afterA")
                    after["orderFacts"][label][field] = bad
                    self.refuses("D2_STATE", lambda: self.verify(after=after))

    def test_each_known_row_version_requires_exact_delta_and_bigint_string(self):
        """Break: monotonic or numeric versions allow missing or extra authoritative writes."""
        for label in D2_STATE:
            for bad in ("6", "99", 7, True, "07"):
                after = d2_observation("afterA")
                after["orderFacts"][label]["rowVersion"] = bad
                self.refuses("D2_STATE", lambda: self.verify(after=after))
        # Exact arithmetic beyond JS's safe integer must remain string-based.
        before, after = d2_observation(), d2_observation("afterA")
        for value, version in ((before, "9007199254740993"), (after, "9007199254740996")):
            value["orderFacts"]["F1"]["rowVersion"] = version
            next(row for row in value["productState"]["web_payment_orders"] if row["id"] == d2_id("F1"))["row_version"] = version
            value["bridgeNative"]["F1"]["context"]["row_version"] = version
        self.assertIsNone(self.verify(before=before, after=after))

    def test_order_link_observation_source_outcome_reason_and_winner_identity_are_checked(self):
        """Break: matching row counts conceal wrong identity or a lost conflict/review fact."""
        for label, field, bad in (("F1", "links", []), ("F2", "observations", []),
            ("F4a", "observations", []), ("F4b", "observations", []), ("F6", "observations", [])):
            after = d2_observation("afterA")
            after["orderFacts"][label][field] = bad
            self.refuses("D2_STATE", lambda: self.verify(after=after))
        for label, index, field, bad in (("F1", 1, "source", "LOOKUP"), ("F1", 1, "identityKind", "ORDER"),
            ("F4b", 1, "outcome", "RECORDED"), ("F4b", 1, "reasonCode", "AMOUNT_MISMATCH"),
            ("F6", 0, "outcome", "RECORDED")):
            after = d2_observation("afterA")
            after["orderFacts"][label]["observations"][index][field] = bad
            self.refuses("D2_STATE", lambda: self.verify(after=after))
        after = d2_observation("afterA")
        after["orderFacts"]["F4b"]["links"][0]["externalId"] = "LOSERID"
        self.refuses("D2_STATE", lambda: self.verify(after=after))
        after, result = d2_observation("afterA"), d2_result()
        next(row for row in result["scenarios"] if row["label"] == "F4b")["outcomes"][0]["providerOrderId"] = "ORDERF4BOTHER"
        after["orderFacts"]["F4b"]["links"][0]["externalId"] = "ORDERF4BOTHER"
        next(row for row in after["productState"]["web_payment_provider_links"] if row["context_id"] == d2_id("F4b", "context"))["external_id"] = "ORDERF4BOTHER"
        after["bridgeNative"]["F4b"]["context"]["provider_order_id"] = "ORDERF4BOTHER"
        self.assertIsNone(self.verify(after=after, result=result))

    def test_raw_product_rows_cannot_disagree_with_order_facts_or_hide_extra_owned_writes(self):
        """Break: a fabricated summary masks real wrong state, an extra link or forbidden quote edit."""
        for mutation in ("state", "version", "immutable", "quote", "context", "link", "attempt", "intake"):
            after = d2_observation("afterA")
            state = after["productState"]
            if mutation in ("state", "version", "immutable"):
                order = next(row for row in state["web_payment_orders"] if row["id"] == d2_id("F1"))
                order[{"state": "payment_state", "version": "row_version", "immutable": "immutable"}[mutation]] = "wrong"
            elif mutation == "quote":
                state["web_payment_quotes"][0]["quote_hash"] = "f" * 64
            else:
                table = {"context": "web_payment_provider_contexts", "link": "web_payment_provider_links",
                         "attempt": "web_payment_charge_attempts", "intake": "web_payment_purchase_intakes"}[mutation]
                state[table].append(copy.deepcopy(state[table][0]))
            self.refuses("D2_STATE", lambda: self.verify(after=after))

    def test_d1_seed_acl_nonowned_orders_products_and_unlisted_rows_are_immutable(self):
        """Break: the bridge writes outside its scenario-owned rows or adds an unowned order."""
        for mutation in ("d1", "nonowned", "acl", "product", "new-order", "extra-table"):
            after = d2_observation("afterA")
            state = after["productState"]
            if mutation in ("d1", "nonowned", "acl"):
                identifier = cases()[0]["order"] if mutation == "d1" else "d255cc99-0000-4000-8000-000000000099" if mutation == "nonowned" else d2_id("ORD-ACL")
                next(row for row in state["web_payment_orders"] if row["id"] == identifier)["row_version"] = "8"
            elif mutation == "product":
                state["products"][0]["web_price_usd"] = "9.99"
            elif mutation == "new-order":
                state["web_payment_orders"].append({"id": "d255cc98-0000-4000-8000-000000000099", "user_id": ACTORS["A"]})
            else:
                state["unapproved_relation"] = []
            self.refuses("D2_STATE", lambda: self.verify(after=after))

    def test_receipt_inbox_and_intake_must_be_exactly_one_and_bound_to_f1(self):
        """Break: the two permitted financial rows belong to another order or fail their link."""
        for mutation in ("receipt-owner", "inbox-owner", "intake-owner", "receipt-extra", "inbox-extra", "receipt-missing", "cross-link"):
            after = d2_observation("afterA")
            state = after["productState"]
            if mutation == "receipt-owner":
                state["receipts"][0]["verification_data"]["order_id"] = d2_id("F2")
            elif mutation == "inbox-owner":
                state["wallet_provider_event_inbox"][0]["idempotency_key"] = "web-payment.purchase.v2:" + d2_id("F2")
            elif mutation == "intake-owner":
                state["web_payment_purchase_intakes"][0]["order_id"] = d2_id("F2")
            elif mutation == "receipt-extra":
                state["receipts"].append({"id": "2", "verification_data": {"order_id": d2_id("F1")}})
            elif mutation == "inbox-extra":
                state["wallet_provider_event_inbox"].append(copy.deepcopy(state["wallet_provider_event_inbox"][0]))
            elif mutation == "receipt-missing":
                state["receipts"] = []
            else:
                state["web_payment_purchase_intakes"][0]["receipt_id"] = "2"
            self.refuses("D2_STATE", lambda: self.verify(after=after))

    def test_financial29_and_full6_nonzero_missing_extra_boolean_counts_fail(self):
        """Break: permitted intake rows broaden into wallet/full writes or truthy zero summaries."""
        for table in (*[name for name in FINANCIAL if name not in ("receipts", "wallet_provider_event_inbox")], *FULL):
            after = d2_observation("afterA")
            field = "fullCounts" if table in FULL else "financialCounts"
            after[field][table] = 1
            self.refuses("D2_STATE", lambda: self.verify(after=after))
        for field in ("financialCounts", "fullCounts"):
            for mutation in ("missing", "extra", "boolean"):
                after = d2_observation("afterA")
                if mutation == "missing":
                    after[field].pop(next(iter(after[field])))
                elif mutation == "extra":
                    after[field]["future"] = 0
                else:
                    after[field][next(iter(after[field]))] = False
                self.refuses("D2_STATE", lambda: self.verify(after=after))

    def test_open_n_cases_reject_intake_receipt_inbox_and_writes_outside_their_own_rows(self):
        """Break: OBSERVED_OPEN exempts N-* from ownership or financial safety invariants."""
        for label in ("N-A", "N-B", "N-C"):
            for field in ("intakeCount", "receiptCount", "inboxCount"):
                after = d2_observation("afterA")
                after["orderFacts"][label][field] = 1
                self.refuses("D2_STATE", lambda: self.verify(after=after))
            after = d2_observation("afterA")
            row = next(row for row in after["productState"]["web_payment_observations"] if row["evidence"]["order_id"] == d2_id(label))
            row["evidence"]["order_id"] = d2_id("ORD-ACL")
            self.refuses("D2_STATE", lambda: self.verify(after=after))

    def test_open_n_findings_record_alternative_actual_facts_without_canonizing_current_behavior(self):
        """Break: observational N-* outcomes become correctness assertions or disappear as resolved."""
        after, result = d2_observation("afterA"), d2_result()
        fact = after["orderFacts"]["N-A"]
        fact["observations"][0].update(outcome="REVIEW_REQUIRED", reasonCode="UNRECOGNIZED_STATUS")
        row = next(row for row in after["productState"]["web_payment_observations"] if row["evidence"]["order_id"] == d2_id("N-A"))
        row.update(outcome="REVIEW_REQUIRED", reason_code="UNRECOGNIZED_STATUS")
        after["bridgeNative"]["N-A"]["context"]["review_required"] = True
        result["openFindings"][0]["facts"] = copy.deepcopy(fact)
        next(row for row in result["scenarios"] if row["label"] == "N-A")["outcomes"][-1] = {"kind": "REVIEW_REQUIRED"}
        self.assertIsNone(self.verify(after=after, result=result))
        for mutation in ("resolved", "missing", "wrong-facts"):
            value = copy.deepcopy(result)
            if mutation == "resolved":
                value["openFindings"][0]["status"] = "FIXED"
            elif mutation == "missing":
                value["openFindings"].pop()
            else:
                value["openFindings"][0]["facts"]["receiptCount"] = 1
            self.refuses("D2_STATE", lambda: self.verify(after=after, result=value))

    def test_f5_intent_commit_must_be_observed_in_attempt_not_in_client_claims(self):
        """Break: a client error/result is used as proof of intent commit."""
        after = d2_observation("afterA")
        next(row for row in after["productState"]["web_payment_charge_attempts"] if row["order_id"] == d2_id("F5"))["submission_intent_at"] = None
        self.refuses("D2_STATE", lambda: self.verify(after=after))

    def test_phase_b_c_product_control_and_frozen_binding_changes_fail(self):
        """Break: rotation/stop refusals are allowed to write or use a substituted binding."""
        for phase in "BC":
            for mutation in ("productDigest", "controlDigest", "controlState", "productState", "native", "bridgeNative"):
                after = d2_observation("after" + phase)
                if mutation.endswith("Digest"):
                    after[mutation] = "0" * 64
                elif mutation == "controlState":
                    after[mutation]["user_profiles"][0]["nickname"] = "changed"
                elif mutation == "productState":
                    after[mutation]["web_payment_orders"][0]["row_version"] = "8"
                elif mutation == "native":
                    after[mutation]["B1"]["value"]["binding_id"] = BINDING2
                else:
                    after[mutation]["F1"]["binding"]["binding_version"] = "2"
                self.refuses("D2_STATE", lambda: self.verify(phase, after=after))
        after = d2_observation("afterA")
        after["controlDigest"] = "0" * 64
        self.refuses("D2_STATE", lambda: self.verify(after=after))


class D2FinalTests(TemporarySource):
    def finish(self, receipt=None, change_snapshot=None, cleanup_fault=False):
        value = d2_receipt() if receipt is None else receipt
        after = {"sources": copy.deepcopy(value["sourcesBefore"]), "dbSources": copy.deepcopy(value["dbSourcesBefore"]),
            "artifacts": copy.deepcopy(value["artifactHashesBefore"]), "cache": {}, "nativeInputs": copy.deepcopy(value["nativeInputHashes"])}
        if change_snapshot:
            change_snapshot(after)
        # The same frozen PairFactory owns inspect/removal/absence behavior.
        with CleanupTests.factory(self) as (pair, transport):
            if cleanup_fault:
                def fault(args, **kwargs):
                    if args == ["network", "rm", NID]:
                        raise OSError("D2 exact network removal failure")
                    return transport(args, **kwargs)
                pair.transport = fault
            result = subject.finalize(value, cleanup=lambda: subject.cleanup_owned(pair, value), snapshot=lambda: after)
            return result, transport.calls

    def test_d2_finalizer_passes_only_after_real_factory_cleanup_and_all_snapshots(self):
        """Break: completion is emitted without D2 validation and exact ledger cleanup."""
        result, calls = self.finish()
        self.assertEqual((result["status"], result["exitCode"]), ("passed", 0))
        self.assertTrue(result["absenceComplete"])
        self.assertEqual([row for row in calls if row[1] == "rm"],
            [["container", "rm", "--force", "--volumes", cid] for cid in reversed(CID)] + [["network", "rm", NID]])
        self.assertFalse(any("label=" in word or "name=" in word for row in calls for word in row))

    def test_d2_finalizer_revalidates_actual_http_and_state_after_completed_true(self):
        """Break: an earlier completed flag bypasses final independent evidence validation."""
        for mutation in ("guard", "tap", "count", "observer", "order", "phase"):
            receipt = d2_receipt()
            if mutation == "guard":
                receipt["phases"]["C"]["result"]["guard"]["blocked"].append("tcp")
            elif mutation == "tap":
                receipt["phases"]["A"]["result"]["taps"].pop()
            elif mutation == "count":
                receipt["phases"]["A"]["result"]["counts"]["postgrest"] = 1
            elif mutation == "observer":
                receipt["observations"].pop("afterA")
            elif mutation == "order":
                receipt["observations"]["afterA"]["orderFacts"]["F1"]["rowVersion"] = "99"
            else:
                receipt["phases"]["B"]["completed"] = False
            result, _ = self.finish(receipt)
            self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
            self.assertIn("validationError", result)

    def test_d2_control_boundaries_recheck_product_unchanged_and_existing_allowlists(self):
        """Break: allowed in-phase writes excuse rotate/stop mutation or control drift."""
        for phase in "BC":
            for mutation in ("product", "raw-product", "profile", "binding"):
                receipt = d2_receipt()
                for prefix in ("baseline", "after"):
                    row = receipt["observations"][prefix + phase]
                    if mutation == "product":
                        row["productDigest"] = "0" * 64
                    elif mutation == "raw-product":
                        row["productState"]["web_payment_quotes"][0]["quote_hash"] = "0" * 64
                    elif mutation == "profile":
                        row["controlState"]["user_profiles"][0]["nickname"] = "wrong"
                    else:
                        row["controlState"]["web_payment_verification_bindings"][0]["credential_ref"] = "wrong"
                result, _ = self.finish(receipt)
                self.assertEqual(result["exitCode"], 1)

    def test_d2_source_artifact_cache_native_and_db_pins_are_all_checked_after_cleanup(self):
        """Break: bridge source, bundle, cached Python or native inputs drift without detection."""
        for area in ("sources", "dbSources", "artifacts", "cache", "nativeInputs"):
            def change(value):
                value[area][next(iter(value[area]), "new.pyc")] = "9" * 64
            result, _ = self.finish(change_snapshot=change)
            self.assertEqual(result["exitCode"], 1)

    def test_d2_finalizer_requires_complete_source_closure_and_actual_execution_pins(self):
        """Break: equal incomplete snapshots or changed Node execution pins bypass byte authority."""
        for name in (D2_FROZEN[-1], D2_OWNED[-1], INSTALLED[-1]):
            receipt = d2_receipt()
            receipt["sourcesBefore"].pop("web:" + name)
            result, _ = self.finish(receipt)
            self.assertEqual(result["exitCode"], 1)
        for key in ("bundleSha256", "guardSha256", "entryDeliverySha256"):
            receipt = d2_receipt()
            receipt["phases"]["C"]["result"]["executionPins"][key] = "0" * 64
            result, _ = self.finish(receipt)
            self.assertEqual(result["exitCode"], 1)

    def test_d2_original_error_and_partial_absence_survive_real_cleanup_failure(self):
        """Break: D2 validation or cleanup masks the first HTTP error or partial absence."""
        receipt = d2_receipt()
        receipt["originalError"] = {"code": "PHASE_EXIT", "type": "BoundaryError", "message": "first D2 HTTP error"}
        result, _ = self.finish(receipt, cleanup_fault=True)
        self.assertEqual(result["exitCode"], 1)
        self.assertEqual(result["originalError"], receipt["originalError"])
        self.assertEqual(result["absenceObserved"], {"containers": {cid: True for cid in CID}, "network": False})
        self.assertEqual(result["cleanupError"]["cause"]["message"], "D2 exact network removal failure")
        self.assertNotIn("cause", result["cleanupError"]["cause"])

    def test_d2_unknown_creation_and_uncertain_start_preserve_resources(self):
        """Break: D2 bypasses the factory's uncertainty gate to fabricate cleanup success."""
        for field in ("unknown", "uncertain_phase"):
            with CleanupTests.factory(self) as (pair, transport):
                if field == "unknown":
                    pair.ledger.unknown = [{"kind": "container", "exitCode": None}]
                else:
                    pair.uncertain_phase = [CID[0]]
                receipt = d2_receipt()
                result = subject.finalize(receipt, cleanup=lambda: subject.cleanup_owned(pair, receipt),
                    snapshot=lambda: {"sources": receipt["sourcesBefore"], "dbSources": receipt["dbSourcesBefore"],
                        "artifacts": receipt["artifactHashesBefore"], "cache": {}, "nativeInputs": receipt["nativeInputHashes"]})
                self.assertEqual(result["exitCode"], 1)
                self.assertEqual(transport.calls, [])
                self.assertNotIn("absenceObserved", receipt)


class D2Boundary(D1Boundary):
    """Real runner with external process/file responses and real factory cleanup."""
    def __init__(self, root):
        super().__init__(root)
        self.seed = cases()[:4] + d2_cases()[9:]
        self.result_mutation = self.observation_mutation = None
        self.extra_bundle = self.after_source_change = False
        self.http_output_fault = None
        self.blobs.pop(ENTRY)
        self.blobs.update({name: ("unit d2 source " + name).encode() for name in (*D2_FROZEN[-3:], D2_ENTRY)})
        for name in (*D2_FROZEN[-3:], D2_ENTRY):
            self.write(root, name, self.blobs[name])
        self.d2_product_pins = {name: sha(self.blobs[name]) for name in D2_FROZEN if name not in REUSE.values()}
        self.web_git = GitBoundary(root, self.blobs, untracked=D2_OWNED)
        self.web_manifest = {"webHead": HEAD, "frozenFiles": {p: sha(self.blobs[p]) for p in D2_FROZEN},
            "ownedFiles": {p: sha(self.blobs[p]) for p in D2_OWNED},
            "installedFiles": {p: sha(self.blobs[p]) for p in INSTALLED}}
        self.web_path.write_text(json.dumps(self.web_manifest))
        # Preserve real inspect authorization/close; only SQL/Node/start are
        # external process boundaries for this offline orchestration test.
        with CleanupTests.factory(self) as (pair, transport):
            self.pair, self.cleanup_transport = pair, transport
        self.pair.start = lambda: self.events.append("start")
        self.pair.start_postgrest = lambda: self.events.append("postgrest")
        self.pair.sql, self.pair.exec_node = self.sql, self.exec_node
        self.pair.version = "150008"
        def cleanup_transport(args, **kwargs):
            result = transport(args, **kwargs)
            if args == ["network", "rm", NID]:
                self.events.append("cleanup")
            return result
        self.pair.transport = cleanup_transport

    def sql(self, text, *, user, check):
        if text.endswith("observer-fixture"):
            if user != "fixture_admin" or check is not False:
                return self.unexpected((user, check))
            label = text.split("set provider_rpc.observation_label to '", 1)[1].split("'", 1)[0]
            self.events.append(label)
            if label == "afterA" and self.after_failure:
                return subprocess.CompletedProcess([], 8, "D2 original observer stdout", "D2 original observer stderr")
            value = d2_observation(label)
            if self.observation_mutation:
                self.observation_mutation(label, value)
            return subprocess.CompletedProcess([], 0, "PROVIDER_RPC_OBSERVATION " + json.dumps(value) + "\nPROVIDER_RPC_OBSERVER_COMPLETE\n", "")
        return super().sql(text, user=user, check=check)

    def command(self, argv, **kwargs):
        if argv[0] == "git":
            return super().command(argv, **kwargs)
        if argv[:3] != ["/unit-node", "--input-type=module", "-"] or argv[5:] != ["d2"]:
            return self.unexpected(argv)
        self.events.append("bundle")
        self.node_out = Path(argv[3])
        entry = bytes.fromhex(argv[4])
        if entry != self.blobs[D2_ENTRY]:
            return self.unexpected("wrong entry delivery")
        inputs = {name: {"bytes": len(entry) if name == D2_ENTRY else 10} for name in D2_BUNDLE}
        if self.extra_bundle:
            inputs["lib/payment/paypal-charge/transport.ts"] = {"bytes": 1}
        self.write(self.node_out, "provider-bridge-http.cjs", b"unit bridge external build output")
        self.write(self.node_out, "bundle-inputs.json", json.dumps({"entryDeliveryHex": entry.hex(),
            "metafile": {"inputs": inputs}, "esbuildVersion": "unit-version"}).encode())
        return subprocess.CompletedProcess(argv, 0, "", "")

    def exec_node(self, argv, *, check):
        phase = argv[4]
        config = json.loads((self.node_out / "config.json").read_text())
        native_path = self.node_out / ("native-" + phase + ".json")
        if argv[:4] != ["node", "--require", "/fixture/guard.cjs", "/fixture/provider-bridge-http.cjs"] or check is not False or argv[5] != sha(native_path.read_bytes()):
            return self.unexpected(argv)
        if config.get("phaseSet") != "d2" or config.get("cases") != d2_cases():
            return self.unexpected("D2 config contract")
        self.events.append("http" + phase)
        result = d2_result(phase)
        result["executionPins"] = config["executionPins"]
        if self.result_mutation:
            self.result_mutation(phase, result)
        if phase == "C" and self.after_source_change:
            (self.root / D2_FROZEN[-1]).write_bytes(b"source changed after delivery")
        if self.http_output_fault and self.http_output_fault[0] == phase:
            style = self.http_output_fault[1]
            stdout = (PARTIAL_PREFIX + json.dumps(result) + "\n" if style == "partial" else
                      RESULT_PREFIX + "{broken\n" + config["completionMarkers"][phase] + "\n")
            return subprocess.CompletedProcess([], 9 if style == "partial" else 0, stdout, "D2 original HTTP stderr")
        return subprocess.CompletedProcess([], 9 if self.http_failure else 0,
            RESULT_PREFIX + json.dumps(result) + "\n" + config["completionMarkers"][phase] + "\n", "D2 original HTTP stderr")

    def run(self, label="unit-d2-main"):
        boundary = types.SimpleNamespace(PairFactory=self.pair_factory, PUBLIC_PASSWORD="public-fixture-only",
            verified_helpers=self.helpers, LocalDocker=self.local_docker, jwt=lambda *args, **kwargs: "public-unit-fixture-token",
            interpreter_evidence=lambda: {"unitDependency": True})
        argv = ["--phase-set", "d2", "--postgres-image", "postgres:15.8", "--run-label", label,
            "--db-workspace", str(self.db), "--docker-host", "unix:///unit-no-socket", "--web-head", HEAD,
            "--web-manifest", str(self.web_path), "--web-manifest-sha256", sha(self.web_path.read_bytes()),
            "--db-manifest", str(self.db_path), "--db-manifest-sha256", sha(self.db_path.read_bytes()),
            "--docker-bin", "/unit-docker", "--node-bin", "/unit-node"]
        with patch.object(subject, "ROOT", self.root), patch.object(subject, "DB_ROOT", self.db), \
             patch.object(subject, "REUSE_PINS", self.reuse_pins), patch.object(subject, "PRODUCT_PINS", self.product_pins), \
             patch.object(subject, "D2_PRODUCT_PINS", self.d2_product_pins), patch.object(subject, "INSTALLED_PINS", self.installed_pins), \
             patch.object(subject, "_command", self.command), patch.dict(sys.modules, {"provider_rpc_main_boundary": boundary}), \
             redirect_stdout(io.StringIO()):
            code = subject.main(argv)
        receipt = self.root / ".artifacts/payment-web-order-http" / ("provider-rpc-" + label) / "receipt.json"
        return code, json.loads(receipt.read_text())


class D2MainTests(TemporarySource):
    def test_real_d2_main_sequences_all_phases_and_uses_real_exact_cleanup(self):
        """Break: main never enters D2 or skips its source/setup/control/observer/finalize path."""
        boundary = D2Boundary(self.root)
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["status"], receipt["phaseSet"]), (0, "passed", "d2"))
        self.assertEqual(boundary.events, ["bundle", "start", "seed", "baselineA", "postgrest", "httpA", "afterA",
            "rotate", "baselineB", "httpB", "afterB", "stop", "baselineC", "httpC", "afterC", "cleanup"])
        self.assertEqual([receipt["phases"][phase]["measuredCounts"]["postgrestRequests"] for phase in "ABC"], [173, 4, 32])
        self.assertTrue(receipt["absenceComplete"] and receipt["sourcesUnchanged"] and receipt["dbSourcesUnchanged"])
        self.assertEqual([args for args in boundary.cleanup_transport.calls if args[1] == "rm"],
            [["container", "rm", "--force", "--volumes", cid] for cid in reversed(CID)] + [["network", "rm", NID]])

    def test_d2_main_keeps_http_first_and_observer_secondary_error_with_original_logs(self):
        """Break: a failed after observer overwrites original Node failure or skips cleanup."""
        boundary = D2Boundary(self.root)
        boundary.http_failure = boundary.after_failure = True
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["originalError"]["code"]), (1, "PHASE_EXIT"))
        self.assertEqual([row["code"] for row in receipt["secondaryErrors"]], ["SQL_STAGE_FAILURE"])
        self.assertEqual(boundary.events[-3:], ["httpA", "afterA", "cleanup"])
        self.assertNotIn("rotate", boundary.events)
        out = boundary.node_out.parent
        self.assertEqual((out / "http-A.stderr.log").read_text(), "D2 original HTTP stderr")
        self.assertIn("D2 original observer stderr", (out / "afterA.log").read_text())

    def test_d2_main_rejects_state_violation_after_actual_result_and_stops_next_phase(self):
        """Break: valid Node output bypasses per-order observer validation in main."""
        boundary = D2Boundary(self.root)
        def mutate(label, value):
            if label == "afterA":
                value["orderFacts"]["F1"]["rowVersion"] = "99"
        boundary.observation_mutation = mutate
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["originalError"]["code"]), (1, "D2_STATE"))
        self.assertNotIn("rotate", boundary.events)
        self.assertTrue(receipt["absenceComplete"])

    def test_d2_main_stops_on_extra_bundle_input_before_any_pair_creation(self):
        """Break: host bundle admits type-only transport or creates Docker before graph approval."""
        boundary = D2Boundary(self.root)
        boundary.extra_bundle = True
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["originalError"]["code"]), (1, "BUNDLE_INPUTS"))
        self.assertEqual(boundary.events, ["bundle"])
        self.assertEqual(boundary.cleanup_transport.calls, [])

    def test_d2_main_checks_added_product_runtime_pin_before_db_and_after_delivery(self):
        """Break: root-approved changed product bytes override D2 pins or final snapshots."""
        boundary = D2Boundary(self.root)
        name = D2_FROZEN[-1]
        changed = b"reapproved but unpinned D2 product"
        boundary.blobs[name] = changed
        boundary.write(self.root, name, changed)
        boundary.web_manifest["frozenFiles"][name] = sha(changed)
        boundary.web_path.write_text(json.dumps(boundary.web_manifest))
        code, receipt = boundary.run()
        self.assertEqual((code, receipt["originalError"]["code"]), (1, "FROZEN_RUNTIME_PIN"))
        self.assertEqual(boundary.events, [])
        self.assertEqual(boundary.db_git.calls, [])
        directory = self.root / "after-delivery"
        directory.mkdir()
        boundary = D2Boundary(directory)
        boundary.after_source_change = True
        code, receipt = boundary.run()
        self.assertEqual(code, 1)
        self.assertEqual(receipt["sourceVerificationError"]["code"], "SOURCE_HASH")
        self.assertTrue(receipt["absenceComplete"])


class ApprovedAHttpTests(TemporarySource):
    def verify(self, value=None):
        return subject.validate_http("A", d2_result() if value is None else value,
            d2_observation(), d2_cases(), phase_set="d2")

    def entry_rows(self, value):
        return [row for row in value["direct"] if row["role"] == "service" and row["rpc"] == D2_RPC["entry"]]

    def test_approved_a_accepts_exact24_direct9_denials_and173_postgrest(self):
        """Break: the old 21/8 contract rejects the approved same-tuple read probe."""
        self.assertEqual(self.verify(), {"postgrestRequests": 173, "setupProxyTaps": 19,
            "measuredProxyTaps": 130, "directRequests": 24})

    def test_service_entry_get_and_post_require_exact200_context_required_literal(self):
        """Break: two matching but wrong service responses pass through parity alone."""
        for method in ("GET", "POST", "both"):
            for mutation in ("status", "version", "outcome", "authority", "reason", "extra", "missing"):
                with self.subTest(method=method, mutation=mutation):
                    value = d2_result()
                    for row in self.entry_rows(value):
                        if method != "both" and row["method"] != method:
                            continue
                        if mutation == "status":
                            row["status"] = 201
                        elif mutation == "missing":
                            row["response"].pop("safe_reason_code")
                        else:
                            key, bad = {"version": ("contract_version", "wrong"), "outcome": ("outcome", "AUTHORIZED"),
                                "authority": ("charge_authority", True), "reason": ("safe_reason_code", "INPUT_INVALID"),
                                "extra": ("extra", False)}[mutation]
                            row["response"][key] = bad
                        row["rawBody"] = json.dumps(row["response"])
                    self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_service_entry_get_post_require_same_valid_five_argument_tuple(self):
        """Break: response parity conceals different actors, contexts, keys or hashes."""
        for method in ("GET", "POST"):
            for field in ("p_actor_user_id", "p_order_id", "p_context_id", "p_create_request_key", "p_binding_hash"):
                value = d2_result()
                row = next(row for row in self.entry_rows(value) if row["method"] == method)
                args = row["query" if method == "GET" else "args"]
                args[field] = "c" * 64 if field == "p_binding_hash" else d2_id("F2")
                self.refuses("D2_HTTP", lambda: self.verify(value))
            for mutation in ("missing", "extra", "malformed", "proxy"):
                value = d2_result()
                row = next(row for row in self.entry_rows(value) if row["method"] == method)
                args = row["query" if method == "GET" else "args"]
                if mutation == "missing":
                    args.pop("p_binding_hash")
                elif mutation == "extra":
                    args["unexpected"] = "value"
                elif mutation == "malformed":
                    args["p_context_id"] = "invalid"
                else:
                    row["proxy"] = True
                self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_anon_authenticated_entry_get_require_non2xx_42501_and_valid_tuple(self):
        """Break: the new GET ACL coverage is omitted, successful or unrelated to entry."""
        for role in ("anon", "authenticated"):
            for mutation in ("missing", "2xx", "code", "tuple"):
                value = d2_result()
                row = next(row for row in value["direct"] if row["role"] == role and row["method"] == "GET")
                if mutation == "missing":
                    value["direct"].remove(row)
                elif mutation == "2xx":
                    row["status"] = 200
                elif mutation == "code":
                    row["response"]["code"] = "P0001"
                    row["rawBody"] = json.dumps(row["response"])
                else:
                    row["query"].pop("p_create_request_key")
                self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_ninth_proxy_entry_get_denial_cannot_be_missing_reordered_or_counted_upstream(self):
        """Break: a blocked proxy GET disappears or is counted as a forwarded request."""
        for mutation in ("old8", "wrong-reason", "extra-upstream"):
            value = d2_result()
            if mutation == "old8":
                value["guard"]["blocked"].pop()
            elif mutation == "wrong-reason":
                value["guard"]["blocked"][-1] = "rpc-query"
            else:
                value["counts"]["postgrest"] = 174
            self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_every_direct_row_requires_status_response_rawbody_and_parseerror_metadata(self):
        """Break: an unrecorded service/ACL failure is accepted as complete evidence."""
        for index in (0, 17, 18, 19, 20, 21, 22, 23):
            for field in ("status", "response", "rawBody", "parseError"):
                value = d2_result()
                value["direct"][index].pop(field)
                self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_direct_status_must_be_real_http_integer_for_acl_and_service(self):
        """Break: strings, booleans or absent HTTP status become ACL refusal evidence."""
        for index in (0, 20, 21, 22, 23):
            for status in (None, True, "200", "403", 0, 99, 600):
                value = d2_result()
                value["direct"][index]["status"] = status
                self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_direct_nonjson_parseerror_and_overflow_never_fall_back_to_response(self):
        """Break: an invented parsed body turns malformed or oversized wire data into success."""
        for index in (0, 20, 21, 22):
            for raw, parse_error in (("not-json", "NON_JSON"), ("not-json", None), ("", None),
                    ("{}", "NON_JSON"), ("{}", "RESPONSE_TOO_LARGE"), ("{}", False),
                    ("x" * 65536, "RESPONSE_TOO_LARGE"), (" " * 65537, None)):
                value = d2_result()
                value["direct"][index].update(rawBody=raw, parseError=parse_error)
                self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_direct_raw_json_must_equal_recorded_parsed_response(self):
        """Break: parser fallback or diagnostic truncation hides a different actual body."""
        for index in (0, 18, 20, 21, 22):
            value = d2_result()
            value["direct"][index]["rawBody"] = "{}"
            self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_direct_rawbody_64kib_bound_is_bytes_and_accepts_exact_boundary(self):
        """Break: a character limit permits more than 64KiB of UTF-8 diagnostics."""
        value = d2_result()
        row = value["direct"][0]
        row["rawBody"] += " " * (65536 - len(row["rawBody"].encode("utf-8")))
        self.assertEqual(self.verify(value)["directRequests"], 24)
        row["rawBody"] += " "
        self.refuses("D2_HTTP", lambda: self.verify(value))
        value = d2_result()
        row = value["direct"][0]
        row["response"]["message"] = "가" * 22000
        row["rawBody"] = json.dumps(row["response"], ensure_ascii=False)
        self.assertLess(len(row["rawBody"]), 65536)
        self.assertGreater(len(row["rawBody"].encode("utf-8")), 65536)
        self.refuses("D2_HTTP", lambda: self.verify(value))

    def test_f5prime_first_unknown_then_exact_unavailable_lookup_is_accepted(self):
        """Break: the old harness insists on SUBMISSION_UNKNOWN for a later recovery GET."""
        self.assertEqual(self.verify()["postgrestRequests"], 173)

    def test_f5prime_wrong_third_result_or_second_capture_is_refused(self):
        """Break: result wildcards or extra provider POSTs weaken the recovery contract."""
        for outcome in ({"kind": "SUBMISSION_UNKNOWN"}, {"kind": "UNAVAILABLE"},
                {"kind": "UNAVAILABLE", "stage": "SUBMIT"}, {"kind": "UNAVAILABLE", "stage": "LOOKUP", "extra": True}):
            value = d2_result()
            next(row for row in value["scenarios"] if row["label"] == "F5prime")["outcomes"][2] = outcome
            self.refuses("D2_HTTP", lambda: self.verify(value))
        value = d2_result()
        row = next(row for row in value["scenarios"] if row["label"] == "F5prime")
        row["fakeCalls"].append(copy.deepcopy(next(call for call in row["fakeCalls"] if call["method"] == "captureOrder")))
        self.refuses("D2_HTTP", lambda: self.verify(value))


class ApprovedACatalogTests(TemporarySource):
    def observe(self, value):
        pair = ScriptedSql([(0, "PROVIDER_RPC_OBSERVATION " + json.dumps(value) + "\nPROVIDER_RPC_OBSERVER_COMPLETE\n", "")])
        return subject.observe(pair, self.root, "baselineA", d2_cases(), b"external-observer", {}, phase_set="d2")

    def test_entry_catalog_accepts_inherent_owner_permission_beside_service_external_execute(self):
        """Break: owner EXECUTE is mistaken for a second external grantee."""
        value = d2_observation()
        self.assertEqual(self.observe(value), value)
        value["entryCatalog"]["executeGrantees"] = ["service_role"]
        self.assertEqual(self.observe(value), value)

    def test_entry_catalog_requires_exact_signature_owner_security_volatile_and_config(self):
        """Break: the observer's aclValid flag masks a changed native function ABI."""
        for field, bad in (("signature", "authorize_web_payment_provider_entry(uuid,uuid)"),
                ("owner", "postgres"), ("securityDefiner", False), ("securityDefiner", 1),
                ("volatility", "s"), ("proconfig", []), ("proconfig", ['search_path=public'])):
            value = d2_observation()
            value["entryCatalog"][field] = bad
            self.refuses("OBSERVER_RESULT", lambda: self.observe(value))
        for field in (*d2_observation()["entryCatalog"], "entryCatalog"):
            value = d2_observation()
            (value if field == "entryCatalog" else value["entryCatalog"]).pop(field)
            self.refuses("OBSERVER_RESULT", lambda: self.observe(value))

    def test_entry_catalog_rejects_public_extra_grantees_and_effective_nonservice_execute(self):
        """Break: inherited nonservice permission survives a service-only direct grant list."""
        for role in ("PUBLIC", "anon", "authenticated", "wallet_test", "wallet_state_owner", "wallet_attestation_owner"):
            value = d2_observation()
            value["entryCatalog"]["executeGrantees"].append(role)
            self.refuses("OBSERVER_RESULT", lambda: self.observe(value))
        for role in ("anon", "authenticated", "wallet_test", "wallet_state_owner", "wallet_attestation_owner"):
            for bad in (True, 0, None):
                value = d2_observation()
                value["entryCatalog"]["effectiveExecute"][role] = bad
                self.refuses("OBSERVER_RESULT", lambda: self.observe(value))
        for field, bad in (("publicExecute", True), ("executeGrantees", ["wallet_command_owner"]),
                ("effectiveExecute", {"service_role": True})):
            value = d2_observation()
            value["entryCatalog"][field] = bad
            self.refuses("OBSERVER_RESULT", lambda: self.observe(value))


class ApprovedAFinalTests(TemporarySource):
    def test_finalizer_rechecks_direct_wire_literal_and_catalog_after_completed_flag(self):
        """Break: a completed phase bypasses revised direct and native evidence checks."""
        for mutation in ("direct", "raw", "literal", "catalog"):
            receipt = d2_receipt()
            rows = receipt["phases"]["A"]["result"]["direct"]
            if mutation == "direct":
                rows.pop()
            elif mutation == "raw":
                rows[20].pop("parseError")
            elif mutation == "literal":
                for row in rows:
                    if row["role"] == "service" and row["rpc"] == D2_RPC["entry"]:
                        row["response"]["safe_reason_code"] = "INPUT_INVALID"
                        row["rawBody"] = json.dumps(row["response"])
            else:
                receipt["observations"]["afterC"]["entryCatalog"]["effectiveExecute"]["anon"] = True
            result, _ = D2FinalTests.finish(self, receipt)
            self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
            self.assertIn("validationError", result)

    def test_finalizer_cannot_promote_no_complete_result_to_success(self):
        """Break: preserved observers or PARTIAL data become a complete result at finalization."""
        receipt = d2_receipt()
        receipt["phases"]["C"] = {"exitCode": 9, "completed": False,
            "stateValidation": {"status": "NOT_RUN", "reason": "NO_COMPLETE_RESULT"}}
        receipt["originalError"] = {"type": "BoundaryError", "code": "PHASE_EXIT", "message": "original"}
        result, _ = D2FinalTests.finish(self, receipt)
        self.assertEqual((result["status"], result["exitCode"]), ("failed", 1))
        self.assertEqual(result["originalError"], receipt["originalError"])
        self.assertNotIn("result", result["phases"]["C"])


class ApprovedAMainTests(TemporarySource):
    def check_incomplete(self, phase, style, label):
        boundary = D2Boundary(self.root)
        boundary.http_output_fault = (phase, style)
        code, receipt = boundary.run(label)
        self.assertEqual((code, receipt["status"], receipt["originalError"]["code"]),
            (1, "failed", "PHASE_EXIT" if style == "partial" else "PHASE_RESULT"))
        self.assertEqual(receipt["observations"]["after" + phase], d2_observation("after" + phase))
        self.assertEqual(receipt["phases"][phase].get("stateValidation"),
            {"status": "NOT_RUN", "reason": "NO_COMPLETE_RESULT"})
        self.assertFalse(receipt["phases"][phase]["completed"])
        self.assertNotIn("result", receipt["phases"][phase])
        self.assertNotIn("secondaryErrors", receipt)
        self.assertNotIn("UnboundLocalError", json.dumps(receipt))
        self.assertEqual(boundary.events[-3:], ["http" + phase, "after" + phase, "cleanup"])
        self.assertTrue(receipt["absenceComplete"])
        self.assertEqual([args for args in boundary.cleanup_transport.calls if args[1] == "rm"],
            [["container", "rm", "--force", "--volumes", cid] for cid in reversed(CID)] + [["network", "rm", NID]])
        return receipt

    def test_partial_a_preserves_successful_after_observer_without_unbound_result(self):
        """Break: parse failure feeds an unassigned result into state validation."""
        receipt = self.check_incomplete("A", "partial", "unit-approved-a-partial-a")
        self.assertEqual(set(receipt["phases"]), {"A"})

    def test_malformed_complete_a_is_not_promoted_despite_successful_after_observer(self):
        """Break: an exit-zero child with malformed RESULT receives state-validation success."""
        self.check_incomplete("A", "malformed", "unit-approved-a-malformed-a")

    def test_partial_b_does_not_reuse_previous_phase_complete_result(self):
        """Break: phase B reuses the last complete phase A result after parsing fails."""
        receipt = self.check_incomplete("B", "partial", "unit-approved-a-partial-b")
        self.assertTrue(receipt["phases"]["A"]["completed"])
        self.assertEqual(set(receipt["phases"]), {"A", "B"})

    def test_malformed_complete_c_does_not_reuse_previous_phase_complete_result(self):
        """Break: phase C passes a stale phase B result to the state validator."""
        receipt = self.check_incomplete("C", "malformed", "unit-approved-a-malformed-c")
        self.assertTrue(receipt["phases"]["A"]["completed"] and receipt["phases"]["B"]["completed"])


if __name__ == "__main__":
    unittest.main()
