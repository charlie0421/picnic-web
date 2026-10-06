import { logSafeError } from '@/utils/log-safe-error';
import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, hostileError, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 핸들러가 스스로 기록을 남기고 정상 응답한다. 계약을 통과한 필드는 남고, 통과하지 못한 값은 어디에도 없어야 한다.
export const GET = withSafeErrors('envtest.boundary.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const header = (name: string) => request.headers.get(`x-envtest-${name}`) ?? undefined;
  logSafeError('envtest.boundary.handled', hostileError(request.headers), {
    userId: header('user-id'),
    orderId: header('order-id'),
    // 형식에 맞지 않는 값 → 버려지고 이름만 droppedFields 에 남는다.
    paymentId: header('boundary-payment-id'),
    // 표에 없는 값 → 'unknown' 이 된다.
    errorCode: header('boundary-error-code'),
    httpStatus: 502,
  });

  return Response.json({ ok: true });
});
