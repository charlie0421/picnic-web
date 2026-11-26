import 'server-only';
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { link, lstat, mkdir, open, readdir, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, normalize, parse } from 'node:path';
import { isLocalPortOneDatabase } from '../portone-test-local';
import type { ChargeContext } from '../paypal-charge/repository';
import type { PortOneTestConfig } from './config';
import type { PortOneTestBinding } from './repository';
import { boundedId, record, UUID } from './protocol';

type Scope = { version: 1; orderId: string; userId: string; productId: string; paymentId: string; storeId: string;
  merchantId: string; channelId: string; channelKey: string; bindingVersion: string; bindingHash: string;
  amount: 1700; currency: 'KRW'; environment: 'TEST'; pgProvider: 'INICIS_V2' };
export type PaidSignal = { version: 1; type: 'paid'; orderId: string; paymentId: string; inboxId: string };
export type CancelledSignal = { version: 1; type: 'cancelled'; orderId: string; paymentId: string; storeId: string;
  transactionId: string; cancellationId: string; deliveryId: string; bodySha256: string };
type Transaction = { version: 1; orderId: string; paymentId: string; transactionId: string };
const HASH = /^[0-9a-f]{64}(?![\s\S])/;
const SCOPE_KEYS = ['version', 'orderId', 'userId', 'productId', 'paymentId', 'storeId', 'merchantId', 'channelId',
  'channelKey', 'bindingVersion', 'bindingHash', 'amount', 'currency', 'environment', 'pgProvider'];
function unavailable(): never { throw new Error('PORTONE_TEST_UNAVAILABLE'); }
function exact(d: Record<string, unknown> | null, keys: string[]): d is Record<string, unknown> {
  return !!d && Object.keys(d).length === keys.length && keys.every(key => Object.hasOwn(d, key));
}
function parseObject(text: string): Record<string, unknown> {
  const d = record(JSON.parse(text));
  // All journal objects are flat. Reject duplicate keys before interpreting their values.
  let inString = false; let escape = false; let colons = 0;
  for (const char of text) {
    if (escape) { escape = false; continue; }
    if (inString && char === '\\') { escape = true; continue; }
    if (char === '"') inString = !inString;
    else if (!inString && char === ':') colons++;
  }
  if (!d || colons !== Object.keys(d).length || Object.values(d).some(v => v !== null && typeof v === 'object')) unavailable();
  return d;
}
function samePayload(a: Record<string, unknown>, b: object) {
  const entries = Object.entries(b);
  return Object.keys(a).length === entries.length && entries.every(([key, value]) => a[key] === value);
}
function sameIdentity(a: { dev: number; ino: number }, b: { dev: number; ino: number }) { return a.dev === b.dev && a.ino === b.ino; }
function privateDirectory(stat: Stats) {
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o700) unavailable();
}
function privateFile(stat: Stats, links = 1) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o600
    || stat.nlink !== links || stat.size < 2 || stat.size > 8192) unavailable();
}

/** Only the coordinator provisions this directory and scope. Files contain hints, never financial authority. */
class PortOneTestSettlement {
  private scopeDigest: string | undefined;
  constructor(private readonly directory: string) {}
  private async root() {
    const before = await lstat(this.directory); privateDirectory(before);
    const handle = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat(); privateDirectory(opened);
      if (!sameIdentity(before, opened) || !sameIdentity(opened, await lstat(this.directory))) unavailable();
      return handle;
    } catch (error) { await handle.close(); throw error; }
  }
  private async readPrivate(path: string): Promise<Record<string, unknown>> {
    const before = await this.recoverManagedTwin(path);
    privateFile(before);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = await handle.stat(); privateFile(opened);
      if (!sameIdentity(before, opened)) unavailable();
      const bytes = Buffer.alloc(8193); const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead !== opened.size || bytesRead > 8192) unavailable();
      const after = await handle.stat(); privateFile(after);
      if (!sameIdentity(after, await lstat(path)) || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) unavailable();
      return parseObject(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)));
    } finally { await handle.close(); }
  }
  private async recoverManagedTwin(path: string): Promise<Stats> {
    const before = await lstat(path);
    if (before.nlink !== 2) { privateFile(before); return before; }
    const name = basename(path); const parentPath = dirname(path);
    if (name !== 'transaction.json' && !(basename(parentPath) === 'notifications' && /^[0-9a-f]{64}\.json$/.test(name))) unavailable();
    // A complete target may survive a crash before its publisher removes the temporary hardlink.
    // Never recover scope.json or a link outside the target's private directory.
    privateFile(before, 2);
    const parentStat = await lstat(parentPath); privateDirectory(parentStat);
    const parent = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      if (!sameIdentity(parentStat, await parent.stat())) unavailable();
      const prefix = `.portone-${name}-`;
      const twins: string[] = [];
      for (const item of await readdir(parentPath)) {
        if (!item.startsWith(prefix) || !item.endsWith('.tmp') || !UUID.test(item.slice(prefix.length, -4))) continue;
        const candidate = join(parentPath, item);
        let stat: Stats;
        try { stat = await lstat(candidate); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        if (sameIdentity(before, stat)) {
          privateFile(stat, 2); twins.push(candidate);
        }
      }
      const current = await lstat(path);
      if (!sameIdentity(before, current)) unavailable();
      if (current.nlink === 2) {
        if (twins.length !== 1) unavailable();
        const twin = await lstat(twins[0]).catch(error => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error;
        });
        if (twin && !sameIdentity(before, twin)) unavailable();
        const directory = await lstat(parentPath); privateDirectory(directory);
        if (!sameIdentity(parentStat, directory)) unavailable();
        if (twin) {
          try { await unlink(twins[0]); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
      }
      const after = await lstat(path); privateFile(after);
      if (!sameIdentity(before, after) || !sameIdentity(parentStat, await lstat(parentPath))) unavailable();
      await parent.sync();
      return after;
    } finally { await parent.close(); }
  }
  private async scope(): Promise<Scope> {
    const handle = await this.root();
    try {
      const d = await this.readPrivate(join(this.directory, 'scope.json'));
      if (!exact(d, SCOPE_KEYS) || d.version !== 1 || typeof d.orderId !== 'string' || !UUID.test(d.orderId)
        || typeof d.userId !== 'string' || !UUID.test(d.userId) || !boundedId(d.productId)
        || typeof d.paymentId !== 'string' || !d.paymentId.startsWith('web_') || !UUID.test(d.paymentId.slice(4))
        || !['storeId', 'merchantId', 'channelId', 'channelKey'].every(key => boundedId(d[key]))
        || typeof d.bindingVersion !== 'string' || !/^[1-9][0-9]{0,18}(?![\s\S])/.test(d.bindingVersion)
        || BigInt(d.bindingVersion) > BigInt('9223372036854775807') || typeof d.bindingHash !== 'string' || !HASH.test(d.bindingHash)
        || d.amount !== 1700 || d.currency !== 'KRW' || d.environment !== 'TEST' || d.pgProvider !== 'INICIS_V2') unavailable();
      const digest = createHash('sha256').update(JSON.stringify(d)).digest('hex');
      if (this.scopeDigest !== undefined && this.scopeDigest !== digest) unavailable();
      this.scopeDigest = digest;
      await this.checkRoot(handle);
      return d as Scope;
    } catch { return unavailable(); }
    finally { await handle.close(); }
  }
  private async checkRoot(handle: FileHandle) {
    const pathStat = await lstat(this.directory); privateDirectory(pathStat);
    if (!sameIdentity(await handle.stat(), pathStat)) unavailable();
  }
  async assertScope(input: { actorUserId: string; orderId: string }, context: ChargeContext,
    config: PortOneTestConfig, binding?: PortOneTestBinding): Promise<void> {
    const scope = await this.scope();
    if (input.actorUserId !== scope.userId || input.orderId !== scope.orderId || context.orderId !== scope.orderId
      || context.productId !== scope.productId || context.amountMinor !== '1700' || context.currency !== 'KRW'
      || context.quantity !== '1' || context.provider !== 'PORTONE' || context.environment !== 'TEST'
      || config.method !== 'CARD' || config.merchant_id !== scope.merchantId || config.store_id !== scope.storeId
      || config.channel_id !== scope.channelId || config.channelKey !== scope.channelKey || config.channel_type !== 'TEST'
      || config.bindingVersion !== scope.bindingVersion
      || (context.paymentId !== null && context.paymentId !== scope.paymentId)
      || (context.contextId !== null && `web_${context.contextId}` !== scope.paymentId)
      || (binding !== undefined && (binding.bindingHash !== scope.bindingHash || binding.bindingVersion !== scope.bindingVersion
        || context.paymentId !== scope.paymentId || !context.verificationBindingPresent))) unavailable();
  }
  async matches(paymentId: string, storeId: string): Promise<boolean> {
    const scope = await this.scope(); return paymentId === scope.paymentId && storeId === scope.storeId;
  }
  private async install(name: string, value: object, notifications = false) {
    const root = await this.root(); let parent: FileHandle | undefined; let temporary: string | undefined;
    try {
      const parentPath = notifications ? join(this.directory, 'notifications') : this.directory;
      if (notifications) {
        try { await mkdir(parentPath, { mode: 0o700 }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        // Sync even on replay: a prior publisher may have died after mkdir but before syncing root.
        await root.sync();
      }
      const before = await lstat(parentPath); privateDirectory(before);
      parent = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      if (!sameIdentity(before, await parent.stat())) unavailable();
      temporary = join(parentPath, `.portone-${name}-${randomUUID()}.tmp`);
      const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(JSON.stringify(value), 'utf8'); await file.sync(); }
      finally { await file.close(); }
      await this.checkRoot(root);
      const currentParent = await lstat(parentPath); privateDirectory(currentParent);
      if (!sameIdentity(await parent.stat(), currentParent)) unavailable();
      const destination = join(parentPath, name);
      try { await link(temporary, destination); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      try { await unlink(temporary); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      temporary = undefined;
      await parent.sync();
      const persisted = await this.readPrivate(destination);
      if (!samePayload(persisted, value)) unavailable();
      await this.checkRoot(root);
      if (!sameIdentity(await parent.stat(), await lstat(parentPath))) unavailable();
    } catch { return unavailable(); }
    finally { if (temporary) await unlink(temporary).catch(() => undefined); await parent?.close(); await root.close(); }
  }
  async pinTransaction(orderId: string, paymentId: string, transactionId: string) {
    const scope = await this.scope();
    if (scope.orderId !== orderId || scope.paymentId !== paymentId || !boundedId(transactionId)) unavailable();
    await this.install('transaction.json', { version: 1, orderId, paymentId, transactionId } satisfies Transaction);
  }
  async publishPaid(value: PaidSignal) {
    const scope = await this.scope();
    if (!exact(record(value), ['version', 'type', 'orderId', 'paymentId', 'inboxId']) || value.version !== 1 || value.type !== 'paid'
      || value.orderId !== scope.orderId || value.paymentId !== scope.paymentId || !UUID.test(value.inboxId)) unavailable();
    const key = createHash('sha256').update(['paid', value.orderId, value.inboxId].join(':')).digest('hex');
    await this.install(`${key}.json`, value, true);
  }
  async publishCancelled(value: CancelledSignal) {
    const scope = await this.scope();
    if (!exact(record(value), ['version', 'type', 'orderId', 'paymentId', 'storeId', 'transactionId', 'cancellationId', 'deliveryId', 'bodySha256'])
      || value.version !== 1 || value.type !== 'cancelled' || value.orderId !== scope.orderId || value.paymentId !== scope.paymentId
      || value.storeId !== scope.storeId || !boundedId(value.transactionId) || !boundedId(value.cancellationId)
      || !boundedId(value.deliveryId) || !HASH.test(value.bodySha256)) unavailable();
    const root = await this.root();
    try {
      const transaction = await this.readPrivate(join(this.directory, 'transaction.json'));
      if (!samePayload(transaction, { version: 1, orderId: value.orderId, paymentId: value.paymentId, transactionId: value.transactionId })) unavailable();
      await this.checkRoot(root);
    } finally { await root.close(); }
    const key = createHash('sha256').update(['cancelled', value.deliveryId].join(':')).digest('hex');
    await this.install(`${key}.json`, value, true);
  }
}
export type PortOneTestSettlementPort = Pick<PortOneTestSettlement, 'assertScope' | 'matches' | 'pinTransaction' | 'publishPaid' | 'publishCancelled'>;

export function createPortOneTestSettlement(env: Readonly<Record<string, string | undefined>> = process.env): PortOneTestSettlementPort | null {
  if (env.PORTONE_TEST_SETTLEMENT_ENABLED === undefined && env.PORTONE_TEST_SETTLEMENT_DIR === undefined) return null;
  const directory = env.PORTONE_TEST_SETTLEMENT_DIR;
  if (env.PORTONE_TEST_SETTLEMENT_ENABLED !== 'true' || !directory || !isAbsolute(directory) || normalize(directory) !== directory
    || directory === parse(directory).root || !['development', 'test'].includes(env.NODE_ENV ?? '') || env.VERCEL || env.VERCEL_ENV
    || !isLocalPortOneDatabase(env.NEXT_PUBLIC_SUPABASE_URL)) unavailable();
  return new PortOneTestSettlement(directory);
}
