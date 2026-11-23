"""H1 intake-hold HTTP harness on one owned disposable PostgreSQL/PostgREST/Node pair.

Commands:
  run.py manifest --output PATH
  run.py run --image postgres:15.8|postgres:17.6 --phase canonical|fault
             --manifest PATH --manifest-sha256 SHA --run-label LABEL

Run with python3 -I -B. The root (this process) owns the manifest check, the
database setup, the observer connection, the child processes and the cleanup.
PayPal fetch and the PayPal credential are synthetic. No real provider, no
wallet grant, no deployment and no production gate is opened. A fixture ACK
is delivery evidence only. A commit is claimed only from a row that the
observer reads on its own connection.
"""

import argparse
import base64
from contextlib import contextmanager, ExitStack
import copy
from datetime import datetime, timezone
import hashlib
import hmac
import importlib.abc
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import stat
import subprocess
import sys
import threading
import time
import traceback
import uuid
from urllib.parse import urlsplit


ROOT = Path(__file__).absolute().parents[3]
DB_ROOT = Path('/Users/charlie.hyun/orca/workspaces/picnic-supabase/web-payment-contract')
PREFIX = 'scripts/payment/intake-hold-http/'
ENTRY = '__tests__/integration/payment/intake-hold-postgrest.http.ts'
BUNDLE_NAME = 'intake-hold-http.cjs'
CHARGE = 'lib/payment/paypal-charge/'
MIGRATIONS = 'supabase/migrations/'
CURRENT10 = tuple(MIGRATIONS + name for name in (
    '20261111224520_web_payment_order_contract.sql', '20261112071844_web_payment_charge_lease.sql',
    '20261112081856_web_payment_provider_observation.sql', '20261112094913_web_payment_purchase_intake.sql',
    '20261112113100_web_payment_verification_binding.sql', '20261112124327_web_payment_verification_result.sql',
    '20261112145247_web_payment_settlement.sql', '20261114015304_web_payment_charge_gate.sql',
    '20261115075731_web_payment_provider_binding_read.sql', '20261115122716_web_payment_provider_entry.sql'))
M1_TO_M5 = tuple(MIGRATIONS + name for name in (
    '20261117035820_web_payment_durability_ledger.sql', '20261117051844_web_payment_submission_results.sql',
    '20261117070424_web_payment_intake_admission.sql', '20261117093017_web_payment_reconciliation_queue.sql',
    '20261117120247_web_payment_absence_release.sql'))
CONTRACT_PREFIX = (*CURRENT10, *M1_TO_M5)
# Already applied on the integration baseline. Replay these before the pending web contract.
INTEGRATED_BASELINE_PINS = {
    MIGRATIONS + '20261116000000_bonus_history_parent_index.sql':
        '5ada01c4d0ee57a9e762909dec54891aa5e3d2bfa4733cac84530206fa8d07ad',
    MIGRATIONS + '20261116010000_refund_evidence_user_scope.sql':
        '8d0057178fe1530549ccde189cea0b502713888868cb508fc5790463d281c344',
    MIGRATIONS + '20261116020000_vote_lock_key_share.sql':
        '962f22588655687e1950074f1a2701eb207fa266cca1014bb486dc9c1d414f6a',
    MIGRATIONS + '20261120090000_bonus_projection_check_open_buckets.sql':
        'a0e79f492d4635312a9c934081e71aaee4092fb8e7a8e3d8744997d19c10b8df',
    MIGRATIONS + '20261120120000_purchase_pregrant_refund_gate.sql':
        'd497929b789a288e1a1be1a59374096d5fba682002d55282453e9f66921b9196',
}
VOTE_TYPE_SOURCE = MIGRATIONS + '20260721094000_wallet_core_vote_v3.sql'
VOTE_PRIOR_SOURCE = 'supabase/prod-cutover/20261116-vote-lock-key-share/rollback/01_restore.sql'
KIT_PATH = 'supabase/prod-cutover/2026-11-17-web-payment-reconciliation-cron/kit.html'
DB_PRODUCT_COMMIT = 'e6464002139de353fc94460017a6e8b02dd759e5'
OWNED = (*(PREFIX + name for name in ('run.py', 'test_run.py', 'bundle.mjs', 'guard.cjs', 'seed.sql',
                                      'observer.sql', 'faults.sql')), ENTRY)
BUNDLE_MODULES = tuple(CHARGE + name + '.ts' for name in (
    'binding-source', 'durability-contract', 'orchestrator', 'protocol', 'provider-entry', 'read-cycle',
    'reconciliation-executor', 'reconciliation-repository', 'repository', 'submission-classification', 'transport'))
# Exact actual esbuild input closure. Type-only imports are erased and are not inputs.
BUNDLE_INPUTS = frozenset((ENTRY, *BUNDLE_MODULES, 'server-only-marker:server-only'))
BUNDLE_EXTERNAL = frozenset(('@supabase/supabase-js', '/fixture/guard.cjs', 'node:assert/strict', 'node:crypto', 'node:fs'))
# Minimum of named web source pins. A manifest may pin more sources.
REQUIRED_WEB_SOURCES = frozenset((*OWNED, *BUNDLE_MODULES, CHARGE + 'reconciliation-entry.ts',
    'app/api/internal/payment/paypal-reconciliation/route.ts', 'utils/log-event-codes.ts', 'types/supabase.ts',
    'package.json', 'package-lock.json', 'tsconfig.json'))
REUSE = {'pair_fixture': 'scripts/payment/order-http/pair_fixture.py', 'setup_db': 'scripts/payment/order-http/setup_db.py'}
SDK_VERSION = '2.112.3'
SDK_FILES = {
    '@supabase/supabase-js': ('node_modules/@supabase/supabase-js/package.json',
                              'node_modules/@supabase/supabase-js/dist/index.cjs'),
    '@supabase/postgrest-js': ('node_modules/@supabase/postgrest-js/package.json',
                               'node_modules/@supabase/postgrest-js/dist/index.cjs')}
REST_IMAGE = 'public.ecr.aws/supabase/postgrest:v14.8'
NODE_IMAGE = 'node@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54'
PINNED_IMAGES = {
    'postgres:15.8': 'sha256:eb3747f5d0a92195ca486d2f15d9a4ee5e9461b0332fe87fbc59069490a5c659',
    'postgres:17.6': 'sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929',
    REST_IMAGE: 'sha256:4173b72e0be29cf15349dc827798c3e464c5f2cc7f9c1697022f9cd1874b4c36',
    NODE_IMAGE: 'sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54'}
NATIVE_HELPERS = tuple('scripts/wallet/' + name for name in (
    'web_payment_fixture.py', 'web_payment_order_fixture.py', 'web_payment_intake_fixture.py',
    'web_payment_settlement_fixture.py', 'web_payment_durability_fixture.py'))
NATIVE_BOOTSTRAP = 'scripts/wallet/fixtures/web-payment-orders-bootstrap.sql'
NATIVE_CONTROL = 'scripts/wallet/fixtures/web-payment-settlement-engine-control.sql'
MANIFEST_FIELDS = frozenset(('webHead', 'dbHead', 'dbProductCommit', 'kit', 'contractPrefix', 'dependencySources',
    'dependencySqlSha256', 'queueDependencySqlSha256', 'webSources', 'reuseSources', 'sdk', 'images'))
PHASE_CASES = {
    'canonical': ('first_completed', 'eligible_no_response', 'actual_facts', 'observed_id_matrix'),
    'fault': ('kill_before_p1', 'p1_before_commit', 'p1_ack_loss', 'restart_xy', 'kill_before_complete',
              'complete_ack_loss', 'nth_fact_failure', 'conflict_and_late')}
# Approved nested matrices. A sub-case without a driver implementation fails the run closed.
REQUIRED_SUBCASES = {
    'eligible_no_response': ('p1_rpc_failure', 'p1_ack_lost'),
    'actual_facts': ('partial_adverse', 'voided', 'http_422', 'raw32_33facts', 'raw33', 'same_id_race',
                     'protocol_mismatch', 'caller8'),
    'observed_id_matrix': ('omitted_e_empty', 'empty_e_empty', 'malformed_e_empty', 'omitted_e_x', 'empty_e_x',
                           'malformed_e_x', 'clean_extra_id_downgrade', 'post_x_get_x', 'post_x_get_y'),
    'restart_xy': ('get_x_clean',),
    # existing_intake_due_unleased is the due, unleased sibling. It separates the hold exclusion from an active lease.
    'kill_before_complete': ('existing_intake_downstream', 'existing_intake_due_unleased'),
    'complete_ack_loss': ('post_commit_clean', 'post_commit_adverse', 'post_commit_no_data'),
    'conflict_and_late': ('late_adverse', 'late_invalid'),
}
# An approved sub-case without an implementation fails the run closed. None is open now.
UNIMPLEMENTED_SUBCASES = {}
# Crafted native acceptance probe (coordinator ruling msg_b5bc5dd6fd44). These are the eight valid W_CORE
# assertions of the native D2 fixture caller_eight(). The W classifier does not emit this set by itself.
CALLER_EIGHT = [
    {'code': 'COUNTRY_MISMATCH', 'detail': {}}, {'code': 'SHAPE_CONTRADICTION', 'detail': {}},
    {'code': 'INTENT_MISMATCH', 'detail': {}}, {'code': 'SAME_ID_RACE_UNCONFIRMED', 'detail': {}},
    {'code': 'UNREPRESENTABLE_CONTRADICTION', 'detail': {}},
    {'code': 'UNRECORDABLE_PROVIDER_FACT', 'detail': {'fact_kind': 'ORDER', 'reason': 'MISSING_ID'}},
    {'code': 'UNRECORDABLE_PROVIDER_FACT', 'detail': {'fact_kind': 'ORDER', 'reason': 'MISSING_STATUS'}},
    {'code': 'UNRECORDABLE_PROVIDER_FACT', 'detail': {'fact_kind': 'CAPTURE', 'reason': 'MISSING_ID'}}]
NOT_CLAIMABLE_V2 = {'contract_version': 'web-purchase-verification-claim.v2', 'outcome': 'NOT_CLAIMABLE', 'grant_eligible': False}
FAULTS = ('enroll', 'sweep', 'nth-fact-install', 'nth-fact-remove', 'downstream-claim', 'downstream-probe', 'downstream-drop')
RPC = {
    'getter': 'get_web_payment_charge_context', 'prepare': 'prepare_web_payment_provider_context',
    'binding': 'get_web_payment_provider_binding', 'entry': 'authorize_web_payment_provider_entry',
    'bind': 'bind_web_payment_provider_identity', 'record': 'record_web_payment_observation',
    'claim': 'claim_web_payment_charge', 'intent': 'record_web_payment_submission_intent',
    'receive': 'receive_web_payment_purchase', 'p1': 'record_web_payment_submission_result',
    'open': 'open_web_payment_read_cycle', 'complete': 'complete_web_payment_read_cycle',
    'preintent': 'record_web_payment_preintent_assertions', 'queueClaim': 'claim_web_payment_reconciliation_item',
    'queueFinish': 'finish_web_payment_reconciliation_item', 'queueRun': 'record_web_payment_reconciliation_run'}
P1, P2_OPEN, P2_COMPLETE = RPC['p1'], RPC['open'], RPC['complete']
PROOF_RPCS = (P1, P2_OPEN, P2_COMPLETE)
# The measured tape of an H1 case never contains CREATE, provider entry or a direct receive.
MEASURED_RPCS = frozenset(RPC[name] for name in ('getter', 'prepare', 'binding', 'bind', 'record', 'claim', 'intent',
    'p1', 'open', 'complete', 'preintent', 'queueClaim', 'queueFinish', 'queueRun'))
MEASURED_PROVIDER = frozenset(('TOKEN', 'ORDER_READ', 'CAPTURE'))
SETUP_RPCS = frozenset(RPC[name] for name in ('getter', 'prepare', 'binding', 'entry', 'bind', 'record'))
SETUP_PROVIDER = frozenset(('TOKEN', 'CREATE'))
ENV = {'PATH': '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin', 'NODE_ENV': 'test',
       'PYTHONDONTWRITEBYTECODE': '1', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
HASH = re.compile(r'[0-9a-f]{64}\Z')
HEAD = re.compile(r'[0-9a-f]{40}\Z')
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z')
FULL_ID = re.compile(r'[0-9a-f]{64}\Z')
TOKEN_KEYS = frozenset(('token', 'lease_token', 'p_lease_token', 'cycle_token', 'p_cycle_token', 'leaseToken',
                        'cycleToken', 'accessToken', 'access_token', 'authorization', 'apikey', 'clientSecret'))


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
    require(isinstance(value, str) and value != '' and '\\' not in value and not Path(value).is_absolute()
            and all(part not in ('', '.', '..') for part in value.split('/')),
            'MANIFEST_SET', 'Source path must be canonical and relative')
    return value


def read_source(root, name):
    """Bytes of one physical regular file below root. A symlink or a missing file is drift."""
    path = Path(root)
    for part in relative(name).split('/'):
        path = path / part
        require(not path.is_symlink(), 'SOURCE_DRIFT', 'Source symlink is forbidden: ' + name)
    try:
        require(stat.S_ISREG(path.stat().st_mode), 'SOURCE_DRIFT', 'Source is not a regular file: ' + name)
        return path.read_bytes()
    except OSError as exc:
        raise BoundaryError('SOURCE_DRIFT', 'Source is unavailable: ' + name) from exc


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'MANIFEST_DUPLICATE', 'Duplicate JSON key')
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
    """Bounded error summary. The exception text is filtered again before it is persisted."""
    result = {'type': type(exc).__name__[:128], 'code': str(getattr(exc, 'code', 'OPERATION_FAILED'))[:128],
              'message': str(exc)[:512]}
    if exc.__cause__ is not None:
        result['cause'] = {'type': type(exc.__cause__).__name__[:128], 'message': str(exc.__cause__)[:256]}
    return result


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def git_call(git, root, args, *, binary=False):
    return git(['git', '-C', str(root), *args], capture_output=True, text=not binary, timeout=30)


def _pin_rows(value, name):
    require(isinstance(value, list) and value, 'MANIFEST_SET', name + ' must be a non-empty list')
    for row in value:
        require(isinstance(row, dict) and set(row) == {'path', 'sha256'} and pin(row['sha256']),
                'MANIFEST_SET', name + ' rows are {path, sha256}')
        relative(row['path'])
    return value


def _pin_map(value, name):
    require(isinstance(value, dict) and value and all(pin(item) for item in value.values()),
            'MANIFEST_SET', name + ' must map a path to a SHA-256')
    for key in value:
        relative(key)
    return value


def manifest_shape(manifest):
    require(isinstance(manifest, dict) and set(manifest) == MANIFEST_FIELDS, 'MANIFEST_SET', 'Manifest fields differ')
    for key in ('webHead', 'dbHead', 'dbProductCommit'):
        require(isinstance(manifest[key], str) and HEAD.fullmatch(manifest[key]) is not None,
                'MANIFEST_SET', key + ' must be a full commit ID')
    kit = manifest['kit']
    require(isinstance(kit, dict) and set(kit) == {'path', 'sha256'} and kit['path'] == KIT_PATH and pin(kit['sha256']),
            'MANIFEST_SET', 'Cutover kit pin differs')
    prefix = _pin_rows(manifest['contractPrefix'], 'contractPrefix')
    dependencies = _pin_rows(manifest['dependencySources'], 'dependencySources')
    require(len({row['path'] for row in dependencies}) == len(dependencies), 'MANIFEST_SET', 'Duplicate dependency source')
    for key in ('dependencySqlSha256', 'queueDependencySqlSha256'):
        require(pin(manifest[key]), 'MANIFEST_SET', key + ' must be a SHA-256')
    web = _pin_map(manifest['webSources'], 'webSources')
    require(REQUIRED_WEB_SOURCES <= set(web), 'MANIFEST_SET', 'A required web source pin is missing')
    require(set(_pin_map(manifest['reuseSources'], 'reuseSources')) == set(REUSE.values()),
            'MANIFEST_SET', 'Reused helper set differs')
    sdk = manifest['sdk']
    require(isinstance(sdk, dict) and set(sdk) == set(SDK_FILES), 'MANIFEST_SET', 'SDK package set differs')
    for package, files in SDK_FILES.items():
        row = sdk[package]
        require(isinstance(row, dict) and set(row) == {'version', 'files'} and isinstance(row['version'], str)
                and isinstance(row['files'], dict) and set(row['files']) == set(files)
                and all(pin(item) for item in row['files'].values()), 'MANIFEST_SET', 'SDK pin shape differs')
    require(isinstance(manifest['images'], dict), 'MANIFEST_SET', 'images must be an object')
    paths = tuple(row['path'] for row in prefix)
    require(paths in (CONTRACT_PREFIX, (*INTEGRATED_BASELINE_PINS, *CONTRACT_PREFIX)),
            'CONTRACT_PREFIX_MISMATCH', 'Contract prefix differs from the supported ordered profiles')
    for row in prefix:
        approved = INTEGRATED_BASELINE_PINS.get(row['path'])
        require(approved is None or approved == row['sha256'], 'SOURCE_DRIFT',
                'Integrated migration differs from the approved hash: ' + row['path'])


def verify_heads(manifest, web_root, db_root, git):
    for root, key in ((web_root, 'webHead'), (db_root, 'dbHead')):
        actual = git_call(git, root, ['rev-parse', 'HEAD'])
        require(actual.returncode == 0 and isinstance(actual.stdout, str) and actual.stdout.strip() == manifest[key],
                'HEAD_DRIFT', 'Actual checkout HEAD differs: ' + key)
    for root in (web_root, db_root):
        status = git_call(git, root, ['status', '--porcelain=v1', '--untracked-files=no'])
        require(status.returncode == 0 and isinstance(status.stdout, str), 'GIT_UNAVAILABLE', 'Tracked status query failed')
        require(status.stdout.strip() == '', 'SOURCE_DRIFT', 'A tracked file differs from HEAD in ' + Path(root).name)


def verify_sources(manifest, web_root, db_root, git=None):
    """Hash the actual bytes of every pinned source. Called before and after each execution."""
    db_rows = [*manifest['contractPrefix'], *manifest['dependencySources'], manifest['kit']]
    require(len({row['path'] for row in db_rows}) == len(db_rows), 'MANIFEST_SET', 'A DB source is pinned twice')
    for row in db_rows:
        require(digest(read_source(db_root, row['path'])) == row['sha256'], 'SOURCE_DRIFT', 'DB source differs: ' + row['path'])
        if git is not None:
            tracked = git_call(git, db_root, ['ls-files', '--error-unmatch', '--', row['path']])
            require(tracked.returncode == 0, 'SOURCE_DRIFT', 'DB source is not tracked: ' + row['path'])
    for name, wanted in {**manifest['webSources'], **manifest['reuseSources']}.items():
        require(digest(read_source(web_root, name)) == wanted, 'SOURCE_DRIFT', 'Web source differs: ' + name)
        if git is not None and name not in OWNED:
            tracked = git_call(git, web_root, ['ls-files', '--error-unmatch', '--', name])
            require(tracked.returncode == 0, 'SOURCE_DRIFT', 'Web source is not tracked: ' + name)


def verify_sdk(manifest, web_root):
    for package, (package_json, bundle) in SDK_FILES.items():
        row = manifest['sdk'][package]
        try:
            data = {name: read_source(web_root, name) for name in (package_json, bundle)}
        except BoundaryError as exc:
            raise BoundaryError('SDK_BUNDLE', 'Installed SDK file is unavailable: ' + package) from exc
        require(all(digest(data[name]) == row['files'][name] for name in data), 'SDK_BUNDLE',
                'Installed SDK bytes differ: ' + package)
        try:
            installed = json.loads(data[package_json]).get('version')
        except (ValueError, AttributeError) as exc:
            raise BoundaryError('SDK_BUNDLE', 'Installed SDK package metadata is invalid') from exc
        require(installed == row['version'] == SDK_VERSION, 'SDK_BUNDLE', 'Installed SDK version differs: ' + package)


def inspect_image(docker, reference):
    try:
        result = docker(['image', 'inspect', reference], timeout=30)
        rows = json.loads(result.stdout) if result.returncode == 0 else None
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired) as exc:
        raise BoundaryError('IMAGE_ID', 'Local image inspection failed: ' + reference) from exc
    require(isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict), 'IMAGE_ID',
            'Required cached image is unavailable; no pull is allowed: ' + reference)
    return rows[0].get('Id')


def verify_images(manifest, docker):
    require(manifest['images'] == PINNED_IMAGES, 'IMAGE_ID', 'Manifest image IDs differ from the approved pins')
    for reference, image_id in PINNED_IMAGES.items():
        require(inspect_image(docker, reference) == image_id, 'IMAGE_ID', 'Cached image ID differs: ' + reference)


def verify_manifest(path, sha256, *, web_root, db_root, git, docker):
    """Refuse a manifest that differs from the approval hash or from the actual sources."""
    path = Path(path)
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise BoundaryError('MANIFEST_HASH', 'Manifest is unavailable') from exc
    require(pin(sha256) and digest(raw) == sha256, 'MANIFEST_HASH', 'Manifest differs from the approval hash')
    manifest = read_json(raw, 'MANIFEST_SET')
    manifest_shape(manifest)
    require(tuple(row['path'] for row in manifest['contractPrefix']) == actual_prefix(db_root),
            'CONTRACT_PREFIX_MISMATCH', 'Manifest and checkout require different migration profiles')
    verify_heads(manifest, web_root, db_root, git)
    verify_sources(manifest, web_root, db_root, git)
    verify_sdk(manifest, web_root)
    verify_images(manifest, docker)
    require(path.read_bytes() == raw, 'MANIFEST_HASH', 'Manifest changed during verification')
    return copy.deepcopy(manifest)


def actual_prefix(db_root):
    """Return the installation order of the exact legacy or integrated checkout profile."""
    for name in CONTRACT_PREFIX:
        require((Path(db_root) / name).is_file(), 'CONTRACT_PREFIX_MISMATCH', 'Contract stage is missing: ' + name)
    last_current = CURRENT10[-1].rsplit('/', 1)[1]
    later = sorted(MIGRATIONS + path.name for path in (Path(db_root) / MIGRATIONS).glob('*.sql')
                   if path.name > last_current)
    if tuple(later) == M1_TO_M5:
        return CONTRACT_PREFIX
    require(tuple(later) == tuple(sorted((*M1_TO_M5, *INTEGRATED_BASELINE_PINS))), 'CONTRACT_PREFIX_MISMATCH',
            'Unexpected or incomplete migration set after current10')
    return (*INTEGRATED_BASELINE_PINS, *CONTRACT_PREFIX)


def build_manifest(*, web_root, db_root, git, docker):
    web_root, db_root = Path(web_root), Path(db_root)
    prefix = actual_prefix(db_root)
    heads = {}
    for root, key in ((web_root, 'webHead'), (db_root, 'dbHead')):
        actual = git_call(git, root, ['rev-parse', 'HEAD'])
        require(actual.returncode == 0 and HEAD.fullmatch(actual.stdout.strip()) is not None, 'HEAD_DRIFT', 'HEAD is unavailable')
        heads[key] = actual.stdout.strip()
    ancestor = git_call(git, db_root, ['merge-base', '--is-ancestor', DB_PRODUCT_COMMIT, 'HEAD'])
    require(ancestor.returncode == 0, 'HEAD_DRIFT', 'D6 product commit is not an ancestor of the D HEAD')
    reuse = {name: digest(read_source(web_root, name)) for name in REUSE.values()}
    seed_pins = {name: {'sha256': digest(read_source(db_root, name))} for name in (*NATIVE_HELPERS, NATIVE_BOOTSTRAP, NATIVE_CONTROL)}
    with verified_reuse(web_root, reuse) as modules:
        native = native_dependencies(modules, db_root, seed_pins)
    additional = (VOTE_TYPE_SOURCE, VOTE_PRIOR_SOURCE) if prefix != CONTRACT_PREFIX else ()
    dependency_names = dict.fromkeys((*NATIVE_HELPERS, NATIVE_BOOTSTRAP, NATIVE_CONTROL, *native['sources'], *additional))
    dependency_names = [name for name in dependency_names if name not in prefix]
    manifest = {
        **heads, 'dbProductCommit': DB_PRODUCT_COMMIT,
        'kit': {'path': KIT_PATH, 'sha256': digest(read_source(db_root, KIT_PATH))},
        'contractPrefix': [{'path': name, 'sha256': digest(read_source(db_root, name))} for name in prefix],
        'dependencySources': [{'path': name, 'sha256': digest(read_source(db_root, name))} for name in dependency_names],
        'dependencySqlSha256': native['dependencySqlSha256'], 'queueDependencySqlSha256': native['queueDependencySqlSha256'],
        'webSources': {name: digest(read_source(web_root, name)) for name in sorted(REQUIRED_WEB_SOURCES)},
        'reuseSources': reuse,
        'sdk': {package: {'version': SDK_VERSION, 'files': {name: digest(read_source(web_root, name)) for name in files}}
                for package, files in SDK_FILES.items()},
        'images': dict(PINNED_IMAGES)}
    manifest_shape(manifest)
    verify_heads(manifest, web_root, db_root, git)
    verify_sources(manifest, web_root, db_root, git)
    verify_sdk(manifest, web_root)
    verify_images(manifest, docker)
    return manifest


# ---------------------------------------------------------------------------
# Verified helper reuse and native dependency derivation
# ---------------------------------------------------------------------------

class VerifiedLoader(importlib.abc.Loader):
    def __init__(self, path, data):
        self.path, self.data = str(path), data

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        module.__file__, module.__cached__ = self.path, None
        exec(compile(self.data, self.path, 'exec'), module.__dict__)


@contextmanager
def verified_reuse(web_root, pins):
    """Execute exactly the pinned bytes of pair_fixture.py and setup_db.py. No pyc is read or written."""
    require(isinstance(pins, dict) and set(pins) == set(REUSE.values()), 'MANIFEST_SET', 'Reused helper set differs')
    require(not any(name in sys.modules for name in REUSE), 'MODULE_PREBOUND', 'A reused module is already bound')
    sources = {}
    for name, path in REUSE.items():
        data = read_source(web_root, path)
        require(digest(data) == pins[path], 'SOURCE_DRIFT', 'Reused helper differs: ' + path)
        sources[name] = (Path(web_root) / path, data)
    previous = (sys.dont_write_bytecode, sys.path[:], sys.meta_path[:])
    modules = {}
    try:
        sys.dont_write_bytecode = True
        for name, (path, data) in sources.items():
            loader = VerifiedLoader(path, data)
            module = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, loader, origin=str(path)))
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


def native_dependencies(modules, db_root, pins):
    """Recompute both dependency SQL digests from the verified D helpers of the actual D tree."""
    db_root = Path(db_root)
    for name in NATIVE_HELPERS:
        require(name in pins, 'DEPENDENCY_CLOSURE', 'A native helper has no pin: ' + name)
    with modules['setup_db'].verified_helpers(db_root, {'files': pins}):
        durability = importlib.import_module('web_payment_durability_fixture')
        order = importlib.import_module('web_payment_order_fixture')
        base = importlib.import_module('web_payment_fixture')
        require(Path(base.ROOT) == db_root.resolve() or Path(base.ROOT) == db_root, 'DEPENDENCY_CLOSURE',
                'Native helper root is not the approved D tree')
        definitions, sources = durability.durability_dependencies()
        queue_sql, queue_sources = durability.queue_dependencies()
        bootstrap, control = Path(order.BOOTSTRAP), Path(durability.CONTROL)
    names = [str(Path(path).relative_to(base.ROOT)) for path in dict.fromkeys([*sources, *queue_sources])]
    require(str(bootstrap.relative_to(base.ROOT)) == NATIVE_BOOTSTRAP and str(control.relative_to(base.ROOT)) == NATIVE_CONTROL,
            'DEPENDENCY_CLOSURE', 'Native bootstrap or engine control path differs')
    return {'definitions': definitions, 'queueSql': queue_sql, 'sources': names,
            'dependencySqlSha256': digest(definitions.encode()), 'queueDependencySqlSha256': digest(queue_sql.encode())}


# ---------------------------------------------------------------------------
# Owned child lifecycle
# ---------------------------------------------------------------------------

class OwnedChildren:
    """Children of one owned run and container. A restart is proven only from boundary records."""

    def __init__(self, process, *, owner, sequence=None):
        require(isinstance(owner, dict) and isinstance(owner.get('runId'), str) and isinstance(owner.get('containerId'), str),
                'CHILD_OWNERSHIP', 'Owner needs a run ID and a container ID')
        self.process, self.owner = process, dict(owner)
        self._sequence = sequence or self._count
        self._counter = 0
        self._records = {}
        self.trail = []
        self.proofs = []

    def _count(self):
        self._counter += 1
        return self._counter

    def _owned(self, role):
        require(role in self._records, 'CHILD_OWNERSHIP', 'No owned process record for this role')
        return self._records[role]

    def _events(self, role, event):
        return [row for row in self.trail if row['role'] == role and row['event'] == event]

    def spawn(self, role, argv):
        require(isinstance(role, str) and role and role not in self._records, 'CHILD_OWNERSHIP', 'Role is empty or already used')
        record = self.process.spawn(role, list(argv))
        require(isinstance(record, dict) and type(record.get('pid')) is int and record['pid'] > 0
                and isinstance(record.get('startId'), str) and record['startId'] != ''
                and record.get('runId') == self.owner['runId'] and record.get('containerId') == self.owner['containerId'],
                'CHILD_OWNERSHIP', 'Spawned process is not an owned record of this run and container')
        self._records[role] = {key: record[key] for key in ('pid', 'startId', 'runId', 'containerId')}
        self.trail.append({'event': 'spawn', 'seq': self._sequence(), 'role': role, **self._records[role]})
        return dict(self._records[role])

    def kill(self, role):
        record = self._owned(role)
        self.process.kill(dict(record))
        self.trail.append({'event': 'kill', 'seq': self._sequence(), 'role': role, **record})

    def wait(self, role):
        record = self._owned(role)
        result = self.process.wait(dict(record))
        require(isinstance(result, dict), 'CHILD_NOT_REAPED', 'No termination result')
        row = {'event': 'wait', 'seq': self._sequence(), 'role': role, **record,
               'exitCode': result.get('exitCode'), 'signal': result.get('signal'), 'inspection': result.get('inspection')}
        self.trail.append(row)
        require(row['exitCode'] is not None or row['signal'] is not None, 'CHILD_NOT_REAPED',
                'The process was not observed to terminate')
        return {'exitCode': row['exitCode'], 'signal': row['signal']}

    def restart_proof(self, killed_role, fresh_role):
        killed, fresh = self._owned(killed_role), self._owned(fresh_role)
        proof = restart_evidence(self.trail, killed_role, fresh_role)
        self.proofs.append({'killed': killed_role, 'fresh': fresh_role})
        return {'killed': {**killed, **proof['exit']}, 'fresh': dict(fresh)}


def restart_evidence(trail, killed_role, fresh_role):
    """Shared restart rule of the live child ledger and of the evidence reducer."""
    def rows(role, event):
        return [row for row in trail if row.get('role') == role and row.get('event') == event]
    spawned, fresh = rows(killed_role, 'spawn'), rows(fresh_role, 'spawn')
    require(len(spawned) == 1 and len(fresh) == 1, 'CHILD_OWNERSHIP', 'A restart role has no single spawn record')
    waits = [row for row in rows(killed_role, 'wait') if row.get('exitCode') is not None or row.get('signal') is not None]
    require(len(waits) >= 1, 'CHILD_NOT_REAPED', 'The killed process has no observed termination')
    wait = waits[0]
    kills = [row for row in rows(killed_role, 'kill') if row['seq'] < wait['seq']]
    require(len(kills) >= 1, 'RESTART_UNPROVEN', 'The process ended without the owned kill')
    require(fresh[0]['seq'] > wait['seq'], 'RESTART_UNPROVEN', 'The fresh process started before the observed termination')
    require(fresh[0]['pid'] != spawned[0]['pid'] and fresh[0]['startId'] != spawned[0]['startId'],
            'RESTART_UNPROVEN', 'A repeated PID or start identity is not a fresh process')
    return {'exit': {'exitCode': wait.get('exitCode'), 'signal': wait.get('signal')}, 'waitSeq': wait['seq'],
            'freshSeq': fresh[0]['seq']}


# ---------------------------------------------------------------------------
# Evidence reducer
# ---------------------------------------------------------------------------

def _row_state(row):
    """Required DB state for one proof RPC. Delivery and DB state are separate facts."""
    require(row.get('delivery') in ('ACK', 'ACK_LOST', 'FAILED_BEFORE_COMMIT', 'REJECTED'), 'RECEIPT_SHAPE',
            'Unknown RPC delivery')
    if row['delivery'] in ('FAILED_BEFORE_COMMIT', 'REJECTED') or row.get('writes') is False:
        return 'ABSENT'
    return 'COMMITTED'


def _units(case_id, case):
    yield case_id, case
    subcases = case.get('subcases', {})
    require(isinstance(subcases, dict), 'RECEIPT_SHAPE', 'subcases must be an object')
    for name, unit in subcases.items():
        yield case_id + '/' + name, unit


def _check_unit(label, unit, spawns, waits):
    require(isinstance(unit, dict) and isinstance(unit.get('order'), str) and UUID.fullmatch(unit['order']) is not None
            and all(isinstance(unit.get(key), list) for key in ('tape', 'commitClaims', 'observations')),
            'RECEIPT_SHAPE', 'Case evidence shape differs: ' + label)
    tape = sorted(unit['tape'], key=lambda row: row['seq'])
    providers = [row for row in tape if row.get('kind') == 'provider']
    rpcs = [row for row in tape if row.get('kind') == 'rpc']
    require(len(providers) + len(rpcs) == len(tape), 'RECEIPT_SHAPE', 'Unknown tape row kind: ' + label)
    for row in tape:
        require(row.get('process') in spawns and row['seq'] > spawns[row['process']]['seq'], 'CHILD_OWNERSHIP',
                'Tape row has no owned process record: ' + label)
    require(all(row.get('operation') in MEASURED_PROVIDER for row in providers)
            and all(row.get('rpc') in MEASURED_RPCS for row in rpcs), 'UNEXPECTED_REQUEST',
            'Unapproved provider operation or RPC on the measured tape: ' + label)
    captures = [row for row in providers if row['operation'] == 'CAPTURE']
    require(len(captures) >= 1, 'CAPTURE_COUNT_MISMATCH', 'The required capture POST is missing: ' + label)
    require(len(captures) == 1, 'CAPTURE_DUPLICATE', 'More than one capture POST for one order: ' + label)

    # Required proofs come from the case and its tape, not from the claims of the receipt.
    required = {}
    for row in rpcs:
        if row['rpc'] in PROOF_RPCS:
            key = (row['rpc'], row.get('attempt'))
            require(type(key[1]) is int and key not in required, 'RECEIPT_SHAPE', 'Proof RPC attempt is missing or repeated')
            required[key] = (_row_state(row), row['seq'])
    if not any(key[0] == P1 for key in required):
        ended = waits.get(captures[0]['process'])
        required[(P1, 1)] = ('ABSENT', max(captures[0]['seq'], ended['seq'] if ended else 0))
    for claim in unit['commitClaims']:
        key = (claim.get('rpc'), claim.get('attempt'))
        require(key in required and claim.get('state') == required[key][0], 'OBSERVER_MISMATCH',
                'Commit claim disagrees with the tape: ' + label)
    drivers = {row.get('connection') for row in rpcs}
    covered = {}
    for row in unit['observations']:
        key = (row.get('rpc'), row.get('attempt'))
        require(row.get('order') == unit['order'] and key in required, 'OBSERVER_MISMATCH',
                'Observer row does not bind this order, RPC and attempt: ' + label)
        connection = row.get('connection')
        require(isinstance(connection, str) and connection != '' and connection not in drivers
                and not connection.startswith('driver:'), 'OBSERVER_MISMATCH', 'Observer used the driver connection: ' + label)
        state, after = required[key]
        require(row.get('state') == state, 'OBSERVER_MISMATCH', 'Observer state disagrees with the delivery: ' + label)
        require(type(row.get('seq')) is int and row['seq'] > after, 'OBSERVER_MISMATCH', 'Observer row is stale: ' + label)
        covered[key] = min(row['seq'], covered.get(key, row['seq']))
    require(set(covered) == set(required), 'COMMIT_UNOBSERVED', 'A required commit or absence has no observer row: ' + label)

    # Protected read. A GET before the intent barrier is the unprotected pre-claim read (S1).
    barrier = [row['seq'] for row in tape if row.get('rpc') in (RPC['intent'], P1) or row.get('operation') == 'CAPTURE']
    used = set()
    for get in (row for row in providers if row['operation'] == 'ORDER_READ'):
        if get['seq'] < min(barrier):
            continue
        process = get['process']
        mine = [row for row in rpcs if row['process'] == process]
        opens = [row for row in mine if row['rpc'] == P2_OPEN and row['delivery'] == 'ACK' and _row_state(row) == 'COMMITTED'
                 and row['seq'] < get['seq'] and row['seq'] not in used
                 and covered[(P2_OPEN, row['attempt'])] < get['seq']
                 and not any(done['rpc'] == P2_COMPLETE and row['seq'] < done['seq'] < get['seq'] for done in mine)]
        require(len(opens) >= 1, 'PROTECTED_READ_ORDER', 'A GET has no committed open read cycle of its process: ' + label)
        opened = opens[-1]
        used.add(opened['seq'])
        if any(row['process'] == process for row in captures):
            classified = [row for row in mine if row['rpc'] == P1 and row['delivery'] == 'ACK' and _row_state(row) == 'COMMITTED'
                          and row['seq'] < opened['seq'] and covered[(P1, row['attempt'])] < opened['seq']]
            require(len(classified) >= 1, 'PROTECTED_READ_ORDER',
                    'The submitting process read without its acknowledged P1 commit: ' + label)
    return {'order': unit['order'], 'captures': len(captures), 'proofs': len(required)}


def reduce_evidence(evidence):
    """Reduce one phase receipt to its checked case list. Every violation raises BoundaryError."""
    require(isinstance(evidence, dict), 'RECEIPT_SHAPE', 'Receipt must be an object')
    phase, cases = evidence.get('phase'), evidence.get('cases')
    require(phase in PHASE_CASES and isinstance(cases, dict), 'CASE_SET_MISMATCH', 'Unknown phase or missing cases')
    approved = list(PHASE_CASES[phase])
    require(set(cases) == set(approved) and len(cases) == len(approved), 'CASE_SET_MISMATCH',
            'Receipt cases differ from the approved list of the phase')
    require(evidence.get('expectedCases') in (None, approved), 'CASE_SET_MISMATCH',
            'Receipt expectation differs from the approved list of the phase')
    require(evidence.get('image') in ('postgres:15.8', 'postgres:17.6') and isinstance(evidence.get('runLabel'), str)
            and pin(evidence.get('manifestSha256')), 'RECEIPT_SHAPE', 'Run identity is incomplete')

    resources = evidence.get('resources')
    require(isinstance(resources, dict) and isinstance(resources.get('runId'), str) and UUID.fullmatch(resources['runId']) is not None
            and isinstance(resources.get('network'), dict) and isinstance(resources.get('containers'), list),
            'RESOURCE_IDENTITY', 'Resource ledger is incomplete')
    rows = [resources['network'], *resources['containers']]
    require(all(isinstance(row, dict) and isinstance(row.get('id'), str) and FULL_ID.fullmatch(row['id']) is not None
                and row.get('owned') is True for row in rows)
            and sorted(row.get('role') for row in resources['containers']) == ['node', 'postgres', 'postgrest']
            and len({row['id'] for row in rows}) == 4, 'RESOURCE_IDENTITY',
            'A resource has no exact owned full ID')
    require(all(row.get('absent') is True for row in rows), 'CLEANUP_UNPROVEN', 'Exact queried absence is not established')
    require(evidence.get('unexpectedRequests') == [], 'UNEXPECTED_REQUEST', 'A request left the approved destinations')

    trail, proofs = evidence.get('children'), evidence.get('restartProofs')
    require(isinstance(trail, list) and isinstance(proofs, list), 'RECEIPT_SHAPE', 'Child ledger is missing')
    node = next(row['id'] for row in resources['containers'] if row['role'] == 'node')
    spawns, waits = {}, {}
    for row in trail:
        require(isinstance(row, dict) and row.get('event') in ('spawn', 'kill', 'wait') and type(row.get('seq')) is int
                and isinstance(row.get('role'), str), 'RECEIPT_SHAPE', 'Child event shape differs')
        if row['event'] == 'spawn':
            require(row['role'] not in spawns and type(row.get('pid')) is int and isinstance(row.get('startId'), str)
                    and row.get('runId') == resources['runId'] and row.get('containerId') == node,
                    'CHILD_OWNERSHIP', 'A child is not an owned process of this run and container')
            spawns[row['role']] = row
        elif row['event'] == 'wait':
            waits.setdefault(row['role'], row)
    units = [(label, unit) for case_id in approved for label, unit in _units(case_id, cases[case_id])]
    for label, unit in units:
        require(isinstance(unit, dict) and isinstance(unit.get('tape'), list), 'RECEIPT_SHAPE', 'Tape is missing: ' + label)
        for row in unit['tape']:
            require(isinstance(row, dict) and type(row.get('seq')) is int, 'RECEIPT_SHAPE', 'Tape row shape differs')
            require(row.get('process') in spawns, 'CHILD_OWNERSHIP', 'Tape row has no owned process record: ' + label)
    pairs = set()
    for proof in proofs:
        require(isinstance(proof, dict) and proof.get('killed') in spawns and proof.get('fresh') in spawns,
                'CHILD_OWNERSHIP', 'Restart proof names a process without a spawn record')
        restart_evidence(trail, proof['killed'], proof['fresh'])
        pairs.add((proof['killed'], proof['fresh']))
    for label, unit in units:
        order = []
        for row in sorted(unit['tape'], key=lambda item: item['seq']):
            if row['process'] not in order:
                order.append(row['process'])
        for earlier, later in zip(order, order[1:]):
            require((earlier, later) in pairs, 'RESTART_UNPROVEN', 'Two processes on one order have no restart proof: ' + label)
            ended = waits[earlier]['seq']
            require(all(row['seq'] > ended for row in unit['tape'] if row['process'] == later)
                    and all(row['seq'] < ended for row in unit['tape'] if row['process'] == earlier),
                    'RESTART_UNPROVEN', 'Process events overlap the observed termination: ' + label)
    reduced = {label: _check_unit(label, unit, spawns, waits) for label, unit in units}
    return {'phase': phase, 'image': evidence['image'], 'runLabel': evidence['runLabel'],
            'manifestSha256': evidence['manifestSha256'], 'caseIds': approved, 'units': reduced}


# ---------------------------------------------------------------------------
# Persisted report
# ---------------------------------------------------------------------------

def persistable_report(receipt, *, secrets):
    """Copy for disk. A raw token becomes its SHA-256. Any other secret occurrence is refused."""
    known = {item for item in secrets if isinstance(item, str) and item != ''}

    def clean(value):
        if isinstance(value, dict):
            result = {}
            for key, item in value.items():
                require(isinstance(key, str), 'RECEIPT_SHAPE', 'Report keys must be text')
                if key in TOKEN_KEYS and isinstance(item, str):
                    known.add(item)
                    result[key + 'Sha256'] = digest(item.encode())
                else:
                    result[key] = clean(item)
            return result
        if isinstance(value, (list, tuple)):
            return [clean(item) for item in value]
        require(value is None or isinstance(value, (str, int, float, bool)), 'RECEIPT_SHAPE', 'Report value is not JSON')
        return value

    report = clean(copy.deepcopy(receipt))

    def scan(value):
        if isinstance(value, dict):
            for key, item in value.items():
                scan(key)
                scan(item)
        elif isinstance(value, list):
            for item in value:
                scan(item)
        elif isinstance(value, str):
            require(not any(secret in value for secret in known), 'SECRET_LEAK',
                    'A token, credential or sentinel would be persisted')

    scan(report)
    return report


def persist(path, value, secrets, *, text=False):
    """The only writer of run output. Text logs are refused when they contain a secret."""
    if text:
        require(not any(secret and secret in value for secret in secrets), 'SECRET_LEAK', 'A log would persist a secret')
        Path(path).write_text(value)
    else:
        Path(path).write_text(json.dumps(persistable_report(value, secrets=secrets), indent=2) + '\n')


# ---------------------------------------------------------------------------
# Execution boundaries
# ---------------------------------------------------------------------------

def _command(argv, **kwargs):
    return subprocess.run(argv, env=ENV, **kwargs)


def docker_endpoint():
    """The one approved endpoint: the same-user Docker Desktop Unix socket of this workspace.

    No environment value, context or other path selects an endpoint. A unix:// text alone is not
    accepted: the path must be this exact physical socket and its owner must be the current user.
    """
    path = Path.home() / '.docker/run/docker.sock'
    try:
        require(not path.is_symlink() and path.resolve(strict=True) == path, 'DOCKER_ENDPOINT',
                'The approved Docker socket path is not a physical path')
        status = path.stat()
        require(stat.S_ISSOCK(status.st_mode) and status.st_uid == os.getuid(), 'DOCKER_ENDPOINT',
                'The approved Docker socket is not a same-user Unix socket')
    except OSError as exc:
        raise BoundaryError('DOCKER_ENDPOINT', 'The approved local Docker socket is unavailable') from exc
    return 'unix://' + str(path)


class LocalDocker:
    """Local Docker CLI over one Unix socket with an empty client configuration."""

    def __init__(self, executable, endpoint, config_dir, log=None):
        try:
            self.executable = str(Path(executable).resolve(strict=True))
            self.endpoint, self.config, self.log, self.count = endpoint, Path(config_dir), log, 0
            self.config.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise BoundaryError('EXECUTABLES', 'The installed Docker client is unavailable') from exc

    def argv(self, args):
        return [self.executable, '--config', str(self.config), '--host', self.endpoint, *args]

    def __call__(self, args, *, timeout=30, input=None):
        require(0 < timeout <= 30, 'DOCKER_DEADLINE', 'Docker commands need a deadline of at most 30 seconds')
        self.count += 1
        record = {'sequence': self.count, 'args': [str(item)[:200] for item in args[:8]], 'timeoutSeconds': timeout}
        try:
            result = subprocess.run(self.argv(args), input=input, capture_output=True, text=True, timeout=timeout, env=ENV)
            record['exitCode'] = result.returncode
            return result
        except BaseException as exc:
            record.update(exitCode=None, error=type(exc).__name__)
            raise
        finally:
            if self.log is not None:
                self.log.append(record)

    def popen(self, args):
        return subprocess.Popen(self.argv(args), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding='utf-8', env=ENV)


class ChildChannel:
    """JSON-line channel to one Node child. Only H1_EVENT lines are events."""

    def __init__(self, popen):
        self.popen, self.events, self.stdout, self.stderr = popen, queue.Queue(), [], []
        for stream, sink in ((popen.stdout, self._out), (popen.stderr, self.stderr.append)):
            threading.Thread(target=self._pump, args=(stream, sink), daemon=True).start()

    def _pump(self, stream, sink):
        for line in stream:
            sink(line)
        if stream is self.popen.stdout:
            self.events.put(None)

    def _out(self, line):
        self.stdout.append(line)
        if line.startswith('H1_EVENT '):
            self.events.put(line[9:])

    def send(self, message):
        self.popen.stdin.write(json.dumps(message) + '\n')
        self.popen.stdin.flush()

    def event(self, timeout):
        try:
            line = self.events.get(timeout=timeout)
        except queue.Empty as exc:
            raise BoundaryError('CHILD_TIMEOUT', 'The child sent no event before the deadline') from exc
        require(line is not None, 'CHILD_EXITED', 'The child closed its event stream')
        return read_json(line, 'CHILD_EVENT')


class ContainerProcess:
    """Actual Node children in the exact owned Node container.

    The identity of a child is its PID plus the kernel start time, both read by
    the root from /proc in the container. The exit of the host-side docker exec
    client is not accepted as termination: the root queries /proc again.
    """

    def __init__(self, docker, pair):
        self.docker, self.pair, self.channels, self.killed = docker, pair, {}, set()

    def _cid(self):
        self.pair.validate()
        return self.pair.role('node')['container_id']

    # Explicit markers separate an authoritative absent PID from a failed or malformed inspection.
    INSPECT = ('if [ ! -d "/proc/$1" ]; then echo H1_PROC_ABSENT; exit 0; fi; echo H1_PROC_PRESENT; '
               'cat /proc/sys/kernel/random/boot_id || exit 9; cat "/proc/$1/stat" || exit 9; '
               'tr "\\0" " " < "/proc/$1/cmdline" || exit 9; echo; echo H1_PROC_END')
    # One exec: read the identity of the PID and signal it only when the start identity is the recorded one.
    KILL = ('[ -d "/proc/$1" ] || { echo H1_KILL_TARGET_ABSENT; exit 3; }; '
            'boot=$(cat /proc/sys/kernel/random/boot_id) || exit 4; stat=$(cat "/proc/$1/stat") || exit 4; '
            'pid=$1; want=$2; rest=${stat##*) }; set -- $rest; '
            '[ "boot:$boot:start:${20}" = "$want" ] || { echo H1_KILL_IDENTITY_DIFFERS; exit 5; }; '
            'kill -KILL "$pid" || exit 6; echo H1_KILL_SENT')

    def _inspect(self, cid, pid):
        """('PRESENT', identity), ('ABSENT', None) or ('UNKNOWN', None). Only the first two are evidence."""
        try:
            result = self.docker(['exec', cid, 'sh', '-c', self.INSPECT, 'sh', str(pid)])
        except (OSError, subprocess.SubprocessError):
            return 'UNKNOWN', None
        lines = result.stdout.splitlines() if isinstance(result.stdout, str) else []
        if result.returncode == 0 and lines == ['H1_PROC_ABSENT']:
            return 'ABSENT', None
        if result.returncode == 0 and len(lines) == 5 and lines[0] == 'H1_PROC_PRESENT' and lines[4] == 'H1_PROC_END' \
                and ')' in lines[2] and re.fullmatch(r'[0-9a-f-]{36}', lines[1].strip()):
            fields = lines[2].rsplit(')', 1)[1].split()
            if len(fields) > 19 and fields[19].isdigit():
                return 'PRESENT', {'startId': 'boot:' + lines[1].strip() + ':start:' + fields[19], 'cmdline': lines[3].strip()}
        return 'UNKNOWN', None

    def spawn(self, role, argv):
        cid = self._cid()
        channel = ChildChannel(self.docker.popen(['exec', '-i', cid, *argv, role]))
        hello = channel.event(20)
        require(hello.get('type') == 'hello' and hello.get('role') == role and type(hello.get('pid')) is int,
                'CHILD_OWNERSHIP', 'The child did not report its process identity')
        state, actual = self._inspect(cid, hello['pid'])
        require(state == 'PRESENT' and actual['startId'] == hello.get('startId') and BUNDLE_NAME in actual['cmdline']
                and actual['cmdline'].split()[-1] == role, 'CHILD_OWNERSHIP',
                'The root could not confirm the child process in the owned container')
        record = {'pid': hello['pid'], 'startId': actual['startId'], 'runId': self.pair.run_id, 'containerId': cid}
        self.channels[actual['startId']] = (channel, hello)
        return record

    def kill(self, record):
        # pair.validate() rechecks the exact owned container. The identity check and the signal share one exec.
        cid = self._cid()
        require(record['containerId'] == cid and record['startId'] in self.channels, 'CHILD_OWNERSHIP',
                'Kill target is not a recorded child of the owned container')
        result = self.docker(['exec', cid, 'sh', '-c', self.KILL, 'sh', str(record['pid']), record['startId']])
        require(result.returncode == 0 and result.stdout.strip() == 'H1_KILL_SENT', 'CHILD_KILL',
                'The identity-checked kill did not run: ' + result.stdout.strip()[:40])
        self.killed.add(record['startId'])

    def wait(self, record):
        """Gone needs both the client exit and a successful proof that the PID is absent or is another process."""
        channel, _ = self.channels[record['startId']]
        try:
            client_exit = channel.popen.wait(timeout=20)
        except subprocess.TimeoutExpired:
            return {'exitCode': None, 'signal': None, 'inspection': 'CLIENT_RUNNING'}
        for _attempt in range(3):
            state, actual = self._inspect(self._cid(), record['pid'])
            if state == 'PRESENT' and actual['startId'] == record['startId']:
                return {'exitCode': None, 'signal': None, 'inspection': 'STILL_PRESENT'}
            if state in ('ABSENT', 'PRESENT'):
                return {'exitCode': client_exit, 'signal': 'SIGKILL' if record['startId'] in self.killed else None,
                        'inspection': 'ABSENT' if state == 'ABSENT' else 'OTHER_START_IDENTITY'}
            time.sleep(0.5)
        # Unavailable, malformed or ambiguous inspection. The child is not recorded as gone.
        return {'exitCode': None, 'signal': None, 'inspection': 'UNKNOWN'}


def jwt(role, secret):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode().rstrip('=')
    message = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode(
        {'role': role, 'iss': 'public-order-http-fixture', 'exp': 4102444800})
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return message + '.' + base64.urlsafe_b64encode(signature).decode().rstrip('=')


def runtime_flags():
    require(sys.flags.isolated == 1 and sys.flags.dont_write_bytecode == 1, 'INTERPRETER_FLAGS',
            'Actual -I -B interpreter flags are required')
    return {'isolated': sys.flags.isolated, 'dontWriteBytecode': sys.flags.dont_write_bytecode,
            'safePath': getattr(sys.flags, 'safe_path', None), 'executable': sys.executable, 'version': sys.version}


# ---------------------------------------------------------------------------
# Database setup and observer
# ---------------------------------------------------------------------------

def install_sql(pair, out, stage, sql, *, user, secrets, marker=None, evidence=None):
    text = sql.decode('utf-8', errors='strict') if isinstance(sql, bytes) else sql
    result = pair.sql(text, user=user, check=False)
    persist(out / (stage + '.log'), result.stdout + result.stderr, secrets, text=True)
    if evidence is not None:
        evidence.setdefault('sqlStages', []).append({'stage': stage, 'exitCode': result.returncode, 'user': user,
            'deliveredSha256': digest(text.encode()), 'marker': marker})
    require(type(result.returncode) is int and result.returncode == 0, 'SQL_STAGE_FAILURE', 'SQL stage failed: ' + stage)
    if marker:
        lines = result.stdout.splitlines()
        require(lines.count(marker) == 1 and lines[-1:] == [marker], 'SQL_STAGE_MARKER', 'SQL stage marker differs: ' + stage)
    return result


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def integrated_vote_prerequisites(read_pinned):
    # The selected-source payment fixture has no vote endpoint or migration ledger.
    # Install the authentic prior vote function so the migration can verify and patch it.
    vote_type = re.match(r'create type public\.wallet_vote_result as \([\s\S]*?^\);',
                         read_pinned(VOTE_TYPE_SOURCE).decode(), re.MULTILINE)
    prior = read_pinned(VOTE_PRIOR_SOURCE).decode().split('$prior$')
    require(vote_type is not None and len(prior) == 3 and prior[1].startswith(
        'CREATE OR REPLACE FUNCTION public.perform_vote_transaction_v3('), 'DEPENDENCY_CLOSURE',
        'Prior vote type or function is unavailable')
    return f"""
begin;
create schema supabase_migrations authorization postgres;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
alter table supabase_migrations.schema_migrations owner to postgres;
set local check_function_bodies=off;
set local search_path=public,extensions,pg_catalog;
{vote_type.group()}
alter type public.wallet_vote_result owner to wallet_command_owner;
{prior[1].rstrip()};
alter function public.perform_vote_transaction_v3(uuid,integer,integer,integer,uuid) owner to wallet_command_owner;
revoke all on function public.perform_vote_transaction_v3(uuid,integer,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.perform_vote_transaction_v3(uuid,integer,integer,integer,uuid) to service_role,wallet_test;
commit;
"""


def setup_database(pair, modules, manifest, native, out, evidence, secrets, *, db_root, smoke=False, labels=()):
    """Install the verified fixture, approved main baseline, and pending web contract in order."""
    pins = {row['path']: row['sha256'] for row in (*manifest['contractPrefix'], *manifest['dependencySources'])}

    def db_bytes(name):
        data = read_source(db_root, name)
        require(digest(data) == pins.get(name), 'SOURCE_DRIFT', 'Execution input differs from its pin: ' + name)
        return data

    def step(stage, sql, user, marker=None):
        return install_sql(pair, out, stage, sql, user=user, secrets=secrets, marker=marker, evidence=evidence)

    step('bootstrap', db_bytes(NATIVE_BOOTSTRAP), 'fixture_admin')
    step('dependencies', native['definitions'], 'fixture_admin')
    step('queue-dependencies', native['queueSql'], 'fixture_admin')
    prefix = tuple(row['path'] for row in manifest['contractPrefix'])
    if prefix != CONTRACT_PREFIX:
        step('integrated-vote-prerequisites', integrated_vote_prerequisites(db_bytes), 'fixture_admin')
        for name in INTEGRATED_BASELINE_PINS:
            step(name.rsplit('/', 1)[1], 'begin;\n' + db_bytes(name).decode() + '\ncommit;', 'postgres')
            evidence.setdefault('appliedMigrations', []).append(name)
    step('positive-engine-control', db_bytes(NATIVE_CONTROL), 'postgres', 'positive-refund-control-complete')
    evidence['engineControlCompleted'] = True
    for name in (CURRENT10 if smoke else CONTRACT_PREFIX):
        step(name.rsplit('/', 1)[1], db_bytes(name), 'postgres')
        evidence.setdefault('appliedMigrations', []).append(name)
    baseline = 'main5+' if prefix != CONTRACT_PREFIX else ''
    evidence['installedPrefix'] = baseline + ('current10' if smoke else 'current10+M1-M5')
    step('authenticator', 'create role authenticator login noinherit nosuperuser nobypassrls password '
         + sql_literal(modules['pair_fixture'].PUBLIC_PASSWORD)
         + '; grant anon,authenticated,service_role to authenticator; grant connect on database fixture to authenticator;',
         'fixture_admin')
    if not labels:
        return {}
    require(all(re.fullmatch(r'[a-z0-9_.]{1,60}', label) for label in labels) and len(set(labels)) == len(labels),
            'FIXTURE_CASES', 'Invalid order labels')
    seed = read_source(ROOT, PREFIX + 'seed.sql')
    require(digest(seed) == manifest['webSources'][PREFIX + 'seed.sql'], 'SOURCE_DRIFT', 'Seed differs from its pin')
    text = seed.decode().replace('__H1_LABELS__', ','.join(labels))
    result = step('seed', text, 'postgres', 'H1_SEED_COMPLETE')
    rows = [read_json(line, 'FIXTURE_CASES') for line in result.stdout.splitlines() if line.startswith('{')]
    require(len(rows) == len(labels) and all(isinstance(row, dict) and set(row) == {'label', 'actor', 'order'}
            and UUID.fullmatch(str(row['order'])) and UUID.fullmatch(str(row['actor'])) for row in rows)
            and {row['label'] for row in rows} == set(labels) and len({row['order'] for row in rows}) == len(labels)
            and len({row['actor'] for row in rows}) == len(labels), 'FIXTURE_CASES', 'Seed returned other order labels')
    return {row['label']: {'order': row['order'], 'actor': row['actor']} for row in rows}


def observer(pair, sql_bytes, mode, argument='', *, user='fixture_admin'):
    """One observer statement on its own psql connection. Returns the single H1_OBSERVATION object."""
    require(mode in ('contract', 'order', 'catalog') and re.fullmatch(r'[0-9a-f-]{0,36}', argument) is not None,
            'OBSERVER_INPUT', 'Invalid observer request')
    text = sql_bytes.decode().replace('__H1_MODE__', mode).replace('__H1_ORDER__', argument or '00000000-0000-4000-8000-000000000000')
    result = pair.sql(text, user=user, check=False)
    lines = result.stdout.splitlines()
    rows = [line[15:] for line in lines if line.startswith('H1_OBSERVATION ')]
    require(result.returncode == 0 and len(rows) == 1 and lines[-1:] == ['H1_OBSERVER_COMPLETE'], 'OBSERVER_RESULT',
            'Observer statement failed or returned an ambiguous result')
    value = read_json(rows[0], 'OBSERVER_RESULT')
    require(isinstance(value, dict) and value.get('mode') == mode and value.get('sessionUser') == user
            and type(value.get('backendPid')) is int, 'OBSERVER_RESULT', 'Observer identity differs')
    return value


def require_installed_contract(pair, sql_bytes):
    """Fail closed when the H1 contract (M1-M5) is not installed. current10 alone is refused here."""
    value = observer(pair, sql_bytes, 'contract')
    missing = sorted(value.get('missing', ['<unreadable>']))
    if missing or value.get('installedContract') != 'current10+M1-M5':
        failure = BoundaryError('MISSING_CONTRACT', 'Installed contract lacks: ' + ', '.join(missing))
        failure.missing = missing
        raise failure
    return value


# ---------------------------------------------------------------------------
# Phase execution
# ---------------------------------------------------------------------------

def provider_order_id(order):
    return 'H1O' + order.replace('-', '').upper()[:30]


def capture_id(order, variant):
    return 'H1C' + variant + order.replace('-', '').upper()[:28]


def approved_get():
    return {'http': 200, 'order': 'APPROVED', 'captures': []}


def body(order_status, captures=(), **extra):
    return {'http': 200, 'order': order_status,
            'captures': [{'v': variant, 'status': status} for variant, status in captures], **extra}


class PhaseRun:
    """Drives the approved cases of one phase and records tape, observer rows and literal checks."""

    def __init__(self, *, phase, pair, docker, observer_sql, faults_sql, orders, init, argv, out, secrets):
        self.phase, self.pair, self.orders, self.init, self.argv = phase, pair, orders, init, argv
        self.observer_sql, self.faults_sql, self.out, self.secrets = observer_sql, faults_sql, out, secrets
        self.seq_value = 0
        self.process = ContainerProcess(docker, pair)
        self.children = OwnedChildren(self.process, owner={'runId': pair.run_id, 'containerId': pair.role('node')['container_id']},
                                      sequence=self.seq)
        self.roles, self.steps, self.attempts, self.snapshots = {}, 0, {}, {}
        self.cases = {case: self.unit(case) for case in PHASE_CASES[phase]}
        self.unexpected, self.case_errors, self.scan_tape = [], {}, []

    def seq(self):
        self.seq_value += 1
        return self.seq_value

    def unit(self, label):
        require(label in self.orders, 'FIXTURE_CASES', 'No seeded order: ' + label)
        return {'order': self.orders[label]['order'], 'actor': self.orders[label]['actor'], 'tape': [], 'commitClaims': [],
                'observations': [], 'setupTape': [], 'checks': [], 'outcomes': [], 'subcases': {}}

    def order(self, case, sub=None):
        return self.target(case, sub)['order']

    def target(self, case, sub):
        if sub is None:
            return self.cases[case]
        return self.cases[case]['subcases'].setdefault(sub, {key: value for key, value in self.unit(case + '.' + sub).items()
                                                               if key != 'subcases'})

    # -- children ---------------------------------------------------------
    def start(self, role):
        record = self.children.spawn(role, self.argv)
        channel, hello = self.process.channels[record['startId']]
        self.roles[role] = channel
        channel.send({'op': 'init', **self.init})
        ready = channel.event(20)
        require(ready.get('type') == 'ready' and ready.get('executionPins') == self.init['executionPins'],
                'NODE_EXECUTION_PINS', 'The child executes other artifact bytes')
        return hello

    def kill(self, role):
        self.children.kill(role)
        return self.children.wait(role)

    def finish(self, role):
        """Normal driver termination. Only the integer exit code 0 with no signal is a clean exit.

        wait() first records the observed exit in the trail. An abnormal exit then raises CHILD_EXIT_FAILED,
        and the per-case or run error path fails the run. This path sends no kill, so a failed exit has no
        kill row and can never count as an expected kill.
        """
        self.roles[role].send({'op': 'exit'})
        result = self.children.wait(role)
        require(type(result.get('exitCode')) is int and result['exitCode'] == 0 and result.get('signal') is None,
                'CHILD_EXIT_FAILED', 'The child did not end with exit code 0 and no signal')
        return result

    # -- observer ---------------------------------------------------------
    def snapshot(self, case, sub):
        unit = self.target(case, sub)
        value = observer(self.pair, self.observer_sql, 'order', unit['order'])
        value['seq'] = self.seq()
        self.snapshots[(case, sub)] = value
        return value

    @staticmethod
    def proof_rows(rpc, snapshot):
        if rpc == P1:
            return sorted([row['id'] for row in snapshot['classifications']] + [row['id'] for row in snapshot['classificationConflicts']])
        if rpc == P2_OPEN:
            return sorted(row['id'] for row in snapshot['cycles'])
        return sorted([row['id'] for row in snapshot['cycles'] if row['outcome'] is not None and row['outcome']['completer'] == 'OPENER']
                      + [row['id'] for row in snapshot['lateResults']] + [row['id'] for row in snapshot['cycleConflicts']])

    def observe_proof(self, case, sub, rpc, attempt, wanted, before):
        """Observer row for one required proof. The state is derived from actual row identities."""
        after = self.snapshot(case, sub)
        new = sorted(set(self.proof_rows(rpc, after)) - set(self.proof_rows(rpc, before)))
        state = 'COMMITTED' if new else 'ABSENT'
        unit = self.target(case, sub)
        unit['commitClaims'].append({'rpc': rpc, 'attempt': attempt, 'state': wanted})
        unit['observations'].append({'seq': after['seq'], 'order': unit['order'], 'rpc': rpc, 'attempt': attempt,
            'state': state, 'connection': 'observer:' + after['sessionUser'] + ':' + str(after['backendPid']),
            'rowIds': new, 'dbNow': after['dbNow'], 'postgrestBackendPids': after.get('postgrestBackendPids')})
        self.check(case, sub, rpc + '#' + str(attempt) + ' observed state', state, wanted)
        return after

    def check(self, case, sub, name, actual, wanted):
        self.target(case, sub)['checks'].append({'name': name, 'wanted': wanted, 'actual': actual, 'ok': actual == wanted})

    # -- one driver step --------------------------------------------------
    def step(self, role, case, sub, action, *, provider=None, gates=(), scope='measured', deadline=45, **extra):
        """Send one step. Gate every proof RPC: observe on the root connection, then deliver, drop or kill."""
        unit, channel = self.target(case, sub), self.roles[role]
        self.steps += 1
        before = self.snapshots.get((case, sub)) or self.snapshot(case, sub)
        channel.send({'op': 'step', 'id': self.steps, 'case': case, 'sub': sub, 'order': unit['order'], 'actor': unit['actor'],
                      'action': action, 'scope': scope, 'provider': provider or {}, 'gates': list(gates), **extra})
        # measured: the case tape. scan: the run-level scanner tape. Other scopes: setup and read-only steps.
        tape = unit['tape'] if scope == 'measured' else self.scan_tape if scope == 'scan' else unit['setupTape']
        while True:
            event = channel.event(deadline)
            kind = event.get('type')
            base = {'seq': self.seq(), 'process': role}
            if kind == 'provider':
                tape.append({**base, 'kind': 'provider', 'method': event['method'], 'operation': event['operation'],
                             'status': event.get('status'), 'providerOrderId': event.get('providerOrderId')})
            elif kind in ('rpc', 'gate'):
                name = event['rpc']
                attempt = self.attempts[(unit['order'], name, scope)] = self.attempts.get((unit['order'], name, scope), 0) + 1
                row = {**base, 'kind': 'rpc', 'rpc': name, 'attempt': attempt, 'connection': 'driver:' + role,
                       'status': event.get('status'), 'outcome': event.get('outcome'), 'replayed': event.get('replayed'),
                       'argsSha256': event.get('argsSha256'), 'tokenSha256': event.get('tokenSha256'),
                       'ids': event.get('ids'), 'wireBytes': event.get('bytes'), 'request': event.get('request')}
                if kind == 'rpc':
                    row['delivery'] = 'ACK' if event.get('status') is not None and 200 <= event['status'] < 300 else 'REJECTED'
                    tape.append(row)
                    continue
                mode = event.get('mode', 'observe')
                if scope == 'scan':
                    # A scanner run touches orders of other cases. Its rows are recorded, not used as case proof.
                    accepted = event.get('status') is not None and 200 <= event['status'] < 300
                    tape.append({**row, 'delivery': 'ACK' if accepted else 'REJECTED', 'writes': event.get('writes')})
                    channel.send({'op': 'release', 'gate': event['gate'], 'action': 'deliver'})
                    continue
                if event['stage'] == 'before':
                    if mode == 'hold-before':
                        # The request never left the child. The root kills the exact child at this point.
                        unit.setdefault('gates', []).append({**base, 'rpc': name, 'attempt': attempt, 'mode': mode})
                        ended = self.kill(role)
                        return {'type': 'killed', 'at': name, 'exit': ended}
                    require(mode == 'fail-before', 'GATE_PROTOCOL', 'Unexpected pre-forward gate')
                    row.update(delivery='FAILED_BEFORE_COMMIT', writes=False)
                    tape.append(row)
                    before = self.observe_proof(case, sub, name, attempt, 'ABSENT', before)
                    channel.send({'op': 'release', 'gate': event['gate'], 'action': 'fail'})
                    continue
                accepted = event.get('status') is not None and 200 <= event['status'] < 300
                writes = accepted and event.get('writes') is True
                row.update(delivery=('ACK_LOST' if mode == 'observe-drop' else 'ACK') if accepted else 'REJECTED', writes=writes)
                tape.append(row)
                # The upstream response is held until the independent observer has read the row.
                before = self.observe_proof(case, sub, name, attempt, 'COMMITTED' if writes else 'ABSENT', before)
                channel.send({'op': 'release', 'gate': event['gate'], 'action': 'drop' if mode == 'observe-drop' else 'deliver'})
            elif kind == 'unexpected-request':
                self.unexpected.append({'case': case, 'sub': sub, 'process': role, 'destination': event.get('destination'),
                                        'method': event.get('method'), 'kind': event.get('reason')})
            elif kind == 'step-done':
                unit['outcomes'].append({'step': self.steps, 'process': role, 'action': action, 'scope': scope,
                                         'outcome': event.get('outcome'), 'error': event.get('error')})
                return event
            else:
                raise BoundaryError('CHILD_EVENT', 'Unknown child event')

    def fault(self, name, order='00000000-0000-4000-8000-000000000000'):
        require(name in FAULTS and UUID.fullmatch(order) is not None,
                'FAULT_SQL', 'Invalid fault control request')
        text = self.faults_sql.decode().replace('__H1_FAULT__', name).replace('__H1_ORDER__', order)
        result = self.pair.sql(text, user='fixture_admin', check=False)
        require(result.returncode == 0 and result.stdout.splitlines()[-1:] == ['H1_FAULT_COMPLETE:' + name],
                'FAULT_SQL', 'Fault control failed: ' + name)
        return [read_json(line[9:], 'FAULT_SQL') for line in result.stdout.splitlines() if line.startswith('H1_FAULT ')]

    def wait_db(self, case, sub, predicate, limit):
        """Wait on the database clock. The host sleep only spaces the observer reads."""
        deadline = time.monotonic() + limit
        while True:
            value = self.snapshot(case, sub)
            if predicate(value):
                return value
            require(time.monotonic() < deadline, 'DB_CLOCK_WAIT', 'The database clock condition was not reached')
            time.sleep(5)

    # -- shared scenario parts -------------------------------------------
    def setup_order(self, role, case, sub):
        done = self.step(role, case, sub, 'setup', scope='setup', provider={'create': {'http': 201, 'order': 'CREATED', 'captures': []}})
        self.check(case, sub, 'setup outcome', (done.get('outcome') or {}).get('kind'), 'PROVIDER_ORDER_READY')

    def capture(self, role, case, sub, capture, gets=(), gates=(), **extra):
        return self.step(role, case, sub, 'capture', provider={'gets': [approved_get(), *gets], 'capture': capture},
                         gates=gates, **extra)

    def proof_row(self, case, sub, rpc):
        """The single measured tape row of one proof RPC of this order."""
        rows = [row for row in self.target(case, sub)['tape'] if row.get('rpc') == rpc]
        require(len(rows) == 1, 'TAPE_SHAPE', 'Expected exactly one request of this RPC')
        return rows[0]

    def sticky(self, case, sub):
        return sorted({item.split(':', 1)[0] for item in self.snapshots[(case, sub)]['hold']['sticky_adverse']})

    def counts(self, case, sub, *, provider, rpc, process=None):
        """Exact request counts of the measured tape. With process, only the rows of that one process."""
        unit = self.target(case, sub)
        actual_provider, actual_rpc = {}, {}
        for row in unit['tape']:
            if process is not None and row['process'] != process:
                continue
            bucket, key = (actual_provider, row['operation']) if row['kind'] == 'provider' else (actual_rpc, row['rpc'])
            bucket[key] = bucket.get(key, 0) + 1
        suffix = '' if process is None else ' of ' + process
        self.check(case, sub, 'exact provider request counts' + suffix, actual_provider, provider)
        self.check(case, sub, 'exact RPC request counts' + suffix, actual_rpc, {RPC[key]: value for key, value in rpc.items()})

    def state(self, case, sub, **wanted):
        """Literal database expectations from the latest observer snapshot."""
        value = self.snapshot(case, sub)
        cycles = value['cycles']
        actual = {
            'intake': value['intakeCount'], 'inbox': value['inboxCount'], 'receipt': value['receiptCount'],
            'grants': value['grantCount'], 'settlement': value['settlementState'],
            'classification': [row['effectiveKind'] for row in value['classifications']],
            'category': [row['requestedCategory'] for row in value['classifications']],
            'facts': [row['factCount'] for row in value['classifications']],
            'distinctFacts': [row['distinctFactCount'] for row in value['classifications']],
            'cycleRequested': [None if row['outcome'] is None else row['outcome']['requestedKind'] for row in cycles],
            'postIds': [row['postCaptureIds'] for row in value['classifications']],
            'classificationConflicts': len(value['classificationConflicts']),
            'cycles': [None if row['outcome'] is None else row['outcome']['kind'] for row in cycles],
            'completers': [None if row['outcome'] is None else row['outcome']['completer'] for row in cycles],
            'cycleFacts': [None if row['outcome'] is None else row['outcome']['factCount'] for row in cycles],
            'late': [row['effectiveKind'] for row in value['lateResults']],
            'cycleConflicts': len(value['cycleConflicts']),
            'dbAssertions': sorted(row['code'] for row in value['assertions'] if row['reporter'] == 'DB_DERIVED'),
            'callerAssertions': sorted(row['code'] for row in value['assertions'] if row['reporter'] == 'W_CORE'),
            'submission': value['hold']['submission']['state'], 'grantBlocked': value['hold']['grant_blocked'],
            'review': value['hold']['review_projection'],
            'sticky': sorted({item.split(':', 1)[0] for item in value['hold']['sticky_adverse']}),
            'absence': sorted(item['key'].split(':', 1)[0] for item in value['hold']['absence']),
            'queue': None if value['queue'] is None else value['queue']['queueState'],
            'captureLinks': [row['externalId'] for row in value['links'] if row['identityKind'] == 'CAPTURE'],
        }
        for key, expected in wanted.items():
            self.check(case, sub, 'db ' + key, actual[key], expected)
        return value

    def outcome(self, case, sub, done, wanted):
        self.check(case, sub, 'workflow outcome', (done.get('outcome') or {}).get('kind'), wanted)

    def guarded(self, case, function):
        """One case cannot hide another: record its first error and continue with the next case."""
        try:
            function()
        except BaseException as exc:
            self.case_errors[case] = error(exc)
            if not isinstance(exc, BoundaryError):
                self.case_errors[case]['traceback'] = traceback.format_exc()[-2000:]


CAPTURE_FLOW = {'getter': 1, 'prepare': 1, 'binding': 1, 'claim': 1, 'intent': 1, 'p1': 1}
CAPTURE_READ_FLOW = {**CAPTURE_FLOW, 'open': 1, 'complete': 1}
RECONCILE_FLOW = {'getter': 1, 'prepare': 1, 'binding': 1, 'open': 1, 'complete': 1}


def merged(*flows):
    result = {}
    for flow in flows:
        for key, value in flow.items():
            result[key] = result.get(key, 0) + value
    return result


def run_canonical(run):
    role = 'canonical-main'
    run.start(role)

    def first_completed():
        case = 'first_completed'
        run.setup_order(role, case, None)
        run.state(case, None, captureLinks=[], intake=0)
        done = run.capture(role, case, None, {**body('COMPLETED', [('X', 'COMPLETED')]), 'http': 201})
        run.outcome(case, None, done, 'INTAKE_PENDING')
        run.state(case, None, classification=['CLEAN'], category=['RESPONSE_COMPLETE_CAPTURE_COMPLETED'], intake=1, inbox=1,
                  receipt=1, grants=0, settlement='INTAKE_PENDING', captureLinks=[capture_id(run.order(case), 'X')], cycles=[])
        replay = run.step(role, case, None, 'replay-p1')
        run.check(case, None, 'same raw replay', (replay.get('outcome') or {}).get('replayed'), True)
        run.state(case, None, classification=['CLEAN'], classificationConflicts=0, intake=1, inbox=1, receipt=1)
        run.counts(case, None, provider={'TOKEN': 1, 'ORDER_READ': 1, 'CAPTURE': 1}, rpc={**CAPTURE_FLOW, 'p1': 2})

    def eligible_no_response():
        case = 'eligible_no_response'
        run.setup_order(role, case, None)
        done = run.capture(role, case, None, {'transport': 'UNKNOWN'}, gets=[body('COMPLETED', [('X', 'COMPLETED')])])
        run.outcome(case, None, done, 'INTAKE_PENDING')
        run.state(case, None, classification=['NO_RESPONSE'], category=['TRANSPORT_UNKNOWN'], cycles=['CLEAN'],
                  completers=['OPENER'], intake=1, inbox=1, receipt=1, grants=0)
        run.counts(case, None, provider={'TOKEN': 1, 'ORDER_READ': 2, 'CAPTURE': 1}, rpc=CAPTURE_READ_FLOW)
        for sub, mode, state in (('p1_rpc_failure', 'fail-before', []), ('p1_ack_lost', 'observe-drop', ['NO_RESPONSE'])):
            run.setup_order(role, case, sub)
            done = run.capture(role, case, sub, {'transport': 'UNKNOWN'}, gets=[body('COMPLETED', [('X', 'COMPLETED')])],
                               gates=[{'rpc': P1, 'nth': 1, 'mode': mode}])
            run.outcome(case, sub, done, 'SUBMISSION_UNKNOWN')
            # The same process sends no GET after a failed or unacknowledged P1.
            run.state(case, sub, classification=state, cycles=[], intake=0)
            run.counts(case, sub, provider={'TOKEN': 1, 'ORDER_READ': 1, 'CAPTURE': 1}, rpc=CAPTURE_FLOW)

    def actual_facts():
        case = 'actual_facts'
        table = (
            (None, {**body('COMPLETED', [('X', 'DECLINED')]), 'http': 201}, 'CAPTURE_FAILED',
             dict(classification=['ADVERSE'], category=['RESPONSE_ADVERSE_FACT'], facts=[2])),
            ('partial_adverse', {**body('COMPLETED', [('X', 'DECLINED')]), 'http': 201, 'omit': ['payee']}, 'REVIEW_REQUIRED',
             dict(classification=['ADVERSE'], category=['RESPONSE_CONTRADICTION_UNREPRESENTABLE'], facts=[0],
                  callerAssertions=['UNRECORDABLE_PROVIDER_FACT'])),
            ('voided', {**body('VOIDED'), 'http': 201}, 'REVIEW_REQUIRED',
             dict(classification=['ADVERSE'], category=['RESPONSE_ORDER_VOIDED'], facts=[1])),
            ('raw32_33facts', {**body('VOIDED'), 'http': 201, 'captureCount': 32}, 'REVIEW_REQUIRED',
             dict(classification=['ADVERSE'], category=['RESPONSE_ORDER_VOIDED'], facts=[33])),
            ('raw33', {**body('COMPLETED'), 'http': 201, 'captureCount': 33}, 'REVIEW_REQUIRED',
             dict(classification=['ADVERSE'], category=['WORK_BOUND_EXCEEDED'], facts=[0], postIds=[None],
                  dbAssertions=['WORK_BOUND_EXCEEDED'])),
            ('same_id_race', {**body('COMPLETED', [('X', 'COMPLETED')]), 'http': 201, 'intent': 'AUTHORIZE'}, 'REVIEW_REQUIRED',
             dict(classification=['ADVERSE'], category=['RESPONSE_CONTRADICTION_UNREPRESENTABLE'], facts=[2],
                  callerAssertions=['INTENT_MISMATCH', 'SAME_ID_RACE_UNCONFIRMED'])),
            ('protocol_mismatch', {**body('COMPLETED', [('X', 'COMPLETED')]), 'http': 201, 'amount': '2.34'}, 'REVIEW_REQUIRED',
             dict(classification=['ADVERSE'], category=['RESPONSE_ADVERSE_FACT'], facts=[1])),
        )
        for sub, capture, outcome, wanted in table:
            run.setup_order(role, case, sub)
            done = run.capture(role, case, sub, capture)
            run.outcome(case, sub, done, outcome)
            run.state(case, sub, intake=0, inbox=0, receipt=0, grants=0, cycles=[], grantBlocked=True, **wanted)
            run.counts(case, sub, provider={'TOKEN': 1, 'ORDER_READ': 1, 'CAPTURE': 1}, rpc=CAPTURE_FLOW)
        # 422 is ADVERSE. A later GET with a completed capture does not receive.
        sub = 'http_422'
        run.setup_order(role, case, sub)
        done = run.capture(role, case, sub, {'http': 422, 'json': {}})
        run.outcome(case, sub, done, 'REVIEW_REQUIRED')
        run.state(case, sub, classification=['ADVERSE'], category=['HTTP_REJECTED_4XX'], intake=0)
        done = run.step(role, case, sub, 'reconcile', provider={'gets': [body('COMPLETED', [('X', 'COMPLETED')])]})
        run.outcome(case, sub, done, 'REVIEW_REQUIRED')
        # The read itself is nominal CLEAN (E is empty). The sticky ADVERSE classification holds the intake.
        run.state(case, sub, intake=0, inbox=0, receipt=0, grants=0, cycles=['CLEAN'], dbAssertions=['HTTP_REJECTED'],
                  grantBlocked=True)
        run.check(case, sub, 'sticky adverse classification', 'CLASSIFICATION_ADVERSE' in run.sticky(case, sub), True)
        run.counts(case, sub, provider={'TOKEN': 2, 'ORDER_READ': 2, 'CAPTURE': 1}, rpc=merged(CAPTURE_FLOW, RECONCILE_FLOW))

        # caller8: crafted native acceptance probe. The actual W capture path reaches the real P1 with its
        # actual sender capability, a VOIDED ORDER fact and 32 actual CAPTURE facts. Only the assertions field
        # of that actual request is replaced at the proxy with the eight valid W_CORE assertions of the native
        # fixture. W does not emit these eight by itself.
        sub = 'caller8'
        run.setup_order(role, case, sub)
        done = run.capture(role, case, sub, {**body('VOIDED'), 'http': 201, 'captureCount': 32},
                           shape=[{'rpc': P1, 'nth': 1, 'field': 'assertions', 'value': CALLER_EIGHT}])
        run.outcome(case, sub, done, 'REVIEW_REQUIRED')
        run.state(case, sub, classification=['ADVERSE'], category=['RESPONSE_ORDER_VOIDED'], facts=[33], distinctFacts=[33],
                  callerAssertions=['COUNTRY_MISMATCH', 'INTENT_MISMATCH', 'SAME_ID_RACE_UNCONFIRMED', 'SHAPE_CONTRADICTION',
                                    'UNRECORDABLE_PROVIDER_FACT', 'UNRECORDABLE_PROVIDER_FACT', 'UNRECORDABLE_PROVIDER_FACT',
                                    'UNREPRESENTABLE_CONTRADICTION'],
                  intake=0, inbox=0, receipt=0, grants=0, cycles=[], captureLinks=[], grantBlocked=True)
        sent = run.proof_row(case, sub, P1)
        run.check(case, sub, 'shaped P1 request summary', sent['request'], {'kind': 'ADVERSE', 'category': 'RESPONSE_ORDER_VOIDED',
                  'factCount': 33, 'assertionCount': 8, 'captureIdCount': 32, 'receiveFactIndex': None, 'shapedFields': ['assertions']})
        run.check(case, sub, 'wire size is within the raw input bound', type(sent['wireBytes']) is int and 0 < sent['wireBytes'] <= 294912, True)
        run.target(case, sub)['probe'] = {'crafted': True, 'shapedField': 'p_classification.assertions',
            'observedWireBytes': sent['wireBytes'], 'note': 'Native acceptance probe. Not a natural W output.'}
        run.counts(case, sub, provider={'TOKEN': 1, 'ORDER_READ': 1, 'CAPTURE': 1}, rpc=CAPTURE_FLOW)

    def observed_id_matrix():
        case = 'observed_id_matrix'
        partial_x = {**body('COMPLETED', [('X', 'COMPLETED')]), 'http': 201, 'omit': ['payee']}
        gets = {'omitted': {**body('COMPLETED'), 'omit': ['payments']}, 'empty': body('COMPLETED'),
                'malformed': {**body('COMPLETED'), 'captureShape': 'object'}}
        # E is the POST capture ID set plus the capture link. O is the GET capture ID set.
        table = [(None, {'transport': 'UNKNOWN'}, body('COMPLETED', [('X', 'COMPLETED')]), 'INTAKE_PENDING',
                  dict(cycles=['CLEAN'], intake=1, postIds=[None]))]
        for shape in ('omitted', 'empty', 'malformed'):
            table.append((shape + '_e_empty', {'transport': 'UNKNOWN'}, gets[shape],
                          'REVIEW_REQUIRED' if shape == 'malformed' else 'SUBMISSION_UNKNOWN',
                          dict(cycles=['ADVERSE' if shape == 'malformed' else 'CLEAN'], intake=0)))
            table.append((shape + '_e_x', partial_x, gets[shape], 'REVIEW_REQUIRED', dict(cycles=['ADVERSE'], intake=0)))
        table.append(('post_x_get_x', partial_x, body('COMPLETED', [('X', 'COMPLETED')]), 'INTAKE_PENDING',
                      dict(cycles=['CLEAN'], intake=1, dbAssertions=[])))
        table.append(('post_x_get_y', partial_x, body('COMPLETED', [('Y', 'COMPLETED')]), 'REVIEW_REQUIRED',
                      dict(cycles=['ADVERSE'], intake=0, dbAssertions=['CAPTURE_ID_DIVERGENCE', 'CLASSIFICATION_INCONSISTENT'])))
        for sub, capture, get, outcome, wanted in table:
            run.setup_order(role, case, sub)
            done = run.capture(role, case, sub, capture, gets=[get])
            run.outcome(case, sub, done, outcome)
            run.state(case, sub, classification=['NO_RESPONSE'], grants=0, **wanted)
            run.counts(case, sub, provider={'TOKEN': 1, 'ORDER_READ': 2, 'CAPTURE': 1}, rpc=CAPTURE_READ_FLOW)

        # clean_extra_id_downgrade: crafted native acceptance probe. E is empty (real eligible P1, real open).
        # The normal CLEAN completion of GET X is sent. Only observed_capture_ids of that actual S3 request is
        # replaced at the proxy with [X, Y]. W does not send CLEAN with two IDs by itself.
        sub = 'clean_extra_id_downgrade'
        run.setup_order(role, case, sub)
        x, y = capture_id(run.order(case, sub), 'X'), capture_id(run.order(case, sub), 'Y')
        done = run.capture(role, case, sub, {'transport': 'UNKNOWN'}, gets=[body('COMPLETED', [('X', 'COMPLETED')])],
                           shape=[{'rpc': P2_COMPLETE, 'nth': 1, 'field': 'observed_capture_ids', 'value': [x, y]}])
        run.outcome(case, sub, done, 'REVIEW_REQUIRED')
        value = run.state(case, sub, classification=['NO_RESPONSE'], postIds=[None], cycles=['ADVERSE'], cycleRequested=['CLEAN'],
                          dbAssertions=['CLASSIFICATION_INCONSISTENT'], callerAssertions=[], intake=0, inbox=0, receipt=0, grants=0)
        sent = run.proof_row(case, sub, P2_COMPLETE)
        run.check(case, sub, 'shaped S3 request summary', sent['request'], {'kind': 'CLEAN', 'category': 'READ_CAPTURE_COMPLETED',
                  'factCount': 2, 'assertionCount': 0, 'captureIdCount': 2, 'receiveFactIndex': 1,
                  'shapedFields': ['observed_capture_ids']})
        run.check(case, sub, 'stored observed capture IDs', value['cycles'][0]['outcome']['observedCaptureIds'], sorted([x, y]))
        # The CAPTURE link state after the downgrade is recorded as an observation. It is not an expectation.
        run.target(case, sub)['probe'] = {'crafted': True, 'shapedField': 'p_completion.observed_capture_ids',
            'observedWireBytes': sent['wireBytes'], 'observedCaptureLinks': [row['externalId'] for row in value['links']
                                                                           if row['identityKind'] == 'CAPTURE'],
            'note': 'Native acceptance probe. Not a natural W output.'}
        run.counts(case, sub, provider={'TOKEN': 1, 'ORDER_READ': 2, 'CAPTURE': 1}, rpc=CAPTURE_READ_FLOW)

    for name, function in (('first_completed', first_completed), ('eligible_no_response', eligible_no_response),
                           ('actual_facts', actual_facts), ('observed_id_matrix', observed_id_matrix)):
        run.guarded(name, function)
    run.finish(role)


def run_fault(run):
    main_role = 'fault-main'
    run.start(main_role)
    partial_x = {**body('COMPLETED', [('X', 'COMPLETED')]), 'http': 201, 'omit': ['payee']}
    settle, final = [], []

    def restart(case, killed, fresh):
        run.start(fresh)
        proof = run.children.restart_proof(killed, fresh)
        run.check(case, None, 'fresh process identity', proof['fresh']['pid'] != proof['killed']['pid'], True)

    def kill_before_p1():
        case = 'kill_before_p1'
        run.start('k1-A')
        run.setup_order('k1-A', case, None)
        done = run.capture('k1-A', case, None, {**body('COMPLETED', [('X', 'COMPLETED')]), 'http': 201},
                           gates=[{'rpc': P1, 'nth': 1, 'mode': 'hold-before'}])
        run.check(case, None, 'A ended before P1', (done['type'], done['at'], done['exit']['signal']), ('killed', P1, 'SIGKILL'))
        before = run.snapshots[(case, None)]
        run.observe_proof(case, None, P1, 1, 'ABSENT', before)
        restart(case, 'k1-A', 'k1-B')
        run.state(case, None, classification=[], submission='PENDING', intake=0)

        def later():
            # Real 90 seconds on the database clock after the intent.
            run.wait_db(case, None, lambda value: value['hold']['submission']['state'] == 'ABSENT', 130)
            done = run.step('k1-B', case, None, 'reconcile', provider={'gets': [body('COMPLETED', [('X', 'COMPLETED')])]})
            run.outcome(case, None, done, 'REVIEW_REQUIRED')
            run.state(case, None, classification=[], submission='ABSENT', absence=['SUBMISSION_ABSENT'], intake=0, inbox=0,
                      receipt=0, grants=0, grantBlocked=True, review=True)
        settle.append((case, later))

        def scanner():
            # Last action of the phase: the actual enrollment, then the actual W3 executor. A scanner run
            # can read other orders, so its rows go to the run-level scanner tape.
            run.fault('enroll')
            run.state(case, None, queue='HELD')
            scan = run.step('k1-B', case, None, 'scan', scope='scan', provider={'getDefault': approved_get()}, deadline=90)
            summary = scan.get('outcome') or {}
            run.check(case, None, 'scanner run finished', (summary.get('started'), summary.get('finished')), (True, True))
            run.check(case, None, 'scanner claimed this order', run.order(case) in (summary.get('claimedOrders') or []), False)
            run.state(case, None, classification=[], submission='ABSENT', queue='HELD', intake=0, inbox=0, receipt=0, grants=0)
            run.finish('k1-B')
        final.append((case, scanner))

    def p1_before_commit():
        # One order, two processes. A is a dedicated original process: setup, the real capture POST, then the
        # proxy fails P1 before the database receives it. A is killed and observed gone. B is a fresh process.
        # B receives only the order, the actor and the synthetic provider reply: no sender capability, no
        # classification body and no state of A.
        case = 'p1_before_commit'
        run.start('pb-A')
        run.setup_order('pb-A', case, None)
        done = run.capture('pb-A', case, None, partial_x, gates=[{'rpc': P1, 'nth': 1, 'mode': 'fail-before'}])
        run.outcome(case, None, done, 'SUBMISSION_UNKNOWN')
        # Independent observer on A: no classification, no assertion, no cycle and zero counts.
        run.state(case, None, classification=[], classificationConflicts=0, dbAssertions=[], callerAssertions=[], cycles=[],
                  intake=0, inbox=0, receipt=0, grants=0)
        run.counts(case, None, provider={'TOKEN': 1, 'ORDER_READ': 1, 'CAPTURE': 1}, rpc=CAPTURE_FLOW, process='pb-A')
        ended = run.kill('pb-A')
        run.check(case, None, 'A ended by the owned kill', (type(ended.get('exitCode')) is int, ended.get('signal')), (True, 'SIGKILL'))
        hello = run.start('pb-B')
        proof = run.children.restart_proof('pb-A', 'pb-B')
        run.check(case, None, 'restart proof names the exact fresh process',
                  (proof['fresh']['pid'], proof['fresh']['startId'], proof['killed']['signal']),
                  (hello.get('pid'), hello.get('startId'), 'SIGKILL'))
        run.check(case, None, 'fresh process identity differs from A',
                  (proof['fresh']['pid'] != proof['killed']['pid'], proof['fresh']['startId'] != proof['killed']['startId']),
                  (True, True))
        run.check(case, None, 'B starts with an empty process memory', hello.get('memory'), {'storedBodies': 0, 'heldGates': 0})
        run.target(case, None)['restart'] = {'killed': proof['killed'], 'fresh': proof['fresh'], 'freshMemory': hello.get('memory')}
        run.state(case, None, classification=[], cycles=[], intake=0, inbox=0, receipt=0, grants=0)

        def later():
            # The actual database clock reaches ABSENT before B acts.
            run.wait_db(case, None, lambda value: value['hold']['submission']['state'] == 'ABSENT', 130)
            run.state(case, None, classification=[], submission='ABSENT', absence=['SUBMISSION_ABSENT'], cycles=[], intake=0, grants=0)
            # One real protected targeted reconciliation of the same order by B. The GET returns the same
            # capture ID X as completed.
            done = run.step('pb-B', case, None, 'reconcile', provider={'gets': [body('COMPLETED', [('X', 'COMPLETED')])]})
            run.outcome(case, None, done, 'REVIEW_REQUIRED')
            # Exactly one OPEN, one read and one completion by B, and nothing else.
            run.counts(case, None, provider={'TOKEN': 1, 'ORDER_READ': 1}, rpc=RECONCILE_FLOW, process='pb-B')
            rows = [row for row in run.target(case, None)['tape'] if row['process'] == 'pb-B']
            forbidden = (RPC['claim'], RPC['intent'], P1, RPC['receive'])
            run.check(case, None, 'B sent no capture POST, claim, intent, P1 or direct receive',
                      (sum(1 for row in rows if row.get('operation') == 'CAPTURE'),
                       sum(1 for row in rows if row.get('rpc') in forbidden)), (0, 0))
            # Independent observer after B: still no P1 classification, an active ABSENT hold in review,
            # and zero intake, inbox, receipt and grants.
            value = run.state(case, None, classification=[], classificationConflicts=0, submission='ABSENT',
                              absence=['SUBMISSION_ABSENT'], review=True, grantBlocked=True, cycles=['CLEAN'],
                              completers=['OPENER'], intake=0, inbox=0, receipt=0, grants=0, settlement='NOT_INTAKE')
            run.check(case, None, 'ABSENT hold is active (not released)',
                      [item.get('resolution_id') for item in value['hold']['absence']], [None])
            run.finish('pb-B')
        settle.append((case, later))

    def ack_loss_and_restart():
        run.start('xy-A')
        units = (('p1_ack_loss', None), ('restart_xy', None), ('restart_xy', 'get_x_clean'))
        for case, sub in units:
            run.setup_order('xy-A', case, sub)
            done = run.capture('xy-A', case, sub, partial_x, gates=[{'rpc': P1, 'nth': 1, 'mode': 'observe-drop'}])
            run.outcome(case, sub, done, 'SUBMISSION_UNKNOWN')
            # The commit is in the database although A never received the ACK. A sends no GET.
            run.state(case, sub, classification=['NO_RESPONSE'], category=['PARTIAL_UNCONTRADICTED'],
                      postIds=[[capture_id(run.target(case, sub)['order'], 'X')]], cycles=[], intake=0)
            run.counts(case, sub, provider={'TOKEN': 1, 'ORDER_READ': 1, 'CAPTURE': 1}, rpc=CAPTURE_FLOW)
        run.check('p1_ack_loss', None, 'A ended', run.kill('xy-A')['signal'], 'SIGKILL')
        restart('restart_xy', 'xy-A', 'xy-B')
        # B has an empty memory. The expected ID X is read from the database only.
        done = run.step('xy-B', 'restart_xy', None, 'reconcile', provider={'gets': [body('COMPLETED', [('Y', 'COMPLETED')])]})
        run.outcome('restart_xy', None, done, 'REVIEW_REQUIRED')
        run.state('restart_xy', None, cycles=['ADVERSE'], cycleRequested=['CLEAN'],
                  dbAssertions=['CAPTURE_ID_DIVERGENCE', 'CLASSIFICATION_INCONSISTENT'], intake=0, inbox=0, receipt=0, grants=0)
        done = run.step('xy-B', 'restart_xy', 'get_x_clean', 'reconcile', provider={'gets': [body('COMPLETED', [('X', 'COMPLETED')])]})
        run.outcome('restart_xy', 'get_x_clean', done, 'INTAKE_PENDING')
        run.state('restart_xy', 'get_x_clean', cycles=['CLEAN'], dbAssertions=[], intake=1, inbox=1, receipt=1, grants=0)
        run.finish('xy-B')

    def kill_before_complete():
        case = 'kill_before_complete'
        run.start('kc-A')
        run.setup_order('kc-A', case, None)
        done = run.capture('kc-A', case, None, {'transport': 'UNKNOWN'}, gets=[body('COMPLETED', [('X', 'DECLINED')])],
                           gates=[{'rpc': P2_COMPLETE, 'nth': 1, 'mode': 'hold-before'}])
        run.check(case, None, 'A ended before complete', (done['type'], done['at'], done['exit']['signal']),
                  ('killed', P2_COMPLETE, 'SIGKILL'))
        run.state(case, None, classification=['NO_RESPONSE'], cycles=[None], intake=0)
        restart(case, 'kc-A', 'kc-B')

        def later():
            # Real 45 seconds on the database clock, then the actual sweeper.
            run.wait_db(case, None, lambda value: value['cycles'][0]['expired'] is True, 80)
            run.fault('sweep')
            run.state(case, None, cycles=['ABANDONED'], completers=['SWEEPER'], absence=['CYCLE_ABANDONED'], intake=0)
            done = run.step('kc-B', case, None, 'reconcile', provider={'gets': [body('COMPLETED', [('X', 'COMPLETED')])]})
            # A normal clean second cycle does not release the abandoned cycle.
            run.state(case, None, cycles=['ABANDONED', 'CLEAN'], intake=0, inbox=0, receipt=0, grants=0, grantBlocked=True,
                      absence=['CYCLE_ABANDONED'])
            run.outcome(case, None, done, 'REVIEW_REQUIRED')
            run.finish('kc-B')
        settle.append((case, later))

    def existing_intake():
        # An order that already has a real CLEAN intake. A later protected read is killed before its completion.
        # After the real 45 seconds and the actual sweep, the downstream callers must stay non-terminal.
        # Closed and documented: PayPal COMPLETE and settlement reachability. No FULL proof, verified result
        # or grant is created. The leased order isolates prepare; the due, unleased sibling isolates list and claim.
        case = 'kill_before_complete'
        units = (('existing_intake_downstream', 'kd-A', True), ('existing_intake_due_unleased', 'ku-A', False))
        for sub, role, leased in units:
            run.start(role)
            run.setup_order(role, case, sub)
            done = run.capture(role, case, sub, {**body('COMPLETED', [('X', 'COMPLETED')]), 'http': 201})
            run.outcome(case, sub, done, 'INTAKE_PENDING')
            run.state(case, sub, classification=['CLEAN'], cycles=[], intake=1, inbox=1, receipt=1, grants=0)
            if leased:
                # A real v2 verification lease while no read cycle exists. The raw lease stays in the database.
                claimed = run.fault('downstream-claim', run.order(case, sub))[-1]
                run.check(case, sub, 'v2 lease before any open cycle', (claimed.get('openCycles'), claimed.get('inboxDue'),
                          claimed.get('listedBeforeClaim'), claimed.get('claimOutcome')), (0, True, True, 'CLAIMED'))
            done = run.step(role, case, sub, 'reconcile', provider={'gets': [body('COMPLETED', [('X', 'DECLINED')])]},
                            gates=[{'rpc': P2_COMPLETE, 'nth': 1, 'mode': 'hold-before'}])
            run.check(case, sub, 'A ended before complete', (done['type'], done['at'], done['exit']['signal']),
                      ('killed', P2_COMPLETE, 'SIGKILL'))
            run.state(case, sub, cycles=[None], intake=1, grants=0)

        def later():
            for sub, _role, leased in units:
                run.wait_db(case, sub, lambda value: value['cycles'][0]['expired'] is True, 80)
                run.fault('sweep')
                run.state(case, sub, cycles=['ABANDONED'], completers=['SWEEPER'], absence=['CYCLE_ABANDONED'], intake=1,
                          inbox=1, receipt=1, grants=0, settlement='INTAKE_PENDING', grantBlocked=True)
                probe = run.fault('downstream-probe', run.order(case, sub))[-1]
                run.target(case, sub)['downstream'] = probe
                after = probe.get('after') or {}
                run.check(case, sub, 'no terminal review, grant or extra intake', (after.get('reviewResults'), after.get('reviewSeals'),
                          after.get('settlements'), after.get('intakes')), (0, 0, 0, 1))
                run.check(case, sub, 'verification list excludes the held inbox', probe.get('verificationListed'), False)
                # Disclosed: settlement needs a verified result, and PayPal COMPLETE is closed. NOT_CLAIMABLE here
                # is recorded and is not attributed to the hold alone.
                run.check(case, sub, 'settlement list and claim stay closed', (probe.get('settlementListed'),
                          (probe.get('settlementClaim') or {}).get('outcome')), (False, 'NOT_CLAIMABLE'))
                if leased:
                    run.check(case, sub, 'lease is live through the sweep', probe.get('leaseLive'), True)
                    run.check(case, sub, 'prepare with the worker RETRY envelope', probe.get('prepare'),
                              {'decision': 'RETRY', 'reasonCode': 'INTAKE_HOLD_PENDING', 'retryDelaySeconds': '60'})
                else:
                    run.check(case, sub, 'due and unleased before the probe', probe.get('precondition'),
                              {'status': 'PENDING', 'attemptCount': 0, 'leased': False, 'due': True})
                    run.check(case, sub, 'v2 claim of the held inbox', probe.get('claim'), NOT_CLAIMABLE_V2)
                    run.check(case, sub, 'list and claim wrote nothing', probe.get('before'), probe.get('after'))
        settle.append((case, later))

        def drop():
            removed = run.fault('downstream-drop')[-1]
            run.check(case, 'existing_intake_downstream', 'overlay table removed', (removed.get('removed'),
                      observer(run.pair, run.observer_sql, 'catalog')['overlayObjects']), (True, 0))
        final.append((case, drop))

    def complete_ack_loss():
        case = 'complete_ack_loss'
        run.setup_order(main_role, case, None)
        done = run.capture(main_role, case, None, {'transport': 'UNKNOWN'}, gets=[body('COMPLETED', [('X', 'COMPLETED')])],
                           gates=[{'rpc': P2_COMPLETE, 'nth': 1, 'mode': 'fail-before'}])
        run.outcome(case, None, done, 'SUBMISSION_UNKNOWN')
        run.state(case, None, cycles=[None], intake=0)
        table = (('post_commit_clean', body('COMPLETED', [('X', 'COMPLETED')]), 'CLEAN', 1),
                 ('post_commit_adverse', body('COMPLETED', [('X', 'DECLINED')]), 'ADVERSE', 0),
                 ('post_commit_no_data', {'http': 503, 'json': {}}, 'NO_DATA', 0))
        for sub, get, kind, intake in table:
            run.setup_order(main_role, case, sub)
            done = run.capture(main_role, case, sub, {'transport': 'UNKNOWN'}, gets=[get],
                               gates=[{'rpc': P2_COMPLETE, 'nth': 1, 'mode': 'observe-drop'}])
            run.outcome(case, sub, done, 'SUBMISSION_UNKNOWN')
            run.state(case, sub, cycles=[kind], completers=['OPENER'], intake=intake)

        def later():
            run.wait_db(case, None, lambda value: value['cycles'][0]['expired'] is True, 80)
            run.fault('sweep')
            run.state(case, None, cycles=['ABANDONED'], completers=['SWEEPER'], intake=0)
            for sub, _get, kind, intake in table:
                # The sweeper does not change a completed cycle.
                run.state(case, sub, cycles=[kind], completers=['OPENER'], intake=intake)
        settle.append((case, later))

    def nth_fact_failure():
        case = 'nth_fact_failure'
        order = run.order(case)
        run.setup_order(main_role, case, None)
        catalog = observer(run.pair, run.observer_sql, 'catalog')
        installed = run.fault('nth-fact-install', order)
        try:
            done = run.capture(main_role, case, None, {'transport': 'UNKNOWN'},
                               gets=[{**body('VOIDED'), 'captureCount': 32}])
        finally:
            removed = run.fault('nth-fact-remove', order)
        run.outcome(case, None, done, 'SUBMISSION_UNKNOWN')
        run.check(case, None, 'overlay raised once at the 33rd fact and was removed',
                  (removed[0].get('raised'), removed[-1].get('removed')), (1, True))
        run.check(case, None, 'overlay trigger installed once', [row.get('installed') for row in installed], [True])
        run.check(case, None, 'trigger catalog restored', observer(run.pair, run.observer_sql, 'catalog')['triggerDigest'],
                  catalog['triggerDigest'])
        # The failed completion left no outcome, no assertion, no new fact and no intake. The cycle stays open.
        run.state(case, None, classification=['NO_RESPONSE'], cycles=[None], dbAssertions=[], callerAssertions=[], intake=0,
                  inbox=0, receipt=0, grants=0)
        run.check(case, None, 'observations after the rolled back completion',
                  run.snapshots[(case, None)]['observationCount'], 1)

    def conflict_and_late():
        case = 'conflict_and_late'
        run.setup_order(main_role, case, None)
        done = run.capture(main_role, case, None, {'transport': 'UNKNOWN'}, gets=[body('COMPLETED')])
        run.outcome(case, None, done, 'SUBMISSION_UNKNOWN')
        run.state(case, None, cycles=['CLEAN'], cycleConflicts=0, intake=0)
        # Same cycle token, other payload: a normal committed CONFLICT_RECORDED.
        for expected in (False, True):
            done = run.step(main_role, case, None, 'conflict-complete')
            run.check(case, None, 'conflict outcome', ((done.get('outcome') or {}).get('kind'), (done.get('outcome') or {}).get('replayed')),
                      ('CONFLICT_RECORDED', expected))
        run.state(case, None, cycles=['CLEAN'], cycleConflicts=1, grantBlocked=True, intake=0)
        run.check(case, None, 'cycle conflict is sticky', 'CYCLE_CONFLICT' in run.sticky(case, None), True)
        late = (('late_adverse', False, 'ADVERSE'), ('late_invalid', True, 'INVALID'))
        for sub, _invalid, _kind in late:
            run.setup_order(main_role, case, sub)
            done = run.capture(main_role, case, sub, {'transport': 'UNKNOWN'}, gets=[body('COMPLETED', [('X', 'DECLINED')])],
                               gates=[{'rpc': P2_COMPLETE, 'nth': 1, 'mode': 'fail-before'}])
            run.outcome(case, sub, done, 'SUBMISSION_UNKNOWN')

        def later():
            for sub, invalid, kind in late:
                run.wait_db(case, sub, lambda value: value['cycles'][0]['expired'] is True, 80)
                run.fault('sweep')
                run.state(case, sub, cycles=['ABANDONED'], late=[], intake=0)
                for expected in (False, True):
                    # The opener sends its result after the sweeper abandoned the cycle. The same payload replays.
                    done = run.step(main_role, case, sub, 'late-complete', invalid=invalid)
                    run.check(case, sub, 'late outcome', ((done.get('outcome') or {}).get('kind'),
                              (done.get('outcome') or {}).get('effectiveKind'), (done.get('outcome') or {}).get('replayed')),
                              ('LATE_RECORDED', kind, expected))
                run.state(case, sub, cycles=['ABANDONED'], late=[kind], intake=0, grants=0, grantBlocked=True)
                run.check(case, sub, 'late result is sticky', 'CYCLE_LATE_ADVERSE' in run.sticky(case, sub), True)
            # Process B reads the hold of the conflict order from the database. This read-only step is
            # recorded outside the measured tape, because B is a second live process and not a restart.
            run.start('cl-B')
            done = run.step('cl-B', case, None, 'status', scope='setup')
            run.check(case, None, 'B reads the review hold', (done.get('outcome') or {}).get('reviewRequired'), True)
            run.finish('cl-B')
        settle.append((case, later))

    for name, function in (('kill_before_p1', kill_before_p1), ('p1_before_commit', p1_before_commit),
                           ('p1_ack_loss', ack_loss_and_restart), ('kill_before_complete', kill_before_complete),
                           ('kill_before_complete', existing_intake), ('complete_ack_loss', complete_ack_loss), ('nth_fact_failure', nth_fact_failure),
                           ('conflict_and_late', conflict_and_late)):
        run.guarded(name, function)
    for name, function in (*settle, *final):
        if name not in run.case_errors:
            run.guarded(name, function)
    run.finish(main_role)


def phase_labels(phase):
    labels = []
    for case in PHASE_CASES[phase]:
        labels.append(case)
        labels += [case + '.' + sub for sub in REQUIRED_SUBCASES.get(case, ()) if sub not in UNIMPLEMENTED_SUBCASES.get(case, ())]
    return labels


def evaluate(receipt, run):
    """Final verdict. reduce_evidence, every literal check and every approved sub-case must hold."""
    failures = []
    for case in PHASE_CASES[receipt['phase']]:
        unit = receipt['cases'][case]
        if case in run.case_errors:
            failures.append({'case': case, 'reason': 'CASE_ERROR', 'error': run.case_errors[case]})
        for sub in REQUIRED_SUBCASES.get(case, ()):
            if sub in UNIMPLEMENTED_SUBCASES.get(case, ()):
                failures.append({'case': case, 'sub': sub, 'reason': 'UNIMPLEMENTED_SUBCASE'})
            elif sub not in unit['subcases']:
                failures.append({'case': case, 'sub': sub, 'reason': 'SUBCASE_NOT_RUN'})
        for label, part in _units(case, unit):
            failures += [{'case': label, 'reason': 'CHECK_FAILED', **check} for check in part.get('checks', []) if not check['ok']]
            # setupTape holds the order setup (CREATE flow) and read-only auxiliary steps. It has its own allowlist.
            setup = part.get('setupTape', [])
            if any(row.get('operation') not in SETUP_PROVIDER for row in setup if row['kind'] == 'provider') \
                    or any(row.get('rpc') not in SETUP_RPCS for row in setup if row['kind'] == 'rpc'):
                failures.append({'case': label, 'reason': 'SETUP_REQUEST_NOT_APPROVED'})
    try:
        receipt['reduced'] = reduce_evidence(receipt)
    except BoundaryError as exc:
        failures.append({'reason': 'REDUCER', 'error': error(exc)})
    return failures


def execute(args, *, git, docker, process, flags, smoke=False):
    """One owned run. Returns the process exit code. The first error and exact cleanup evidence are kept."""
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', args.run_label) is not None, 'RUN_LABEL', 'Invalid fresh run label')
    preflight = docker or LocalDocker(shutil.which('docker', path=ENV['PATH']) or '/nonexistent', docker_endpoint(),
                                      ROOT / '.artifacts/payment-web-order-http/.intake-hold-docker-config')
    db_root = Path(args.db_root).resolve()
    manifest = verify_manifest(args.manifest, args.manifest_sha256, web_root=ROOT, db_root=db_root, git=git, docker=preflight)
    for parent in (ROOT / '.artifacts', ROOT / '.artifacts/payment-web-order-http'):
        require(not parent.is_symlink(), 'ARTIFACT_PATH', 'Artifact parent symlinks are forbidden')
    os.umask(0o077)
    out = ROOT / '.artifacts/payment-web-order-http' / ('intake-hold-' + args.run_label)
    out.mkdir(parents=True, exist_ok=False)
    node_out = out / 'node-artifacts'
    node_out.mkdir()
    synthetic = {'paypalAccessToken': 'h1-access-' + uuid.uuid4().hex, 'paypalClientSecret': 'Q7pPriv-' + uuid.uuid4().hex,
                 'sentinel': 'Q7pPriv-sentinel-' + uuid.uuid4().hex}
    secrets = list(synthetic.values())
    docker_log = []
    evidence = {'status': 'failed', 'exitCode': 1, 'phase': args.phase, 'image': args.image, 'runLabel': args.run_label,
                'smoke': smoke, 'manifestSha256': args.manifest_sha256, 'stage': 'preflight', 'originalError': None,
                'recordedAt': datetime.now(timezone.utc).isoformat(), 'launchFlags': flags,
                'heads': {key: manifest[key] for key in ('webHead', 'dbHead', 'dbProductCommit')},
                'expectedCases': list(PHASE_CASES[args.phase]), 'cases': {}, 'children': [], 'restartProofs': [],
                'unexpectedRequests': [], 'resources': None,
                'limits': {'provider': 'Synthetic PayPal fetch and credential only; no real provider evidence',
                           'guard': 'Cooperative wrappers for reviewed code; Docker owns network isolation',
                           'atomicity': 'No test proves atomicity between HTTP and the database',
                           'gateway': 'Local PostgREST only; no production gateway size evidence'}}
    pair, run, modules = None, None, None
    stack = ExitStack()
    previous_signal = signal.getsignal(signal.SIGTERM)

    def terminated(_signum, _frame):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        raise BoundaryError('TERMINATED', 'Termination requested; the exact ledger is kept')

    signal.signal(signal.SIGTERM, terminated)
    try:
        modules = stack.enter_context(verified_reuse(ROOT, manifest['reuseSources']))
        evidence['stage'] = 'native-dependencies'
        pins = {row['path']: {'sha256': row['sha256']} for row in (*manifest['contractPrefix'], *manifest['dependencySources'])}
        native = native_dependencies(modules, db_root, pins)
        require(all(name in pins for name in (*native['sources'], NATIVE_BOOTSTRAP, NATIVE_CONTROL)), 'DEPENDENCY_CLOSURE',
                'A native dependency source has no manifest pin')
        require(native['dependencySqlSha256'] == manifest['dependencySqlSha256']
                and native['queueDependencySqlSha256'] == manifest['queueDependencySqlSha256'], 'DEPENDENCY_SQL',
                'Recomputed dependency SQL differs from the manifest digests')
        evidence['dependencies'] = {key: native[key] for key in ('dependencySqlSha256', 'queueDependencySqlSha256', 'sources')}
        verify_sources(manifest, ROOT, db_root)
        evidence['stage'] = 'bundle'
        node = shutil.which('node', path=ENV['PATH'])
        require(node is not None, 'EXECUTABLES', 'Installed Node is required')
        entry = read_source(ROOT, ENTRY)
        bundled = _command([node, '--input-type=module', '-', str(node_out), entry.hex()],
                           input=read_source(ROOT, PREFIX + 'bundle.mjs').decode(), cwd=str(ROOT), text=True,
                           encoding='utf-8', capture_output=True, timeout=60)
        persist(out / 'bundle.log', bundled.stdout + bundled.stderr, secrets, text=True)
        require(bundled.returncode == 0, 'BUNDLE_FAILURE', 'Host build failed before any Docker creation')
        meta = read_json((node_out / 'bundle-inputs.json').read_bytes(), 'BUNDLE_META')
        inputs = meta.get('metafile', {}).get('inputs')
        require(isinstance(inputs, dict) and set(inputs) == BUNDLE_INPUTS and meta.get('entryDeliveryHex') == entry.hex(),
                'BUNDLE_INPUTS', 'Actual bundle input closure differs from the approved hashed inputs')
        require(all(name in manifest['webSources'] for name in inputs if ':' not in name), 'BUNDLE_INPUTS',
                'A bundle input has no manifest pin')
        outputs = list(meta['metafile'].get('outputs', {}).values())
        require(len(outputs) == 1 and {row.get('path') for row in outputs[0].get('imports', [])} == BUNDLE_EXTERNAL
                and all(row.get('external') is True for row in outputs[0].get('imports', [])), 'BUNDLE_INPUTS',
                'Actual bundle external graph differs from the approved graph')
        guard = read_source(ROOT, PREFIX + 'guard.cjs')
        (node_out / 'guard.cjs').write_bytes(guard)
        pins_now = {'bundleSha256': digest((node_out / BUNDLE_NAME).read_bytes()), 'guardSha256': digest(guard),
                    'entryDeliverySha256': digest(entry)}
        evidence['bundle'] = {'inputs': sorted(inputs), 'esbuildVersion': meta.get('esbuildVersion'), **pins_now}
        verify_sources(manifest, ROOT, db_root)

        evidence['stage'] = 'factory-start'
        transport = docker or LocalDocker(preflight.executable, preflight.endpoint, out / 'empty-docker-config', docker_log)
        pair = modules['pair_fixture'].PairFactory(transport, pg_image=args.image, artifact_dir=node_out,
                                                   modules_dir=ROOT / 'node_modules')
        pair.start()
        evidence['stage'] = 'database-setup'
        labels = () if smoke else tuple(phase_labels(args.phase))
        orders = setup_database(pair, modules, manifest, native, out, evidence, secrets,
                                db_root=db_root, smoke=smoke, labels=labels)
        observer_sql = read_source(ROOT, PREFIX + 'observer.sql')
        evidence['stage'] = 'installed-contract'
        evidence['installedContract'] = require_installed_contract(pair, observer_sql)
        evidence['stage'] = 'postgrest-start'
        pair.start_postgrest()
        tokens = {'service': jwt('service_role', modules['pair_fixture'].PUBLIC_JWT_SECRET)}
        secrets.append(tokens['service'])
        (node_out / 'config.json').write_text(json.dumps({'restIp': pair.role('postgrest')['ipv4'], 'restPort': 3000,
            'restAlias': 'order-rest', 'phase': args.phase, 'executionPins': pins_now}, indent=2) + '\n')
        init = {'tokens': tokens, 'synthetic': synthetic, 'executionPins': pins_now,
                'binding': {'credentialRef': 'fixture.h1.paypal', 'clientId': 'fixture-client-v1', 'bindingVersion': '1'}}
        evidence['stage'] = 'phase'
        run = PhaseRun(phase=args.phase, pair=pair, docker=transport, observer_sql=observer_sql,
                       faults_sql=read_source(ROOT, PREFIX + 'faults.sql'), orders=orders, init=init,
                       argv=['node', '--require', '/fixture/guard.cjs', '/fixture/' + BUNDLE_NAME, args.phase],
                       out=out, secrets=secrets)
        if process is not None:
            run.process = run.children.process = process
        (run_canonical if args.phase == 'canonical' else run_fault)(run)
        evidence['stage'] = 'phase-complete'
    except BaseException as exc:
        evidence['originalError'] = {**error(exc), 'missing': getattr(exc, 'missing', None)}
        if not isinstance(exc, BoundaryError):
            evidence['originalError']['traceback'] = traceback.format_exc()[-4000:]
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        # Step 1. Exact cleanup first. It depends on no log, no persistence and no evidence collection.
        if pair is not None:
            try:
                evidence['resources'] = close_pair(pair, evidence)
            except BaseException as exc:
                evidence.setdefault('cleanupError', error(exc))
        # Step 2. In-memory evidence of the phase.
        try:
            if run is not None:
                evidence.update(cases=run.cases, children=run.children.trail, restartProofs=run.children.proofs,
                                unexpectedRequests=run.unexpected, caseErrors=run.case_errors, scannerTape=run.scan_tape)
        except BaseException as exc:
            evidence['collectionError'] = error(exc)
        # Step 3. Child logs. A rejected or failed log is recorded as such and fails the run. It is never
        # reported as written, and it cannot skip cleanup, which already ran.
        logs = []
        for role, channel in (run.roles.items() if run is not None else ()):
            name = 'child-' + role + '.stderr.log'
            try:
                persist(out / name, ''.join(channel.stderr)[-20000:], secrets, text=True)
                logs.append({'log': name, 'status': 'WRITTEN'})
            except BaseException as exc:
                logs.append({'log': name, 'status': 'REJECTED', 'error': error(exc)})
        evidence['childLogs'] = logs
        try:
            # Step 4. Verify the migration profile and every manifest pin again.
            try:
                verify_manifest(args.manifest, args.manifest_sha256, web_root=ROOT, db_root=db_root, git=git, docker=preflight)
                evidence['sourcesUnchanged'] = True
            except BaseException as exc:
                evidence.update(sourcesUnchanged=False, sourceVerificationError=error(exc))
            failures = evaluate(evidence, run) if run is not None and evidence['originalError'] is None else None
            evidence['failures'] = failures
            clean = ((evidence['resources'] or {}).get('complete') is True and evidence.get('sourcesUnchanged') is True
                     and 'cleanupError' not in evidence and 'collectionError' not in evidence
                     and all(row['status'] == 'WRITTEN' for row in logs))
            if smoke:
                missing = (evidence['originalError'] or {}).get('code') == 'MISSING_CONTRACT'
                evidence['smokeResult'] = 'MISSING_CONTRACT_CLOSED' if missing else 'NOT_CLOSED'
                if missing and clean:
                    evidence.update(status='passed', exitCode=0)
            elif failures == [] and clean:
                evidence.update(status='passed', exitCode=0)
        except BaseException as exc:
            evidence.update(status='failed', exitCode=1, finalizationError=error(exc))
        finally:
            try:
                stack.close()
            except BaseException as exc:
                evidence.update(status='failed', exitCode=1, reuseFinalizationError=error(exc))
            signal.signal(signal.SIGTERM, previous_signal)
            evidence['dockerCommands'] = docker_log
            try:
                persist(out / 'receipt.json', evidence, secrets)
            except BaseException as exc:
                # A receipt that cannot be persisted safely is replaced by a minimal failed record. It keeps
                # the codes of the original and cleanup errors and the exact resource ledger, with no free text.
                evidence = {'status': 'failed', 'exitCode': 1, 'phase': args.phase, 'runLabel': args.run_label,
                            'receiptError': {'type': type(exc).__name__, 'code': str(getattr(exc, 'code', 'OPERATION_FAILED'))[:64]},
                            'originalErrorCode': (evidence.get('originalError') or {}).get('code'),
                            'cleanupErrorCode': (evidence.get('cleanupError') or {}).get('code'),
                            'resources': evidence.get('resources')}
                try:
                    (out / 'receipt.json').write_text(json.dumps(evidence, indent=2) + '\n')
                except BaseException:
                    evidence['receiptWritten'] = False
            print(json.dumps({key: evidence.get(key) for key in ('status', 'stage', 'exitCode', 'smokeResult')}))
            print('Receipt: ' + str(out / 'receipt.json'))
    return evidence['exitCode']


def close_pair(pair, evidence):
    """Exact cleanup through the reused factory. Uncertain creation is preserved, never guessed."""
    result = {'runId': pair.run_id, 'unknownCreation': copy.deepcopy(pair.ledger.unknown),
              'uncertainPhase': copy.deepcopy(pair.uncertain_phase), 'complete': False,
              'network': {'id': pair.network['network_id'] if pair.network else None,
                          'name': pair.network_name, 'owned': pair.network is not None, 'absent': None},
              'containers': [{'role': row['role'], 'id': row['container_id'], 'imageId': row['image_id'], 'owned': True,
                              'absent': None} for row in pair.containers]}
    try:
        require(not pair.ledger.unknown and not pair.uncertain_phase, 'UNKNOWN_CREATION',
                'Uncertain creation or start is preserved; guessed cleanup is forbidden')
        pair.close()
    except BaseException as exc:
        evidence['cleanupError'] = error(exc)
    absence = pair.cleanup.absence if pair.cleanup else None
    if isinstance(absence, dict):
        result['network']['absent'] = absence.get('network')
        for row in result['containers']:
            row['absent'] = absence.get('containers', {}).get(row['id'])
    # A full run owns three containers. The missing-contract smoke stops before PostgREST and owns two.
    result['complete'] = ('cleanupError' not in evidence and result['network']['absent'] is True
                          and len(result['containers']) == (2 if evidence.get('smoke') else 3)
                          and all(row['absent'] is True for row in result['containers']))
    return result


def missing_contract_smoke(image, manifest, manifest_sha256, run_label, *, db_root=DB_ROOT, git=None, docker=None):
    """Owned smoke: install only current10, then expect the exact MISSING_CONTRACT refusal.

    This is not a command-line option. The coordinator calls it from python3 -I -B
    after loading this file. No child process starts and no PostgREST starts.
    """
    args = argparse.Namespace(image=image, phase='canonical', manifest=manifest, manifest_sha256=manifest_sha256,
                              run_label=run_label, db_root=db_root)
    require(image in ('postgres:15.8', 'postgres:17.6'), 'IMAGE_ID', 'Unsupported PostgreSQL image')
    return execute(args, git=git or _command, docker=docker, process=None, flags=runtime_flags(), smoke=True)


def main(argv=None, *, git=None, docker=None, process=None):
    parser = argparse.ArgumentParser(description='H1 intake-hold HTTP harness')
    commands = parser.add_subparsers(dest='command', required=True)
    build = commands.add_parser('manifest')
    build.add_argument('--output', required=True)
    run = commands.add_parser('run')
    for command in (build, run):
        command.add_argument('--db-root', type=Path, default=DB_ROOT)
    run.add_argument('--image', choices=['postgres:15.8', 'postgres:17.6'], required=True)
    run.add_argument('--phase', choices=['canonical', 'fault'], required=True)
    for name in ('manifest', 'manifest-sha256', 'run-label'):
        run.add_argument('--' + name, required=True)
    args = parser.parse_args(argv)
    try:
        flags = runtime_flags()
        if args.command == 'manifest':
            output = Path(args.output)
            require(not output.exists(), 'MANIFEST_OUTPUT', 'Manifest output already exists')
            client = docker or LocalDocker(shutil.which('docker', path=ENV['PATH']) or '/nonexistent', docker_endpoint(),
                                           ROOT / '.artifacts/payment-web-order-http/.intake-hold-docker-config')
            manifest = build_manifest(web_root=ROOT, db_root=args.db_root.resolve(), git=git or _command, docker=client)
            output.write_text(json.dumps(manifest, indent=2) + '\n')
            print(json.dumps({'status': 'written', 'manifestSha256': digest(output.read_bytes()), 'output': str(output)}))
            return 0
        return execute(args, git=git or _command, docker=docker, process=process, flags=flags)
    except BoundaryError as exc:
        print(json.dumps({'status': 'failed', 'exitCode': 1, 'error': {'code': exc.code, 'message': str(exc)[:300]}}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
