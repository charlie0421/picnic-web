"""Root-run D1 binding-source HTTP measurement on an owned disposable pair.

All approval pins are explicit. Reused Python executes verified bytes only.
Synthetic JWTs and local fixture traffic provide no real-provider evidence.
"""

import argparse
from contextlib import contextmanager, ExitStack
import copy
from datetime import datetime, timezone
import hashlib
import importlib.abc
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import traceback
import uuid
from urllib.parse import urlsplit


ROOT = Path(__file__).absolute().parents[3]
DB_ROOT = Path('/Users/charlie.hyun/orca/workspaces/picnic-supabase/web-payment-contract')
DB_HEAD = '471b278cb57835973c3b24748f74898d03cef968'
PREFIX = 'scripts/payment/provider-rpc-http/'
ENTRY = '__tests__/integration/payment/provider-binding-postgrest.http.ts'
REUSE = {
    'pair_fixture': 'scripts/payment/order-http/pair_fixture.py',
    'setup_db': 'scripts/payment/order-http/setup_db.py',
    'order_http_run': 'scripts/payment/order-http/run.py',
    'charge_context_run': 'scripts/payment/charge-context-http/run.py',
}
REUSE_PINS = {
    'scripts/payment/order-http/pair_fixture.py': 'a194d142b57a199efa27f33ef78f9aa5ac2886f772d73defdef5848d6ee92a16',
    'scripts/payment/order-http/setup_db.py': '3bff4c99679e446c8d00486b6bc1dcc8be7326d449a6a100a02889cfe37dfac6',
    'scripts/payment/order-http/run.py': '809fde33a906d59df1ebda4313d8ec928e9e99465ed2004f2dbf667ff703c9eb',
    'scripts/payment/charge-context-http/run.py': '0a4b798219a0ff9f1dbc3eabf2f8796e2956951a40163ba775392fb603a6712c',
}
PRODUCT_PINS = {
    'lib/payment/paypal-charge/binding-source.ts': '2c8bb9102b6bd8d92b83e86f8e2d4ccb6eb4079028a93a18b5454a5a8c3ea1b4',
    'lib/payment/paypal-charge/repository.ts': 'ce58fe073e652dbc5324d29722110cb2f7e61b5f38d769e5e0a8547425e71841',
}
INSTALLED_PINS = {
    'node_modules/@supabase/supabase-js/package.json': 'd01ad122a3ed6005916169c36653c1727f2f95eaaad6968bc5ff9132524e65e1',
    'node_modules/@supabase/supabase-js/dist/index.cjs': 'ac25661172121ba59f741abe0262cfedc533613c3b175963df71c57e14f49e20',
    'node_modules/@supabase/postgrest-js/package.json': '74b9ee26d761f25cc9c8c68114ec6e7a2ac4ebee31f5d6ed3c48cd5450ae6aba',
    'node_modules/@supabase/postgrest-js/dist/index.cjs': 'd457ad36136e6c47328fb948aff16bc74058885d07e7a2a61b2adb9d600a4dd0',
}
FROZEN = frozenset((*REUSE.values(), *PRODUCT_PINS))
OWNED = frozenset((ENTRY, *(PREFIX + name for name in (
    'run.py', 'test_run.py', 'guard.cjs', 'bundle.mjs', 'seed.sql', 'observer.sql', 'rotate.sql', 'stop.sql'))))
INSTALLED = frozenset(INSTALLED_PINS)
ARTIFACTS = frozenset(('provider-binding-http.cjs', 'guard.cjs', 'config.json', 'bundle-inputs.json'))
BUNDLE_INPUTS = frozenset((ENTRY, *PRODUCT_PINS, 'server-only-marker:server-only'))
MIGRATIONS10 = (
    '20261111224520_web_payment_order_contract.sql', '20261112071844_web_payment_charge_lease.sql',
    '20261112081856_web_payment_provider_observation.sql', '20261112094913_web_payment_purchase_intake.sql',
    '20261112113100_web_payment_verification_binding.sql', '20261112124327_web_payment_verification_result.sql',
    '20261112145247_web_payment_settlement.sql', '20261114015304_web_payment_charge_gate.sql',
    '20261115075731_web_payment_provider_binding_read.sql', '20261115122716_web_payment_provider_entry.sql',
)
FINANCIAL = frozenset((
    'receipts', 'star_candy_history', 'star_candy_bonus_history', 'wallet_financial_operations',
    'wallet_credit_operations', 'wallet_credit_allocations', 'wallet_debit_operations', 'wallet_debit_allocations',
    'wallet_debit_bucket_allocations', 'wallet_repair_operations', 'wallet_recovery_debts', 'wallet_recovery_debt_events',
    'wallet_provider_event_inbox', 'wallet_provider_verification_attestations', 'purchase_reward_snapshots',
    'purchase_reward_allocations', 'purchase_promotion_resolutions', 'purchase_promotion_resolution_events',
    'purchase_promotion_awards', 'purchase_promotion_resolution_inputs', 'wallet_promotion_time_attestations',
    'purchase_refund_events', 'purchase_refund_allocations', 'cotton_candy_grants', 'cotton_candy_ledger',
    'wallet_star_lots', 'wallet_star_spend_allocations', 'wallet_star_lot_retirements', 'wallet_star_lot_applications',
    'wallet_star_lot_violations', 'wallet_bonus_projection_violations',
))
FULL = frozenset(('web_payment_verification_seals', 'web_payment_verification_results',
    'web_payment_settlement_leases', 'web_payment_settlement_outcomes', 'web_payment_full_verification_proofs',
    'web_payment_settlements'))
ACTORS = {'A': 'd155aa01-0000-4000-8000-000000000001', 'B': 'd155aa01-0000-4000-8000-000000000002',
          'C': 'd155aa01-0000-4000-8000-000000000003'}
LABELS = frozenset(('B1', 'B2', 'B3', 'B4', 'NF_OTHER', 'NF_UNKNOWN', 'NF_NULL_ACTOR', 'NF_NULL_ORDER', 'NF_NULL_BOTH'))
SOURCE_LABELS = frozenset(('B1', 'B2', 'B3', 'B4', 'NF_OTHER', 'NF_UNKNOWN'))
ENV = {'PATH': '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin', 'NODE_ENV': 'test',
       'PYTHONDONTWRITEBYTECODE': '1', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
HASH = re.compile(r'[0-9a-f]{64}\Z')
HEAD = re.compile(r'[0-9a-f]{40}\Z')
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z')
D2_ENTRY = '__tests__/integration/payment/provider-bridge-postgrest.http.ts'
D2_PRODUCT_PINS = {**PRODUCT_PINS,
    'lib/payment/paypal-charge/provider-entry.ts': 'd5b28163e39e238fac54388e08bcb3d6d1dea469d8509caee4503a678b049d22',
    'lib/payment/paypal-charge/orchestrator.ts': 'cc8c911d3fedba478fcff17c2eaa9187f00abff758b0c88f73ebf38291e4e761',
    'lib/payment/paypal-charge/protocol.ts': '987d3333122a197f0115d9a9b5f06337ba0c9bebcea36f3c623081c1ebef67c5'}
D2_FROZEN = frozenset((*REUSE.values(), *D2_PRODUCT_PINS))
D2_OWNED = frozenset((OWNED - {ENTRY}) | {D2_ENTRY})
D2_BUNDLE = frozenset((D2_ENTRY, *D2_PRODUCT_PINS, 'server-only-marker:server-only'))
D2_ARTIFACTS = frozenset(('provider-bridge-http.cjs', 'guard.cjs', 'config.json', 'bundle-inputs.json'))
D2_LABELS = ('F1', 'F2', 'F3', 'F4a', 'F4b', 'F5', 'F5prime', 'F6', 'F7', 'L1-CLAIM', 'N-A', 'N-B', 'N-C', 'ORD-ACL')
D2_RPC = {'getter': 'get_web_payment_charge_context', 'prepare': 'prepare_web_payment_provider_context',
    'binding': 'get_web_payment_provider_binding', 'entry': 'authorize_web_payment_provider_entry',
    'bind': 'bind_web_payment_provider_identity', 'record': 'record_web_payment_observation',
    'claim': 'claim_web_payment_charge', 'intent': 'record_web_payment_submission_intent', 'receive': 'receive_web_payment_purchase'}
D2_STABLE = frozenset((D2_RPC['getter'], D2_RPC['binding']))
D2_PROBES = ['http', 'http-address', 'rpc-path', 'http-address', 'rpc-method', 'rpc-method', 'rpc-query', 'rpc-query', 'rpc-method']
PRODUCT_TABLES = frozenset(('web_payment_orders', 'web_payment_quotes', 'web_payment_provider_contexts',
    'web_payment_provider_links', 'web_payment_observations', 'web_payment_charge_attempts',
    'web_payment_purchase_intakes', 'products', *FINANCIAL, *FULL))
# Closed measurement plan. Entries are external RPC names in arrival order
# within one lane; concurrent F4 lanes are validated independently.
D2_TAP_PLAN = {
    'A': {
        'F1': ('F1', '', 'getter prepare binding entry bind getter prepare binding claim intent bind receive'),
        'F2': ('F2', '', 'getter prepare binding entry getter prepare binding entry bind'),
        'F3a': ('F3', '', 'getter prepare binding entry'),
        'F4a': ('F4a', 'prepare getter', 'getter prepare binding entry bind'),
        'F4b': ('F4b', 'prepare getter', 'getter prepare binding entry bind'),
        'F4b-refusal': ('F4b', '', 'getter entry'),
        'F5': ('F5', '', 'getter prepare binding entry bind getter prepare binding claim intent getter prepare binding getter claim'),
        'F5prime': ('F5prime', '', 'getter prepare binding entry bind getter prepare binding claim intent getter prepare binding'),
        'F6': ('F6', 'getter prepare binding entry record getter', 'getter binding entry claim'),
        'F7a': ('F7', '', 'prepare'), 'L1a': ('F1', '', 'binding entry entry entry entry'),
        'L1-CLAIM': ('L1-CLAIM', 'getter prepare binding entry bind getter claim getter binding', 'entry'),
        'L1b': ('F5', '', 'binding entry'),
        'N-A': ('N-A', '', 'getter prepare binding entry bind getter prepare binding claim intent record record getter prepare binding bind entry claim'),
        'N-B': ('N-B', '', 'getter prepare binding entry bind getter prepare binding claim intent record record getter prepare binding bind entry claim'),
        'N-C': ('N-C', '', 'getter prepare binding entry bind getter prepare binding claim intent record bind getter prepare binding bind entry claim')},
    'B': {'F7b': ('F7', '', 'getter prepare binding entry')},
    'C': {'F3b': ('F3', '', 'getter prepare binding entry'), 'C-READS': (None, '', '')}}
D2_COUNTS = {'A': {'scenarios': 16, 'setupProxy': 19, 'measuredProxy': 142, 'direct': 24, 'postgrest': 185},
    'B': {'scenarios': 1, 'setupProxy': 0, 'measuredProxy': 4, 'direct': 0, 'postgrest': 4},
    'C': {'scenarios': 2, 'setupProxy': 0, 'measuredProxy': 32, 'direct': 0, 'postgrest': 32}}
# context, ORDER link, CAPTURE link, observation, attempt, intent,
# payment, settlement, exact row-version delta, intake/inbox/receipt.
D2_END_STATES = {
    'F1': (1, 1, 1, 2, 1, True, 'SUBMISSION_UNKNOWN', 'INTAKE_PENDING', 3, 1),
    'F2': (1, 1, 0, 1, 0, False, 'NOT_SUBMITTED', 'NOT_INTAKE', 0, 0),
    'F3': (1, 0, 0, 0, 0, False, 'NOT_SUBMITTED', 'NOT_INTAKE', 0, 0),
    'F4a': (1, 1, 0, 1, 0, False, 'NOT_SUBMITTED', 'NOT_INTAKE', 0, 0),
    'F4b': (1, 1, 0, 2, 0, False, 'NOT_SUBMITTED', 'NOT_INTAKE', 0, 0),
    'F5': (1, 1, 0, 1, 1, True, 'SUBMISSION_UNKNOWN', 'NOT_INTAKE', 2, 0),
    'F5prime': (1, 1, 0, 1, 1, True, 'SUBMISSION_UNKNOWN', 'NOT_INTAKE', 2, 0),
    'F6': (1, 0, 0, 1, 0, False, 'NOT_SUBMITTED', 'NOT_INTAKE', 0, 0),
    'F7': (1, 0, 0, 0, 0, False, 'NOT_SUBMITTED', 'NOT_INTAKE', 0, 0),
    'L1-CLAIM': (1, 1, 0, 1, 1, False, 'NOT_SUBMITTED', 'NOT_INTAKE', 1, 0),
    'N-A': (1, 1, 1, 4, 1, True, 'SUBMISSION_UNKNOWN', 'NOT_INTAKE', 2, 0),
    'N-B': (1, 1, 1, 4, 1, True, 'SUBMISSION_UNKNOWN', 'NOT_INTAKE', 2, 0),
    'N-C': (1, 1, 1, 4, 1, True, 'SUBMISSION_UNKNOWN', 'NOT_INTAKE', 2, 0),
    'ORD-ACL': (0, 0, 0, 0, 0, False, 'NOT_SUBMITTED', 'NOT_INTAKE', 0, 0)}


class BoundaryError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def require(condition, code, message):
    if not condition:
        raise BoundaryError(code, message)


def phase_contract(phase_set):
    require(phase_set in ('d1', 'd2'), 'PHASE_SET', 'Unknown phase set')
    if phase_set == 'd2':
        return D2_FROZEN, D2_OWNED, D2_ENTRY, D2_BUNDLE, D2_ARTIFACTS, 'provider-bridge-http.cjs'
    return FROZEN, OWNED, ENTRY, BUNDLE_INPUTS, ARTIFACTS, 'provider-binding-http.cjs'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pin(value):
    return isinstance(value, str) and HASH.fullmatch(value) is not None


def relative(value):
    require(isinstance(value, str) and value and '\\' not in value and not Path(value).is_absolute()
            and all(part not in ('', '.', '..') for part in value.split('/')),
            'SOURCE_PATH', 'Source path must be canonical and relative')
    return value


def root_path(value):
    path = Path(value).absolute()
    require(path.is_dir() and not path.is_symlink(), 'SOURCE_PATH', 'Source root must be a physical directory')
    return path


def source_file(root, name):
    path = Path(root)
    for part in relative(name).split('/'):
        path = path / part
        require(not path.is_symlink(), 'SOURCE_PATH', 'Source symlink is forbidden: ' + name)
    try:
        regular = stat.S_ISREG(path.stat().st_mode)
    except OSError as exc:
        raise BoundaryError('SOURCE_PATH', 'Source is unavailable: ' + name) from exc
    require(regular, 'SOURCE_PATH', 'Source must be a regular file: ' + name)
    return path


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'MANIFEST_DUPLICATE', 'Duplicate JSON key: ' + key)
        result[key] = value
    return result


def read_json(data, code):
    try:
        return json.loads(data, object_pairs_hook=unique_object)
    except BoundaryError:
        raise
    except (ValueError, UnicodeError, TypeError) as exc:
        raise BoundaryError(code, 'Invalid JSON payload') from exc


def error(exc):
    result = {'type': type(exc).__name__, 'message': str(exc), 'code': getattr(exc, 'code', 'OPERATION_FAILED')}
    cause = exc.__cause__
    if cause is not None:
        result['cause'] = {'type': type(cause).__name__[:128], 'message': str(cause)[:512],
                           'code': str(getattr(cause, 'code', 'OPERATION_FAILED'))[:128]}
    return result


class VerifiedLoader(importlib.abc.Loader):
    def __init__(self, path, data):
        self.path, self.data = str(path), data

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        module.__file__, module.__cached__ = self.path, None
        exec(compile(self.data, self.path, 'exec'), module.__dict__)
        require(module.__file__ == self.path and module.__cached__ is None
                and module.__loader__ is self and module.__spec__.loader is self
                and module.__spec__.origin == self.path, 'LOADER_IDENTITY', 'Helper replaced its loader identity')


@contextmanager
def verified_reuse(root, pins):
    require(isinstance(pins, dict) and set(pins) == set(REUSE.values()), 'REUSE_SET', 'Exactly REUSE4 is required')
    require(not any(name in sys.modules for name in REUSE), 'MODULE_PREBOUND', 'A reused module is already bound')
    root = root_path(root)
    sources = {}
    for name, path in REUSE.items():
        source = source_file(root, path)
        data = source.read_bytes()
        require(pin(pins[path]) and digest(data) == pins[path], 'SOURCE_HASH', 'Reused source hash differs: ' + path)
        sources[name] = (source, data)
    previous = (sys.dont_write_bytecode, sys.path[:], sys.meta_path[:])
    modules = {}
    try:
        sys.dont_write_bytecode = True
        for name, (path, data) in sources.items():
            require(name not in sys.modules, 'MODULE_PREBOUND', 'A helper bound another reused module')
            loader = VerifiedLoader(path, data)
            spec = importlib.util.spec_from_loader(name, loader, origin=str(path))
            module = importlib.util.module_from_spec(spec)
            modules[name] = module
            sys.modules[name] = module
            loader.exec_module(module)
        yield modules
    finally:
        for name in reversed(modules):
            sys.modules.pop(name, None)
        sys.dont_write_bytecode = previous[0]
        sys.path[:] = previous[1]
        sys.meta_path[:] = previous[2]


def manifest_bytes(root, path, approved_hash, code):
    path = Path(path).absolute()
    try:
        name = str(path.relative_to(root))
    except ValueError as exc:
        raise BoundaryError('SOURCE_PATH', 'Manifest must be inside the explicit web workspace') from exc
    raw = source_file(root, name).read_bytes()
    require(pin(approved_hash) and digest(raw) == approved_hash, code, 'Manifest differs from root approval pin')
    return path, raw


def git_command(git, root, args, *, binary=False):
    return git(['git', '-C', str(root), *args], capture_output=True, text=not binary, timeout=30)


def verify_web(root, manifest_path, manifest_sha256, web_head, *, git, phase_set='d1'):
    frozen, owned, _, _, _, _ = phase_contract(phase_set)
    root = root_path(root)
    require(isinstance(web_head, str) and HEAD.fullmatch(web_head), 'WEB_HEAD', 'Full explicit web HEAD is required')
    path, raw = manifest_bytes(root, manifest_path, manifest_sha256, 'MANIFEST_HASH')
    manifest = read_json(raw, 'MANIFEST_JSON')
    require(isinstance(manifest, dict) and set(manifest) == {'webHead', 'frozenFiles', 'ownedFiles', 'installedFiles'},
            'MANIFEST_SET', 'Web manifest fields differ')
    require(manifest['webHead'] == web_head, 'WEB_HEAD', 'Web manifest HEAD differs')
    sources = {}
    for category, names in (('frozenFiles', frozen), ('ownedFiles', owned), ('installedFiles', INSTALLED)):
        rows = manifest[category]
        require(isinstance(rows, dict), 'MANIFEST_SET', 'Manifest category must be an object')
        for name in rows:
            relative(name)
        require(set(rows) == names, 'MANIFEST_SET', 'Web source closure differs: ' + category)
        for name, wanted in rows.items():
            data = source_file(root, name).read_bytes()
            require(pin(wanted) and digest(data) == wanted, 'SOURCE_HASH', 'Web source hash differs: ' + name)
            sources[name] = wanted
    actual = git_command(git, root, ['rev-parse', 'HEAD'])
    require(actual.returncode == 0 and actual.stdout.strip() == web_head, 'WEB_HEAD', 'Actual web HEAD differs')
    frozen_state, owned_state = {}, {}
    for name in sorted(frozen | owned):
        tracked = git_command(git, root, ['ls-files', '--error-unmatch', '--', name])
        status = git_command(git, root, ['status', '--porcelain=v1', '--untracked-files=all', '--', name])
        require(tracked.returncode in (0, 1) and status.returncode == 0, 'GIT_STATUS', 'Git source query failed')
        lines = status.stdout.splitlines()
        require(not lines or (len(lines) == 1 and len(lines[0]) >= 4 and lines[0][2] == ' '
                and lines[0][3:] == name and all(char in ' MADRCUT?!' for char in lines[0][:2])),
                'GIT_STATUS', 'Git status source evidence is ambiguous')
        state = {'tracked': tracked.returncode == 0, 'dirty': bool(lines)}
        if name in frozen:
            require(state['tracked'], 'FROZEN_TRACKING', 'Frozen source is untracked: ' + name)
            require(not state['dirty'], 'FROZEN_DIRTY', 'Frozen source is dirty: ' + name)
            blob = git_command(git, root, ['show', 'HEAD:' + name], binary=True)
            require(blob.returncode == 0 and isinstance(blob.stdout, bytes) and digest(blob.stdout) == sources[name],
                    'FROZEN_HEAD_BLOB', 'Frozen HEAD blob differs: ' + name)
            frozen_state[name] = state
        else:
            require(state['tracked'] or (lines and lines[0][:2] == '??'), 'GIT_STATUS', 'Missing untracked source evidence')
            owned_state[name] = state
    require(path.read_bytes() == raw, 'MANIFEST_HASH', 'Web manifest changed during verification')
    return {'webHead': web_head, 'manifestPath': str(path), 'manifestSha256': manifest_sha256,
            'sources': sources, 'ownedState': owned_state, 'frozenState': frozen_state}


def verify_db(root, manifest_path, manifest_sha256, *, git):
    root = root_path(root)
    require(root == DB_ROOT, 'DB_ROOT', 'Only the approved explicit DB workspace is allowed')
    path, raw = manifest_bytes(root_path(ROOT), manifest_path, manifest_sha256, 'DB_MANIFEST_HASH')
    manifest = read_json(raw, 'DB_MANIFEST_JSON')
    require(isinstance(manifest, dict) and set(manifest) == {'root', 'sourceCommit', 'dependencySqlSha256', 'files'}
            and manifest['root'] == str(root) and manifest['sourceCommit'] == DB_HEAD
            and pin(manifest['dependencySqlSha256']) and isinstance(manifest['files'], dict)
            and len(manifest['files']) == 97, 'DB_MANIFEST_IDENTITY', 'DB current97 manifest identity differs')
    actual = git_command(git, root, ['rev-parse', 'HEAD'])
    require(actual.returncode == 0 and actual.stdout.strip() == DB_HEAD, 'DB_HEAD', 'Actual DB HEAD differs')
    sources = {}
    for name, row in manifest['files'].items():
        relative(name)
        require(isinstance(row, dict) and set(row) == {'sha256'} and pin(row['sha256']),
                'DB_MANIFEST_IDENTITY', 'Malformed DB source pin')
        value = digest(source_file(root, name).read_bytes())
        require(value == row['sha256'], 'DB_SOURCE_HASH', 'DB source bytes differ: ' + name)
        sources[name] = value
        tracked = git_command(git, root, ['ls-files', '--error-unmatch', '--', name])
        status = git_command(git, root, ['status', '--porcelain=v1', '--untracked-files=all', '--', name])
        blob = git_command(git, root, ['show', 'HEAD:' + name], binary=True)
        require(tracked.returncode == 0 and status.returncode == 0 and not status.stdout.strip()
                and blob.returncode == 0 and isinstance(blob.stdout, bytes) and digest(blob.stdout) == value,
                'DB_GIT_SOURCE', 'DB source is not a tracked clean HEAD blob: ' + name)
    require(path.read_bytes() == raw, 'DB_MANIFEST_HASH', 'DB manifest changed during verification')
    return root, manifest, sources


def execution_bytes(root, name, pins, evidence, scope):
    require(pin(pins.get(name)), 'SOURCE_HASH', 'Execution input has no approval pin: ' + name)
    data = source_file(root, name).read_bytes()
    require(digest(data) == pins[name], 'SOURCE_HASH', 'Execution input changed: ' + name)
    evidence.setdefault('executionInputs', {})[scope + ':' + name] = {
        'approvedSha256': pins[name], 'deliverySha256': digest(data), 'sizeBytes': len(data)}
    return data


def validate_migrations(names):
    require(isinstance(names, (list, tuple)) and tuple(names) == MIGRATIONS10
            and len(set(names)) == 10 and list(names) == sorted(names),
            'MIGRATIONS10', 'Only the exact ordered current10 migrations are permitted')
    return tuple(names)


def install_sql(pair, out, stage, sql, *, user, marker=None, evidence=None):
    text = sql.decode('utf-8', errors='strict') if isinstance(sql, bytes) else sql
    require(isinstance(text, str), 'SQL_INPUT', 'SQL delivery is not UTF-8 text')
    result = pair.sql(text, user=user, check=False)
    (out / (stage + '.log')).write_text(result.stdout + result.stderr)
    if evidence is not None:
        evidence.setdefault('sqlStages', {})[stage] = {'exitCode': result.returncode, 'user': user,
            'deliveredSha256': digest(text.encode()), 'marker': marker,
            'markerCount': result.stdout.splitlines().count(marker) if marker else None}
    require(type(result.returncode) is int and result.returncode == 0, 'SQL_STAGE_FAILURE',
            'SQL stage failed: ' + stage + '; user=' + user + '; exit=' + str(result.returncode))
    if marker:
        require(result.stdout.splitlines().count(marker) == 1 and result.stdout.splitlines()[-1:] == [marker],
                'SQL_STAGE_MARKER', 'SQL stage completion marker differs: ' + stage)
    return result


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def validate_cases(cases, *, phase_set='d1'):
    phase_contract(phase_set)
    if phase_set == 'd2':
        require(isinstance(cases, list) and len(cases) == 23, 'FIXTURE_CASES', 'Expected native9 and distinct bridge14')
        old = [row for row in cases if isinstance(row, dict) and row.get('label') in LABELS]
        validate_cases(old)
        bridge = [row for row in cases if isinstance(row, dict) and row.get('label') in D2_LABELS]
        require(len(bridge) == 14 and {row['label'] for row in bridge} == set(D2_LABELS)
            and all(set(row) == {'label', 'actor', 'order'} and row['actor'] == ACTORS['A']
                and isinstance(row['order'], str) and UUID.fullmatch(row['order']) for row in bridge)
            and len({row['order'] for row in bridge}) == 14
            and not ({row['order'] for row in bridge} & {row['order'] for row in old}),
            'FIXTURE_CASES', 'Bridge identities are missing, duplicate, null or shared')
        return {row['label']: row for row in cases}
    require(isinstance(cases, list) and len(cases) == 9
            and all(isinstance(row, dict) and set(row) == {'label', 'actor', 'order'} for row in cases)
            and {row['label'] for row in cases} == LABELS, 'FIXTURE_CASES', 'Expected exactly the nine D1 fixture labels')
    for row in cases:
        for key in ('actor', 'order'):
            require(row[key] is None or (isinstance(row[key], str) and UUID.fullmatch(row[key])),
                    'FIXTURE_CASES', 'Fixture identity must be UUID or explicit null')
    mapped = {row['label']: row for row in cases}
    require(all(mapped[label]['actor'] is not None and mapped[label]['order'] is not None for label in SOURCE_LABELS),
            'FIXTURE_CASES', 'Source cases require non-null actor and order')
    return mapped


def setup_current10(pair, modules, db_root, manifest, out, web_pins, evidence, *, phase_set='d1'):
    names = validate_migrations(MIGRATIONS10)
    db_pins = {name: row['sha256'] for name, row in manifest['files'].items()}
    for name in names:
        require('supabase/migrations/' + name in db_pins, 'MIGRATIONS10', 'Migration missing from approved DB manifest')

    def db_install(stage, path, *, user, marker=None):
        data = execution_bytes(db_root, path, db_pins, evidence, 'db')
        return install_sql(pair, out, stage, data, user=user, marker=marker, evidence=evidence)

    with modules['setup_db'].verified_helpers(db_root, manifest):
        order = __import__('web_payment_order_fixture')
        settlement = __import__('web_payment_settlement_fixture')
        definitions, selected = settlement.settlement_dependencies()
        selected_names = [str(path.relative_to(db_root)) for path in selected]
        require(digest(definitions.encode()) == manifest['dependencySqlSha256'] and len(selected_names) == 48
                and len(set(selected_names)) == 48 and all(name in db_pins for name in selected_names),
                'DB_DEPENDENCIES', 'Selected dependency SQL or source closure differs from root measurement')
        require(order.BOOTSTRAP == db_root / 'scripts/wallet/fixtures/web-payment-orders-bootstrap.sql',
                'DB_DEPENDENCIES', 'Original bootstrap source differs')
        db_install('bootstrap', 'scripts/wallet/fixtures/web-payment-orders-bootstrap.sql', user='fixture_admin')
        install_sql(pair, out, 'dependencies', definitions, user='fixture_admin', evidence=evidence)
        evidence['selectedSources'] = selected_names
        evidence['dependencySqlSha256'] = digest(definitions.encode())
    db_install('positive-engine-control', 'scripts/wallet/fixtures/web-payment-settlement-engine-control.sql',
               user='postgres', marker='positive-refund-control-complete')
    evidence['engineControlCompleted'] = True
    for name in names:
        db_install(name, 'supabase/migrations/' + name, user='postgres')
        evidence.setdefault('appliedMigrations', []).append(name)
    password = modules['pair_fixture'].PUBLIC_PASSWORD
    install_sql(pair, out, 'authenticator',
        'create role authenticator login noinherit nosuperuser nobypassrls password ' + sql_literal(password)
        + '; grant anon,authenticated,service_role to authenticator; grant connect on database fixture to authenticator;',
        user='fixture_admin', evidence=evidence)
    seed_bytes = execution_bytes(ROOT, PREFIX + 'seed.sql', web_pins, evidence, 'web')
    seed_bytes = seed_bytes.replace(b'__PROVIDER_RPC_PHASE_SET__', phase_set.encode('ascii'))
    seed = install_sql(pair, out, 'seed', seed_bytes,
        user='postgres', marker='PROVIDER_RPC_SEED_COMPLETE', evidence=evidence)
    seeded = [read_json(line, 'FIXTURE_JSON') for line in seed.stdout.splitlines() if line.startswith('{')]
    labels = {'B1', 'B2', 'B3', 'B4'} | (set(D2_LABELS) if phase_set == 'd2' else set())
    require(len(seeded) == len(labels) and all(isinstance(row, dict) and set(row) == {'label', 'actor', 'order'} for row in seeded)
            and {row['label'] for row in seeded} == labels
            and len({row['order'] for row in seeded}) == len(labels), 'FIXTURE_CASES', 'Seed must return exact distinct order labels')
    first = next(row['order'] for row in seeded if row['label'] == 'B1')
    seeded += [{'label': 'NF_OTHER', 'actor': ACTORS['B'], 'order': first},
               {'label': 'NF_UNKNOWN', 'actor': ACTORS['A'], 'order': 'd155cc09-0000-4000-8000-000000000099'},
               {'label': 'NF_NULL_ACTOR', 'actor': None, 'order': first},
               {'label': 'NF_NULL_ORDER', 'actor': ACTORS['A'], 'order': None},
               {'label': 'NF_NULL_BOTH', 'actor': None, 'order': None}]
    validate_cases(seeded, phase_set=phase_set)
    if phase_set == 'd2':
        mapped = {row['label']: row for row in seeded}
        seeded = [mapped[label] for label in ('B1', 'B2', 'B3', 'B4', 'NF_OTHER', 'NF_UNKNOWN',
            'NF_NULL_ACTOR', 'NF_NULL_ORDER', 'NF_NULL_BOTH', *D2_LABELS)]
    evidence.update(installedContractLevel='current10', suiteContractLevel=None)
    return seeded


def verify_bundle(meta, entry_bytes, *, phase_set='d1'):
    _, _, entry, bundle_inputs, _, _ = phase_contract(phase_set)
    require(isinstance(meta, dict) and meta.get('entryDeliveryHex') == entry_bytes.hex(),
            'BUNDLE_DELIVERY', 'Bundle entry delivery differs from approved snapshot')
    inputs = meta.get('metafile', {}).get('inputs')
    require(isinstance(inputs, dict) and set(inputs) == bundle_inputs, 'BUNDLE_INPUTS', 'Actual bundle graph differs; stop for review')
    require(isinstance(inputs[entry], dict) and inputs[entry].get('bytes') == len(entry_bytes),
            'BUNDLE_DELIVERY', 'Metafile entry byte count differs')
    return {'inputPaths': sorted(inputs), 'esbuildVersion': meta.get('esbuildVersion'),
            'entryDeliverySha256': digest(entry_bytes)}


def zero_counts(value, expected):
    return (isinstance(value, dict) and set(value) == expected
            and all(type(count) is int and count == 0 for count in value.values()))


def valid_entry_catalog(value):
    fields = {'signature', 'owner', 'securityDefiner', 'volatility', 'proconfig',
              'executeGrantees', 'publicExecute', 'effectiveExecute'}
    effective = {'service_role': True, 'anon': False, 'authenticated': False, 'wallet_test': False,
                 'wallet_state_owner': False, 'wallet_attestation_owner': False}
    if not (isinstance(value, dict) and set(value) == fields
            and value['signature'] == 'authorize_web_payment_provider_entry(uuid,uuid,uuid,uuid,text)'
            and value['owner'] == 'wallet_command_owner' and value['securityDefiner'] is True
            and value['volatility'] == 'v' and value['proconfig'] == ['search_path=""']
            and value['publicExecute'] is False and isinstance(value['executeGrantees'], list)
            and all(isinstance(role, str) for role in value['executeGrantees'])
            and isinstance(value['effectiveExecute'], dict) and set(value['effectiveExecute']) == set(effective)):
        return False
    grantees = value['executeGrantees']
    return (len(set(grantees)) == len(grantees) and set(grantees) - {value['owner']} == {'service_role'}
            and all(value['effectiveExecute'][role] is allowed for role, allowed in effective.items()))


def valid_observation(value, label, labels=LABELS, *, phase_set='d1'):
    fields = {'label', 'sessionUser', 'currentUser', 'timezone', 'productDigest', 'controlDigest', 'controlState',
              'financialCounts', 'fullCounts', 'financialZero', 'fullZero', 'aclValid', 'native'}
    if phase_set == 'd2':
        fields |= {'phaseSet', 'orderFacts', 'productState', 'bridgeNative', 'entryCatalog'}
        if not (isinstance(value, dict) and set(value) == fields and value['phaseSet'] == 'd2'
            and valid_entry_catalog(value['entryCatalog'])
            and isinstance(value['orderFacts'], dict) and set(value['orderFacts']) == set(D2_LABELS)
            and isinstance(value['bridgeNative'], dict) and set(value['bridgeNative']) == set(D2_LABELS)
            and all(isinstance(row, dict) and set(row) == {'binding', 'context'}
                and all(isinstance(row[key], dict) for key in ('binding', 'context')) for row in value['bridgeNative'].values())
            and isinstance(value['productState'], dict) and set(value['productState']) == PRODUCT_TABLES
            and all(isinstance(rows, list) and all(isinstance(row, dict) for row in rows) for rows in value['productState'].values())
            and isinstance(value['financialCounts'], dict) and set(value['financialCounts']) == FINANCIAL
            and all(type(n) is int and 0 <= n <= (1 if table in ('receipts', 'wallet_provider_event_inbox') else 0)
                for table, n in value['financialCounts'].items())):
            return False
        financial_valid = True
    elif phase_set == 'd1':
        financial_valid = isinstance(value, dict) and zero_counts(value.get('financialCounts'), FINANCIAL)
    else:
        return False
    return (isinstance(value, dict) and set(value) == fields and value['label'] == label
            and value['sessionUser'] == value['currentUser'] == 'fixture_admin' and value['timezone'] == 'UTC'
            and pin(value['productDigest']) and pin(value['controlDigest']) and isinstance(value['controlState'], dict)
            and financial_valid and zero_counts(value['fullCounts'], FULL)
            and all(value[key] is True for key in ('financialZero', 'fullZero', 'aclValid'))
            and isinstance(value['native'], dict) and set(value['native']) == labels
            and all(isinstance(row, dict) and set(row) == {'ok', 'value'} and row['ok'] is True
                    and isinstance(row['value'], dict) for row in value['native'].values()))


def observe(pair, out, label, cases, observer_bytes, evidence, *, phase_set='d1'):
    validate_cases(cases, phase_set=phase_set)
    prefix = 'set provider_rpc.cases to ' + sql_literal(json.dumps(cases, separators=(',', ':'))) + ';\n'
    if phase_set == 'd2':
        prefix += "set provider_rpc.phase_set to 'd2';\n"
    prefix += 'set provider_rpc.observation_label to ' + sql_literal(label) + ';\n'
    data = prefix.encode() + observer_bytes
    result = install_sql(pair, out, label, data, user='fixture_admin',
                         marker='PROVIDER_RPC_OBSERVER_COMPLETE', evidence=evidence)
    rows = [line[len('PROVIDER_RPC_OBSERVATION '):] for line in result.stdout.splitlines()
            if line.startswith('PROVIDER_RPC_OBSERVATION ')]
    require(len(rows) == 1, 'OBSERVER_RESULT', 'Expected one complete observer payload')
    value = read_json(rows[0], 'OBSERVER_RESULT')
    require(valid_observation(value, label, phase_set=phase_set), 'OBSERVER_RESULT', 'Native observer evidence differs from selected schema')
    return value


def parse_result(phase, child, config, *, phase_set='d1'):
    phase_contract(phase_set)
    markers = config.get('completionMarkers') if isinstance(config, dict) else None
    require(phase in ('A', 'B', 'C') and isinstance(markers, dict) and set(markers) == {'A', 'B', 'C'}
            and all(isinstance(marker, str) and marker and '\n' not in marker and '\r' not in marker for marker in markers.values())
            and len(set(markers.values())) == 3, 'PHASE_CONFIG', 'Invalid immutable phase markers')
    require(type(child.returncode) is int and child.returncode == 0, 'PHASE_EXIT', 'HTTP child exit=' + str(child.returncode))
    require(isinstance(child.stdout, str), 'PHASE_RESULT', 'HTTP output is not text')
    lines = child.stdout.splitlines()
    require(lines.count(markers[phase]) == 1 and not any(markers[other] in lines for other in 'ABC' if other != phase),
            'PHASE_MARKER', 'HTTP phase marker missing, duplicate or foreign')
    rows = [line[len('PROVIDER_RPC_HTTP_RESULT '):] for line in lines if line.startswith('PROVIDER_RPC_HTTP_RESULT ')]
    require(len(rows) == 1 and not any(line.startswith('PROVIDER_RPC_HTTP_PARTIAL_RESULT ') for line in lines),
            'PHASE_RESULT', 'HTTP result missing, duplicate or partial')
    try:
        value = read_json(rows[0], 'PHASE_RESULT')
    except BoundaryError as exc:
        raise BoundaryError('PHASE_RESULT', 'Invalid HTTP result JSON') from exc
    require(isinstance(value, dict) and value.get('phase') == phase
            and all(isinstance(value.get(key), list) for key in ('source', 'direct', 'taps')),
            'PHASE_RESULT', 'HTTP phase/result shape differs')
    if phase_set == 'd2':
        require(config.get('phaseSet') == value.get('phaseSet') == 'd2'
            and all(isinstance(value.get(key), list) for key in ('scenarios', 'openFindings'))
            and isinstance(value.get('counts'), dict), 'PHASE_RESULT', 'D2 result contract is incomplete')
    return value


def expected_binding(value):
    return {'orderId': value['order_id'], 'contextId': value['context_id'], 'provider': value['provider'],
            'environment': value['environment'], 'billingCountry': value['billing_country'], 'scope': value['scope'],
            'bindingId': value['binding_id'], 'bindingVersion': value['binding_version'], 'bindingHash': value['binding_hash'],
            'credentialRef': value['credential_ref'], 'expectedPayPalClientId': value['expected_application']['paypal_client_id']}


def validate_http(phase, result, native, cases, *, phase_set='d1'):
    phase_contract(phase_set)
    if phase_set == 'd2':
        return validate_d2_http(phase, result, native, cases)
    mapped = validate_cases(cases)
    require(phase in ('A', 'B', 'C') and isinstance(result, dict) and result.get('phase') == phase
            and all(isinstance(result.get(key), list) for key in ('source', 'direct', 'taps'))
            and isinstance(native, dict) and set(native) == LABELS, 'HTTP_COUNTS', 'Malformed D1 matrix')
    guard = result.get('guard')
    require(isinstance(guard, dict) and guard.get('blocked') == ['http', 'http-address', 'rpc-path', 'http-address'],
            'HTTP_GUARD', 'Expected exactly the four ordered guard probe denials')
    source, direct, taps = result['source'], result['direct'], result['taps']
    require(len(source) == 6 and all(isinstance(row, dict) for row in source)
            and {row.get('label') for row in source} == SOURCE_LABELS, 'HTTP_SOURCE', 'Source case set differs')
    for row in source:
        label = row['label']
        require(row.get('method') == 'POST' and type(row.get('fetchCount')) is int and row['fetchCount'] == 1,
                'HTTP_SOURCE', 'Source must perform exactly one POST fetch')
        if label == 'B1':
            value = native[label].get('value', {})
            require(value.get('binding_version') == '1' and value.get('order_id') == mapped[label]['order']
                    and value.get('provider') == 'PAYPAL', 'HTTP_SOURCE', 'B1 frozen native identity differs')
            wanted = {'ok': True, 'value': expected_binding(value)}
        elif label == 'B4':
            wanted = {'ok': False, 'name': 'ChargeRepositoryError', 'stage': 'RESPONSE'}
        else:
            outcome = {'B2': 'CONTEXT_REQUIRED', 'B3': 'VERIFICATION_BINDING_REQUIRED',
                       'NF_OTHER': 'NOT_FOUND', 'NF_UNKNOWN': 'NOT_FOUND'}[label]
            wanted = {'ok': True, 'value': {'kind': outcome}}
        require(row.get('result') == wanted, 'HTTP_SOURCE', 'Consumer result differs: ' + label)
    expected_direct = {(label, 'service', method) for label in LABELS
                       for method in (('POST',) if label.startswith('NF_NULL') else ('POST', 'GET'))}
    expected_direct |= {('B1', role, method) for role in ('anon', 'authenticated') for method in ('GET', 'POST')}
    require(len(direct) == 19 and all(isinstance(row, dict) for row in direct), 'HTTP_CASES', 'Direct case count differs')
    actual_direct = [(row.get('label'), row.get('role'), row.get('method')) for row in direct]
    require(len(set(actual_direct)) == 19 and set(actual_direct) == expected_direct, 'HTTP_CASES', 'Direct label/role/method set differs')
    for row in direct:
        status = row.get('status')
        if row['role'] == 'service':
            label = row['label']
            envelope = native[label]
            require(envelope.get('ok') is True and status == 200 and row.get('response') == envelope.get('value'),
                    'HTTP_NATIVE_PARITY', 'Service HTTP/native JSON differs: ' + label)
            value = row['response']
            require(value.get('contract_version') == 'web-payment-provider-binding.v1' and value.get('charge_authority') is False,
                    'HTTP_NATIVE_PARITY', 'Service binding contract differs')
            if value.get('outcome') == 'FOUND':
                require(value.get('order_id') == mapped[label]['order'] and type(value.get('binding_version')) is str,
                        'HTTP_NATIVE_PARITY', 'FOUND identity/version differs')
        else:
            require(type(status) is int and not 200 <= status < 300 and isinstance(row.get('response'), dict)
                    and row['response'].get('code') == '42501', 'HTTP_ACL', 'ACL response must be actual non2xx/42501')
        require(row.get('retryHeader') is None, 'HTTP_RETRY', 'Direct case has a retry header')
    retry = result.get('retry')
    require(isinstance(retry, dict) and set(retry) == ({'R_OFF', 'R_DEF'} if phase == 'A' else set()),
            'HTTP_RETRY', 'Retry cases are phase-A only')
    retry_taps = {}
    if phase == 'A':
        off, default = retry['R_OFF'], retry['R_DEF']
        require(off == {'fetchCount': 1, 'tapCount': 1, 'upstreamCount': 0, 'headers': [None], 'error': True},
                'HTTP_RETRY', 'retry(false) must be one injected fetch with no retry header')
        require(isinstance(default, dict) and type(default.get('fetchCount')) is int and default['fetchCount'] > 0
                and default.get('tapCount') == default['fetchCount'] and default.get('upstreamCount') == 0
                and default.get('error') is True
                and default.get('headers') == [None, *[str(n) for n in range(1, default['fetchCount'])]],
                'HTTP_RETRY', 'Default SDK retry observations are inconsistent')
        retry_taps = {'R_OFF': off, 'R_DEF': default}
    expected_tap_count = 6 + sum(row['tapCount'] for row in retry_taps.values())
    require(len(taps) == expected_tap_count and all(isinstance(row, dict) for row in taps), 'HTTP_TAPS', 'Proxy tap count differs')
    source_taps = [row for row in taps if row.get('label') in SOURCE_LABELS]
    require(len(source_taps) == 6 and {row['label'] for row in source_taps} == SOURCE_LABELS,
            'HTTP_TAPS', 'Proxy source labels are duplicate/missing')
    for row in source_taps:
        require(row.get('method') == 'POST' and row.get('status') == 200 and row.get('retryHeader') is None
                and row.get('injected') is False and row.get('upstream') is True
                and row.get('response') == native[row['label']]['value'], 'HTTP_TAPS', 'Proxy source evidence differs')
    for label, retry_row in retry_taps.items():
        rows = [row for row in taps if row.get('label') == label]
        require(len(rows) == retry_row['tapCount'] and [row.get('retryHeader') for row in rows] == retry_row['headers']
                and all(row.get('method') == 'GET' and row.get('status') == 503 and row.get('injected') is True
                        and row.get('upstream') is False and row.get('retryAfter') == '0' for row in rows),
                'HTTP_TAPS', 'Injected retry taps must never reach PostgREST')
    require(all(row.get('label') in SOURCE_LABELS | set(retry_taps) for row in taps), 'HTTP_TAPS', 'Unapproved proxy case')
    for row in taps:
        headers = row.get('sdkHeaders')
        post = row['method'] == 'POST'
        wanted = {'accept': None, 'prefer': None, 'contentType': 'application/json' if post else None,
                  'contentProfile': 'public' if post else None, 'acceptProfile': None if post else 'public',
                  'apikeyMatches': True, 'authorizationMatches': True, 'clientInfoVersion': '2.112.3'}
        require(isinstance(headers, dict) and headers == wanted
                and headers.get('apikeyMatches') is True and headers.get('authorizationMatches') is True,
                'HTTP_HEADERS', 'SDK semantic request headers differ: ' + row['label'])
    require(result.get('counts') == {'source': 6, 'direct': 19, 'fixedProxy': 7 if phase == 'A' else 6, 'postgrest': 25},
            'HTTP_COUNTS', 'Summary counts differ from fixed matrix')
    return {'postgrestRequests': 25, 'fixedProxyTaps': 7 if phase == 'A' else 6, 'serviceDirect': 15, 'aclDirect': 4,
            'defaultRetryObservation': copy.deepcopy(retry.get('R_DEF'))}


def validate_request_policy(request, config, *, phase_set='d1'):
    """Validate one runner request description, independently of Node wrappers."""
    phase_contract(phase_set)
    try:
        require(isinstance(request, dict) and set(request) == {'url', 'method', 'query'}, 'HTTP_POLICY', 'Request fields differ')
        url = urlsplit(request['url'])
        method, query = request['method'], request['query']
        require(url.scheme == 'http' and not url.username and not url.password and not url.fragment and not url.query
            and method in ('POST', 'GET') and isinstance(query, list), 'HTTP_POLICY', 'Request method/URL differs')
        direct = url.hostname == config['restIp'] and url.port == 3000
        proxy = url.hostname == '127.0.0.1' and type(config.get('proxyPort')) is int and url.port == config['proxyPort']
        require(direct or proxy, 'HTTP_POLICY', 'Request is outside the owned addresses')
        prefix = '/rpc/' if direct else '/rest/v1/rpc/'
        require(url.path.startswith(prefix), 'HTTP_POLICY', 'RPC path prefix differs')
        rpc = url.path[len(prefix):]
        allowed = set(D2_RPC.values()) if phase_set == 'd2' else {D2_RPC['binding']}
        require(rpc in allowed, 'HTTP_POLICY', 'Unapproved RPC')
        if method == 'POST':
            require(not query, 'HTTP_POLICY', 'POST query is forbidden')
            return
        keys = {'p_actor_user_id', 'p_order_id'}
        if phase_set == 'd2' and rpc not in D2_STABLE:
            require(direct and rpc == D2_RPC['entry'], 'HTTP_POLICY', 'Nonstable GET is forbidden')
            keys |= {'p_context_id', 'p_create_request_key', 'p_binding_hash'}
        require(all(isinstance(row, (tuple, list)) and len(row) == 2 for row in query), 'HTTP_POLICY', 'Malformed query')
        values = dict(query)
        require(len(values) == len(query) == len(keys) and set(values) == keys
            and all(isinstance(value, str) and (HASH if key == 'p_binding_hash' else UUID).fullmatch(value)
                for key, value in values.items()), 'HTTP_POLICY', 'GET query is incomplete or malformed')
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise BoundaryError('HTTP_POLICY', 'Malformed request policy evidence') from exc


def validate_d2_http(phase, result, before, cases):
    try:
        _validate_d2_http(phase, result, before, cases)
    except (KeyError, TypeError, ValueError, AttributeError, IndexError) as exc:
        raise BoundaryError('D2_HTTP', 'Incomplete D2 HTTP evidence') from exc
    counts = D2_COUNTS[phase]
    return {'postgrestRequests': counts['postgrest'], 'setupProxyTaps': counts['setupProxy'],
            'measuredProxyTaps': counts['measuredProxy'], 'directRequests': counts['direct']}


def _validate_d2_http(phase, result, before, cases):
    def check(condition, message):
        require(condition, 'D2_HTTP', message)
    mapped = validate_cases(cases, phase_set='d2')
    check(phase in D2_TAP_PLAN and valid_observation(before, 'baseline' + phase, phase_set='d2'), 'Missing native baseline')
    check(result['phaseSet'] == 'd2' and result['phase'] == phase and result['source'] == []
          and result['guard']['blocked'] == D2_PROBES and result['counts'] == D2_COUNTS[phase], 'Phase/count/guard contract differs')
    stamps = result['nativeTimestampEvidence']
    check(isinstance(stamps, dict) and stamps.get('timezone') == 'UTC' and 'entryNotAfter' in stamps
          and (stamps['entryNotAfter'] is None or isinstance(stamps['entryNotAfter'], str)
               and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?\+00:00', stamps['entryNotAfter'])), 'Native timestamp evidence missing')
    scenarios = result['scenarios']
    check(isinstance(scenarios, list) and len(scenarios) == len(D2_TAP_PLAN[phase])
          and all(isinstance(row, dict) for row in scenarios), 'Scenario count differs')
    by_name = {row['label']: row for row in scenarios}
    check(set(by_name) == set(D2_TAP_PLAN[phase]), 'Scenario identities differ')
    taps = result['taps']
    check(isinstance(taps, list) and len(taps) == D2_COUNTS[phase]['setupProxy'] + D2_COUNTS[phase]['measuredProxy'], 'Tap count differs')
    tap_keys = {'label', 'orderLabel', 'scope', 'lane', 'step', 'rpc', 'method', 'args', 'status', 'response',
                'upstream', 'injected', 'retryHeader', 'sdkHeaders', 'incomingHeaders', 'leaseTokenMatchesClaim', 'downstreamDestroyed'}
    headers = {'accept': None, 'prefer': None, 'contentType': 'application/json', 'contentProfile': 'public',
               'acceptProfile': None, 'apikeyMatches': True, 'authorizationMatches': True, 'clientInfoVersion': '2.112.3'}
    for tap in taps:
        check(isinstance(tap, dict) and set(tap) == tap_keys and tap['label'] in by_name
              and tap['orderLabel'] in D2_LABELS and tap['scope'] in ('setup', 'measured')
              and type(tap['lane']) is int and type(tap['step']) is int and tap['method'] == 'POST'
              and type(tap['status']) is int and tap['status'] == 200 and tap['upstream'] is True
              and tap['injected'] is False and tap['retryHeader'] is None, 'Tap request/reach evidence differs')
        for key, wanted in (('sdkHeaders', headers), ('incomingHeaders', {**headers, 'accept': '*/*'})):
            check(tap[key] == wanted and all(type(tap[key][k]) is bool for k in ('apikeyMatches', 'authorizationMatches')), 'Semantic headers differ')
    fake_counts = {
        'F1': ((0,0,0,0),(2,1,1,1)), 'F2': ((0,0,0,0),(2,2,0,0)), 'F3a': ((0,0,0,0),(1,1,0,0)),
        'F4a': ((0,0,0,0),(2,2,0,0)), 'F4b': ((0,0,0,0),(2,2,0,0)), 'F4b-refusal': ((0,0,0,0),(0,0,0,0)),
        'F5': ((0,0,0,0),(3,1,2,0)), 'F5prime': ((0,0,0,0),(3,1,3,1)), 'F6': ((1,1,0,0),(0,0,0,0)),
        'F7a': ((0,0,0,0),(0,0,0,0)), 'L1a': ((0,0,0,0),(0,0,0,0)),
        'L1-CLAIM': ((1,1,0,0),(0,0,0,0)), 'L1b': ((0,0,0,0),(0,0,0,0)),
        'N-A': ((0,0,0,0),(3,1,2,1)), 'N-B': ((0,0,0,0),(3,1,2,1)), 'N-C': ((0,0,0,0),(3,1,2,1)),
        'F7b': ((0,0,0,0),(1,0,0,0)), 'F3b': ((0,0,0,0),(1,0,0,0)), 'C-READS': ((0,0,0,0),(0,0,0,0))}
    for name, (label, setup_plan, measured_plan) in D2_TAP_PLAN[phase].items():
        scenario = by_name[name]
        check(scenario['orderLabel'] == label, 'Scenario order differs')
        selected = [t for t in taps if t['label'] == name]
        expected_groups = {}
        for scope, plan in (('setup', setup_plan), ('measured', measured_plan)):
            for lane in range(2 if name in ('F4a', 'F4b') and scope == 'measured' else 1):
                if plan:
                    expected_groups[(scope, lane)] = plan.split()
        if name == 'C-READS':
            check(len(selected) == 28 and scenario['fakeCalls'] == [] and scenario['setupEvidence'] is None, 'C read count/setup differs')
            for read_label in D2_LABELS:
                rows = [t for t in selected if t['orderLabel'] == read_label]
                check([t['rpc'] for t in rows] == [D2_RPC['getter'], D2_RPC['binding']], 'C read surface differs')
                for row, key in zip(rows, ('context', 'binding')):
                    check(row['response'] == before['bridgeNative'][read_label][key]
                          and row['args'] == {'p_actor_user_id': ACTORS['A'], 'p_order_id': mapped[read_label]['order']}, 'C native parity differs')
        else:
            groups = {(t['scope'], t['lane']) for t in selected}
            check(groups == set(expected_groups), 'Unexpected/missing setup or lane')
            prepared = None
            claim = None
            for group, plan in expected_groups.items():
                rows = [t for t in selected if (t['scope'], t['lane']) == group]
                check(len(rows) == len(plan) and [t['step'] for t in rows] == list(range(len(plan)))
                      and [t['rpc'] for t in rows] == [D2_RPC[op] for op in plan], 'RPC sequence differs')
                for op, tap in zip(plan, rows):
                    check(tap['orderLabel'] == label and isinstance(tap['response'], dict), 'Tap response/order missing')
                    args, response = tap['args'], tap['response']
                    actor = {'p_actor_user_id': ACTORS['A'], 'p_order_id': mapped[label]['order']}
                    keys = {'getter': set(actor), 'prepare': set(actor), 'binding': set(actor),
                        'entry': set(actor) | {'p_context_id','p_create_request_key','p_binding_hash'},
                        'bind': {'p_context_id','p_evidence'}, 'record': {'p_context_id','p_evidence'},
                        'claim': set(actor) | {'p_expected_version','p_action'},
                        'intent': set(actor) | {'p_expected_version','p_action','p_attempt_id','p_lease_token','p_fencing_version'},
                        'receive': {'p_order_id','p_observation_id'}}[op]
                    check(isinstance(args, dict) and set(args) == keys and all(args[k] == v for k,v in actor.items() if k in keys), 'RPC arguments differ')
                    if op == 'prepare' and response.get('outcome') == 'PREPARED':
                        prepared = response
                        check(response.get('order_id') == mapped[label]['order'] and UUID.fullmatch(response['context_id'])
                              and UUID.fullmatch(response['create_request_key']), 'Prepared identity differs')
                    if op == 'entry':
                        check(response.get('contract_version') == 'web-payment-provider-entry.v1' and response.get('charge_authority') is False, 'Entry envelope differs')
                        if response.get('outcome') == 'AUTHORIZED':
                            check(response.get('context_id') == args['p_context_id']
                                  and response.get('create_request_key') == args['p_create_request_key']
                                  and response.get('binding_hash') == args['p_binding_hash'], 'Entry echo differs')
                    if op in ('bind', 'record'):
                        check(args['p_evidence'].get('order_id') == mapped[label]['order'], 'Evidence crosses order ownership')
                    if op == 'claim' and response.get('decision') == 'SUBMIT':
                        claim = response
                    if op == 'intent':
                        check(args['p_lease_token'] == '<redacted>' and tap['leaseTokenMatchesClaim'] is True
                              and claim is not None and args['p_attempt_id'] == claim['attempt_id']
                              and args['p_fencing_version'] == claim['fencing_version'], 'Intent capability mismatch')
                    else:
                        check(tap['leaseTokenMatchesClaim'] is None, 'Unexpected capability projection')
                    check(tap['downstreamDestroyed'] is (name == 'F5' and op == 'intent'), 'Intent loss boundary differs')
                    if name in ('F4a', 'F4b') and group[0] == 'measured':
                        seed = scenario['setupEvidence']['prepared']
                        if op == 'prepare':
                            check(response['replayed'] is True and response['context_id'] == seed['contextId']
                                  and response['create_request_key'] == seed['createRequestKey'], 'Concurrent replay differs')
                        if op == 'entry':
                            check(args['p_context_id'] == seed['contextId'] and args['p_create_request_key'] == seed['createRequestKey'], 'Concurrent tuple differs')
            if name in ('F4a','F4b'):
                seed = scenario['setupEvidence']; getter = seed['getter']; p = seed['prepared']
                check(p['kind'] == 'PREPARED' and p['replayed'] is False and getter == {
                    'contextId': p['contextId'], 'verificationBindingPresent': True, 'providerOrderId': None,
                    'reviewRequired': False, 'attemptId': None, 'submissionIntentRecorded': False}
                    and scenario['barrier'] == {'arrivals': 2, 'released': True, 'timedOut': False}, 'Concurrent setup/barrier differs')
            if name == 'F6':
                seed = scenario['setupEvidence']
                check(seed == {'outcome': {'kind':'REVIEW_REQUIRED'}, 'createCount':1, 'reasonObserved':'PROVIDER_SCOPE_MISMATCH',
                    'getter': {'reviewRequired':True,'providerOrderId':None,'attemptId':None,'paymentState':'NOT_SUBMITTED'}}, 'Stored review setup differs')
            if name == 'L1-CLAIM':
                seed = scenario['setupEvidence']
                getter = next(t['response'] for t in selected if t['rpc'] == D2_RPC['getter'] and t['step'] == 7)
                check(seed['claim'] == {'kind':'SUBMIT'} and seed['submissionIntentRecorded'] is False
                      and seed['paymentState'] == 'NOT_SUBMITTED' and seed['reviewRequired'] is False
                      and seed['rowVersion'] == getter['row_version'] and seed['attemptId'] == getter['attempt_id'], 'Claim-only setup differs')
            calls = scenario['fakeCalls']
            check(isinstance(calls,list) and all(set(c) == {'scope','method','requestKey','providerOrderId','response'} for c in calls), 'Fake transport evidence fields differ')
            for scope, counts in zip(('setup','measured'),fake_counts[name]):
                rows = [c for c in calls if c['scope'] == scope]
                check(len(rows) == sum(counts), 'Fake transport count differs')
                for method, count in zip(('requestToken','createOrder','getOrder','captureOrder'),counts):
                    actual = [c for c in rows if c['method'] == method]
                    check(len(actual) == count, 'Fake transport method count differs')
                    for call in actual:
                        if method == 'createOrder':
                            check(prepared is not None and call['requestKey'] == prepared['create_request_key'], 'CREATE key differs')
                        elif method == 'captureOrder':
                            check(claim is not None and call['requestKey'] == claim['provider_request_key']
                                  and call['requestKey'] != prepared['create_request_key'], 'CAPTURE key differs')
                        else:
                            check(call['requestKey'] is None, 'Unexpected request key')
            if name in ('F2','F3a'):
                check(next(c for c in calls if c['method']=='createOrder')['response'] == {'kind':'TRANSPORT_UNKNOWN'}, 'Unknown create fact differs')
            if name.startswith('N-'):
                rows = [t for t in selected if t['scope']=='measured' and t['lane']==0]
                order_id = 'ORDER'+name.replace('-','')
                capture_id = 'CAPTURE'+name.replace('-','')
                order = mapped[label]['order']
                account = rows[1]['response']['scope']['account_id']
                expected_scope = {'account_id':account,'merchant_id':'binding-merchant-v1'}
                check(isinstance(account,str) and account, 'N prepared scope differs: '+name)
                for step in (1,6,13):
                    check(rows[step]['response']['scope']==expected_scope, 'N prepared scope differs: '+name)
                for step in (2,7,14):
                    check(rows[step]['response']['scope']==expected_scope, 'N binding scope differs: '+name)
                expected_body = {'id':order_id,'status':'CREATED','intent':'CAPTURE','purchase_units':[{
                    'custom_id':'v2:'+order,'amount':{'value':'1.23','currency_code':'USD'},
                    'payee':{'merchant_id':'binding-merchant-v1'},'payments':{'captures':[]}}]}
                create = next(c for c in calls if c['method']=='createOrder')
                check(create['response']=={'kind':'RESPONSE','status':200,'body':expected_body}
                      and create['providerOrderId']==order_id, 'N CREATE body differs: '+name)
                gets = [c for c in calls if c['method']=='getOrder']
                expected_first = copy.deepcopy(expected_body)
                expected_first['status']='APPROVED'
                check(gets[0]['response']=={'kind':'RESPONSE','status':200,'body':expected_first}
                      and gets[0]['providerOrderId']==order_id, 'N first GET differs: '+name)
                expected_capture = copy.deepcopy(expected_body)
                expected_capture['status']='COMPLETED' if name=='N-B' else 'FUTURE_ORDER'
                expected_capture['purchase_units'][0]['payments']['captures']=[{'id':capture_id,'status':'COMPLETED',
                    'amount':{'value':'2.34' if name=='N-A' else '1.23','currency_code':'USD'}}]
                if name=='N-A':
                    del expected_capture['intent']
                elif name=='N-B':
                    expected_capture['intent']='AUTHORIZE'
                capture = next(c for c in calls if c['method']=='captureOrder')
                check(capture['response']=={'kind':'RESPONSE','status':200,'body':expected_capture}
                      and capture['providerOrderId']==order_id, 'N capture body differs: '+name)
                expected_followup = copy.deepcopy(expected_capture)
                expected_followup.update(status='COMPLETED',intent='CAPTURE')
                expected_followup['purchase_units'][0]['payments']['captures'][0]['amount']['value']='1.23'
                check(gets[1]['response']=={'kind':'RESPONSE','status':200,'body':expected_followup}
                      and gets[1]['providerOrderId']==order_id, 'N followup GET differs: '+name)
                observation_ids = set()
                for step in (4,10,11,15):
                    is_capture = step in (11,15)
                    status = 'CREATED' if step==4 else 'FUTURE_ORDER' if step==10 and name!='N-B' else 'COMPLETED'
                    kind = 'CAPTURE' if is_capture else 'ORDER'
                    external_id = capture_id if is_capture else order_id
                    wanted_evidence = {'source':'CREATE_RESPONSE' if step==4 else 'LOOKUP' if step==15 else 'SUBMIT_RESPONSE',
                        'key':kind+':'+external_id+':'+status,'provider':'PAYPAL','environment':'SANDBOX',
                        'identity_kind':kind,'external_id':external_id,'parent_external_id':order_id if is_capture else None,
                        'order_id':order,'user_id':ACTORS['A'],'quote_hash':rows[1]['response']['quote_hash'],
                        'order_reference':'v2:'+order,'scope':expected_scope,
                        'amount_minor':'234' if name=='N-A' and step==11 else '123','currency':'USD','status':status}
                    actual = rows[step]['args']['p_evidence']
                    check(rows[step]['args']['p_context_id']==rows[1]['response']['context_id']
                          and set(actual)==set(wanted_evidence)|{'payload_hash'} and pin(actual['payload_hash'])
                          and {k:v for k,v in actual.items() if k!='payload_hash'}==wanted_evidence,
                          'N evidence differs: '+name+' step '+str(step))
                    response = rows[step]['response']
                    reason = {('N-A',10):'UNRECOGNIZED_STATUS',('N-A',11):'AMOUNT_MISMATCH',
                        ('N-B',11):'IDENTITY_NOT_BOUND',('N-C',10):'UNRECOGNIZED_STATUS'}.get((name,step))
                    observation_id = response.get('observation_id')
                    check(isinstance(observation_id,str) and UUID.fullmatch(observation_id)
                          and observation_id not in observation_ids and response=={
                              'outcome':'REVIEW_REQUIRED' if reason else 'RECORDED','reason_code':reason,
                              'trust':'SERVER_REPORTED','observation_id':observation_id,'replayed':False}
                          and response['replayed'] is False, 'N observation outcome differs: '+name+' step '+str(step))
                    observation_ids.add(observation_id)
                snapshot = rows[12]['response']
                r0 = rows[5]['response']['row_version']
                check(isinstance(r0,str) and re.fullmatch(r'0|[1-9][0-9]*',r0)
                      and snapshot['quote_hash']==rows[1]['response']['quote_hash']
                      and snapshot['context_id']==rows[1]['response']['context_id']
                      and snapshot['review_required'] is True and snapshot['provider_order_id']==order_id
                      and snapshot['provider_capture_id']==(capture_id if name=='N-C' else None)
                      and snapshot['payment_state']=='SUBMISSION_UNKNOWN' and snapshot['submission_intent_recorded'] is True
                      and snapshot['settlement_state']=='NOT_INTAKE' and snapshot['row_version']==str(int(r0)+2)
                      and snapshot['attempt_id']==rows[8]['response']['attempt_id'], 'N snapshot differs: '+name)
                check(rows[16]['response']=={'contract_version':'web-payment-provider-entry.v1',
                      'outcome':'ORDER_LINKED','charge_authority':False} and rows[16]['response']['charge_authority'] is False,
                      'N entry differs: '+name)
                submitted = rows[8]['response']
                check(rows[17]['args']['p_expected_version']==snapshot['row_version'] and rows[17]['response']=={
                    'decision':'LOOKUP_ONLY','safe_reason_code':'SUBMISSION_UNKNOWN','attempt_id':submitted['attempt_id'],
                    'provider_request_key':submitted['provider_request_key'],'fencing_version':submitted['fencing_version'],
                    'row_version':snapshot['row_version'],'quote_hash':snapshot['quote_hash']}, 'N claim differs: '+name)
        outcomes = scenario['outcomes']
        check(isinstance(outcomes,list) and all(isinstance(o,dict) for o in outcomes), 'Outcomes missing')
        kinds = [o.get('kind') for o in outcomes]
        expected = {'F1':['PROVIDER_ORDER_READY','INTAKE_PENDING'],'F2':['SUBMISSION_UNKNOWN','PROVIDER_ORDER_READY'],
            'F3a':['SUBMISSION_UNKNOWN'],'F4a':['PROVIDER_ORDER_READY']*2,'F4b-refusal':['REVIEW_REQUIRED','ORDER_LINKED'],
            'F5':['PROVIDER_ORDER_READY','SUBMISSION_UNKNOWN','SUBMISSION_UNKNOWN','LOOKUP_ONLY'],
            'F5prime':['PROVIDER_ORDER_READY','SUBMISSION_UNKNOWN','UNAVAILABLE'],
            'F6':['REVIEW_REQUIRED','BLOCKED','BLOCKED'],'F7a':['PREPARED'],
            'L1a':['BLOCKED','BLOCKED','BLOCKED','ORDER_LINKED'],'L1-CLAIM':['ORDER_LINKED'],'L1b':['ORDER_LINKED'],
            'F7b':['BLOCKED'],'F3b':['BLOCKED'],'C-READS':[]}
        if name == 'F4b':
            check(sorted(kinds) == ['PROVIDER_ORDER_READY','REVIEW_REQUIRED'], 'Different-ID outcomes differ')
        elif not name.startswith('N-'):
            check(kinds == expected[name], 'Scenario outcome differs: ' + name)
        else:
            check(outcomes==[{'kind':'PROVIDER_ORDER_READY','providerOrderId':'ORDER'+name.replace('-',''),'replayed':False},
                {'kind':'REVIEW_REQUIRED'},{'kind':'REVIEW_REQUIRED'},{'kind':'ORDER_LINKED'},{'kind':'LOOKUP_ONLY'}]
                and outcomes[0]['replayed'] is False, 'N outcomes differ: '+name)
        if name == 'F5prime':
            check(outcomes[2] == {'kind':'UNAVAILABLE','stage':'LOOKUP'}, 'Recovery GET must be exact UNAVAILABLE LOOKUP')
        for outcome in outcomes:
            if outcome.get('kind') == 'PROVIDER_ORDER_READY':
                order_ids = [c['response']['body']['id'] for c in scenario['fakeCalls'] if c['method']=='createOrder' and c['response']['kind']=='RESPONSE']
                check(outcome.get('providerOrderId') in order_ids and outcome.get('replayed') is (name in ('F2','F4a','F4b')), 'Ready identity/replay differs')
        if name == 'F4a':
            check(outcomes[0] == outcomes[1], 'Same-ID outcomes differ')
        reasons = {'L1a':['CONTEXT_MISMATCH','CONTEXT_MISMATCH','BINDING_MISMATCH'],
                   'F6':['REVIEW_REQUIRED','REVIEW_REQUIRED'], 'F7b':['VERIFICATION_BINDING_CHANGED'], 'F3b':['ORDERS_CLOSED']}
        if name in reasons:
            check([o.get('reason') for o in outcomes if o['kind']=='BLOCKED'] == reasons[name], 'Gate/claim refusal differs')
    direct = result['direct']
    check(isinstance(direct,list) and len(direct) == D2_COUNTS[phase]['direct'], 'Direct count differs')
    if phase == 'A':
        identities = [(r['role'],r['rpc'],r['method']) for r in direct]
        expected = {(role,rpc,'POST') for role in ('anon','authenticated') for rpc in D2_RPC.values()}
        expected |= {('service',rpc,'GET') for rpc in (*D2_STABLE,D2_RPC['entry'])}
        expected |= {('service',D2_RPC['entry'],'POST')}
        expected |= {(role,D2_RPC['entry'],'GET') for role in ('anon','authenticated')}
        check(len(set(identities))==24 and set(identities)==expected, 'Direct matrix differs')
        entry_tuple = None
        entry_response = None
        for row in direct:
            check(row['label']=='ORD-ACL' and row['retryHeader'] is None and type(row['status']) is int
                  and 100 <= row['status'] <= 599 and isinstance(row['response'], dict)
                  and isinstance(row['rawBody'], str) and len(row['rawBody'].encode('utf-8')) <= 65536
                  and row['parseError'] is None, 'Direct wire evidence missing, malformed or overflowed')
            check(read_json(row['rawBody'], 'D2_HTTP') == row['response'], 'Direct raw/parsed response differs')
            if row['rpc'] == D2_RPC['entry'] and (row['method'] == 'GET' or row['role'] == 'service'):
                args = row['query'] if row['method'] == 'GET' else row['args']
                check(isinstance(args, dict) and set(args) == {'p_actor_user_id','p_order_id','p_context_id','p_create_request_key','p_binding_hash'}
                      and args['p_actor_user_id'] == ACTORS['A'] and args['p_order_id'] == mapped['ORD-ACL']['order']
                      and all(isinstance(args[key], str) and UUID.fullmatch(args[key]) for key in ('p_context_id','p_create_request_key'))
                      and pin(args['p_binding_hash']) and row.get('proxy',False) is False, 'Direct entry tuple differs')
                if entry_tuple is None:
                    entry_tuple = args
                check(args == entry_tuple, 'Direct entry GET/POST tuples differ')
            if row['role'] != 'service':
                check(not 200<=row['status']<300 and row['response'].get('code')=='42501', 'ACL is not actual non2xx/42501')
            else:
                if row['rpc']==D2_RPC['entry']:
                    check(row['status'] == 200 and row['response'] == {'contract_version':'web-payment-provider-entry.v1',
                        'outcome':'BLOCKED','charge_authority':False,'safe_reason_code':'CONTEXT_REQUIRED'}
                        and row['response']['charge_authority'] is False, 'Service entry read contract differs')
                    if entry_response is None:
                        entry_response = row['response']
                    check(row['response'] == entry_response, 'Service entry GET/POST responses differ')
                else:
                    check(set(row['query'])=={'p_actor_user_id','p_order_id'}
                          and row['query']['p_order_id']==mapped['ORD-ACL']['order']
                          and row['query']['p_actor_user_id']==ACTORS['A'] and row.get('proxy',False) is False, 'Direct GET query differs')
                    key='context' if row['rpc']==D2_RPC['getter'] else 'binding'
                    check(row['status']==200 and row['response']==before['bridgeNative']['ORD-ACL'][key], 'Stable native parity differs')


def validate_d2_state(phase, before, after, result, cases):
    try:
        _validate_d2_state(phase, before, after, result, cases)
    except (KeyError, TypeError, ValueError, AttributeError, IndexError) as exc:
        raise BoundaryError('D2_STATE', 'Incomplete D2 state evidence') from exc


def _validate_d2_state(phase, before, after, result, cases):
    def check(condition, message):
        require(condition, 'D2_STATE', message)
    mapped = validate_cases(cases, phase_set='d2')
    check(phase in 'ABC' and valid_observation(before,'baseline'+phase,phase_set='d2')
          and valid_observation(after,'after'+phase,phase_set='d2'), 'Observer schema differs')
    check(all(before[k]==after[k] for k in ('controlDigest','controlState','native')), 'HTTP changed control/D1 native state')
    if phase != 'A':
        check(all(before[k]==after[k] for k in ('productDigest','productState','orderFacts','bridgeNative')), 'B/C must preserve product/native state')
        return
    old, new = before['productState'], after['productState']
    orders_old = {r['id']:r for r in old['web_payment_orders']}
    orders_new = {r['id']:r for r in new['web_payment_orders']}
    check(len(orders_old)==len(old['web_payment_orders']) and len(orders_new)==len(new['web_payment_orders'])
          and set(orders_old)==set(orders_new), 'Order identity set differs')
    owned = {mapped[l]['order'] for l in D2_LABELS if l!='ORD-ACL'}
    allowed_order = {'row_version','payment_state','settlement_state','updated_at'}
    for oid, row in orders_old.items():
        check(row==orders_new[oid] if oid not in owned else
              {k:v for k,v in row.items() if k not in allowed_order}=={k:v for k,v in orders_new[oid].items() if k not in allowed_order}, 'Order immutable/nonowned fields changed')
    changing = {'web_payment_orders','web_payment_provider_contexts','web_payment_provider_links','web_payment_observations',
                'web_payment_charge_attempts','web_payment_purchase_intakes','receipts','wallet_provider_event_inbox'}
    for table in PRODUCT_TABLES - changing:
        check(old[table]==new[table], 'Unapproved table changed: '+table)
    contexts = new['web_payment_provider_contexts']
    context_owner = {r['id']:r['order_id'] for r in contexts}
    check(len(context_owner)==len(contexts), 'Duplicate context')
    for table in changing - {'web_payment_orders'}:
        rows = new[table]
        identity = 'order_id' if table=='web_payment_purchase_intakes' else 'id'
        check(len({r[identity] for r in rows})==len(rows), 'Duplicate raw row: '+table)
        check(all(r in rows for r in old[table]), 'Historical row changed: '+table)
        for row in rows:
            if row in old[table]:
                continue
            if table in ('web_payment_provider_contexts','web_payment_charge_attempts','web_payment_purchase_intakes'):
                owner=row['order_id']
            elif table=='receipts':
                owner=row.get('verification_data',{}).get('order_id')
            elif table=='wallet_provider_event_inbox':
                prefix='web-payment.purchase.v2:'
                check(row['idempotency_key'].startswith(prefix), 'Inbox key differs')
                owner=row['idempotency_key'][len(prefix):]
            else:
                owner=context_owner.get(row.get('context_id') or row.get('requested_context_id'))
                if table=='web_payment_observations':
                    check(row['evidence'].get('order_id')==owner, 'Observation evidence crosses context owner')
            check(owner in owned and (owner==mapped['F1']['order'] if table in ('receipts','wallet_provider_event_inbox','web_payment_purchase_intakes') else True), 'Write outside owned rows')
    for label in D2_LABELS:
        oid=mapped[label]['order']; fact=after['orderFacts'][label]; base=before['orderFacts'][label]
        row=orders_new[oid]; ctx=[r for r in contexts if r['order_id']==oid]; ids={r['id'] for r in ctx}
        links=[{'identityKind':r['identity_kind'],'externalId':r['external_id']} for r in new['web_payment_provider_links'] if r['context_id'] in ids]
        observations=[{'source':r['source'],'identityKind':r['evidence']['identity_kind'],'outcome':r['outcome'],'reasonCode':r['reason_code']}
            for r in new['web_payment_observations'] if (r.get('context_id') or r.get('requested_context_id')) in ids]
        attempts=[r for r in new['web_payment_charge_attempts'] if r['order_id']==oid]
        intakes=[r for r in new['web_payment_purchase_intakes'] if r['order_id']==oid]
        receipts=[r for r in new['receipts'] if r.get('verification_data',{}).get('order_id')==oid]
        inbox=[r for r in new['wallet_provider_event_inbox'] if r['idempotency_key']=='web-payment.purchase.v2:'+oid]
        raw = {'orderId':oid,'contextCount':len(ctx),'links':links,'observations':observations,'attemptCount':len(attempts),
               'submissionIntentRecorded':any(r.get('submission_intent_at') is not None for r in attempts),
               'paymentState':row['payment_state'],'settlementState':row['settlement_state'],'rowVersion':row['row_version'],
               'intakeCount':len(intakes),'inboxCount':len(inbox),'receiptCount':len(receipts)}
        # Array order is not a database invariant. Compare exact multisets.
        normalize=lambda rows: sorted(json.dumps(r,sort_keys=True) for r in rows)
        check(set(fact)==set(raw) and all(normalize(fact[k])==normalize(raw[k]) if k in ('links','observations') else fact[k]==raw[k] and type(fact[k]) is type(raw[k]) for k in raw), 'Summary/raw rows disagree: '+label)
        native=after['bridgeNative'][label]['context']
        check(native['row_version']==fact['rowVersion'] and native['payment_state']==fact['paymentState']
              and native['settlement_state']==fact['settlementState'] and native['submission_intent_recorded'] is fact['submissionIntentRecorded']
              and native['context_id']==(ctx[0]['id'] if ctx else None)
              and native['attempt_id']==(attempts[0]['id'] if attempts else None)
              and native['review_required'] is any(r['outcome']=='REVIEW_REQUIRED' for r in observations), 'Native/raw disagreement')
        for kind, key in (('ORDER','provider_order_id'),('CAPTURE','provider_capture_id')):
            values=[r['externalId'] for r in links if r['identityKind']==kind]
            check(len(values)<=1 and native[key]==(values[0] if values else None), 'Native link disagreement')
        for version in (base['rowVersion'],fact['rowVersion']):
            check(isinstance(version,str) and re.fullmatch(r'0|[1-9][0-9]*',version), 'Version must be canonical bigint string')
        if label in D2_END_STATES:
            c,o,cap,obs,a,intent,payment,settlement,delta,intake=D2_END_STATES[label]
            check((len(ctx),sum(r['identityKind']=='ORDER' for r in links),sum(r['identityKind']=='CAPTURE' for r in links),len(observations),len(attempts),fact['submissionIntentRecorded'],fact['paymentState'],fact['settlementState'],int(fact['rowVersion'])-int(base['rowVersion']),len(intakes))
                  ==(c,o,cap,obs,a,intent,payment,settlement,delta,intake), 'Exact end state differs: '+label)
            expected=[]
            if obs:
                expected=[{'source':'CREATE_RESPONSE','identityKind':'ORDER','outcome':'REVIEW_REQUIRED' if label=='F6' else 'RECORDED','reasonCode':'PROVIDER_SCOPE_MISMATCH' if label=='F6' else None}]
            if label=='F1':
                expected.append({'source':'SUBMIT_RESPONSE','identityKind':'CAPTURE','outcome':'RECORDED','reasonCode':None})
            if label=='F4b':
                expected.append({'source':'CREATE_RESPONSE','identityKind':'ORDER','outcome':'REVIEW_REQUIRED','reasonCode':'IDENTITY_ALREADY_BOUND'})
            if label in ('N-A','N-B','N-C'):
                expected += [
                    {'source':'SUBMIT_RESPONSE','identityKind':'ORDER',
                     'outcome':'RECORDED' if label=='N-B' else 'REVIEW_REQUIRED',
                     'reasonCode':None if label=='N-B' else 'UNRECOGNIZED_STATUS'},
                    {'source':'SUBMIT_RESPONSE','identityKind':'CAPTURE',
                     'outcome':'RECORDED' if label=='N-C' else 'REVIEW_REQUIRED',
                     'reasonCode':{'N-A':'AMOUNT_MISMATCH','N-B':'IDENTITY_NOT_BOUND','N-C':None}[label]},
                    {'source':'LOOKUP','identityKind':'CAPTURE','outcome':'RECORDED','reasonCode':None}]
            check(normalize(observations)==normalize(expected), 'Observation class differs: '+label)
            if label in ('N-A','N-B','N-C'):
                prepared = next(t['response'] for t in result['taps'] if t['label']==label and t['step']==1)
                check(after['bridgeNative'][label]['binding']['scope']=={
                    'account_id':prepared['scope']['account_id'],'merchant_id':'binding-merchant-v1'},
                    'N binding scope differs: '+label)
            if o:
                scenario=next(r for r in result['scenarios'] if r['orderLabel']==label)
                ready=next((r['providerOrderId'] for r in scenario['outcomes'] if r['kind']=='PROVIDER_ORDER_READY'), None)
                if label=='L1-CLAIM':
                    ready=scenario['setupEvidence']['providerOrderId']
                check(next(r['externalId'] for r in links if r['identityKind']=='ORDER')==ready, 'Winner/link mismatch')
        else:
            check(len(intakes)==len(receipts)==len(inbox)==0, 'Open finding crossed financial boundary')
    check(len(new['receipts'])==len(new['wallet_provider_event_inbox'])==len(new['web_payment_purchase_intakes'])==1, 'F1 must own exactly one receipt/inbox/intake')
    receipt=new['receipts'][0]; inbox=new['wallet_provider_event_inbox'][0]; intake=new['web_payment_purchase_intakes'][0]
    check(intake['receipt_id']==receipt['id'] and intake['inbox_id']==inbox['id'] and receipt.get('user_id')==ACTORS['A'], 'F1 financial crosslink/owner mismatch')
    for table in FINANCIAL:
        check(after['financialCounts'][table]==len(new[table]), 'Financial summary/raw count differs')
    findings=result['openFindings']
    def finding_matches(finding):
        facts=finding['facts']; observed=after['orderFacts'][finding['label']]
        return set(facts)==set(observed) and all(normalize(facts[k])==normalize(observed[k])
            if k in ('links','observations') else facts[k]==observed[k] and type(facts[k]) is type(observed[k]) for k in observed)
    check(len(findings)==3 and {f['label'] for f in findings}=={'N-A','N-B','N-C'}
          and all(set(f)=={'label','status','facts'} and f['status']=='E_ASSERTED' and finding_matches(f) for f in findings), 'N findings must retain asserted facts')


def rows_by(rows, keys):
    require(isinstance(rows, list) and all(isinstance(row, dict) for row in rows), 'CONTROL_STATE', 'Control rows must be objects')
    result = {}
    for row in rows:
        identity = tuple(row.get(key) for key in keys)
        require(None not in identity and identity not in result, 'CONTROL_STATE', 'Control identity missing/duplicate')
        result[identity] = row
    return result


def control_changes_allowed(kind, before, after, actors):
    try:
        tables = {'web_payment_provider_settings', 'web_payment_verification_bindings', 'user_profiles'}
        require(kind in ('rotate', 'stop') and isinstance(before, dict) and isinstance(after, dict)
                and set(before) == set(after) == tables, 'CONTROL_STATE', 'Control table set differs')
        old_settings = rows_by(before['web_payment_provider_settings'], ('provider', 'environment'))
        new_settings = rows_by(after['web_payment_provider_settings'], ('provider', 'environment'))
        old_bindings = rows_by(before['web_payment_verification_bindings'], ('id',))
        new_bindings = rows_by(after['web_payment_verification_bindings'], ('id',))
        old_profiles = rows_by(before['user_profiles'], ('id',))
        new_profiles = rows_by(after['user_profiles'], ('id',))
        require(set(old_settings) == set(new_settings) and set(old_profiles) == set(new_profiles),
                'CONTROL_STATE', 'Control identities changed')
        if kind == 'rotate':
            require(old_profiles == new_profiles and all(new_bindings.get(key) == row for key, row in old_bindings.items()),
                    'CONTROL_STATE', 'Rotation rewrote historical binding/profile')
            added = set(new_bindings) - set(old_bindings)
            require(len(added) == 1, 'CONTROL_STATE', 'Rotation must insert exactly one binding')
            new_id = next(iter(added))[0]
            binding = new_bindings[(new_id,)]
            require(binding.get('provider') == 'PAYPAL' and binding.get('environment') == 'SANDBOX'
                    and binding.get('binding_version') == 2, 'CONTROL_STATE', 'Rotation binding must be PayPal sandbox v2')
            allowed = {'verification_binding_id', 'paypal_account_id', 'paypal_merchant_id'}
            for key, old in old_settings.items():
                new = new_settings[key]
                if key == ('PAYPAL', 'SANDBOX'):
                    require(new.get('verification_binding_id') == new_id
                            and new.get('verification_binding_id') != old.get('verification_binding_id')
                            and all(isinstance(new.get(field), str) and new[field] for field in ('paypal_account_id', 'paypal_merchant_id'))
                            and {k: v for k, v in old.items() if k not in allowed} == {k: v for k, v in new.items() if k not in allowed},
                            'CONTROL_STATE', 'Rotation settings changed outside binding/scope')
                else:
                    require(old == new, 'CONTROL_STATE', 'Rotation changed another provider setting')
        else:
            require(old_bindings == new_bindings, 'CONTROL_STATE', 'Stop rewrote bindings')
            allowed = {'mode', 'allow_charge', 'allow_new_orders'}
            for key, old in old_settings.items():
                new = new_settings[key]
                if key in (('PAYPAL', 'SANDBOX'), ('PORTONE', 'TEST')):
                    require(new.get('mode') == 'CLOSED' and new.get('allow_charge') is False and new.get('allow_new_orders') is False
                            and {k: v for k, v in old.items() if k not in allowed} == {k: v for k, v in new.items() if k not in allowed},
                            'CONTROL_STATE', 'Stop failed to close flags or changed scope')
                else:
                    require(old == new, 'CONTROL_STATE', 'Stop changed another provider')
            for key, old in old_profiles.items():
                new = new_profiles[key]
                if key == (actors['C'],):
                    require(old.get('deleted_at') is None and isinstance(new.get('deleted_at'), str) and new['deleted_at']
                            and {k: v for k, v in old.items() if k != 'deleted_at'} == {k: v for k, v in new.items() if k != 'deleted_at'},
                            'CONTROL_STATE', 'Stop must delete only actor C')
                else:
                    require(old == new, 'CONTROL_STATE', 'Stop changed another actor')
        return True
    except (BoundaryError, KeyError, TypeError, ValueError):
        return False


def cleanup_owned(pair, receipt):
    receipt.update(ownedContainerIds=[row['container_id'] for row in pair.containers],
        ownedNetworkId=pair.network['network_id'] if pair.network else None,
        unknownCreation=copy.deepcopy(pair.ledger.unknown), uncertainPhase=copy.deepcopy(pair.uncertain_phase),
        runId=pair.run_id, network=pair.network, containers=pair.containers, imageIds=pair.images,
        actualServerVersion=getattr(pair, 'version', None))
    require(not pair.ledger.unknown, 'UNKNOWN_CREATION', 'Uncertain create preserved; guessed cleanup is forbidden')
    require(not pair.uncertain_phase, 'UNCERTAIN_PHASE', 'Uncertain start preserved; cleanup needs root review')
    # This method delegates all inspect authorization/removal to the real factory.
    try:
        pair.close()
    finally:
        receipt['absenceObserved'] = copy.deepcopy(pair.cleanup.absence) if pair.cleanup else None
    return pair.cleanup.absence if pair.cleanup else None


def hash_snapshot(value, *, exact=None, count=None):
    return (isinstance(value, dict) and bool(value) and (exact is None or set(value) == exact)
            and (count is None or len(value) == count) and all(isinstance(key, str) and pin(row) for key, row in value.items()))


def finalize(receipt, *, cleanup, snapshot):
    phase_set = receipt.get('phaseSet')
    frozen, owned, entry, _, artifacts, bundle_name = phase_contract(phase_set)
    cleanup_error = None
    try:
        absence = cleanup()
    except BaseException as exc:
        absence, cleanup_error = None, error(exc)
    result = copy.deepcopy(receipt)
    result.update(status='failed', exitCode=1, absence=absence)
    if cleanup_error is not None:
        result['cleanupError'] = cleanup_error
    try:
        after = snapshot()
        result.update(sourcesAfter=after['sources'], dbSourcesAfter=after['dbSources'],
            artifactHashesAfter=after['artifacts'], cacheAfter=after['cache'], nativeInputHashesAfter=after['nativeInputs'])
        result['sourcesUnchanged'] = hash_snapshot(result.get('sourcesBefore')) and result['sourcesBefore'] == after['sources']
        result['dbSourcesUnchanged'] = hash_snapshot(result.get('dbSourcesBefore'), count=97) and result['dbSourcesBefore'] == after['dbSources']
        result['artifactsUnchanged'] = hash_snapshot(result.get('artifactHashesBefore'), exact=artifacts) and result['artifactHashesBefore'] == after['artifacts']
        result['cacheUnchanged'] = isinstance(result.get('cacheBefore'), dict) and result['cacheBefore'] == after['cache']
        result['nativeInputsUnchanged'] = hash_snapshot(result.get('nativeInputHashes'), exact={'native-' + phase + '.json' for phase in 'ABC'}) and result['nativeInputHashes'] == after['nativeInputs']
    except BaseException as exc:
        result['sourceVerificationError'] = error(exc)
    ids = result.get('ownedContainerIds')
    absence_valid = (isinstance(ids, list) and len(ids) == 3 and len(set(ids)) == 3 and all(pin(cid) for cid in ids)
        and pin(result.get('ownedNetworkId')) and isinstance(absence, dict) and set(absence) == {'containers', 'network'}
        and absence['network'] is True and isinstance(absence['containers'], dict) and set(absence['containers']) == set(ids)
        and all(value is True for value in absence['containers'].values()))
    result['absenceComplete'] = absence_valid
    valid = (absence_valid and result.get('phaseSet') in ('d1', 'd2') and result.get('installedContractLevel') == 'current10'
        and 'suiteContractLevel' in result and result['suiteContractLevel'] is None
        and 'originalError' in result and result['originalError'] is None and result.get('unknownCreation') == []
        and result.get('uncertainPhase') == []
        and not any(key in result for key in ('metadataError', 'cleanupError', 'sourceVerificationError', 'finalizationError'))
        and all(result.get(key) is True for key in ('sourcesUnchanged', 'dbSourcesUnchanged', 'artifactsUnchanged', 'cacheUnchanged', 'nativeInputsUnchanged')))
    try:
        if phase_set == 'd2':
            require(hash_snapshot(result.get('sourcesBefore'), exact={'web:' + p for p in frozen | owned | set(INSTALLED_PINS)}),
                    'FINAL_SOURCES', 'D2 source closure incomplete')
        phases, observations = result['phases'], result['observations']
        require(isinstance(phases, dict) and set(phases) == {'A', 'B', 'C'} and isinstance(observations, dict)
                and set(observations) == {'baseline' + p for p in 'ABC'} | {'after' + p for p in 'ABC'},
                'FINAL_PHASES', 'Phase/observer coverage incomplete')
        for phase in 'ABC':
            row = phases[phase]
            require(isinstance(row, dict) and row.get('completed') is True and type(row.get('exitCode')) is int and row['exitCode'] == 0,
                    'FINAL_PHASES', 'Phase did not complete successfully')
            before, after = observations['baseline' + phase], observations['after' + phase]
            require(valid_observation(before, 'baseline' + phase, phase_set=phase_set) and valid_observation(after, 'after' + phase, phase_set=phase_set),
                    'FINAL_OBSERVATION', 'Observer evidence invalid')
            if phase_set == 'd2':
                validate_d2_state(phase, before, after, row['result'], result['fixtureCases'])
                expected_pins = {'bundleSha256': result['artifactHashesBefore'][bundle_name],
                    'guardSha256': result['artifactHashesBefore']['guard.cjs'],
                    'entryDeliverySha256': result['sourcesBefore']['web:' + entry]}
                require(row['result'].get('executionPins') == expected_pins, 'NODE_EXECUTION_PINS', 'Node execution pins differ')
            else:
                require(all(before[key] == after[key] for key in ('productDigest', 'controlDigest', 'controlState', 'native')),
                        'FINAL_MUTATION', 'HTTP phase changed product/control/native state')
            validate_http(phase, row['result'], before if phase_set == 'd2' else before['native'], result['fixtureCases'], phase_set=phase_set)
            require(before['native'] == observations['baselineA']['native'], 'FINAL_FROZEN_BINDING', 'Native frozen responses changed across phases')
        for earlier, later, kind in (('A', 'B', 'rotate'), ('B', 'C', 'stop')):
            before, after = observations['after' + earlier], observations['baseline' + later]
            require(before['productDigest'] == after['productDigest']
                    and (phase_set != 'd2' or all(before[k] == after[k] for k in ('productState','orderFacts','bridgeNative')))
                    and control_changes_allowed(kind, before['controlState'], after['controlState'], result['actors']),
                    'FINAL_CONTROL', 'Control operation changed product/non-allowlisted fields')
    except (BoundaryError, KeyError, TypeError, ValueError, AttributeError) as exc:
        valid = False
        result['validationError'] = error(exc)
    if valid:
        result.update(status='passed', exitCode=0)
    return result


def _command(argv, **kwargs):
    return subprocess.run(argv, env=ENV, **kwargs)


def artifact_hashes(directory, *, phase_set='d1'):
    return {name: digest(source_file(directory, name).read_bytes()) for name in sorted(phase_contract(phase_set)[4])}


def cache_state(*directories):
    result = {}
    for directory in directories:
        for path in sorted(directory.glob('__pycache__/*.pyc')):
            require(not path.is_symlink(), 'CACHE_PATH', 'Cache symlink is forbidden')
            if path.is_file():
                result[str(path)] = digest(path.read_bytes())
    return result


def runtime_flags():
    require(sys.flags.isolated == 1 and sys.flags.dont_write_bytecode == 1
            and (not hasattr(sys.flags, 'safe_path') or sys.flags.safe_path is True),
            'INTERPRETER_FLAGS', 'Actual -I -B interpreter flags are required')
    return {'isolated': sys.flags.isolated, 'dontWriteBytecode': sys.flags.dont_write_bytecode,
            'safePath': getattr(sys.flags, 'safe_path', None)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase-set', choices=['d1', 'd2'], required=True)
    parser.add_argument('--postgres-image', choices=['postgres:15.8', 'postgres:17.6'], required=True)
    for name in ('run-label', 'db-workspace', 'docker-host', 'web-head', 'web-manifest', 'web-manifest-sha256', 'db-manifest', 'db-manifest-sha256'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--docker-bin', default=shutil.which('docker', path=ENV['PATH']))
    parser.add_argument('--node-bin', default=shutil.which('node', path=ENV['PATH']))
    args = parser.parse_args(argv)
    phase_set = args.phase_set
    _, _, entry, _, _, bundle_name = phase_contract(phase_set)
    flags = runtime_flags()
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', args.run_label), 'RUN_LABEL', 'Invalid fresh run label')
    for parent in (ROOT / '.artifacts', ROOT / '.artifacts/payment-web-order-http'):
        require(not parent.is_symlink(), 'ARTIFACT_PATH', 'Artifact parent symlinks are forbidden')
    os.umask(0o077)
    out = ROOT / '.artifacts/payment-web-order-http' / ('provider-rpc-' + args.run_label)
    out.mkdir(parents=True, exist_ok=False)
    node_out = out / 'node-artifacts'
    evidence = {'status': 'failed', 'exitCode': 1, 'phaseSet': args.phase_set, 'stage': 'web-preflight',
        'recordedAt': datetime.now(timezone.utc).isoformat(), 'originalError': None, 'phases': {}, 'observations': {},
        'unknownCreation': [], 'uncertainPhase': [], 'launchFlags': flags, 'actors': ACTORS,
        'invocation': {'mainArgv': list(argv) if argv is not None else sys.argv[1:], 'interpreterArgv': getattr(sys, 'orig_argv', None)},
        'limits': {'provider': 'No real provider, credential resolver, capture, wallet grant, UI, deployment or FULL claim',
                   'guard': 'Cooperative fixed-source wrappers; not a hostile whole-OS sandbox',
                   'transactionMode': 'Actual GET/native READONLY compatibility only; no transaction-mode inference',
                   'retry': 'Phase-A SDK synthetic503 observations are excluded from PostgREST counts',
                   'concurrency': 'Sequential pool1 only', 'dependencyTree': 'Selected installed4 pinned, not whole dependency tree'}}
    if phase_set == 'd2':
        evidence['limits'].update(provider='Scripted local PayPalTransport and public fixture resolver only; no real provider or production composition',
            transactionMode='Actual POST RPCs and stable GET/native parity; no unsupported transaction-mode inference',
            retry='Every product SDK RPC uses retry(false); no synthetic retry case in D2',
            concurrency='F4 two caller lanes with fake CREATE barrier over PostgREST pool1; no DB parallelism claim')
    pair, modules, web, db_root, manifest = None, None, None, None, None
    native_pins = {}
    stack = ExitStack()
    previous_signal = signal.getsignal(signal.SIGTERM)

    def terminated(_signum, _frame):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        raise BoundaryError('TERMINATED', 'Termination requested; preserve first failure and exact ledger')

    signal.signal(signal.SIGTERM, terminated)
    try:
        web = verify_web(ROOT, args.web_manifest, args.web_manifest_sha256, args.web_head, git=_command, phase_set=phase_set)
        evidence['webPreflight'] = web
        require(all(web['sources'].get(name) == value for name, value in {**REUSE_PINS, **(D2_PRODUCT_PINS if phase_set == 'd2' else PRODUCT_PINS), **INSTALLED_PINS}.items()),
                'FROZEN_RUNTIME_PIN', 'Frozen reuse/product/SDK bytes differ')
        evidence['stage'] = 'db-preflight'
        validate_migrations(MIGRATIONS10)
        db_root, manifest, db_sources = verify_db(args.db_workspace, args.db_manifest, args.db_manifest_sha256, git=_command)
        evidence.update(webHead=web['webHead'], dbHead=DB_HEAD, dbManifestSha256=args.db_manifest_sha256,
            dependencySqlSha256=manifest['dependencySqlSha256'], dbSourcesBefore=db_sources,
            sourcesBefore={'web:' + name: value for name, value in web['sources'].items()},
            cacheBefore=cache_state(ROOT / 'scripts/payment/order-http', ROOT / 'scripts/payment/charge-context-http', db_root / 'scripts/wallet'))
        modules = stack.enter_context(verified_reuse(ROOT, REUSE_PINS))
        evidence['reuseIdentity'] = {name: {'file': module.__file__, 'origin': module.__spec__.origin,
            'cached': module.__cached__, 'loader': type(module.__loader__).__name__} for name, module in modules.items()}
        evidence['interpreter'] = modules['order_http_run'].interpreter_evidence()
        for name in ('supabase-js', 'postgrest-js'):
            package = execution_bytes(ROOT, 'node_modules/@supabase/' + name + '/package.json', web['sources'], evidence, 'web')
            require(read_json(package, 'SDK_PACKAGE').get('version') == '2.112.3', 'SDK_PACKAGE', 'Installed SDK version differs')
        require(args.node_bin and args.docker_bin, 'EXECUTABLES', 'Installed Node and Docker are required')
        node_out.mkdir()
        evidence['stage'] = 'bundle'
        bundle_source = execution_bytes(ROOT, PREFIX + 'bundle.mjs', web['sources'], evidence, 'web')
        entry_bytes = execution_bytes(ROOT, entry, web['sources'], evidence, 'web')
        bundle_text = bundle_source.decode('utf-8', errors='strict')
        bundled = _command([args.node_bin, '--input-type=module', '-', str(node_out), entry_bytes.hex(), *(['d2'] if phase_set == 'd2' else [])],
            input=bundle_text, cwd=str(ROOT), text=True, encoding='utf-8', capture_output=True, timeout=30)
        (out / 'bundle.log').write_text(bundled.stdout + bundled.stderr)
        evidence['bundleExitCode'] = bundled.returncode
        require(bundled.returncode == 0, 'BUNDLE_FAILURE', 'Host build failed before Docker creation')
        meta_bytes = source_file(node_out, 'bundle-inputs.json').read_bytes()
        evidence['bundleMetadata'] = verify_bundle(read_json(meta_bytes, 'BUNDLE_META'), entry_bytes, phase_set=phase_set)
        evidence['bundleMetadata'].update(sha256=digest(meta_bytes), scriptStdinSha256=digest(bundle_source))
        guard = execution_bytes(ROOT, PREFIX + 'guard.cjs', web['sources'], evidence, 'web')
        (node_out / 'guard.cjs').write_bytes(guard)
        transport = modules['order_http_run'].LocalDocker(args.docker_bin, args.docker_host, out)
        pair = modules['pair_fixture'].PairFactory(transport, pg_image=args.postgres_image,
            artifact_dir=node_out, modules_dir=ROOT / 'node_modules')
        evidence['stage'] = 'factory-start'
        pair.start()
        evidence['stage'] = 'source-current10-setup'
        cases = setup_current10(pair, modules, db_root, manifest, out, web['sources'], evidence, phase_set=phase_set)
        evidence['fixtureCases'] = cases

        def native_observe(label):
            data = execution_bytes(ROOT, PREFIX + 'observer.sql', web['sources'], evidence, 'web')
            return observe(pair, out, label, cases, data, evidence, phase_set=phase_set)

        evidence['observations']['baselineA'] = native_observe('baselineA')
        evidence['stage'] = 'postgrest-start'
        pair.start_postgrest()
        config = {'restIp': pair.role('postgrest')['ipv4'], 'restPort': 3000, 'restAlias': 'order-rest',
            'actors': ACTORS, 'cases': cases, 'nodeDeadlineMs': 24000,
            'readinessIdentity': {'actor': str(uuid.uuid4()), 'order': str(uuid.uuid4())},
            'tokens': {'service': modules['order_http_run'].jwt('service_role'), 'anon': modules['order_http_run'].jwt('anon'),
                       'authenticated': modules['order_http_run'].jwt('authenticated', sub=ACTORS['A'])},
            'completionMarkers': {phase: 'PROVIDER_RPC_HTTP_COMPLETE_' + uuid.uuid4().hex + '_' + phase for phase in 'ABC'},
            'executionPins': {'bundleSha256': digest(source_file(node_out, bundle_name).read_bytes()),
                'guardSha256': digest(guard), 'entryDeliverySha256': digest(entry_bytes)}}
        if phase_set == 'd2':
            config['phaseSet'] = 'd2'
        (node_out / 'config.json').write_text(json.dumps(config, indent=2) + '\n')
        evidence['artifactHashesBefore'] = artifact_hashes(node_out, phase_set=phase_set)
        evidence['completionMarkers'] = config['completionMarkers']
        for phase in 'ABC':
            result = None
            if phase != 'A':
                kind = 'rotate' if phase == 'B' else 'stop'
                earlier = 'A' if phase == 'B' else 'B'
                evidence['stage'] = kind
                data = execution_bytes(ROOT, PREFIX + kind + '.sql', web['sources'], evidence, 'web')
                install_sql(pair, out, kind, data, user='postgres', marker='PROVIDER_RPC_' + kind.upper() + '_COMPLETE', evidence=evidence)
                baseline = native_observe('baseline' + phase)
                evidence['observations']['baseline' + phase] = baseline
                before = evidence['observations']['after' + earlier]
                require(before['productDigest'] == baseline['productDigest']
                        and control_changes_allowed(kind, before['controlState'], baseline['controlState'], ACTORS),
                        'CONTROL_STATE', 'Control changed product/non-allowlisted state')
                require(baseline['native'] == evidence['observations']['baselineA']['native'],
                        'FROZEN_NATIVE', 'Frozen native binding changed after control operation')
            baseline = evidence['observations']['baseline' + phase]
            native_path = node_out / ('native-' + phase + '.json')
            native_path.write_text(json.dumps(baseline if phase_set == 'd2' else baseline['native'], indent=2) + '\n')
            native_pins[native_path.name] = digest(native_path.read_bytes())
            require(artifact_hashes(node_out, phase_set=phase_set) == evidence['artifactHashesBefore'], 'ARTIFACT_CHANGED', 'Immutable build/config changed between phases')
            evidence['stage'] = 'http-' + phase
            child = pair.exec_node(['node', '--require', '/fixture/guard.cjs', '/fixture/' + bundle_name, phase, native_pins[native_path.name]], check=False)
            (out / ('http-' + phase + '.stdout.log')).write_text(child.stdout)
            (out / ('http-' + phase + '.stderr.log')).write_text(child.stderr)
            evidence['phases'][phase] = {'exitCode': child.returncode, 'completed': False}
            first_error = None
            try:
                result = parse_result(phase, child, config, phase_set=phase_set)
                counts = validate_http(phase, result, baseline if phase_set == 'd2' else baseline['native'], cases, phase_set=phase_set)
                require(result.get('executionPins') == config['executionPins'], 'NODE_EXECUTION_PINS', 'Node artifact evidence differs')
                evidence['phases'][phase].update(completed=True, result=result, measuredCounts=counts)
            except BaseException as exc:
                first_error = exc
            try:
                after = native_observe('after' + phase)
                evidence['observations']['after' + phase] = after
                if phase_set == 'd2':
                    if result is None:
                        evidence['phases'][phase]['stateValidation'] = {'status':'NOT_RUN','reason':'NO_COMPLETE_RESULT'}
                    else:
                        validate_d2_state(phase, baseline, after, result, cases)
                else:
                    require(all(baseline[key] == after[key] for key in ('productDigest', 'controlDigest', 'controlState', 'native')),
                            'HTTP_STATE_MUTATION', 'Read-only HTTP phase changed product/control/native state')
            except BaseException as exc:
                if first_error is None:
                    first_error = exc
                else:
                    evidence.setdefault('secondaryErrors', []).append(error(exc))
            if first_error is not None:
                raise first_error
        evidence['stage'] = 'http-phases-complete'
        evidence['nativeInputHashes'] = native_pins
    except BaseException as exc:
        evidence['originalError'] = {**error(exc), 'traceback': traceback.format_exc()}
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            if pair is not None:
                def cleanup():
                    return cleanup_owned(pair, evidence)

                def snapshot():
                    current_web = verify_web(ROOT, args.web_manifest, args.web_manifest_sha256, args.web_head, git=_command, phase_set=phase_set)
                    _, _, current_db = verify_db(db_root, args.db_manifest, args.db_manifest_sha256, git=_command)
                    return {'sources': {'web:' + name: value for name, value in current_web['sources'].items()},
                        'dbSources': current_db, 'artifacts': artifact_hashes(node_out, phase_set=phase_set),
                        'cache': cache_state(ROOT / 'scripts/payment/order-http', ROOT / 'scripts/payment/charge-context-http', db_root / 'scripts/wallet'),
                        'nativeInputs': {name: digest(source_file(node_out, name).read_bytes()) for name in native_pins}}

                evidence = finalize(evidence, cleanup=cleanup, snapshot=snapshot)
        except BaseException as exc:
            evidence.update(status='failed', exitCode=1, finalizationError=error(exc))
        finally:
            try:
                stack.close()
            except BaseException as exc:
                evidence.update(status='failed', exitCode=1, reuseFinalizationError=error(exc))
            signal.signal(signal.SIGTERM, previous_signal)
            (out / 'receipt.json').write_text(json.dumps(evidence, indent=2) + '\n')
            print(json.dumps({key: evidence.get(key) for key in ('status', 'stage', 'exitCode', 'originalError', 'cleanupError', 'absence')}))
            print('Receipt: ' + str(out / 'receipt.json'))
    return evidence['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())
