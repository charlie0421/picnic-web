import 'server-only';

export type PortOneTestScope = { merchant_id: string; store_id: string; channel_id: string; channel_type: 'TEST' };
export type PortOneTestConfig = Readonly<PortOneTestScope & {
  channelKey: string; method: 'CARD' | 'KAKAOPAY'; credentialRef: string; bindingVersion: string; apiSecret: string;
}>;
const ID = /^[A-Za-z0-9._:-]{1,200}(?![\s\S])/;
export function readPortOneTestConfig(env: Readonly<Record<string, string | undefined>> = process.env): PortOneTestConfig | null {
  try {
    if (!['development', 'test'].includes(env.NODE_ENV ?? '') || env.PORTONE_TEST_CHECKOUT_ENABLED !== 'true'
      || env.VERCEL || env.VERCEL_ENV || !env.PORTONE_TEST_API_SECRET
      || !/^[\x21-\x7e]{1,4096}(?![\s\S])/.test(env.PORTONE_TEST_API_SECRET)
      || !env.PORTONE_TEST_CHANNEL_CONFIG || env.PORTONE_TEST_CHANNEL_CONFIG.length > 4096) return null;
    const value: unknown = JSON.parse(env.PORTONE_TEST_CHANNEL_CONFIG);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const d = value as Record<string, unknown>;
    const keys = ['merchant_id', 'store_id', 'channel_id', 'channel_type', 'channelKey', 'method', 'credentialRef', 'bindingVersion'];
    if (Object.keys(d).length !== keys.length || !keys.every(key => Object.hasOwn(d, key))
      || !['merchant_id', 'store_id', 'channel_id', 'channelKey'].every(key => typeof d[key] === 'string' && ID.test(d[key] as string))
      || d.channel_type !== 'TEST' || (d.method !== 'CARD' && d.method !== 'KAKAOPAY')
      || typeof d.credentialRef !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,127}(?![\s\S])/.test(d.credentialRef)
      || typeof d.bindingVersion !== 'string' || !/^[1-9][0-9]{0,18}(?![\s\S])/.test(d.bindingVersion)
      || BigInt(d.bindingVersion) > BigInt('9223372036854775807')) return null;
    return Object.freeze({ ...d, apiSecret: env.PORTONE_TEST_API_SECRET }) as PortOneTestConfig;
  } catch { return null; }
}
