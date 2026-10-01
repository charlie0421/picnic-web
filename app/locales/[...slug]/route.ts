// public/locales/ 아래의 없는 경로. matcher 가 /locales/ 를 통째로 제외하므로 middleware 를 거치지 않는다.
// 이 handler 가 없으면 /images/rewards 같은 주소가 [lang] 페이지로 렌더되고 ISR 항목이 된다.
// 실제 파일(public/)은 Next 가 먼저 맞춘다.
export function GET() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
