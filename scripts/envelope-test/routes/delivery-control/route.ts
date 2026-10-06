import { readProbe } from '../_lib/delivery-probe';
import { envelopeTestDisabled } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 탐침이 기록한 waitUntil 등록을 실행기에 돌려준다. 기록을 남기지 않는다.
export async function GET(): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  return Response.json(readProbe());
}
