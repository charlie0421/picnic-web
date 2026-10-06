import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, hostileError, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계 함수로 감싼 라우트. 던진 오류가 Next 의 미처리 오류 로그와 SDK 의 래퍼에 닿지 않아야 한다.
export const GET = withSafeErrors('envtest.boundary.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  throw hostileError(request.headers);
});
