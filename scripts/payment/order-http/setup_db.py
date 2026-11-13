"""Install the approved selected-source closure without changing its files."""

import hashlib
import importlib
import importlib.abc
import importlib.util
import json
from contextlib import contextmanager
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True

from pair_fixture import PairFixtureError, PUBLIC_PASSWORD


DB_WORKSPACE = Path("/Users/charlie.hyun/orca/workspaces/picnic-supabase/web-payment-contract")
DB_HEAD = "5a84abd97248c633290befb2357e4752a10c8aff"
MIGRATIONS = [
    "20261111224520_web_payment_order_contract.sql", "20261112071844_web_payment_charge_lease.sql",
    "20261112081856_web_payment_provider_observation.sql", "20261112094913_web_payment_purchase_intake.sql",
    "20261112113100_web_payment_verification_binding.sql", "20261112124327_web_payment_verification_result.sql",
    "20261112145247_web_payment_settlement.sql",
]
FINANCIAL_RELATIONS = [
    "receipts", "star_candy_history", "star_candy_bonus_history",
    "wallet_financial_operations", "wallet_credit_operations", "wallet_credit_allocations",
    "wallet_debit_operations", "wallet_debit_allocations", "wallet_debit_bucket_allocations", "wallet_repair_operations",
    "wallet_recovery_debts", "wallet_recovery_debt_events", "wallet_provider_event_inbox",
    "wallet_provider_verification_attestations", "purchase_reward_snapshots", "purchase_reward_allocations",
    "purchase_promotion_resolutions", "purchase_promotion_resolution_events", "purchase_promotion_awards",
    "purchase_promotion_resolution_inputs", "wallet_promotion_time_attestations", "purchase_refund_events", "purchase_refund_allocations",
    "cotton_candy_grants", "cotton_candy_ledger", "wallet_star_lots", "wallet_star_spend_allocations",
    "wallet_star_lot_retirements", "wallet_star_lot_applications", "wallet_star_lot_violations", "wallet_bonus_projection_violations",
]


class VerifiedHelperLoader(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    """Compile exactly the manifest-verified bytes; never consult a pyc."""

    def __init__(self, root, manifest):
        self.sources = {}
        root = Path(root).resolve(strict=True)
        for relative, row in manifest["files"].items():
            path = Path(relative)
            if path.parent != Path("scripts/wallet") or path.suffix != ".py" or not path.stem.isidentifier():
                continue
            source = (root / path).resolve(strict=True)
            if not source.is_relative_to(root):
                raise PairFixtureError("DB helper escaped the source closure")
            data = source.read_bytes()
            if hashlib.sha256(data).hexdigest() != row["sha256"]:
                raise PairFixtureError("DB helper source hash differs: " + relative)
            self.sources[path.stem] = (source, data)

    def find_spec(self, fullname, path=None, target=None):
        if fullname in self.sources:
            return importlib.util.spec_from_loader(fullname, self, origin=str(self.sources[fullname][0]))
        if fullname.startswith("web_payment_"):
            raise PairFixtureError("DB Python helper is outside the verified manifest: " + fullname)
        return None

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        path, data = self.sources[module.__name__]
        module.__file__ = str(path)
        module.__cached__ = None
        exec(compile(data, str(path), "exec"), module.__dict__)


@contextmanager
def verified_helpers(root, manifest):
    sys.dont_write_bytecode = True
    loader = VerifiedHelperLoader(root, manifest)
    # Cached modules must not bypass verification either. Restore the host's
    # prior module bindings after this narrowly scoped fixture operation.
    previous = {name: sys.modules.pop(name) for name in loader.sources if name in sys.modules}
    sys.meta_path.insert(0, loader)
    try:
        yield loader
    finally:
        sys.meta_path.remove(loader)
        for name in loader.sources:
            sys.modules.pop(name, None)
        sys.modules.update(previous)


def source_hashes(root, manifest):
    return {relative: hashlib.sha256((root / relative).read_bytes()).hexdigest() for relative in manifest["files"]}


def verify_source(root, manifest_path):
    root = Path(root).resolve(strict=True)
    if root != DB_WORKSPACE:
        raise PairFixtureError("Only the approved explicit DB workspace is allowed")
    manifest = json.loads(Path(manifest_path).read_text())
    if manifest["root"] != str(root) or manifest["sourceCommit"] != DB_HEAD:
        raise PairFixtureError("DB source manifest identity differs")
    result = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True,
                            timeout=30, env={"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin",
                                             "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"})
    if result.returncode or result.stdout.strip() != DB_HEAD:
        raise PairFixtureError("DB HEAD differs from the frozen source")
    for relative in manifest["files"]:
        path = root / relative
        if Path(relative).is_absolute() or ".." in Path(relative).parts or not path.resolve(strict=True).is_relative_to(root):
            raise PairFixtureError("Invalid source closure path")
    before = source_hashes(root, manifest)
    if any(before[path] != row["sha256"] for path, row in manifest["files"].items()):
        raise PairFixtureError("DB source hash differs from the approved source")
    return root, manifest, before


def setup(pair, root, manifest, out, *, mode):
    with verified_helpers(root, manifest):
        order = importlib.import_module("web_payment_order_fixture")
        settlement = importlib.import_module("web_payment_settlement_fixture")
        return _setup(pair, root, manifest, out, mode=mode, order=order, settlement=settlement)


def _setup(pair, root, manifest, out, *, mode, order, settlement):
    definitions, selected = settlement.settlement_dependencies()
    dependency_hash = hashlib.sha256(definitions.encode()).hexdigest()
    if dependency_hash != manifest["dependencySqlSha256"]:
        raise PairFixtureError("Original settlement dependency SQL hash differs")
    if len(selected) != 48 or any(str(path.relative_to(root)) not in manifest["files"] for path in selected):
        raise PairFixtureError("Unexpected original selected-source closure")
    evidence = {"mode": mode, "dependencySqlSha256": dependency_hash,
                "selectedSources": [str(path.relative_to(root)) for path in selected], "appliedMigrations": [],
                "engineControlCompleted": False}

    def install(stage, sql, *, user="fixture_admin"):
        result = pair.sql(sql, user=user, check=False)
        (out / (stage + ".log")).write_text(result.stdout + result.stderr)
        evidence["lastStage"] = stage
        evidence["lastExitCode"] = result.returncode
        (out / "db-setup.json").write_text(json.dumps(evidence, indent=2) + "\n")
        if result.returncode:
            raise PairFixtureError("Original fixture setup failed at " + stage)
        return result

    install("bootstrap", order.BOOTSTRAP.read_text())
    install("dependencies", definitions)
    control = root / "scripts/wallet/fixtures/web-payment-settlement-engine-control.sql"
    result = install("positive-engine-control", control.read_text(), user="postgres")
    if result.stdout.splitlines()[-1:] != ["positive-refund-control-complete"]:
        raise PairFixtureError("Original positive app/debit/refund control did not complete")
    evidence["engineControlCompleted"] = True
    for name in MIGRATIONS if mode == "current7" else MIGRATIONS[:1]:
        install(name, (root / "supabase/migrations" / name).read_text(), user="postgres")
        evidence["appliedMigrations"].append(name)
    install("synthetic-authenticator", "create role authenticator login noinherit nosuperuser nobypassrls password '" + PUBLIC_PASSWORD
            + "'; grant anon,authenticated,service_role to authenticator; grant connect on database fixture to authenticator;")
    install("seed", (Path(__file__).parent / "seed.sql").read_text())
    # The source engine controls rolled back. Record the real selected-source
    # financial/history catalog before HTTP, without creating missing tables.
    rows = " union all ".join("select 'public." + name + "'::text as relation, count(*) as rows from public." + name
                              for name in FINANCIAL_RELATIONS)
    baseline = install("financial-baseline", "select jsonb_build_object('financialBaseline',jsonb_object_agg(relation,rows)) from (" + rows + ") counts;")
    evidence["financialBaseline"] = json.loads(baseline.stdout.strip())["financialBaseline"]
    if any(value != 0 for value in evidence["financialBaseline"].values()):
        raise PairFixtureError("Source control rollback left nonempty financial/history relations")
    (out / "db-setup.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence
