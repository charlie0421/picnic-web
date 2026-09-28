import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_REQUEST_BYTES, MAX_TOTAL_ATTACHMENT_BYTES } from '@/lib/qna/attachment-policy';

/**
 * 첨부 합계 25MiB 를 정확히 채운 요청도 multipart 오버헤드(경계·헤더·텍스트 필드) 때문에 본문이 조금 더 크다.
 * 본문 제한(서버 액션·/api/qna/messages)은 첨부 합계보다 여유가 있어야 허용 범위의 파일이 413 으로 막히지 않는다.
 */
describe('QNA 요청 본문 제한', () => {
  it('API 본문 제한은 첨부 합계 + 512KiB 이상이다', () => {
    expect(MAX_REQUEST_BYTES).toBeGreaterThanOrEqual(MAX_TOTAL_ATTACHMENT_BYTES + 512 * 1024);
  });

  it('서버 액션 bodySizeLimit 도 같은 여유를 둔다', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.js'), 'utf8');
    const match = config.match(/bodySizeLimit:\s*'(\d+)mb'/);
    expect(match).not.toBeNull();
    expect(Number(match![1]) * 1024 * 1024).toBeGreaterThanOrEqual(MAX_REQUEST_BYTES);
  });
});
