// /api/ 아래의 없는 경로. matcher 가 /api/ 를 통째로 제외하므로 middleware 를 거치지 않는다.
// 이 handler 가 없으면 /api/rewards 같은 주소가 [lang]=api 페이지로 렌더되고 ISR 항목이 된다.
// 실제 route(app/api/**/route.ts)는 Next 가 먼저 맞춘다.
export function GET() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
