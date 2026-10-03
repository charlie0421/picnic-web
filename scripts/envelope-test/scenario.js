'use strict';

/**
 * envelope 테스트가 보내는 요청과 기대값. 값은 전부 가짜다.
 *
 * canary 는 세 묶음이다 (설계 §5.1).
 *   absent     — envelope 과 서버 표준 출력 어디에도 없어야 한다.
 *   stdoutOnly — 테스트 라우트가 console.warn 으로 찍는다. 서버 출력에만 있어야 한다.
 *   unhandled  — 감싸지 않은 예외. marker 만 exception.values[].value 와 Next 의 미처리 오류 줄에 남는다.
 */

const REPEAT = 3;
const TRACE_ID = '0123456789abcdef0123456789abcdef';
const UNHANDLED_LINE_MARKER = 'envtest unhandled';

const CANARIES = {
  absent: {
    cookie: 'cnryA-cookie-7f3a9b1c2d',
    authorization: 'cnryA1authz8d2e4f6a0b9c7d5e3f',
    signature: 'cnryA-signature-5e6f7a8b9c',
    forwardedFor: '203.0.113.77',
    pageQuery: 'cnryA-pagequery-c3d4e5f6a7',
    webhookQuery: 'cnryA-webhookquery-b8c9d0e1f2',
    webhookPaymentId: 'cnryA-paymentid-1a2b3c4d5e',
    webhookEmail: 'cnrya-webhook@envtest.invalid',
    handledQuery: 'cnryA-handledquery-6f7a8b9c0d',
    upstreamToken: 'cnryA-upstreamtoken-9e8d7c6b5a',
    baggageQuery: 'cnryA-baggagequery-3c2b1a0f9e',
  },
  stdoutOnly: {
    console: 'cnryC-console-0f1e2d3c4b',
  },
  unhandled: {
    marker: 'cnryB-marker-4b5a69788796',
    requestQuery: 'cnryB-requestquery-a5b4c3d2e1',
    urlQuery: 'cnryB-urlquery-f0e1d2c3b4',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbnJ5Qi1qd3QifQ.Y25yeUItand0LXNpZ25hdHVyZQ',
    bearer: 'cnryB7bearer3c5e7a9b1d3f5a7c',
    email: 'cnryb-message@envtest.invalid',
  },
};

const EXPECTED = {
  errors: [
    { label: '웹훅 서명 실패(logError)', handled: true, transaction: 'POST /api/payment/portone/webhook', count: REPEAT },
    { label: '테스트 라우트의 logError', handled: true, valueIncludes: 'envtest handled', count: REPEAT },
    // 라우트 핸들러의 오류는 SDK 의 라우트 래퍼가 먼저 잡는다(mechanism.handled=false). onRequestError 의
    // captureRequestError 는 같은 오류를 다시 보내지 않으므로 이 이벤트에는 contexts.nextjs 가 없다.
    { label: '처리되지 않은 예외(node)', handled: false, runtime: 'node', valueIncludes: UNHANDLED_LINE_MARKER, count: REPEAT, tripwire: true },
    { label: '처리되지 않은 예외(edge)', handled: false, runtime: 'edge', valueIncludes: UNHANDLED_LINE_MARKER, count: REPEAT, tripwire: true },
  ],
  // 웹훅 요청(401)의 transaction 은 기대하지 않는다. SDK 가 401·404·3xx 응답의 transaction 을 버린다.
  // 다른 서비스가 시작한 추적(sentry-trace, baggage)을 이어받은 요청. baggage 의 transaction 이름(쿼리 포함)은
  // DSC 로 envelope 헤더에 실릴 수 있다. 9.47.1 은 span 안의 이벤트에서 DSC 를 자기 루트 span 으로 다시 만들지만,
  // 활성 span 이 없으면 scope 의 DSC(들어온 baggage)를 쓴다. 이어받았는지는 trace_id 로 확인하고, canary 는 헤더까지 찾는다.
  traceHeaders: [{ label: '이어받은 추적의 envelope 헤더', traceId: TRACE_ID, min: REPEAT }],
  transactions: [
    { label: '페이지 transaction', name: 'GET /[lang]/vote', min: REPEAT },
    { label: '밖으로 부르는 요청의 transaction', name: 'GET /api/envelope-test/handled', min: REPEAT, childOp: 'http.client' },
    { label: '처리되지 않은 예외의 transaction(node)', name: 'GET /api/envelope-test/throw', min: REPEAT },
    // edge 는 SDK 가 SENTRY_TRACES_SAMPLE_RATE 를 스스로 읽어 표본이 켜진다. 운영에서는 꺼져 있다.
    { label: 'edge 라우트의 transaction', name: 'GET /api/envelope-test/edge-throw', min: REPEAT },
    { label: 'middleware 의 transaction(edge)', name: 'middleware GET /ko/vote', min: REPEAT },
  ],
};

function buildRequests(base) {
  const A = CANARIES.absent;
  const B = CANARIES.unhandled;
  const common = {
    // 이 프로젝트의 Supabase 쿠키 이름이 아니다. middleware 가 세션으로 읽지 않는다.
    cookie: `sb-envtest-auth-token=${A.cookie}; locale=ko`,
    authorization: `Bearer ${A.authorization}`,
    'x-forwarded-for': A.forwardedFor,
    'x-envtest-console': CANARIES.stdoutOnly.console,
  };
  const unhandled = {
    ...common,
    'x-envtest-marker': B.marker,
    'x-envtest-url-query': B.urlQuery,
    'x-envtest-jwt': B.jwt,
    'x-envtest-bearer': B.bearer,
    'x-envtest-email': B.email,
  };

  const round = [
    { label: 'page', url: `${base}/ko/vote?code=${A.pageQuery}`, init: { headers: common } },
    {
      label: 'webhook',
      url: `${base}/api/payment/portone/webhook?token=${A.webhookQuery}`,
      init: {
        method: 'POST',
        headers: { ...common, 'content-type': 'application/json', 'x-portone-signature': A.signature },
        body: JSON.stringify({ paymentId: A.webhookPaymentId, status: 'PAID', customer: { email: A.webhookEmail } }),
      },
    },
    {
      label: 'handled',
      url: `${base}/api/envelope-test/handled?code=${A.handledQuery}`,
      init: {
        headers: {
          ...common,
          'x-envtest-upstream-token': A.upstreamToken,
          // 다른 서비스가 시작한 추적을 이어받는 요청. baggage 의 transaction 이름에 쿼리가 들어 있다.
          'sentry-trace': `${TRACE_ID}-0123456789abcdef-1`,
          baggage: [
            `sentry-trace_id=${TRACE_ID}`,
            'sentry-public_key=envtestkey',
            'sentry-sample_rate=1',
            'sentry-sampled=true',
            `sentry-transaction=${encodeURIComponent(`/api/pay?code=${A.baggageQuery}`)}`,
          ].join(','),
        },
      },
    },
    { label: 'throw', url: `${base}/api/envelope-test/throw?code=${B.requestQuery}`, init: { headers: unhandled } },
    { label: 'edge-throw', url: `${base}/api/envelope-test/edge-throw?code=${B.requestQuery}`, init: { headers: unhandled } },
  ];

  return Array.from({ length: REPEAT }, () => round).flat();
}

module.exports = { REPEAT, UNHANDLED_LINE_MARKER, CANARIES, EXPECTED, buildRequests };
