import { logSafeError } from '@/utils/log-safe-error';
import { withSafeErrors } from '@/utils/with-safe-errors';
import { applyProbeHeader } from '../_lib/delivery-probe';
import { envelopeTestDisabled } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계 함수로 감싼 라우트. mode 로 고른다: throw(던진다), handled(기록 한 번), multi(기록 세 번), 그 밖(기록 없음).
export const GET = withSafeErrors('envtest.delivery.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;
  applyProbeHeader(request.headers);

  const mode = new URL(request.url).searchParams.get('mode');
  if (mode === 'throw') throw new Error('envtest delivery throw');
  const records = mode === 'multi' ? 3 : mode === 'handled' ? 1 : 0;
  for (let index = 0; index < records; index += 1) {
    logSafeError('envtest.delivery.handled', new Error('envtest delivery'));
  }

  return Response.json({ ok: true });
});
