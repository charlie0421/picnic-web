/**
 * SWR 용 JSON fetcher.
 *
 * `fetch(...).then(r => r.json())` 은 HTTP 오류를 **resolve** 한다. BFF 가
 * 500 + `{error: ...}` 를 주면 SWR 은 성공으로 보고 `error` 를 세우지 않는다.
 * 그러면 화면이 "데이터 없음" 을 그려서, 로드 실패가 "소멸 예정 없음" 처럼 보인다.
 * 소멸 안내처럼 **없음과 못 불러옴을 구분해야 하는 화면**에서는 치명적이다.
 *
 * 여기서 명시적으로 throw 해 SWR 의 error 경로로 보낸다.
 */
export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`FETCH_INVALID_JSON:${res.status}`);
  }

  if (!res.ok) {
    const code =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP_${res.status}`;
    throw new Error(code);
  }

  // BFF 는 성공 시 { success: true, ... } 를 준다. success 가 명시적으로 false 면 실패다.
  if (body && typeof body === 'object' && (body as { success?: unknown }).success === false) {
    throw new Error('RESPONSE_NOT_SUCCESS');
  }

  return body as T;
}
