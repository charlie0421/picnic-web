import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계가 던진 값을 들여다보는 것을 방해하는 오류. cause 를 읽으면 요청 값이 든 예외를 던진다.
// 그 예외가 경계 밖으로 나가면 Next 의 미처리 오류 로그와 SDK 의 래퍼에 닿는다.
export const GET = withSafeErrors('envtest.boundary.hostile', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const secret = request.headers.get('x-envtest-boundary-getter') ?? 'none';
  const error = new Error('envtest boundary hostile');
  Object.defineProperty(error, 'cause', {
    get() {
      throw new Error(`envtest cause getter ${secret}`);
    },
  });
  throw error;
});
