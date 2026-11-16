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


class BoundaryError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def require(condition, code, message):
    if not condition:
        raise BoundaryError(code, message)


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


def verify_web(root, manifest_path, manifest_sha256, web_head, *, git):
    root = root_path(root)
    require(isinstance(web_head, str) and HEAD.fullmatch(web_head), 'WEB_HEAD', 'Full explicit web HEAD is required')
    path, raw = manifest_bytes(root, manifest_path, manifest_sha256, 'MANIFEST_HASH')
    manifest = read_json(raw, 'MANIFEST_JSON')
    require(isinstance(manifest, dict) and set(manifest) == {'webHead', 'frozenFiles', 'ownedFiles', 'installedFiles'},
            'MANIFEST_SET', 'Web manifest fields differ')
    require(manifest['webHead'] == web_head, 'WEB_HEAD', 'Web manifest HEAD differs')
    sources = {}
    for category, names in (('frozenFiles', FROZEN), ('ownedFiles', OWNED), ('installedFiles', INSTALLED)):
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
    for name in sorted(FROZEN | OWNED):
        tracked = git_command(git, root, ['ls-files', '--error-unmatch', '--', name])
        status = git_command(git, root, ['status', '--porcelain=v1', '--untracked-files=all', '--', name])
        require(tracked.returncode in (0, 1) and status.returncode == 0, 'GIT_STATUS', 'Git source query failed')
        lines = status.stdout.splitlines()
        require(not lines or (len(lines) == 1 and len(lines[0]) >= 4 and lines[0][2] == ' '
                and lines[0][3:] == name and all(char in ' MADRCUT?!' for char in lines[0][:2])),
                'GIT_STATUS', 'Git status source evidence is ambiguous')
        state = {'tracked': tracked.returncode == 0, 'dirty': bool(lines)}
        if name in FROZEN:
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


def validate_cases(cases):
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


def setup_current10(pair, modules, db_root, manifest, out, web_pins, evidence):
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
    seed = install_sql(pair, out, 'seed', execution_bytes(ROOT, PREFIX + 'seed.sql', web_pins, evidence, 'web'),
        user='postgres', marker='PROVIDER_RPC_SEED_COMPLETE', evidence=evidence)
    seeded = [read_json(line, 'FIXTURE_JSON') for line in seed.stdout.splitlines() if line.startswith('{')]
    require(len(seeded) == 4 and all(isinstance(row, dict) and set(row) == {'label', 'actor', 'order'} for row in seeded)
            and {row['label'] for row in seeded} == {'B1', 'B2', 'B3', 'B4'}
            and len({row['order'] for row in seeded}) == 4, 'FIXTURE_CASES', 'Seed must return distinct B1-B4 orders')
    first = next(row['order'] for row in seeded if row['label'] == 'B1')
    seeded += [{'label': 'NF_OTHER', 'actor': ACTORS['B'], 'order': first},
               {'label': 'NF_UNKNOWN', 'actor': ACTORS['A'], 'order': 'd155cc09-0000-4000-8000-000000000099'},
               {'label': 'NF_NULL_ACTOR', 'actor': None, 'order': first},
               {'label': 'NF_NULL_ORDER', 'actor': ACTORS['A'], 'order': None},
               {'label': 'NF_NULL_BOTH', 'actor': None, 'order': None}]
    validate_cases(seeded)
    evidence.update(installedContractLevel='current10', suiteContractLevel=None)
    return seeded


def verify_bundle(meta, entry_bytes):
    require(isinstance(meta, dict) and meta.get('entryDeliveryHex') == entry_bytes.hex(),
            'BUNDLE_DELIVERY', 'Bundle entry delivery differs from approved snapshot')
    inputs = meta.get('metafile', {}).get('inputs')
    require(isinstance(inputs, dict) and set(inputs) == BUNDLE_INPUTS, 'BUNDLE_INPUTS', 'Actual bundle graph differs; stop for review')
    require(isinstance(inputs[ENTRY], dict) and inputs[ENTRY].get('bytes') == len(entry_bytes),
            'BUNDLE_DELIVERY', 'Metafile entry byte count differs')
    return {'inputPaths': sorted(inputs), 'esbuildVersion': meta.get('esbuildVersion'),
            'entryDeliverySha256': digest(entry_bytes)}


def zero_counts(value, expected):
    return (isinstance(value, dict) and set(value) == expected
            and all(type(count) is int and count == 0 for count in value.values()))


def valid_observation(value, label, labels=LABELS):
    fields = {'label', 'sessionUser', 'currentUser', 'timezone', 'productDigest', 'controlDigest', 'controlState',
              'financialCounts', 'fullCounts', 'financialZero', 'fullZero', 'aclValid', 'native'}
    return (isinstance(value, dict) and set(value) == fields and value['label'] == label
            and value['sessionUser'] == value['currentUser'] == 'fixture_admin' and value['timezone'] == 'UTC'
            and pin(value['productDigest']) and pin(value['controlDigest']) and isinstance(value['controlState'], dict)
            and zero_counts(value['financialCounts'], FINANCIAL) and zero_counts(value['fullCounts'], FULL)
            and all(value[key] is True for key in ('financialZero', 'fullZero', 'aclValid'))
            and isinstance(value['native'], dict) and set(value['native']) == labels
            and all(isinstance(row, dict) and set(row) == {'ok', 'value'} and row['ok'] is True
                    and isinstance(row['value'], dict) for row in value['native'].values()))


def observe(pair, out, label, cases, observer_bytes, evidence):
    validate_cases(cases)
    prefix = 'set provider_rpc.cases to ' + sql_literal(json.dumps(cases, separators=(',', ':'))) + ';\n'
    prefix += 'set provider_rpc.observation_label to ' + sql_literal(label) + ';\n'
    data = prefix.encode() + observer_bytes
    result = install_sql(pair, out, label, data, user='fixture_admin',
                         marker='PROVIDER_RPC_OBSERVER_COMPLETE', evidence=evidence)
    rows = [line[len('PROVIDER_RPC_OBSERVATION '):] for line in result.stdout.splitlines()
            if line.startswith('PROVIDER_RPC_OBSERVATION ')]
    require(len(rows) == 1, 'OBSERVER_RESULT', 'Expected one complete observer payload')
    value = read_json(rows[0], 'OBSERVER_RESULT')
    require(valid_observation(value, label), 'OBSERVER_RESULT', 'Native observer evidence differs from D1 schema')
    return value


def parse_result(phase, child, config):
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
    return value


def expected_binding(value):
    return {'orderId': value['order_id'], 'contextId': value['context_id'], 'provider': value['provider'],
            'environment': value['environment'], 'billingCountry': value['billing_country'], 'scope': value['scope'],
            'bindingId': value['binding_id'], 'bindingVersion': value['binding_version'], 'bindingHash': value['binding_hash'],
            'credentialRef': value['credential_ref'], 'expectedPayPalClientId': value['expected_application']['paypal_client_id']}


def validate_http(phase, result, native, cases):
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
        result['artifactsUnchanged'] = hash_snapshot(result.get('artifactHashesBefore'), exact=ARTIFACTS) and result['artifactHashesBefore'] == after['artifacts']
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
    valid = (absence_valid and result.get('phaseSet') == 'd1' and result.get('installedContractLevel') == 'current10'
        and 'suiteContractLevel' in result and result['suiteContractLevel'] is None
        and 'originalError' in result and result['originalError'] is None and result.get('unknownCreation') == []
        and result.get('uncertainPhase') == []
        and not any(key in result for key in ('metadataError', 'cleanupError', 'sourceVerificationError', 'finalizationError'))
        and all(result.get(key) is True for key in ('sourcesUnchanged', 'dbSourcesUnchanged', 'artifactsUnchanged', 'cacheUnchanged', 'nativeInputsUnchanged')))
    try:
        phases, observations = result['phases'], result['observations']
        require(isinstance(phases, dict) and set(phases) == {'A', 'B', 'C'} and isinstance(observations, dict)
                and set(observations) == {'baseline' + p for p in 'ABC'} | {'after' + p for p in 'ABC'},
                'FINAL_PHASES', 'Phase/observer coverage incomplete')
        for phase in 'ABC':
            row = phases[phase]
            require(isinstance(row, dict) and row.get('completed') is True and type(row.get('exitCode')) is int and row['exitCode'] == 0,
                    'FINAL_PHASES', 'Phase did not complete successfully')
            before, after = observations['baseline' + phase], observations['after' + phase]
            require(valid_observation(before, 'baseline' + phase) and valid_observation(after, 'after' + phase),
                    'FINAL_OBSERVATION', 'Observer evidence invalid')
            require(all(before[key] == after[key] for key in ('productDigest', 'controlDigest', 'controlState', 'native')),
                    'FINAL_MUTATION', 'HTTP phase changed product/control/native state')
            validate_http(phase, row['result'], before['native'], result['fixtureCases'])
            require(before['native'] == observations['baselineA']['native'], 'FINAL_FROZEN_BINDING', 'Native frozen responses changed across phases')
        for earlier, later, kind in (('A', 'B', 'rotate'), ('B', 'C', 'stop')):
            before, after = observations['after' + earlier], observations['baseline' + later]
            require(before['productDigest'] == after['productDigest']
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


def artifact_hashes(directory):
    return {name: digest(source_file(directory, name).read_bytes()) for name in sorted(ARTIFACTS)}


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
    parser.add_argument('--phase-set', choices=['d1'], required=True)
    parser.add_argument('--postgres-image', choices=['postgres:15.8', 'postgres:17.6'], required=True)
    for name in ('run-label', 'db-workspace', 'docker-host', 'web-head', 'web-manifest', 'web-manifest-sha256', 'db-manifest', 'db-manifest-sha256'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--docker-bin', default=shutil.which('docker', path=ENV['PATH']))
    parser.add_argument('--node-bin', default=shutil.which('node', path=ENV['PATH']))
    args = parser.parse_args(argv)
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
    pair, modules, web, db_root, manifest = None, None, None, None, None
    native_pins = {}
    stack = ExitStack()
    previous_signal = signal.getsignal(signal.SIGTERM)

    def terminated(_signum, _frame):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        raise BoundaryError('TERMINATED', 'Termination requested; preserve first failure and exact ledger')

    signal.signal(signal.SIGTERM, terminated)
    try:
        web = verify_web(ROOT, args.web_manifest, args.web_manifest_sha256, args.web_head, git=_command)
        evidence['webPreflight'] = web
        require(all(web['sources'].get(name) == value for name, value in {**REUSE_PINS, **PRODUCT_PINS, **INSTALLED_PINS}.items()),
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
        entry_bytes = execution_bytes(ROOT, ENTRY, web['sources'], evidence, 'web')
        bundle_text = bundle_source.decode('utf-8', errors='strict')
        bundled = _command([args.node_bin, '--input-type=module', '-', str(node_out), entry_bytes.hex()],
            input=bundle_text, cwd=str(ROOT), text=True, encoding='utf-8', capture_output=True, timeout=30)
        (out / 'bundle.log').write_text(bundled.stdout + bundled.stderr)
        evidence['bundleExitCode'] = bundled.returncode
        require(bundled.returncode == 0, 'BUNDLE_FAILURE', 'Host build failed before Docker creation')
        meta_bytes = source_file(node_out, 'bundle-inputs.json').read_bytes()
        evidence['bundleMetadata'] = verify_bundle(read_json(meta_bytes, 'BUNDLE_META'), entry_bytes)
        evidence['bundleMetadata'].update(sha256=digest(meta_bytes), scriptStdinSha256=digest(bundle_source))
        guard = execution_bytes(ROOT, PREFIX + 'guard.cjs', web['sources'], evidence, 'web')
        (node_out / 'guard.cjs').write_bytes(guard)
        transport = modules['order_http_run'].LocalDocker(args.docker_bin, args.docker_host, out)
        pair = modules['pair_fixture'].PairFactory(transport, pg_image=args.postgres_image,
            artifact_dir=node_out, modules_dir=ROOT / 'node_modules')
        evidence['stage'] = 'factory-start'
        pair.start()
        evidence['stage'] = 'source-current10-setup'
        cases = setup_current10(pair, modules, db_root, manifest, out, web['sources'], evidence)
        evidence['fixtureCases'] = cases

        def native_observe(label):
            data = execution_bytes(ROOT, PREFIX + 'observer.sql', web['sources'], evidence, 'web')
            return observe(pair, out, label, cases, data, evidence)

        evidence['observations']['baselineA'] = native_observe('baselineA')
        evidence['stage'] = 'postgrest-start'
        pair.start_postgrest()
        config = {'restIp': pair.role('postgrest')['ipv4'], 'restPort': 3000, 'restAlias': 'order-rest',
            'actors': ACTORS, 'cases': cases, 'nodeDeadlineMs': 24000,
            'readinessIdentity': {'actor': str(uuid.uuid4()), 'order': str(uuid.uuid4())},
            'tokens': {'service': modules['order_http_run'].jwt('service_role'), 'anon': modules['order_http_run'].jwt('anon'),
                       'authenticated': modules['order_http_run'].jwt('authenticated', sub=ACTORS['A'])},
            'completionMarkers': {phase: 'PROVIDER_RPC_HTTP_COMPLETE_' + uuid.uuid4().hex + '_' + phase for phase in 'ABC'},
            'executionPins': {'bundleSha256': digest(source_file(node_out, 'provider-binding-http.cjs').read_bytes()),
                'guardSha256': digest(guard), 'entryDeliverySha256': digest(entry_bytes)}}
        (node_out / 'config.json').write_text(json.dumps(config, indent=2) + '\n')
        evidence['artifactHashesBefore'] = artifact_hashes(node_out)
        evidence['completionMarkers'] = config['completionMarkers']
        for phase in 'ABC':
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
            native_path.write_text(json.dumps(baseline['native'], indent=2) + '\n')
            native_pins[native_path.name] = digest(native_path.read_bytes())
            require(artifact_hashes(node_out) == evidence['artifactHashesBefore'], 'ARTIFACT_CHANGED', 'Immutable build/config changed between phases')
            evidence['stage'] = 'http-' + phase
            child = pair.exec_node(['node', '--require', '/fixture/guard.cjs', '/fixture/provider-binding-http.cjs', phase, native_pins[native_path.name]], check=False)
            (out / ('http-' + phase + '.stdout.log')).write_text(child.stdout)
            (out / ('http-' + phase + '.stderr.log')).write_text(child.stderr)
            evidence['phases'][phase] = {'exitCode': child.returncode, 'completed': False}
            first_error = None
            try:
                result = parse_result(phase, child, config)
                counts = validate_http(phase, result, baseline['native'], cases)
                require(result.get('executionPins') == config['executionPins'], 'NODE_EXECUTION_PINS', 'Node artifact evidence differs')
                evidence['phases'][phase].update(completed=True, result=result, measuredCounts=counts)
            except BaseException as exc:
                first_error = exc
            try:
                after = native_observe('after' + phase)
                evidence['observations']['after' + phase] = after
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
                    current_web = verify_web(ROOT, args.web_manifest, args.web_manifest_sha256, args.web_head, git=_command)
                    _, _, current_db = verify_db(db_root, args.db_manifest, args.db_manifest_sha256, git=_command)
                    return {'sources': {'web:' + name: value for name, value in current_web['sources'].items()},
                        'dbSources': current_db, 'artifacts': artifact_hashes(node_out),
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
