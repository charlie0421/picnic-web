// app/instrumentation.ts
// 참고: Sentry 초기화는 클라이언트 전용 파일(`instrumentation-client.ts`)과
// 서버/엣지 전용 설정(`sentry.server.config.js`, `sentry.edge.config.js`)에서 수행합니다.
// 이 파일에서는 중복 초기화를 방지하기 위해 별도 초기화를 하지 않습니다.

export function register() {
  // 중복 초기화 방지용 no-op
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('instrumentation (app) register: no-op (Sentry init handled elsewhere)');
  }
}