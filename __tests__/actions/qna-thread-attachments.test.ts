import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * createQnaThreadAction 첨부도 /api/qna/messages 와 같은 정책을 따른다:
 * 파일 5개·개별 10MiB·합계 25MiB, magic byte 로 판정한 허용 타입만, 저장 확장자·MIME 은 magic 에서 유도.
 * 검증 실패 시 스레드를 만들지 않는다.
 */
const mocks = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  uploads: [] as Array<{ path: string; contentType?: string }>,
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

vi.mock('@/lib/supabase/server', () => ({
  isWithdrawnUser: vi.fn(async () => false),
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      let row: Record<string, unknown> = {};
      Object.assign(builder, {
        insert: (value: Record<string, unknown>) => {
          row = value;
          mocks.inserts.push({ table, row: value });
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        delete: () => builder,
        match: async () => ({ error: null }),
        single: async () => ({ data: { id: table === 'qna_threads' ? 11 : 22, ...row }, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
      });
      return builder;
    },
    storage: {
      from: () => ({
        upload: async (path: string, _file: File, options?: { contentType?: string }) => {
          mocks.uploads.push({ path, contentType: options?.contentType });
          return { error: null };
        },
      }),
    },
    functions: { invoke: async () => ({}) },
  }),
}));

import { createQnaThreadAction } from '@/app/actions/qna';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes], name, { type });

function form(files: File[]) {
  const fd = new FormData();
  fd.set('title', '문의');
  fd.set('content', '내용');
  fd.set('lang', 'ko');
  files.forEach((f) => fd.append('attachments', f));
  return fd;
}

const threadInserts = () => mocks.inserts.filter((i) => i.table === 'qna_threads');

describe('createQnaThreadAction — 첨부 정책', () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.uploads.length = 0;
    mocks.redirect.mockClear();
  });

  it('파일이 5개를 넘으면 스레드를 만들지 않고 오류를 반환한다', async () => {
    const files = Array.from({ length: 6 }, (_, i) => file(PNG, `a${i}.png`, 'image/png'));
    const result = await createQnaThreadAction({ error: null }, form(files));

    expect(result?.error).toMatch(/Too many attachments/);
    expect(threadInserts()).toHaveLength(0);
    expect(mocks.uploads).toHaveLength(0);
  });

  it('PNG 로 위장한 HTML 은 거부하고 스레드를 만들지 않는다', async () => {
    const result = await createQnaThreadAction({ error: null }, form([file(HTML, 'x.png', 'image/png')]));

    expect(result?.error).toMatch(/not an allowed file type/);
    expect(threadInserts()).toHaveLength(0);
  });

  it('허용되지 않은 선언 MIME 은 거부한다', async () => {
    const result = await createQnaThreadAction({ error: null }, form([file(PNG, 'x.svg', 'image/svg+xml')]));

    expect(result?.error).toMatch(/Unsupported attachment type/);
    expect(threadInserts()).toHaveLength(0);
  });

  it('10MiB 초과 파일은 거부한다', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG);
    const result = await createQnaThreadAction({ error: null }, form([file(big, 'big.png', 'image/png')]));

    expect(result?.error).toMatch(/too large/);
    expect(threadInserts()).toHaveLength(0);
  });

  it('정상 파일은 원본 확장자가 아니라 magic 에서 유도한 확장자·MIME 으로 저장한다', async () => {
    await expect(
      createQnaThreadAction({ error: null }, form([file(PNG, 'evil.exe', 'image/png')])),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.uploads).toHaveLength(1);
    expect(mocks.uploads[0].path).toMatch(/^user-1\/11\/[^/]+\.png$/);
    expect(mocks.uploads[0].contentType).toBe('image/png');
    const meta = mocks.inserts.find((i) => i.table === 'qna_attachments')?.row;
    expect(meta?.file_type).toBe('image/png');
  });
});
