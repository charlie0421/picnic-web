import { envelopeTestDisabled, logConsoleCanary, unhandledMessage } from '../_lib/envtest';

// middleware 와 같은 edge SDK(sentry.edge.config.js)를 탄다. middleware 에는 테스트 코드를 넣을 수 없다.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  throw new Error(unhandledMessage(request.headers));
}
