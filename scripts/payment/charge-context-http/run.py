"""Coordinator-run, pinned-source charge-context HTTP fixture.

Runs only the disposable fixture through the frozen factory. Credentials are
synthetic; whole-OS and full dependency-tree integrity are outside this unit.
"""

import sys

from contextlib import contextmanager
from contextlib import ExitStack
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import importlib.abc
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import shutil
import signal
import subprocess
import traceback
import uuid


ROOT = Path(__file__).absolute().parents[3]
REUSE = {
    "pair_fixture": "scripts/payment/order-http/pair_fixture.py",
    "setup_db": "scripts/payment/order-http/setup_db.py",
    "order_http_run": "scripts/payment/order-http/run.py",
}
FROZEN = frozenset((
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
))
OWNED = frozenset((
    "scripts/payment/charge-context-http/run.py", "scripts/payment/charge-context-http/test_run.py",
    "scripts/payment/charge-context-http/guard.cjs", "scripts/payment/charge-context-http/bundle.mjs",
    "scripts/payment/charge-context-http/seed.sql", "scripts/payment/charge-context-http/privileged.sql",
    "scripts/payment/charge-context-http/stop.sql", "scripts/payment/charge-context-http/observer.sql",
    "__tests__/integration/payment/charge-context-postgrest.http.ts",
))
INSTALLED = frozenset((
    "node_modules/@supabase/supabase-js/package.json",
    "node_modules/@supabase/supabase-js/dist/index.cjs",
    "node_modules/@supabase/postgrest-js/package.json",
    "node_modules/@supabase/postgrest-js/dist/index.cjs",
))
ARTIFACTS = frozenset(("charge-context-http.cjs", "guard.cjs", "config.json"))
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
FULL_HEAD = re.compile(r"[0-9a-f]{40}\Z")
DB_ROOT = Path('/Users/charlie.hyun/orca/workspaces/picnic-supabase/web-payment-contract')
DB_HEAD = 'e0ba366ba3b02e151b9fb2ab8e3a272af72d2ae5'
DB_MANIFEST_PIN = '34c338874cdfd0590838671686747ba178f8c0ac882e0583a3e916dd40cd98a5'
DEPENDENCY_PIN = 'f6791fffdeaba348bf1e15dcd72460113ed0a8b64748c8eb290bae4cc3f78a2c'
ENV = {'PATH': '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin', 'NODE_ENV': 'test',
       'PYTHONDONTWRITEBYTECODE': '1', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
ACTORS = {'A': 'c755aa01-0000-4000-8000-000000000001', 'B': 'c755aa01-0000-4000-8000-000000000002',
          'C': 'c755aa01-0000-4000-8000-000000000003'}
MIGRATIONS = ('20261111224520_web_payment_order_contract.sql', '20261112071844_web_payment_charge_lease.sql',
              '20261112081856_web_payment_provider_observation.sql', '20261112094913_web_payment_purchase_intake.sql',
              '20261112113100_web_payment_verification_binding.sql', '20261112124327_web_payment_verification_result.sql',
              '20261112145247_web_payment_settlement.sql', '20261114015304_web_payment_charge_gate.sql')
REUSE_PINS = {
    'scripts/payment/order-http/pair_fixture.py': 'a194d142b57a199efa27f33ef78f9aa5ac2886f772d73defdef5848d6ee92a16',
    'scripts/payment/order-http/setup_db.py': '3bff4c99679e446c8d00486b6bc1dcc8be7326d449a6a100a02889cfe37dfac6',
    'scripts/payment/order-http/run.py': '809fde33a906d59df1ebda4313d8ec928e9e99465ed2004f2dbf667ff703c9eb',
}
INSTALLED_PINS = {
    'node_modules/@supabase/supabase-js/package.json': 'd01ad122a3ed6005916169c36653c1727f2f95eaaad6968bc5ff9132524e65e1',
    'node_modules/@supabase/postgrest-js/package.json': '74b9ee26d761f25cc9c8c68114ec6e7a2ac4ebee31f5d6ed3c48cd5450ae6aba',
    'node_modules/@supabase/postgrest-js/dist/index.cjs': 'd457ad36136e6c47328fb948aff16bc74058885d07e7a2a61b2adb9d600a4dd0',
    'node_modules/@supabase/supabase-js/dist/index.cjs': 'ac25661172121ba59f741abe0262cfedc533613c3b175963df71c57e14f49e20',
}
FROZEN_PINS = {
    **REUSE_PINS,
    '__tests__/api/payment/orders.test.ts': '4eb2d71e99c3d28ade23f95b5b8aa34f687b74dc56a85b8906c2b169123fd9ab',
    '__tests__/integration/payment/orders-postgrest.http.ts': 'd8c4a73ad1ec78940f39110930d23d5140cb000373a54cf81a8929389240e9c4',
    '__tests__/lib/payment/server-order-repository.test.ts': 'edb77d01479d94d97fffd4aa75218deef12c23f68a1bfb89cf7a83f699e6fc3b',
    '__tests__/lib/payment/server-order.test.ts': 'a9e351ea7d5eea49de6c8e49085ed00233dedc7af8629dec86c263c5f8088dcd',
    'app/api/payment/orders/route.ts': 'c89f765cbfcd9a9e31d264759a4b0e8504dbd741df9038bc65e5b9abca425aa8',
    'lib/payment/server-order-repository.ts': 'bb58bd4c2fda2c94739813ff197e4a03aa3bad9cab3ec4f863aa86b5fbdf6a55',
    'lib/payment/server-order.ts': '426c03761cbc55171bbe1f10a71afbd794d41ed8614c60772ad2bb0e9ba0c243',
    'scripts/payment/order-http/assert.sql': 'efe52c11cff709fc9887941eb8d6cff94a034712407a9fbb49f212c3e1f30e93',
    'scripts/payment/order-http/auth-fixture.ts': '0f37cedb698bf46a1d0392ed751f1e5c72e8e52d80e6341ee85b76250f027e7c',
    'scripts/payment/order-http/bundle.mjs': '289307c43d053b079ed62e535a821b99d22f151311077da04437267172501ff5',
    'scripts/payment/order-http/network-guard.cjs': '874dafb86bd35c606a653b2cfd0357dad63f7ca3807f9bc346fd7f198fb9e9ba',
    'scripts/payment/order-http/seed.sql': '410f578464a5f8c1eae3608cd4666d7df534a542f6d9d8f1e311a99c5daeb02b',
    'scripts/payment/order-http/test_pair_fixture.py': 'ed1cf51569a8eed6c93cf03f69d95a1e76634841e1f325942ad8db2e7085cb58',
    'types/supabase.ts': '47324482d1e121e9c8ffc79368b77635d7411c33f9460ac6586710f76d759971',
    'utils/log-event-codes.ts': 'e1aca50d36554526ae590e01597d6119ff669cd2d88434e75e7daa45a77210b3',
}


class BoundaryError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _require(condition, code, message):
    if not condition:
        raise BoundaryError(code, message)


def _digest(data):
    return hashlib.sha256(data).hexdigest()


def _relative(relative):
    _require(isinstance(relative, str) and relative and "\\" not in relative
             and not Path(relative).is_absolute()
             and all(part not in ("", ".", "..") for part in relative.split("/")),
             "SOURCE_PATH", "Source paths must be canonical relative paths")
    return relative


def _root(root):
    root = Path(root).absolute()
    _require(not root.is_symlink() and root.is_dir(), "SOURCE_PATH", "Invalid source root")
    return root


def _file(root, relative):
    path = root
    for part in _relative(relative).split("/"):
        path = path / part
        _require(not path.is_symlink(), "SOURCE_PATH", "Source symlink is forbidden: " + relative)
    try:
        regular = stat.S_ISREG(path.stat().st_mode)
    except OSError as exc:
        raise BoundaryError("SOURCE_PATH", "Source is unavailable: " + relative) from exc
    _require(regular, "SOURCE_PATH", "Source must be a regular file: " + relative)
    return path


def _pin(value):
    return isinstance(value, str) and SHA256.fullmatch(value) is not None


class VerifiedReuseLoader(importlib.abc.Loader):
    """Execute one verified byte snapshot; never consult SourceFileLoader/pyc."""

    def __init__(self, path, data):
        self.path = str(path)
        self.data = data

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        module.__file__ = self.path
        module.__cached__ = None
        exec(compile(self.data, self.path, "exec"), module.__dict__)
        _require(module.__loader__ is self and module.__spec__.loader is self
                 and module.__spec__.origin == self.path and module.__file__ == self.path
                 and module.__cached__ is None, "LOADER_IDENTITY", "Reused module changed loader identity")


@contextmanager
def verified_reuse(root, pins):
    sys.dont_write_bytecode = True
    root = _root(root)
    _require(isinstance(pins, dict) and set(pins) == set(REUSE.values()),
             "REUSE_SET", "Exactly the approved three reuse sources are required")
    _require(not any(name in sys.modules for name in REUSE),
             "MODULE_PREBOUND", "A reused module already has a sys.modules binding")
    sources = {}
    # Verify every file before executing even the first helper.
    for name, relative in REUSE.items():
        path = _file(root, relative)
        data = path.read_bytes()
        _require(_pin(pins[relative]) and _digest(data) == pins[relative],
                 "SOURCE_HASH", "Reused source hash differs: " + relative)
        sources[name] = (path, data)
    modules = {}
    try:
        for name in REUSE:
            _require(name not in sys.modules, "MODULE_PREBOUND", "Reuse import installed an unexpected binding")
            path, data = sources[name]
            loader = VerifiedReuseLoader(path, data)
            spec = importlib.util.spec_from_loader(name, loader, origin=str(path))
            module = importlib.util.module_from_spec(spec)
            modules[name] = module
            sys.modules[name] = module
            loader.exec_module(module)
        yield modules
    finally:
        for name, module in reversed(list(modules.items())):
            if sys.modules.get(name) is module:
                del sys.modules[name]


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result, "MANIFEST_DUPLICATE", "Duplicate JSON key: " + key)
        result[key] = value
    return result


def _json(data, code):
    try:
        return json.loads(data, object_pairs_hook=_unique_object)
    except BoundaryError:
        raise
    except (ValueError, TypeError, UnicodeError) as exc:
        raise BoundaryError(code, "Invalid JSON payload") from exc


def _text(output):
    return output.decode("utf-8", errors="strict") if isinstance(output, bytes) else output


def verify_web(root, manifest_path, manifest_sha256, web_head, *, git):
    root = _root(root)
    _require(isinstance(web_head, str) and FULL_HEAD.fullmatch(web_head),
             "WEB_HEAD", "An explicit full 40-character web HEAD is required")
    manifest_path = Path(manifest_path).absolute()
    try:
        manifest_relative = str(manifest_path.relative_to(root))
    except ValueError as exc:
        raise BoundaryError("SOURCE_PATH", "Web manifest must be inside the explicit web root") from exc
    manifest_path = _file(root, manifest_relative)
    raw = manifest_path.read_bytes()
    _require(_pin(manifest_sha256) and _digest(raw) == manifest_sha256,
             "MANIFEST_HASH", "Web manifest differs from the coordinator approval pin")
    manifest = _json(raw, "MANIFEST_JSON")
    _require(isinstance(manifest, dict) and set(manifest) == {"webHead", "frozenFiles", "ownedFiles", "installedFiles"},
             "MANIFEST_SET", "Unexpected web manifest fields")
    _require(manifest["webHead"] == web_head, "WEB_HEAD", "Manifest web HEAD differs")
    categories = (("frozenFiles", FROZEN), ("ownedFiles", OWNED), ("installedFiles", INSTALLED))
    for category, expected in categories:
        rows = manifest[category]
        _require(isinstance(rows, dict), "MANIFEST_SET", "Manifest source categories must be objects")
        for relative in rows:
            _relative(relative)
        _require(set(rows) == expected, "MANIFEST_SET", "Manifest source set differs: " + category)
        _require(all(_pin(value) for value in rows.values()), "SOURCE_HASH", "Malformed source hash")
    source_hashes = {}
    for category, _expected in categories:
        for relative, wanted in manifest[category].items():
            actual = _digest(_file(root, relative).read_bytes())
            _require(actual == wanted, "SOURCE_HASH", "Web source hash differs: " + relative)
            source_hashes[relative] = actual

    def command(args, *, binary=False):
        return git(["git", "-C", str(root), *args], capture_output=True,
                   text=not binary, timeout=30)

    head = command(["rev-parse", "HEAD"])
    _require(head.returncode == 0 and _text(head.stdout).strip() == web_head,
             "WEB_HEAD", "Actual web HEAD differs from the explicit pin")
    owned_state = {}
    frozen_state = {}
    for relative in sorted(FROZEN | OWNED):
        tracked_result = command(["ls-files", "--error-unmatch", "--", relative])
        # ls-files exit 1 means no tracked match. Other failures are not untracked evidence.
        _require(tracked_result.returncode in (0, 1), "GIT_STATUS", "Git tracking query failed")
        tracked = tracked_result.returncode == 0
        status = command(["status", "--porcelain=v1", "--untracked-files=all", "--", relative])
        _require(status.returncode == 0, "GIT_STATUS", "Git status query failed")
        status_text = _text(status.stdout)
        status_rows = status_text.splitlines()
        _require(not status_rows or (len(status_rows) == 1 and len(status_rows[0]) >= 4
                 and status_rows[0][2] == " " and status_rows[0][3:] == relative
                 and all(char in " MADRCUT?!" for char in status_rows[0][:2])),
                 "GIT_STATUS", "Unexpected path-scoped Git status output")
        _require(tracked or (status_rows and status_rows[0][:2] == "??"),
                 "FROZEN_TRACKING" if relative in FROZEN else "GIT_STATUS",
                 "Untracked source lacks matching Git status evidence")
        dirty = bool(status_rows)
        state = {"tracked": tracked, "dirty": dirty}
        if relative in FROZEN:
            _require(tracked, "FROZEN_TRACKING", "Frozen source is not tracked: " + relative)
            _require(not dirty, "FROZEN_DIRTY", "Frozen source has a Git change: " + relative)
            blob = command(["show", "HEAD:" + relative], binary=True)
            _require(blob.returncode == 0 and isinstance(blob.stdout, bytes)
                     and _digest(blob.stdout) == source_hashes[relative],
                     "FROZEN_HEAD_BLOB", "Frozen source differs from its HEAD blob: " + relative)
            frozen_state[relative] = state
        else:
            owned_state[relative] = state
    _require(manifest_path.read_bytes() == raw, "MANIFEST_HASH", "Web manifest changed during verification")
    return {"webHead": web_head, "manifestPath": str(manifest_path), "manifestSha256": manifest_sha256,
            "sourcePaths": sorted(source_hashes), "sources": source_hashes,
            "ownedState": owned_state, "frozenState": frozen_state}


def parse_phase(phase, child, config):
    markers = config.get("completionMarkers") if isinstance(config, dict) else None
    _require(phase in ("A", "B") and isinstance(markers, dict) and set(markers) == {"A", "B"}
             and all(isinstance(value, str) and value and "\n" not in value and "\r" not in value for value in markers.values())
             and markers["A"] != markers["B"], "PHASE_CONFIG", "Invalid immutable phase-marker configuration")
    _require(child.returncode == 0, "PHASE_EXIT", "HTTP child exited unsuccessfully")
    _require(isinstance(child.stdout, str), "PHASE_RESULT", "HTTP child stdout is not text")
    lines = child.stdout.splitlines()
    _require(lines.count(markers[phase]) == 1 and markers["B" if phase == "A" else "A"] not in lines,
             "PHASE_MARKER", "HTTP child did not emit its unique phase completion marker")
    prefix = "CHARGE_CONTEXT_HTTP_RESULT "
    rows = [line[len(prefix):] for line in lines if line.startswith(prefix)]
    _require(len(rows) == 1 and not any(line.startswith("CHARGE_CONTEXT_HTTP_PARTIAL_RESULT ") for line in lines),
             "PHASE_RESULT", "HTTP child emitted missing, duplicate or partial results")
    try:
        result = _json(rows[0], "PHASE_RESULT")
    except BoundaryError as exc:
        raise BoundaryError("PHASE_RESULT", "HTTP child result JSON is invalid") from exc
    _require(isinstance(result, dict) and result.get("phase") == phase and isinstance(result.get("taps"), list),
             "PHASE_RESULT", "HTTP child result phase/shape differs")
    return result


def _error(exc):
    return {"type": type(exc).__name__, "message": str(exc)}


def _hash_snapshot(rows, *, exact=None):
    return (isinstance(rows, dict) and bool(rows) and (exact is None or set(rows) == exact)
            and all(isinstance(key, str) and _pin(value) for key, value in rows.items()))


def finalize_receipt(receipt, *, cleanup, snapshot):
    # The factory remains the authority for identity checks and removal. This
    # consumer can only require its exact per-ID absence evidence, never infer it.
    cleanup_error = None
    try:
        absence = cleanup()
    except BaseException as exc:
        cleanup_error = _error(exc)
        absence = None
    # Cleanup also captures factory metadata. Copy after that attempt so a
    # metadata error cannot disappear from the final failure decision.
    result = copy.deepcopy(receipt)
    result.update(status="failed", exitCode=1, absence=absence)
    if cleanup_error is not None:
        result["cleanupError"] = cleanup_error
    try:
        after = snapshot()
        result["sourcesAfter"] = after["sources"]
        result["artifactHashesAfter"] = after["artifacts"]
        if 'cache' in after:
            result['cacheAfter'] = after['cache']
        before_sources = result.get("sourcesBefore")
        before_artifacts = result.get("artifactHashesBefore")
        result["sourcesUnchanged"] = (_hash_snapshot(before_sources)
                                       and before_sources == result["sourcesAfter"])
        result["artifactsUnchanged"] = (_hash_snapshot(before_artifacts, exact=ARTIFACTS)
                                         and before_artifacts == result["artifactHashesAfter"])
    except BaseException as exc:
        result["sourceVerificationError"] = _error(exc)
        result["sourcesUnchanged"] = False
        result["artifactsUnchanged"] = False
    ids = result.get("ownedContainerIds")
    absence = result.get("absence")
    absence_valid = (isinstance(ids, list) and len(ids) == 3 and all(_pin(cid) for cid in ids)
                     and len(set(ids)) == 3
                     and isinstance(absence, dict) and set(absence) == {"containers", "network"}
                     and absence["network"] is True and isinstance(absence["containers"], dict)
                     and set(absence["containers"]) == set(ids)
                     and all(value is True for value in absence["containers"].values()))
    result["absenceComplete"] = absence_valid
    phases = result.get("phases")
    phases_valid = (isinstance(phases, dict) and set(phases) == {"A", "B"}
                    and all(isinstance(row, dict) and row.get("completed") is True
                            and type(row.get("exitCode")) is int and row["exitCode"] == 0 for row in phases.values()))
    observations = result.get("observations")
    observations_valid = (isinstance(observations, dict)
                          and set(observations) == {"baselineA", "afterA", "baselineB", "afterB"}
                          and all(isinstance(row, dict) and isinstance(row.get("digest"), str) and row["digest"]
                                  and all(row.get(key) is True for key in ("financialZero", "fullZero", "aclValid"))
                                  for row in observations.values()))
    if observations_valid:
        observations_valid = (observations["baselineA"]["digest"] == observations["afterA"]["digest"]
                              and observations["baselineB"]["digest"] == observations["afterB"]["digest"]
                              and all(isinstance(row.get('native'), dict) and row['native'] for row in observations.values())
                              and observations['baselineA']['native'] == observations['afterA']['native']
                              and observations['baselineB']['native'] == observations['afterB']['native'])
    if (absence_valid and phases_valid and observations_valid
            and result.get("unknownCreation") == [] and result.get("stopChangesAllowed") is True
            and "originalError" in result and result["originalError"] is None
            and "cleanupError" not in result and "sourceVerificationError" not in result and 'metadataError' not in result
            and result.get("sourcesUnchanged") is True and result.get("artifactsUnchanged") is True):
        result.update(status="passed", exitCode=0)
    return result


def _command(argv, **kwargs):
    return subprocess.run(argv, env=ENV, **kwargs)


def _db_sources(root, manifest):
    result = {}
    for relative, row in manifest['files'].items():
        value = _digest(_file(root, relative).read_bytes())
        _require(isinstance(row, dict) and set(row) == {'sha256'} and value == row['sha256'],
                 'DB_SOURCE_HASH', 'DB source hash differs: ' + relative)
        result[relative] = value
    return result


def _validate_db_manifest(manifest):
    _require(isinstance(manifest, dict) and set(manifest) == {'root', 'sourceCommit', 'dependencySqlSha256', 'files'}
             and manifest['root'] == str(DB_ROOT) and manifest['sourceCommit'] == DB_HEAD
             and manifest['dependencySqlSha256'] == DEPENDENCY_PIN
             and isinstance(manifest['files'], dict) and len(manifest['files']) == 93,
             'DB_MANIFEST_IDENTITY', 'DB manifest identity/93-source closure differs')
    for relative, row in manifest['files'].items():
        _relative(relative)
        _require(isinstance(row, dict) and set(row) == {'sha256'} and _pin(row['sha256']),
                 'DB_MANIFEST_IDENTITY', 'DB manifest source pin differs')


def _read_pinned(root, relative, pins):
    _relative(relative)
    _require(isinstance(pins, dict) and _pin(pins.get(relative)), 'SOURCE_HASH', 'Execution source lacks an approval pin')
    data = _file(_root(root), relative).read_bytes()
    _require(_digest(data) == pins[relative], 'SOURCE_HASH', 'Execution source hash differs: ' + relative)
    return data


def _execution_bytes(root, relative, pins, evidence, scope):
    data = _read_pinned(root, relative, pins)
    evidence.setdefault('executionInputs', {})[scope + ':' + relative] = {
        'approvedSha256': pins[relative], 'deliverySha256': _digest(data), 'sizeBytes': len(data)}
    return data


def _runtime_flags(flags):
    _require(flags.isolated == 1 and flags.dont_write_bytecode == 1,
             'INTERPRETER_FLAGS', 'Launch the coordinator runner with actual -I -B interpreter flags')
    observed = hasattr(flags, 'safe_path')
    safe_path = flags.safe_path if observed else None
    _require(not observed or safe_path is True, 'INTERPRETER_FLAGS', 'Observed safe_path must be enabled')
    return {'isolated': flags.isolated, 'dontWriteBytecode': flags.dont_write_bytecode,
            'safePath': safe_path, 'safePathObserved': observed,
            'compatibilityLimit': None if observed else 'safe_path unavailable on this interpreter; not measured'}


def _cleanup_pair(pair, receipt, *, signals=signal):
    previous = signals.getsignal(signals.SIGTERM)
    signals.signal(signals.SIGTERM, signals.SIG_IGN)
    try:
        try:
            receipt.update(ownedContainerIds=[row['container_id'] for row in pair.containers],
                           unknownCreation=pair.ledger.unknown, uncertainPhase=pair.uncertain_phase,
                           runId=pair.run_id, imageIds=pair.images, network=pair.network,
                           containers=pair.containers, actualServerVersion=getattr(pair, 'version', None))
        except BaseException as exc:
            receipt['metadataError'] = _error(exc)
        # Identity verification and removal remain exclusively in the factory.
        pair.close()
        return pair.cleanup.absence if pair.cleanup is not None else None
    finally:
        signals.signal(signals.SIGTERM, previous)


def _verify_db(root, manifest_path, approved_hash):
    root = _root(root)
    _require(root == DB_ROOT, 'DB_ROOT', 'Only the approved DB source workspace is permitted')
    manifest_path = Path(manifest_path).absolute()
    try:
        relative = str(manifest_path.relative_to(ROOT))
    except ValueError as exc:
        raise BoundaryError('SOURCE_PATH', 'DB manifest must be inside the explicit web root') from exc
    raw = _file(_root(ROOT), relative).read_bytes()
    _require(approved_hash == DB_MANIFEST_PIN and _digest(raw) == approved_hash,
             'DB_MANIFEST_HASH', 'DB manifest differs from the fixed 93-source approval pin')
    manifest = _json(raw, 'DB_MANIFEST_JSON')
    _validate_db_manifest(manifest)
    head = _command(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True, capture_output=True, timeout=30)
    _require(head.returncode == 0 and head.stdout.strip() == DB_HEAD, 'DB_HEAD', 'Actual DB HEAD differs')
    sources = _db_sources(root, manifest)
    for relative in sources:
        tracked = _command(['git', '-C', str(root), 'ls-files', '--error-unmatch', '--', relative],
                           text=True, capture_output=True, timeout=30)
        status = _command(['git', '-C', str(root), 'status', '--porcelain=v1', '--untracked-files=all', '--', relative],
                          text=True, capture_output=True, timeout=30)
        blob = _command(['git', '-C', str(root), 'show', 'HEAD:' + relative], capture_output=True, timeout=30)
        _require(tracked.returncode == 0 and status.returncode == 0 and not status.stdout.strip()
                 and blob.returncode == 0 and _digest(blob.stdout) == sources[relative],
                 'DB_GIT_SOURCE', 'DB source is not a clean tracked HEAD blob: ' + relative)
    return root, manifest, sources


def _cache_state(directory):
    return {str(path): _digest(path.read_bytes()) for path in sorted(directory.glob('__pycache__/*.pyc')) if path.is_file()}


def _artifacts(directory):
    return {name: _digest((directory / name).read_bytes()) if (directory / name).is_file() else None for name in sorted(ARTIFACTS)}


def _sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def _install(pair, out, stage, sql, *, user, marker=None, evidence=None, source='generated'):
    if isinstance(sql, bytes):
        sql = sql.decode('utf-8', errors='strict')
    if evidence is not None:
        source_input = evidence.get('executionInputs', {}).get(source, {})
        evidence.setdefault('sqlDelivery', {})[stage] = {
            'source': source, 'sourceSha256': source_input.get('deliverySha256'),
            'approvedSourceSha256': source_input.get('approvedSha256'),
            'deliveredSha256': _digest(sql.encode('utf-8')), 'user': user}
    result = pair.sql(sql, user=user, check=False)
    (out / (stage + '.log')).write_text(result.stdout + result.stderr)
    _require(result.returncode == 0, 'SQL_STAGE_FAILURE', 'SQL stage failed: ' + stage + '; user=' + user)
    if marker:
        _require(result.stdout.splitlines()[-1:] == [marker], 'SQL_STAGE_MARKER', 'SQL stage marker missing: ' + stage)
    return result


def _setup_current8(pair, modules, db_root, manifest, here, out, web_pins, evidence):
    helper = modules['setup_db']
    db_pins = {path: row['sha256'] for path, row in manifest['files'].items()}

    def db_install(stage, relative, *, user, marker=None):
        data = _execution_bytes(db_root, relative, db_pins, evidence, 'db')
        return _install(pair, out, stage, data, user=user, marker=marker,
                        evidence=evidence, source='db:' + relative)

    def owned_install(stage, *, marker):
        relative = 'scripts/payment/charge-context-http/' + stage + '.sql'
        data = _execution_bytes(ROOT, relative, web_pins, evidence, 'web')
        return _install(pair, out, stage, data, user='postgres', marker=marker,
                        evidence=evidence, source='web:' + relative)

    with helper.verified_helpers(db_root, manifest):
        order = __import__('web_payment_order_fixture')
        settlement = __import__('web_payment_settlement_fixture')
        definitions, selected = settlement.settlement_dependencies()
        _require(_digest(definitions.encode()) == DEPENDENCY_PIN and len(selected) == 48
                 and all(str(path.relative_to(db_root)) in manifest['files'] for path in selected),
                 'DB_DEPENDENCIES', 'Original selected 48 dependencies differ')
        _require(order.BOOTSTRAP == db_root / 'scripts/wallet/fixtures/web-payment-orders-bootstrap.sql',
                 'DB_DEPENDENCIES', 'Original bootstrap path differs')
        db_install('bootstrap', 'scripts/wallet/fixtures/web-payment-orders-bootstrap.sql', user='fixture_admin')
        _install(pair, out, 'dependencies', definitions, user='fixture_admin', evidence=evidence,
                 source='generated:selected48:' + DEPENDENCY_PIN)
    db_install('positive-engine-control', 'scripts/wallet/fixtures/web-payment-settlement-engine-control.sql',
               user='postgres', marker='positive-refund-control-complete')
    for name in MIGRATIONS:
        db_install(name, 'supabase/migrations/' + name, user='postgres')
    password = modules['pair_fixture'].PUBLIC_PASSWORD
    _install(pair, out, 'authenticator',
             "create role authenticator login noinherit nosuperuser nobypassrls password " + _sql_literal(password)
             + '; grant anon,authenticated,service_role to authenticator; grant connect on database fixture to authenticator;',
             user='fixture_admin', evidence=evidence)
    seed = owned_install('seed', marker='CHARGE_CONTEXT_SEED_COMPLETE')
    privileged = owned_install('privileged', marker='CHARGE_CONTEXT_PRIVILEGED_COMPLETE')
    cases = []
    for result in (seed, privileged):
        for line in result.stdout.splitlines():
            if line.startswith('{'):
                row = _json(line, 'FIXTURE_JSON')
                _require(isinstance(row, dict) and set(row) == {'label', 'actor', 'order'}, 'FIXTURE_JSON', 'Unexpected fixture metadata')
                cases.append(row)
    _require({row['label'] for row in cases} == {'F' + str(i) for i in range(1, 12)} | {'H1', 'H2'}
             and len(cases) == 13 and len({row['order'] for row in cases}) == 13,
             'FIXTURE_CASES', 'Expected exactly F1-F11/H1/H2')
    other = next(row['order'] for row in cases if row['label'] == 'F2')
    unknown = 'c755aa09-0000-4000-8000-000000000099'
    cases += [{'label': 'NF_OTHER', 'actor': ACTORS['B'], 'order': other},
              {'label': 'NF_UNKNOWN', 'actor': ACTORS['A'], 'order': unknown},
              {'label': 'NF_NULL_ACTOR', 'actor': None, 'order': other},
              {'label': 'NF_NULL_ORDER', 'actor': ACTORS['A'], 'order': None},
              {'label': 'NF_NULL_BOTH', 'actor': None, 'order': None}]
    return cases, unknown


def _observe(pair, out, here, label, cases, *, observer_bytes=None, evidence=None):
    prefix = "set charge_context.cases to " + _sql_literal(json.dumps(cases, separators=(',', ':'))) + ';\n'
    prefix += 'set charge_context.observation_label to ' + _sql_literal(label) + ';\n'
    # The executable caller always supplies its approved byte snapshot. The
    # optional file input retains the standalone injected-SQL unit interface.
    source = (here / 'observer.sql').read_bytes() if observer_bytes is None else observer_bytes
    result = _install(pair, out, label, prefix.encode('utf-8') + source, user='fixture_admin',
                      marker='CHARGE_CONTEXT_OBSERVER_COMPLETE', evidence=evidence,
                      source='web:scripts/payment/charge-context-http/observer.sql')
    if evidence is not None:
        evidence['sqlDelivery'][label]['generatedPrefixSha256'] = _digest(prefix.encode('utf-8'))
    rows = [line[len('CHARGE_CONTEXT_OBSERVATION '):] for line in result.stdout.splitlines() if line.startswith('CHARGE_CONTEXT_OBSERVATION ')]
    _require(len(rows) == 1, 'OBSERVER_RESULT', 'Expected exactly one native observation')
    observation = _json(rows[0], 'OBSERVER_RESULT')
    _require(isinstance(observation, dict)
             and set(observation) == {'label', 'sessionUser', 'currentUser', 'timezone', 'digest', 'state',
                                      'financialCounts', 'fullCounts', 'financialZero', 'fullZero', 'aclValid', 'native'}
             and isinstance(observation['state'], dict)
             and isinstance(observation['financialCounts'], dict) and isinstance(observation['fullCounts'], dict)
             and isinstance(observation['native'], dict), 'OBSERVER_RESULT', 'Malformed native observation shape')
    _require(observation['label'] == label and observation['sessionUser'] == 'fixture_admin'
             and observation['currentUser'] == 'fixture_admin' and observation['timezone'] == 'UTC'
             and _pin(observation['digest']) and len(observation['financialCounts']) == 31
             and len(observation['fullCounts']) == 6
             and all(type(n) is int and n == 0 for n in [*observation['financialCounts'].values(), *observation['fullCounts'].values()])
             and all(observation[key] is True for key in ('financialZero', 'fullZero', 'aclValid')),
             'OBSERVER_RESULT', 'Native observation evidence is incomplete')
    _require(set(observation['native']) == {row['label'] for row in cases}, 'NATIVE_CASES', 'Native case coverage differs')
    for case in cases:
        row = observation['native'][case['label']]
        _require(isinstance(row, dict), 'OBSERVER_RESULT', 'Malformed native case envelope')
        if case['label'] == 'H2':
            _require(row == {'ok': False, 'code': 'P0001', 'message': 'WEB_PAYMENT_CHARGE_CONTEXT_BINDING_INVALID'},
                     'NATIVE_H2', 'Native H2 must preserve the exact binding failure')
        elif case['label'].startswith('NF_'):
            _require(row == {'ok': True, 'value': {'contract_version': 'web-payment-charge-context.v1', 'outcome': 'NOT_FOUND', 'charge_authority': False}},
                     'NATIVE_NOT_FOUND', 'Native owner/null lookup is not exact NOT_FOUND')
        else:
            _require(row.get('ok') is True and isinstance(row.get('value'), dict) and row['value'].get('outcome') == 'FOUND',
                     'NATIVE_FOUND', 'Native normal fixture did not return FOUND')
    return observation


def _stop_allowed(before, after):
    before = copy.deepcopy(before)
    after = copy.deepcopy(after)
    settings = 'web_payment_provider_settings'
    allowed = {'mode', 'allow_charge', 'allow_new_orders', 'verification_binding_id', 'paypal_account_id', 'paypal_merchant_id',
               'portone_merchant_id', 'portone_store_id', 'portone_channel_id'}
    for state in (before, after):
        for row in state[settings]:
            if (row['provider'], row['environment']) in (('PAYPAL', 'SANDBOX'), ('PORTONE', 'TEST')):
                for key in allowed:
                    row.pop(key, None)
        for row in state['user_profiles']:
            if row['id'] == ACTORS['C']:
                row.pop('deleted_at', None)
        # Removing fields can change lexical ordering; compare the remaining rows canonically.
        for table in state:
            state[table].sort(key=lambda row: json.dumps(row, sort_keys=True))
    return before == after


def _http_parity(result, native, expected_cases=None):
    _require(isinstance(result, dict) and all(isinstance(result.get(key), list) for key in ('cases', 'taps', 'direct'))
             and isinstance(native, dict), 'HTTP_COUNTS', 'Malformed HTTP/native result')
    _require(len(result['cases']) == 33 and len(result['taps']) == 53 and len(result['direct']) == 8
             and result.get('counts') == {'proxy': 53, 'direct': 8, 'cases': 33}, 'HTTP_COUNTS', 'HTTP matrix coverage differs')
    labels = {'F' + str(i) for i in range(1, 12)} | {'H1', 'H2', 'NF_OTHER', 'NF_UNKNOWN', 'NF_NULL_ACTOR', 'NF_NULL_ORDER', 'NF_NULL_BOTH'}
    _require(isinstance(expected_cases, list) and len(expected_cases) == 18
             and all(isinstance(row, dict) and isinstance(row.get('label'), str) and 'order' in row for row in expected_cases)
             and {row['label'] for row in expected_cases} == labels and set(native) == labels,
             'HTTP_REQUEST_CASES', 'Independent fixture request mapping is required')
    orders = {row['label']: row['order'] for row in expected_cases}
    expected_methods = {(label, method) for label in labels
                        for method in (('POST',) if label.startswith('NF_NULL') else ('GET', 'POST'))}
    actual_methods = []
    for row in result['cases']:
        _require(isinstance(row, dict) and isinstance(row.get('label'), str) and isinstance(row.get('method'), str)
                 and row['label'] in labels and 'status' in row and 'response' in row,
                 'HTTP_CASES', 'Malformed HTTP case')
        actual_methods.append((row['label'], row['method']))
        envelope = native[row['label']]
        _require(isinstance(envelope, dict) and type(envelope.get('ok')) is bool,
                 'HTTP_NATIVE_PARITY', 'Malformed native envelope')
        if envelope['ok']:
            _require(row['status'] == 200 and row['response'] == envelope.get('value') and isinstance(row['response'], dict),
                     'HTTP_NATIVE_PARITY', 'HTTP/native JSON differs')
            if row['response'].get('outcome') == 'FOUND':
                _require(orders[row['label']] is not None and row['response'].get('order_id') == orders[row['label']],
                         'HTTP_REQUEST_ORDER', 'FOUND order differs from the independent fixture request')
        else:
            _require(row['label'] == 'H2' and row['status'] == 400
                     and envelope == {'ok': False, 'code': 'P0001', 'message': 'WEB_PAYMENT_CHARGE_CONTEXT_BINDING_INVALID'}
                     and row['response'] == {'code': 'P0001', 'details': None, 'hint': None, 'message': 'WEB_PAYMENT_CHARGE_CONTEXT_BINDING_INVALID'},
                     'HTTP_NATIVE_PARITY', 'H2 HTTP/native exact error body differs')
    _require(len(actual_methods) == len(set(actual_methods)) and set(actual_methods) == expected_methods,
             'HTTP_CASES', 'HTTP label/method combinations are duplicate, missing or unapproved')


def main(argv=None):
    launch_flags = _runtime_flags(sys.flags)
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--postgres-image', required=True, choices=['postgres:15.8', 'postgres:17.6'])
    for flag in ('run-label', 'db-workspace', 'docker-host', 'web-head', 'web-manifest', 'web-manifest-sha256', 'db-manifest', 'db-manifest-sha256'):
        parser.add_argument('--' + flag, required=True)
    parser.add_argument('--docker-bin', default=shutil.which('docker', path=ENV['PATH']))
    parser.add_argument('--node-bin', default=shutil.which('node', path=ENV['PATH']))
    args = parser.parse_args(argv)
    _require(re.fullmatch('[a-z0-9][a-z0-9-]{0,63}', args.run_label) is not None, 'RUN_LABEL', 'Invalid new run label')
    for parent in (ROOT / '.artifacts', ROOT / '.artifacts/payment-web-order-http'):
        _require(not parent.is_symlink(), 'ARTIFACT_PATH', 'Artifact parent symlinks are forbidden')
    out = ROOT / '.artifacts/payment-web-order-http' / ('charge-context-' + args.run_label)
    out.mkdir(parents=True, exist_ok=False)
    here = ROOT / 'scripts/payment/charge-context-http'
    node_out = out / 'node-artifacts'
    evidence = {'status': 'failed', 'exitCode': 1, 'mode': 'current8-charge-context-http', 'stage': 'web-preflight',
                'originalError': None, 'phases': {}, 'observations': {}, 'unknownCreation': [],
                'launchFlags': launch_flags,
                'recordedAt': datetime.now(timezone.utc).isoformat(),
                'invocation': {'argv': list(sys.argv), 'mainArgv': list(argv) if argv is not None else list(sys.argv[1:]),
                               'interpreterArgv': getattr(sys, 'orig_argv', None)},
                'limits': {'pool': 1, 'concurrency': 'not measured', 'fullDependencyTreePinned': False,
                           'auth': 'public synthetic JWTs; no GoTrue/Kong', 'provider': 'no provider/capture transmission/FULL/UI/deploy claim',
                           'retry': 'retry(false) configured; one tap/no X-Retry-Count observed only for non-retry-eligible responses; GET503/520/network retry suppression unmeasured',
                           'readiness': 'finite fail-closed 23s readiness inside 24s watchdog; no availability guarantee',
                           'manifestProvenance': 'coordinator attestation and byte comparison; not hostile same-user isolation'}}
    pair = None
    web = db_before = None
    db_root = manifest = None
    native_pins = {}
    stack = ExitStack()
    old_signal = signal.getsignal(signal.SIGTERM)

    def terminated(_signum, _frame):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        raise BoundaryError('TERMINATED', 'Termination requested; preserve original failure and exact cleanup authority')

    signal.signal(signal.SIGTERM, terminated)
    try:
        # This must precede DB source reads, source execution, bundling and Docker.
        web = verify_web(ROOT, args.web_manifest, args.web_manifest_sha256, args.web_head, git=_command)
        evidence['webPreflight'] = web
        web_pins = web['sources']

        def web_bytes(relative):
            return _execution_bytes(ROOT, relative, web_pins, evidence, 'web')

        def observe(label):
            return _observe(pair, out, here, label, cases,
                            observer_bytes=web_bytes('scripts/payment/charge-context-http/observer.sql'), evidence=evidence)

        _require(set(FROZEN_PINS) == FROZEN and all(web['sources'][path] == pin for path, pin in {**FROZEN_PINS, **INSTALLED_PINS}.items()),
                 'FROZEN_RUNTIME_PIN', 'Original reuse or selected installed dependency source differs')
        evidence['stage'] = 'db-preflight'
        db_root, manifest, db_before = _verify_db(args.db_workspace, args.db_manifest, args.db_manifest_sha256)
        evidence.update(webHead=web['webHead'], dbHead=DB_HEAD, dbManifestSha256=DB_MANIFEST_PIN,
                        dependencySqlSha256=DEPENDENCY_PIN, dbSourcesBefore=db_before,
                        cacheBefore={**_cache_state(ROOT / 'scripts/payment/order-http'), **_cache_state(db_root / 'scripts/wallet')})
        evidence['sourcesBefore'] = {**{'web:' + k: v for k, v in web['sources'].items()},
                                     **{'db:' + k: v for k, v in db_before.items()}}
        modules = stack.enter_context(verified_reuse(ROOT, REUSE_PINS))
        evidence['reuseIdentity'] = {name: {'file': module.__file__, 'origin': module.__spec__.origin,
                                           'loader': type(module.__loader__).__name__, 'cached': module.__cached__}
                                     for name, module in modules.items()}
        evidence['interpreter'] = modules['order_http_run'].interpreter_evidence()
        evidence['installedVersions'] = {name: _json(web_bytes('node_modules/@supabase/' + name + '/package.json'),
                                                      'INSTALLED_PACKAGE')['version'] for name in ('supabase-js', 'postgrest-js')}
        evidence['stage'] = 'bundle'
        _require(args.node_bin and args.docker_bin, 'EXECUTABLES', 'Installed Node/Docker are required; installation is forbidden')
        node_out.mkdir()
        bundle_source = web_bytes('scripts/payment/charge-context-http/bundle.mjs')
        entry_relative = '__tests__/integration/payment/charge-context-postgrest.http.ts'
        entry_bytes = web_bytes(entry_relative)
        bundle_text = bundle_source.decode('utf-8', errors='strict')
        _require(bundle_text.encode('utf-8') == bundle_source, 'BUNDLE_DELIVERY', 'Bundle script UTF-8 delivery differs')
        # Node resolves stdin-module imports from this explicit W cwd. argv[1]
        # is '-', argv[2] the owned output, argv[3] the fixed entry snapshot hex.
        bundled = _command([args.node_bin, '--input-type=module', '-', str(node_out), entry_bytes.hex()],
                           input=bundle_text, cwd=str(ROOT), text=True, encoding='utf-8', capture_output=True, timeout=30)
        (out / 'bundle.log').write_text(bundled.stdout + bundled.stderr)
        _require(bundled.returncode == 0, 'BUNDLE_FAILURE', 'Host bundle failed before container creation')
        bundle_meta_bytes = (node_out / 'bundle-inputs.json').read_bytes()
        bundle_meta_pin = _digest(bundle_meta_bytes)
        bundle_meta = _json(bundle_meta_bytes, 'BUNDLE_META')
        _require(bundle_meta['entryDeliveryHex'] == entry_bytes.hex()
                 and set(bundle_meta['metafile']['inputs']) == {entry_relative}
                 and bundle_meta['metafile']['inputs'][entry_relative]['bytes'] == len(entry_bytes),
                 'BUNDLE_DELIVERY', 'Actual in-memory bundle entry differs from the approved delivery')
        evidence['bundleMetadata'] = {'sha256': bundle_meta_pin,
                                      'esbuildVersion': bundle_meta['esbuildVersion'], 'inputPaths': [entry_relative],
                                      'entryDeliverySha256': _digest(bytes.fromhex(bundle_meta['entryDeliveryHex'])),
                                      'scriptStdinSha256': _digest(bundle_text.encode('utf-8')),
                                      'moduleResolution': 'Node stdin ESM, explicit cwd=W; fixed esbuild stdin sourcefile; strict UTF-8 round trip'}
        guard_bytes = web_bytes('scripts/payment/charge-context-http/guard.cjs')
        (node_out / 'guard.cjs').write_bytes(guard_bytes)
        _require(_digest((node_out / 'guard.cjs').read_bytes()) == web_pins['scripts/payment/charge-context-http/guard.cjs'],
                 'GUARD_DELIVERY', 'Copied guard differs from its approved owned source pin')
        transport = modules['order_http_run'].LocalDocker(args.docker_bin, args.docker_host, out)
        pair = modules['pair_fixture'].PairFactory(transport, pg_image=args.postgres_image, artifact_dir=node_out, modules_dir=ROOT / 'node_modules')
        evidence['stage'] = 'factory-start'
        pair.start()
        evidence['stage'] = 'source-current8-setup'
        cases, unknown = _setup_current8(pair, modules, db_root, manifest, here, out, web_pins, evidence)
        evidence['fixtureCases'] = cases
        evidence['observations']['baselineA'] = observe('baselineA')
        evidence['stage'] = 'postgrest-start'
        pair.start_postgrest()
        config = {'restIp': pair.role('postgrest')['ipv4'], 'restAlias': 'order-rest', 'restPort': 3000,
                  'actors': ACTORS, 'unknownOrder': unknown, 'cases': cases, 'nodeDeadlineMs': 24000,
                  'readinessIdentity': {'actor': str(uuid.uuid4()), 'order': str(uuid.uuid4())},
                  'executionPins': {'bundleSha256': _digest((node_out / 'charge-context-http.cjs').read_bytes()),
                                    'guardSha256': web_pins['scripts/payment/charge-context-http/guard.cjs'],
                                    'entryDeliverySha256': evidence['bundleMetadata']['entryDeliverySha256']},
                  'tokens': {'service': modules['order_http_run'].jwt('service_role'), 'anon': modules['order_http_run'].jwt('anon'),
                             'authenticated': modules['order_http_run'].jwt('authenticated', sub=ACTORS['A'])},
                  'completionMarkers': {phase: 'CHARGE_CONTEXT_HTTP_COMPLETE_' + uuid.uuid4().hex + '_' + phase for phase in ('A', 'B')}}
        (node_out / 'config.json').write_text(json.dumps(config, indent=2) + '\n')
        evidence['artifactHashesBefore'] = _artifacts(node_out)
        evidence['completionMarkers'] = config['completionMarkers']
        for phase in ('A', 'B'):
            if phase == 'B':
                evidence['stage'] = 'stop'
                _install(pair, out, 'stop', web_bytes('scripts/payment/charge-context-http/stop.sql'),
                         user='postgres', marker='CHARGE_CONTEXT_STOP_COMPLETE', evidence=evidence,
                         source='web:scripts/payment/charge-context-http/stop.sql')
                evidence['observations']['baselineB'] = observe('baselineB')
                evidence['stopChangesAllowed'] = _stop_allowed(evidence['observations']['afterA']['state'], evidence['observations']['baselineB']['state'])
                _require(evidence['stopChangesAllowed'], 'STOP_STATE', 'Stop changed a non-allowlisted field')
                expected = copy.deepcopy(evidence['observations']['afterA']['native'])
                expected['F9']['value']['actor_deleted'] = True
                _require(expected == evidence['observations']['baselineB']['native'], 'STOP_NATIVE', 'Stop hid or changed frozen recovery context')
            baseline = evidence['observations']['baseline' + phase]
            native_path = node_out / ('native-' + phase + '.json')
            native_path.write_text(json.dumps(baseline['native'], indent=2) + '\n')
            native_pins[native_path.name] = _digest(native_path.read_bytes())
            _require(_artifacts(node_out) == evidence['artifactHashesBefore'], 'ARTIFACT_CHANGED', 'Immutable config/guard/bundle changed between phases')
            evidence['stage'] = 'http-' + phase
            child = pair.exec_node(['node', '--require', '/fixture/guard.cjs', '/fixture/charge-context-http.cjs', phase, native_pins[native_path.name]], check=False)
            (out / ('http-' + phase + '.stdout.log')).write_text(child.stdout)
            (out / ('http-' + phase + '.stderr.log')).write_text(child.stderr)
            evidence['phases'][phase] = {'exitCode': child.returncode, 'completed': False}
            operation_error = None
            try:
                result = parse_phase(phase, child, config)
                _http_parity(result, baseline['native'], cases)
                _require(result.get('executionPins') == config['executionPins'], 'NODE_EXECUTION_PINS',
                         'Node executed artifact hashes differ from root delivery')
                evidence['phases'][phase].update(completed=True, result=result)
            except BaseException as exc:
                operation_error = exc
            try:
                evidence['observations']['after' + phase] = observe('after' + phase)
                _require(baseline['digest'] == evidence['observations']['after' + phase]['digest'], 'HTTP_STATE_MUTATION', 'HTTP phase mutated observed state')
                _require(baseline['native'] == evidence['observations']['after' + phase]['native'],
                         'HTTP_NATIVE_MUTATION', 'Native getter changed within the same HTTP phase')
            except BaseException as exc:
                if operation_error is None:
                    operation_error = exc
                else:
                    evidence.setdefault('secondaryErrors', []).append(_error(exc))
            if operation_error is not None:
                raise operation_error
        evidence['stage'] = 'http-phases-complete'
    except BaseException as exc:
        evidence['originalError'] = {**_error(exc), 'code': getattr(exc, 'code', 'OPERATION_FAILED'), 'traceback': traceback.format_exc()}
    finally:
        try:
            # Keep TERM ignored through metadata, factory cleanup, final source
            # observations and reuse teardown. Restore the caller's handler below.
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            if pair is not None:
                def cleanup():
                    return _cleanup_pair(pair, evidence)

                def snapshot():
                    checked = verify_web(ROOT, args.web_manifest, args.web_manifest_sha256, args.web_head, git=_command)
                    _require(_digest(Path(args.db_manifest).read_bytes()) == DB_MANIFEST_PIN, 'DB_MANIFEST_HASH', 'DB manifest changed during execution')
                    current_db = _db_sources(db_root, manifest)
                    db_head_after = _command(['git', '-C', str(db_root), 'rev-parse', 'HEAD'], text=True, capture_output=True, timeout=30)
                    _require(db_head_after.returncode == 0 and db_head_after.stdout.strip() == DB_HEAD, 'DB_HEAD', 'DB HEAD changed during execution')
                    cache_after = {**_cache_state(ROOT / 'scripts/payment/order-http'), **_cache_state(db_root / 'scripts/wallet')}
                    _require(cache_after == evidence['cacheBefore'], 'CACHE_CHANGED', 'Reuse/helper cache changed during verified-byte execution')
                    for name, pin in native_pins.items():
                        _require(_digest((node_out / name).read_bytes()) == pin, 'NATIVE_INPUT_CHANGED', 'Native baseline artifact changed')
                    _require(_digest((node_out / 'bundle-inputs.json').read_bytes()) == bundle_meta_pin,
                             'BUNDLE_META_CHANGED', 'Actual bundle metafile changed')
                    return {'sources': {**{'web:' + k: v for k, v in checked['sources'].items()}, **{'db:' + k: v for k, v in current_db.items()}},
                            'artifacts': _artifacts(node_out), 'cache': cache_after}

                evidence = finalize_receipt(evidence, cleanup=cleanup, snapshot=snapshot)
                evidence['factoryAbsenceEvidence'] = pair.cleanup.absence if pair.cleanup is not None else None
                evidence['nativeInputHashes'] = native_pins
            # Preflight failures have no factory and retain their original exact
            # cause instead of turning missing cleanup evidence into a new error.
            evidence['finalStage'] = 'complete' if evidence['exitCode'] == 0 else evidence['stage']
        except BaseException as exc:
            evidence.update(status='failed', exitCode=1, finalizationError={**_error(exc), 'traceback': traceback.format_exc()})
        finally:
            try:
                stack.close()
            except BaseException as exc:
                evidence.update(status='failed', exitCode=1, reuseFinalizationError=_error(exc))
            finally:
                signal.signal(signal.SIGTERM, old_signal)
            (out / 'receipt.json').write_text(json.dumps(evidence, indent=2) + '\n')
            print(json.dumps({key: evidence.get(key) for key in ('status', 'stage', 'exitCode', 'originalError', 'cleanupError', 'absence')}))
            print('Receipt: ' + str(out / 'receipt.json'))
    return evidence['exitCode']


if __name__ == "__main__":
    raise SystemExit(main())
