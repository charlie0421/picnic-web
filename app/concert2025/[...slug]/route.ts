// /concert2025/ 아래의 없는 경로. matcher 는 /concert2025/image/, /concert2025/video/ 를 제외한다.
// 그 아래의 없는 파일이 [lang]=concert2025 페이지로 렌더되지 않게 한다. 실제 파일(public/concert2025/)이 먼저 맞는다.
// /concert2025 자체는 (bare) 페이지이고 이 handler 와 겹치지 않는다(slug 는 한 세그먼트 이상).
export function GET() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
