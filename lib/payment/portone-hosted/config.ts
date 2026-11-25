import 'server-only';
import type { PortOneEnvironment } from '../portone-test/protocol';

export type HostedFlow = 'PG_HOSTED_V1' | 'KAKAOPAY_DIRECT_V1';
/** PortOne V2 browser SDK launch categories. There is no wildcard; each channel names one route. */
export type HostedPayMethod = 'CARD' | 'TRANSFER' | 'VIRTUAL_ACCOUNT' | 'MOBILE' | 'GIFT_CERTIFICATE' | 'EASY_PAY';
export type HostedBuyer = 'NONE' | 'NAME_EMAIL_PHONE';
/** KG Inicis V2 gift certificate kinds. A mobile GIFT_CERTIFICATE launch requires one; a PC launch omits it. */
export type HostedGiftCertificateType = 'BOOKNLIFE' | 'SMART_MUNSANG' | 'CULTURELAND';
export type HostedChannel = Readonly<{
  credentialRef: string; environment: PortOneEnvironment; bindingVersion: string;
  merchant_id: string; store_id: string; channel_id: string; channel_type: PortOneEnvironment; channelKey: string;
  checkoutFlow: HostedFlow; payMethod: HostedPayMethod; easyPayProvider: string | null; buyer: HostedBuyer;
  productType: 'DIGITAL' | 'REAL'; virtualAccountValidHours: number | null; giftCertificateType: HostedGiftCertificateType | null;
  // False closes new checkout and initial confirmation only. Historical lookup keeps resolving the credential.
  acceptsCheckout: boolean; apiSecret: string;
}>;
export type HostedChannelKey = { credentialRef: string; environment: PortOneEnvironment; bindingVersion: string; checkoutFlow: HostedFlow };
export type HostedChannels = {
  resolve(key: HostedChannelKey): HostedChannel | null;
  environmentsForStore(storeId: string): readonly PortOneEnvironment[];
};

const ID = /^[A-Za-z0-9._:-]{1,200}$/;
const REF = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const VERSION = /^[1-9][0-9]{0,18}$/;
const SECRET = /^[\x21-\x7e]{1,4096}$/;
const KEYS = ['credentialRef', 'environment', 'bindingVersion', 'merchant_id', 'store_id', 'channel_id', 'channelKey', 'checkoutFlow',
  'payMethod', 'easyPayProvider', 'buyer', 'productType', 'virtualAccountValidHours', 'acceptsCheckout'];
const OPTIONAL_KEYS = ['giftCertificateType'];
const PAY_METHODS: readonly string[] = ['CARD', 'TRANSFER', 'VIRTUAL_ACCOUNT', 'MOBILE', 'GIFT_CERTIFICATE', 'EASY_PAY'];
const GIFT_TYPES: readonly string[] = ['BOOKNLIFE', 'SMART_MUNSANG', 'CULTURELAND'];
const PROVIDER = /^[A-Z][A-Z0-9_]{0,39}$/;
const CLOSED: HostedChannels = { resolve: () => null, environmentsForStore: () => [] };

/** Server env name of a channel's API secret. The secret never enters the JSON channel list. */
export function hostedSecretName(credentialRef: string, environment: PortOneEnvironment): string {
  return `PORTONE_HOSTED_SECRET__${credentialRef.toUpperCase().replace(/[^A-Z0-9]/g, '_')}__${environment}`;
}

function parseChannel(value: unknown, env: Readonly<Record<string, string | undefined>>): HostedChannel | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (!KEYS.every(key => Object.hasOwn(d, key)) || Object.keys(d).some(key => !KEYS.includes(key) && !OPTIONAL_KEYS.includes(key))) return null;
  const environment: PortOneEnvironment | null = d.environment === 'TEST' ? 'TEST' : d.environment === 'LIVE' ? 'LIVE' : null;
  const flow: HostedFlow | null = d.checkoutFlow === 'PG_HOSTED_V1' ? 'PG_HOSTED_V1'
    : d.checkoutFlow === 'KAKAOPAY_DIRECT_V1' ? 'KAKAOPAY_DIRECT_V1' : null;
  if (!environment || !flow || typeof d.credentialRef !== 'string' || !REF.test(d.credentialRef)
    || typeof d.bindingVersion !== 'string' || !VERSION.test(d.bindingVersion) || BigInt(d.bindingVersion) > BigInt('9223372036854775807')
    || !['merchant_id', 'store_id', 'channel_id', 'channelKey'].every(key => typeof d[key] === 'string' && ID.test(d[key] as string))
    || typeof d.payMethod !== 'string' || !PAY_METHODS.includes(d.payMethod)
    || (d.easyPayProvider !== null && (typeof d.easyPayProvider !== 'string' || !PROVIDER.test(d.easyPayProvider)))
    || (d.buyer !== 'NONE' && d.buyer !== 'NAME_EMAIL_PHONE')
    || (d.productType !== 'DIGITAL' && d.productType !== 'REAL') || typeof d.acceptsCheckout !== 'boolean') return null;
  // An EasyPay provider exists only on an EASY_PAY route. The dedicated KakaoPay flow is exactly EASY_PAY + KAKAOPAY.
  // An integrated PG EASY_PAY route may name a merchant-configured wallet. The CARD window never names one, so it keeps
  // every optional wallet the PG shows.
  if (d.easyPayProvider !== null && d.payMethod !== 'EASY_PAY') return null;
  if (flow === 'KAKAOPAY_DIRECT_V1' && !(d.payMethod === 'EASY_PAY' && d.easyPayProvider === 'KAKAOPAY')) return null;
  const hours = d.virtualAccountValidHours;
  if (hours !== null && (d.payMethod !== 'VIRTUAL_ACCOUNT' || !Number.isSafeInteger(hours) || (hours as number) < 1 || (hours as number) > 720)) return null;
  const gift = d.giftCertificateType ?? null;
  if (gift !== null && (d.payMethod !== 'GIFT_CERTIFICATE' || typeof gift !== 'string' || !GIFT_TYPES.includes(gift))) return null;
  const apiSecret = env[hostedSecretName(d.credentialRef, environment)];
  if (!apiSecret || !SECRET.test(apiSecret)) return null;
  return Object.freeze({ credentialRef: d.credentialRef, environment, bindingVersion: d.bindingVersion,
    merchant_id: d.merchant_id as string, store_id: d.store_id as string, channel_id: d.channel_id as string, channel_type: environment,
    channelKey: d.channelKey as string, checkoutFlow: flow, payMethod: d.payMethod as HostedPayMethod,
    easyPayProvider: d.easyPayProvider as string | null, buyer: d.buyer as HostedBuyer, productType: d.productType as 'DIGITAL' | 'REAL',
    virtualAccountValidHours: hours as number | null, giftCertificateType: gift as HostedGiftCertificateType | null,
    acceptsCheckout: d.acceptsCheckout, apiSecret });
}

/**
 * Reads hosted channels from PORTONE_HOSTED_CHANNELS (a JSON array) and per-channel secret env names.
 * Unset means unprovisioned. Any invalid entry closes the whole configuration.
 */
export function readPortOneHostedChannels(env: Readonly<Record<string, string | undefined>> = process.env): HostedChannels {
  try {
    const raw = env.PORTONE_HOSTED_CHANNELS;
    if (!raw || raw.length > 16384) return CLOSED;
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0 || list.length > 16) return CLOSED;
    const channels: HostedChannel[] = [];
    for (const item of list) {
      const channel = parseChannel(item, env);
      if (!channel || channels.some(other => other.credentialRef === channel.credentialRef && other.environment === channel.environment
        && other.bindingVersion === channel.bindingVersion)) return CLOSED;
      channels.push(channel);
    }
    return {
      resolve: key => channels.find(c => c.credentialRef === key.credentialRef && c.environment === key.environment
        && c.bindingVersion === key.bindingVersion && c.checkoutFlow === key.checkoutFlow) ?? null,
      environmentsForStore: storeId => Array.from(new Set(channels.filter(c => c.store_id === storeId).map(c => c.environment))),
    };
  } catch { return CLOSED; }
}
