/**
 * UUID v4 생성 — secure context 가 아니어도 동작한다.
 *
 * `crypto.randomUUID()` 는 secure context(https, localhost)에서만 정의된다.
 * 인앱 브라우저·구형 WebView·http 접속에서는 undefined 이므로 그대로 호출하면 TypeError 가 난다.
 * 투표 제출의 `request_id` 는 서버 멱등 키라 필수이므로, 여기서 반드시 유효한 UUID 를 만들어야 한다.
 *
 * 반환값은 항상 소문자 canonical v4 형식이며 서버의 UUID 정규식을 통과한다.
 */
export function randomUUIDSafe(): string {
  const c: Crypto | undefined = globalThis.crypto;

  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    // 마지막 수단. 암호학적 강도는 없지만 멱등 키로서의 충돌 회피에는 충분하다.
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));

  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
