// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { chmod, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createPortOneTestSettlement } from '@/lib/payment/portone-test/settlement';

const USER = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const INBOX = '44444444-4444-4444-8444-444444444444';
const PAYMENT = `web_${CONTEXT}`;
const scope = { version: 1, orderId: ORDER, userId: USER, productId: 'STAR_100', paymentId: PAYMENT,
  storeId: 'store-test', merchantId: 'merchant-test', channelId: 'channel-test', channelKey: 'channel-key-test',
  bindingVersion: '1', bindingHash: 'a'.repeat(64), amount: 1700, currency: 'KRW', environment: 'TEST', pgProvider: 'INICIS_V2' };
const context = { orderId: ORDER, contextId: CONTEXT, paymentId: PAYMENT, productId: scope.productId, amountMinor: '1700',
  provider: 'PORTONE', environment: 'TEST', currency: 'KRW', quantity: '1', verificationBindingPresent: true };
const config = { merchant_id: scope.merchantId, store_id: scope.storeId, channel_id: scope.channelId, channelKey: scope.channelKey,
  channel_type: 'TEST', method: 'CARD', bindingVersion: '1' };
const binding = { bindingHash: scope.bindingHash, bindingVersion: '1' };
const env = { NODE_ENV: 'test', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', PORTONE_TEST_SETTLEMENT_ENABLED: 'true' };
const roots: string[] = [];
async function fixture(changed = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'portone-settlement-')); roots.push(dir);
  await chmod(dir, 0o700);
  await writeFile(join(dir, 'scope.json'), JSON.stringify({ ...scope, ...changed }), { mode: 0o600 });
  const spool = createPortOneTestSettlement({ ...env, PORTONE_TEST_SETTLEMENT_DIR: dir })!;
  return { dir, spool };
}
const key = (parts: string[]) => createHash('sha256').update(parts.join(':')).digest('hex');
afterEach(async () => { await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

describe('local PortOne settlement immutable filesystem', () => {
  it('preserves optional checkout but fails closed when an armed directory is absent or remote', () => {
    expect(createPortOneTestSettlement({ NODE_ENV: 'test' })).toBeNull();
    for (const changed of [{}, { NODE_ENV: 'production' }, { VERCEL: '1' },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://remote.invalid' }, { PORTONE_TEST_SETTLEMENT_DIR: 'relative' }]) {
      expect(() => createPortOneTestSettlement({ ...env, ...changed })).toThrow('PORTONE_TEST_UNAVAILABLE');
    }
  });
  it('publishes complete paid files once across concurrent replay and a fresh publisher', async () => {
    const { dir, spool } = await fixture();
    const paid = { version: 1, type: 'paid', orderId: ORDER, paymentId: PAYMENT, inboxId: INBOX } as const;
    await Promise.all(Array.from({ length: 8 }, () => spool.publishPaid(paid)));
    await createPortOneTestSettlement({ ...env, PORTONE_TEST_SETTLEMENT_DIR: dir })!.publishPaid(paid);
    expect(await readdir(join(dir, 'notifications'))).toEqual([`${key(['paid', ORDER, INBOX])}.json`]);
    expect(JSON.parse(await readFile(join(dir, 'notifications', `${key(['paid', ORDER, INBOX])}.json`), 'utf8'))).toEqual(paid);
  });
  it('pins one independently verified transaction immutably and refuses replacement', async () => {
    const { dir, spool } = await fixture();
    await spool.assertScope({ actorUserId: USER, orderId: ORDER }, context as any, config as any, binding as any);
    await spool.pinTransaction(ORDER, PAYMENT, 'tx-original');
    await spool.pinTransaction(ORDER, PAYMENT, 'tx-original');
    await expect(spool.pinTransaction(ORDER, PAYMENT, 'tx-other')).rejects.toThrow('PORTONE_TEST_UNAVAILABLE');
    expect(JSON.parse(await readFile(join(dir, 'transaction.json'), 'utf8'))).toEqual({ version: 1, orderId: ORDER, paymentId: PAYMENT, transactionId: 'tx-original' });
  });
  it.each(['transaction', 'paid'])('recovers only a matching managed publish twin after a crash: %s', async kind => {
    const { dir, spool } = await fixture();
    const paid = { version: 1, type: 'paid', orderId: ORDER, paymentId: PAYMENT, inboxId: INBOX } as const;
    const transaction = { version: 1, orderId: ORDER, paymentId: PAYMENT, transactionId: 'tx-original' };
    const parent = kind === 'transaction' ? dir : join(dir, 'notifications');
    if (kind === 'paid') await mkdir(parent, { mode: 0o700 });
    const name = kind === 'transaction' ? 'transaction.json' : `${key(['paid', ORDER, INBOX])}.json`;
    const temporary = join(parent, `.portone-${name}-55555555-5555-4555-8555-555555555555.tmp`);
    await writeFile(temporary, JSON.stringify(kind === 'transaction' ? transaction : paid), { mode: 0o600 });
    await link(temporary, join(parent, name));
    if (kind === 'transaction') await spool.pinTransaction(ORDER, PAYMENT, 'tx-original');
    else await spool.publishPaid(paid);
    expect(await readdir(parent)).not.toContain(temporary.slice(parent.length + 1));
    expect(JSON.parse(await readFile(join(parent, name), 'utf8'))).toEqual(kind === 'transaction' ? transaction : paid);
  });
  it('refuses a same-directory hardlink that is not a matching managed publish twin', async () => {
    const { dir, spool } = await fixture();
    const value = { version: 1, orderId: ORDER, paymentId: PAYMENT, transactionId: 'tx-original' };
    await writeFile(join(dir, 'unmanaged.json'), JSON.stringify(value), { mode: 0o600 });
    await link(join(dir, 'unmanaged.json'), join(dir, 'transaction.json'));
    await expect(spool.pinTransaction(ORDER, PAYMENT, 'tx-original')).rejects.toThrow('PORTONE_TEST_UNAVAILABLE');
  });
  it.each([{ orderId: USER }, { userId: ORDER }, { productId: 'OTHER' }, { paymentId: `web_${ORDER}` },
    { bindingHash: 'b'.repeat(64) }, { bindingVersion: '2' }, { amount: 1701 }, { pgProvider: 'KAKAOPAY' }, { privateToken: 'never' }])('refuses mismatched or expanded scope %j', async changed => {
    const { spool } = await fixture(changed);
    await expect(spool.assertScope({ actorUserId: USER, orderId: ORDER }, context as any, config as any, binding as any)).rejects.toThrow('PORTONE_TEST_UNAVAILABLE');
  });
  it('refuses corrupt scope and changed permissions without creating notifications', async () => {
    const { dir, spool } = await fixture();
    await chmod(join(dir, 'scope.json'), 0o644);
    await expect(spool.assertScope({ actorUserId: USER, orderId: ORDER }, context as any, config as any)).rejects.toThrow('PORTONE_TEST_UNAVAILABLE');
    await chmod(join(dir, 'scope.json'), 0o600); await writeFile(join(dir, 'scope.json'), '{');
    await expect(spool.publishPaid({ version: 1, type: 'paid', orderId: ORDER, paymentId: PAYMENT, inboxId: INBOX })).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['scope.json']);
  });
  it.each(['root', 'scope', 'notifications', 'file', 'hardlink'])('rejects symlink or hardlink redirection: %s', async kind => {
    const { dir, spool } = await fixture(); const other = await mkdtemp(join(tmpdir(), 'portone-other-')); roots.push(other);
    const paid = { version: 1, type: 'paid', orderId: ORDER, paymentId: PAYMENT, inboxId: INBOX } as const;
    if (kind === 'root') {
      const alias = join(other, 'alias'); await symlink(dir, alias);
      const redirected = createPortOneTestSettlement({ ...env, PORTONE_TEST_SETTLEMENT_DIR: alias })!;
      await expect(redirected.publishPaid(paid)).rejects.toThrow(); return;
    }
    if (kind === 'scope') { await rm(join(dir, 'scope.json')); await writeFile(join(other, 'scope'), JSON.stringify(scope), { mode: 0o600 }); await symlink(join(other, 'scope'), join(dir, 'scope.json')); }
    if (kind === 'notifications') await symlink(other, join(dir, 'notifications'));
    if (kind === 'file' || kind === 'hardlink') {
      await mkdir(join(dir, 'notifications'), { mode: 0o700 });
      await writeFile(join(other, 'file'), JSON.stringify(paid), { mode: 0o600 });
      const destination = join(dir, 'notifications', `${key(['paid', ORDER, INBOX])}.json`);
      if (kind === 'file') await symlink(join(other, 'file'), destination); else await link(join(other, 'file'), destination);
    }
    await expect(spool.publishPaid(paid)).rejects.toThrow('PORTONE_TEST_UNAVAILABLE');
  });
  it('refuses delivery collisions and excludes volatile receipt/signature data', async () => {
    const { dir, spool } = await fixture();
    const signal = { version: 1, type: 'cancelled', orderId: ORDER, paymentId: PAYMENT, storeId: scope.storeId,
      transactionId: 'tx-original', cancellationId: 'cancel-1', deliveryId: 'delivery-1', bodySha256: 'b'.repeat(64) } as const;
    await spool.pinTransaction(ORDER, PAYMENT, 'tx-original');
    await spool.publishCancelled(signal);
    await spool.publishCancelled(signal);
    await expect(spool.publishCancelled({ ...signal, cancellationId: 'cancel-2' })).rejects.toThrow('PORTONE_TEST_UNAVAILABLE');
    const files = await readdir(join(dir, 'notifications'));
    expect(files).toEqual([`${key(['cancelled', 'delivery-1'])}.json`]);
    expect(JSON.parse(await readFile(join(dir, 'notifications', files[0]), 'utf8'))).toEqual(signal);
  });
});
