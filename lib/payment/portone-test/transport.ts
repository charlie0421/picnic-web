import 'server-only';
import type { PortOneTestConfig } from './config';

export type ConfirmBody = { storeId: string; txId: string; paymentToken: string; totalAmount: number; currency: 'KRW'; isTest: true };
export interface PortOneTestTransport {
  getPayment(config: PortOneTestConfig, paymentId: string): Promise<unknown>;
  confirmPayment(config: PortOneTestConfig, paymentId: string, body: ConfirmBody): Promise<void>;
}
export class PortOneTestTransportError extends Error {
  constructor() { super('PORTONE_TEST_UNAVAILABLE'); }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || response.redirected || !response.body) throw new PortOneTestTransportError();
  const reader = response.body.getReader();
  let bytes = 0; let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 65536) throw new PortOneTestTransportError();
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch { void reader.cancel().catch(() => undefined); throw new PortOneTestTransportError(); }
  finally { reader.releaseLock(); }
}
export function createPortOneTestTransport(fetcher: typeof fetch = fetch): PortOneTestTransport {
  async function request(config: PortOneTestConfig, paymentId: string, body?: ConfirmBody): Promise<unknown> {
    try {
      if (!/^web_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentId)) throw new PortOneTestTransportError();
      const url = `https://api.portone.io/payments/${encodeURIComponent(paymentId)}${body ? '/confirm' : `?storeId=${encodeURIComponent(config.store_id)}`}`;
      const response = await fetcher(url, { method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(10_000), headers: { Authorization: `PortOne ${config.apiSecret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      return await boundedJson(response);
    } catch { throw new PortOneTestTransportError(); }
  }
  return { getPayment: (config, paymentId) => request(config, paymentId),
    async confirmPayment(config, paymentId, body) { await request(config, paymentId, body); } };
}
