import { logError } from '@/utils/log-error';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 서버가 밖으로 요청을 보낸 뒤(자식 span, http breadcrumb) logError 로 오류를 남긴다.
export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const token = request.headers.get('x-envtest-upstream-token') ?? 'none';
  const upstream = await fetch(`${process.env.ENVELOPE_TEST_UPSTREAM}/probe?token=${token}&select=id`, {
    cache: 'no-store',
  });
  logError('envtest handled', new Error(`envtest handled upstream ${upstream.status}`));

  return Response.json({ ok: true });
}
