/**
 * QNA 첨부 정책 — /api/qna/messages 와 createQnaThreadAction 이 같은 규칙을 쓴다.
 * 파일 5개·개별 10MiB·합계 25MiB, magic byte 로 판정한 허용 타입만 받고
 * 저장 확장자·MIME 은 선언값이 아니라 magic 에서 유도한다.
 */
export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

export const ATTACHMENT_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
} as const;

export type AllowedAttachmentType = keyof typeof ATTACHMENT_TYPES;

const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIF_IMAGE_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
]);
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'M4VH',
  'M4VP',
]);
const QUICKTIME_BRANDS = new Set(['qt  ']);

export function isFileEntry(value: FormDataEntryValue): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as File).size === 'number' &&
    typeof (value as File).slice === 'function'
  );
}

function startsWithBytes(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0,
): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = offset; index < offset + length; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}

function ftypBrands(bytes: Uint8Array): string[] {
  if (asciiAt(bytes, 4, 4) !== 'ftyp') return [];

  const declaredBoxSize =
    ((bytes[0] ?? 0) * 0x1000000 +
      (bytes[1] ?? 0) * 0x10000 +
      (bytes[2] ?? 0) * 0x100 +
      (bytes[3] ?? 0)) >>>
    0;
  if (declaredBoxSize < 16) return [];

  const boxEnd = Math.min(bytes.length, declaredBoxSize, 64);
  const brands = [asciiAt(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    brands.push(asciiAt(bytes, offset, 4));
  }
  return brands;
}

export function detectAttachmentType(bytes: Uint8Array): AllowedAttachmentType | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    startsWithBytes(bytes, [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  ) {
    return 'image/png';
  }
  if (
    asciiAt(bytes, 0, 6) === 'GIF87a' ||
    asciiAt(bytes, 0, 6) === 'GIF89a'
  ) {
    return 'image/gif';
  }
  if (
    asciiAt(bytes, 0, 4) === 'RIFF' &&
    asciiAt(bytes, 8, 4) === 'WEBP'
  ) {
    return 'image/webp';
  }

  const brands = ftypBrands(bytes);
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) {
    return 'image/avif';
  }
  if (brands.some((brand) => HEIF_IMAGE_BRANDS.has(brand))) {
    return null;
  }
  if (brands.some((brand) => QUICKTIME_BRANDS.has(brand))) {
    return 'video/quicktime';
  }
  if (brands.some((brand) => MP4_BRANDS.has(brand))) {
    return 'video/mp4';
  }
  return null;
}

export async function detectFileType(
  file: File,
): Promise<AllowedAttachmentType | null> {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return detectAttachmentType(bytes);
}

export function normalizeDeclaredAttachmentType(contentType: string): string {
  return contentType === 'image/jpg' ? 'image/jpeg' : contentType;
}

export function isAllowedAttachmentType(
  contentType: string,
): contentType is AllowedAttachmentType {
  return Object.hasOwn(ATTACHMENT_TYPES, contentType);
}

export type AttachmentValidation =
  | {
      ok: true;
      files: Array<{ file: File; contentType: AllowedAttachmentType; ext: string }>;
    }
  | { ok: false; error: string; status: 400 | 413 | 415 };

/** 개수 → 개별 크기 → 합계 크기 → 선언 MIME → magic 순서로 검사한다. */
export async function validateAttachments(files: File[]): Promise<AttachmentValidation> {
  if (files.length > MAX_ATTACHMENT_COUNT) {
    return { ok: false, error: 'Too many attachments.', status: 400 };
  }
  if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
    return { ok: false, error: 'An attachment is too large.', status: 413 };
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return { ok: false, error: 'Attachments are too large.', status: 413 };
  }

  const verified: Array<{ file: File; contentType: AllowedAttachmentType; ext: string }> = [];
  for (const file of files) {
    const declared = normalizeDeclaredAttachmentType(file.type.toLowerCase());
    if (!isAllowedAttachmentType(declared)) {
      return { ok: false, error: 'Unsupported attachment type.', status: 415 };
    }
    const detected = await detectFileType(file);
    if (!detected) {
      return { ok: false, error: 'Attachment content is not an allowed file type.', status: 415 };
    }
    verified.push({ file, contentType: detected, ext: ATTACHMENT_TYPES[detected] });
  }
  return { ok: true, files: verified };
}
