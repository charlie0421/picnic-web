import { File as NodeFile } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  isWithdrawnUser: vi.fn(),
  getUser: vi.fn(),
  messageInsert: vi.fn(),
  messageInsertSingle: vi.fn(),
  fullMessageSingle: vi.fn(),
  attachmentInsert: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  isWithdrawnUser: mocks.isWithdrawnUser,
}));

import { POST } from '@/app/api/qna/messages/route';

const USER = { id: 'user-1' };
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const AVIF_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x6d, 0x69, 0x66, 0x31,
  0x00, 0x00, 0x00, 0x00,
  0x61, 0x76, 0x69, 0x66,
  0x6d, 0x69, 0x66, 0x31,
]);
const MP4_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x00, 0x00,
  0x6d, 0x70, 0x34, 0x32,
  0x69, 0x73, 0x6f, 0x32,
]);
const QUICKTIME_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x10,
  0x66, 0x74, 0x79, 0x70,
  0x71, 0x74, 0x20, 0x20,
  0x00, 0x00, 0x00, 0x00,
]);
const HEIC_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x1c,
  0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63,
  0x00, 0x00, 0x00, 0x00,
  0x6d, 0x69, 0x66, 0x31,
  0x68, 0x65, 0x69, 0x78,
  0x69, 0x73, 0x6f, 0x6d,
]);
const UNKNOWN_FTYP_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x10,
  0x66, 0x74, 0x79, 0x70,
  0x7a, 0x7a, 0x7a, 0x7a,
  0x00, 0x00, 0x00, 0x00,
]);
const FREE_BOX_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x08,
  0x66, 0x72, 0x65, 0x65,
  0x3c, 0x68, 0x74, 0x6d,
]);
const AVIF_OUTSIDE_DECLARED_FTYP_BOX = new Uint8Array([
  0x00, 0x00, 0x00, 0x0c,
  0x66, 0x74, 0x79, 0x70,
  0x6d, 0x69, 0x66, 0x31,
  0x00, 0x00, 0x00, 0x00,
  0x61, 0x76, 0x69, 0x66,
  0x6d, 0x69, 0x66, 0x31,
]);
let threadRecord: { id: number; user_id: string } | null;

type FileWithSize = File & { size: number };

function makeFile(
  name: string,
  type: string,
  bytes: Uint8Array = PNG_BYTES,
  reportedSize?: number,
): FileWithSize {
  const file = new NodeFile([bytes], name, { type }) as unknown as FileWithSize;
  if (reportedSize !== undefined) {
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: reportedSize,
    });
  }
  return file;
}

function makeFormData({
  threadId = '1',
  content = 'hello',
  files = [],
}: {
  threadId?: FormDataEntryValue;
  content?: FormDataEntryValue;
  files?: File[];
} = {}): FormData {
  const values = new Map<string, FormDataEntryValue>([
    ['thread_id', threadId],
    ['content', content],
  ]);
  return {
    get: (key: string) => values.get(key) ?? null,
    getAll: (key: string) => (key === 'attachments' ? files : []),
  } as unknown as FormData;
}

function makeRequest(
  formData: FormData,
  contentLength?: number,
): { request: Request; formDataMock: ReturnType<typeof vi.fn> } {
  const formDataMock = vi.fn().mockResolvedValue(formData);
  const headers = new Headers();
  if (contentLength !== undefined) {
    headers.set('content-length', String(contentLength));
  }
  return {
    request: { headers, formData: formDataMock } as unknown as Request,
    formDataMock,
  };
}

function createSupabaseMock() {
  const threadFilters = new Map<string, unknown>();
  const threadChain: Record<string, unknown> = {};
  threadChain.eq = vi.fn((column: string, value: unknown) => {
    threadFilters.set(column, value);
    return threadChain;
  });
  threadChain.maybeSingle = vi.fn(async () => {
    const record = threadRecord as Record<string, unknown> | null;
    const matches =
      record !== null &&
      Array.from(threadFilters).every(
        ([column, value]) => record[column] === value,
      );
    return {
      data: matches ? { id: threadRecord!.id } : null,
      error: null,
    };
  });

  const qnaMessages = {
    insert: mocks.messageInsert.mockImplementation(() => ({
      select: () => ({ single: mocks.messageInsertSingle }),
    })),
    select: vi.fn(() => ({
      eq: () => ({ single: mocks.fullMessageSingle }),
    })),
  };
  const qnaThreads = {
    select: vi.fn(() => threadChain),
  };
  const qnaAttachments = {
    insert: mocks.attachmentInsert,
  };

  mocks.from.mockImplementation((table: string) => {
    if (table === 'qna_messages') return qnaMessages;
    if (table === 'qna_threads') return qnaThreads;
    if (table === 'qna_attachments') return qnaAttachments;
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload,
    getPublicUrl: mocks.getPublicUrl,
  });

  return {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  };
}

describe('POST /api/qna/messages — request boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const supabase = createSupabaseMock();
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);
    mocks.getUser.mockResolvedValue({ data: { user: USER } });
    mocks.isWithdrawnUser.mockResolvedValue(false);
    threadRecord = { id: 1, user_id: USER.id };
    mocks.messageInsertSingle.mockResolvedValue({
      data: { id: 10, thread_id: 1, user_id: USER.id, content: 'hello' },
      error: null,
    });
    mocks.fullMessageSingle.mockResolvedValue({
      data: {
        id: 10,
        thread_id: 1,
        user_id: USER.id,
        content: 'hello',
        qna_attachments: [],
        user_profiles: null,
      },
      error: null,
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.attachmentInsert.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://picnic-project.supabase.co/storage/file' },
    });
  });

  it('authenticates before parsing a large multipart body', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const { request, formDataMock } = makeRequest(
      makeFormData(),
      100 * 1024 * 1024,
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(formDataMock).not.toHaveBeenCalled();
  });

  it('rejects a withdrawn session before parsing the body', async () => {
    mocks.isWithdrawnUser.mockResolvedValue(true);
    const { request, formDataMock } = makeRequest(makeFormData());

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(formDataMock).not.toHaveBeenCalled();
  });

  it('rejects Content-Length over the 25 MiB request limit before parsing', async () => {
    const { request, formDataMock } = makeRequest(
      makeFormData(),
      25 * 1024 * 1024 + 1,
    );

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(formDataMock).not.toHaveBeenCalled();
  });

  it('rejects more than five attachments before any insert or upload', async () => {
    const files = Array.from({ length: 6 }, (_, index) =>
      makeFile(`${index}.png`, 'image/png'),
    );
    const { request } = makeRequest(makeFormData({ files }));

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects an attachment over 10 MiB', async () => {
    const file = makeFile(
      'large.png',
      'image/png',
      PNG_BYTES,
      10 * 1024 * 1024 + 1,
    );
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
  });

  it('rejects attachments whose combined size is over 25 MiB', async () => {
    const files = [1, 2, 3].map((index) =>
      makeFile(
        `${index}.png`,
        'image/png',
        PNG_BYTES,
        9 * 1024 * 1024,
      ),
    );
    const { request } = makeRequest(makeFormData({ files }));

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
  });

  it('rejects an unsupported attachment MIME type', async () => {
    const file = makeFile(
      'payload.html',
      'text/html',
      new TextEncoder().encode('<script>alert(1)</script>'),
    );
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
  });

  it('rejects spoofed image MIME when magic bytes are HTML', async () => {
    const file = makeFile(
      'payload.png',
      'image/png',
      new TextEncoder().encode('<html>not png</html>'),
    );
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Attachment content is not an allowed file type.',
    });
    expect(mocks.messageInsert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects prototype property names as unsupported MIME types', async () => {
    const file = makeFile('payload.png', 'constructor', PNG_BYTES);
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Unsupported attachment type.',
    });
    expect(mocks.messageInsert).not.toHaveBeenCalled();
  });

  it('requires thread_id to be a complete positive integer string', async () => {
    const { request } = makeRequest(makeFormData({ threadId: '1abc' }));

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalledWith('qna_threads');
    expect(mocks.messageInsert).not.toHaveBeenCalled();
  });

  it('rejects a thread not owned by the authenticated user', async () => {
    threadRecord = { id: 1, user_id: 'other-user' };
    const { request } = makeRequest(makeFormData());

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('accepts a valid attachment and derives its stored extension from magic', async () => {
    const file = makeFile('misleading.html', 'image/png');
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [filePath] = mocks.upload.mock.calls[0];
    expect(filePath).toMatch(/^user-1\/1\/.+\.png$/);
    expect(filePath).not.toContain('.html');
  });

  it('uses PNG magic for extension and content type when JPEG is declared', async () => {
    const file = makeFile('avatar.jpg', 'image/jpeg', PNG_BYTES);
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [filePath, , uploadOptions] = mocks.upload.mock.calls[0];
    expect(filePath).toMatch(/^user-1\/1\/.+\.png$/);
    expect(uploadOptions).toMatchObject({ contentType: 'image/png' });
    expect(mocks.attachmentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        file_path: filePath,
        file_type: 'image/png',
      }),
    );
  });

  it('normalizes image/jpg and stores JPEG from its magic', async () => {
    const file = makeFile('avatar.jpg', 'image/jpg', JPEG_BYTES);
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(200);
    const [filePath, , uploadOptions] = mocks.upload.mock.calls[0];
    expect(filePath).toMatch(/^user-1\/1\/.+\.jpg$/);
    expect(uploadOptions).toMatchObject({ contentType: 'image/jpeg' });
  });

  it('accepts AVIF with a mif1 major brand and derives .avif', async () => {
    const file = makeFile('avatar.avif', 'image/avif', AVIF_BYTES);
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(200);
    const [filePath, , uploadOptions] = mocks.upload.mock.calls[0];
    expect(filePath).toMatch(/^user-1\/1\/.+\.avif$/);
    expect(uploadOptions).toMatchObject({ contentType: 'image/avif' });
  });

  it.each([
    ['MP4', 'clip.mp4', 'video/mp4', MP4_BYTES, '.mp4'],
    ['QuickTime', 'clip.mov', 'video/quicktime', QUICKTIME_BYTES, '.mov'],
  ])(
    'accepts an allowlisted %s ftyp brand',
    async (_label, fileName, declaredType, bytes, extension) => {
      const file = makeFile(fileName, declaredType, bytes);
      const { request } = makeRequest(makeFormData({ files: [file] }));

      const response = await POST(request);

      expect(response.status).toBe(200);
      const [filePath, , uploadOptions] = mocks.upload.mock.calls[0];
      expect(filePath).toMatch(new RegExp(`\\${extension}$`));
      expect(uploadOptions).toMatchObject({ contentType: declaredType });
    },
  );

  it.each([
    ['HEIC image brands', HEIC_BYTES],
    ['an unknown ftyp brand', UNKNOWN_FTYP_BYTES],
    ['a standalone free box', FREE_BOX_BYTES],
  ])('does not classify %s as video', async (_label, bytes) => {
    const file = makeFile('spoofed.mp4', 'video/mp4', bytes);
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('does not scan AVIF brands beyond the declared ftyp box size', async () => {
    const file = makeFile(
      'spoofed.avif',
      'image/avif',
      AVIF_OUTSIDE_DECLARED_FTYP_BOX,
    );
    const { request } = makeRequest(makeFormData({ files: [file] }));

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(mocks.messageInsert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
