import { envelopeTestDisabled, logConsoleCanary, unhandledMessage } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계 함수로 감싸지 않은 라우트. 오류가 Next 의 onRequestError 까지 올라간다.
export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  throw new Error(unhandledMessage(request.headers));
}
