import { logError } from '@/utils/log-error';
import { logSafeError } from '@/utils/log-safe-error';
import { applyProbeHeader } from '../_lib/delivery-probe';
import { envelopeTestDisabled } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계 함수로 감싸지 않은 라우트. 기록을 남기고 바로 응답한다 — SDK 의 래퍼가 건 flush 가 그 이벤트를 기다리는지 본다.
export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;
  applyProbeHeader(request.headers);

  if (new URL(request.url).searchParams.get('via') === 'logError') {
    logError('envtest delivery legacy', new Error('envtest delivery legacy'));
  } else {
    logSafeError('envtest.delivery.handled', new Error('envtest delivery'));
  }

  return Response.json({ ok: true });
}
