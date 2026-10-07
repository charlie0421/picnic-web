import type { Envelope, EnvelopeItem } from '@sentry/core';
import { redactTokenShapes, scrubEvent, stripUrlQueries, TRIPWIRE_KEY } from './scrub';

// Bound both compressed input and expanded output, not just the transport body.
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_WORK_MS = 2000;
const URL_KEYS = new Set(['url', 'urls', 'href', 'src', 'action', 'poster', 'xlink:href', 'from', 'to', 'filename', 'formaction', 'cite', 'background', 'longdesc', 'manifest', 'usemap', 'data', 'transaction', 'url.full', 'http.url', 'http.target', 'request_path']);
const QUERY_KEYS = new Set(['url.query', 'http.query', 'url.fragment', 'http.fragment']);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const cutUrl = (value: string) => value.split(/[?#]/, 1)[0];
type Walk = { count: number; tripwire: boolean; deadline: number };

/** Preserve escaped selectors; consume URL/string tokens without regex backtracking. */
function scrubCss(value: string, opaque = false): string {
  const output: string[] = [], remainder: string[] = [];
  const nameChar = (char: string) => !!char && (/[a-zA-Z0-9_-]/.test(char) || char.charCodeAt(0) >= 128);
  const tokenEnd = (start: number, endChar: string) => {
    let end = start, escaped = false;
    for (; end < value.length; end++) {
      if (value[end] === '\\') { escaped = true; end++; }
      else if (value[end] === endChar) break;
    }
    return { end, escaped };
  };
  for (let cursor = 0; cursor < value.length;) {
    if (value.startsWith('/*', cursor)) {
      const end = value.indexOf('*/', cursor + 2);
      if (end === -1) return '';
      cursor = end + 2;
    } else if (nameChar(value[cursor]) || value[cursor] === '\\') {
      const start = cursor;
      let name = '', escaped = false;
      while (cursor < value.length) {
        if (value[cursor] === '\\') {
          escaped = true; cursor++;
          const hexStart = cursor;
          while (cursor < value.length && cursor - hexStart < 6 && /[a-fA-F0-9]/.test(value[cursor])) cursor++;
          if (cursor > hexStart) {
            const point = parseInt(value.slice(hexStart, cursor), 16);
            name += String.fromCodePoint(point > 0 && point <= 0x10ffff ? point : 0xfffd);
            if (/\s/.test(value[cursor] ?? '')) cursor++;
          } else {
            if (cursor >= value.length || /[\r\n\f]/.test(value[cursor])) return '';
            name += value[cursor++];
          }
        } else if (nameChar(value[cursor])) name += value[cursor++];
        else break;
      }
      if (name.toLowerCase() !== 'url' || value[cursor] !== '(') {
        const raw = value.slice(start, cursor);
        output.push(raw);
        remainder.push(escaped ? (opaque && /[?#]/.test(name) ? name : 'identifier') : raw);
        continue;
      }
      cursor++;
      while (/\s/.test(value[cursor] ?? '') && cursor < value.length) cursor++;
      const quote = value[cursor] === '"' || value[cursor] === "'" ? value[cursor++] : '';
      const contentStart = cursor;
      const token = tokenEnd(cursor, quote || ')');
      if (token.end >= value.length) return '';
      cursor = token.end + (quote ? 1 : 0);
      while (/\s/.test(value[cursor] ?? '') && cursor < value.length) cursor++;
      if (value[cursor] !== ')') return '';
      const url = value.slice(contentStart, token.end).trim();
      const unsafe = token.escaped || (!quote && /[('"\s]/.test(url));
      output.push(`url(${JSON.stringify(unsafe ? '' : cutUrl(url))})`); remainder.push('url()');
      cursor++;
    } else if (value[cursor] === '"' || value[cursor] === "'") {
      const quote = value[cursor++], start = cursor;
      const token = tokenEnd(cursor, quote);
      if (token.end >= value.length) return '';
      output.push(quote + (token.escaped ? '' : cutUrl(value.slice(start, token.end))) + quote);
      remainder.push(quote + quote); cursor = token.end + 1;
    } else {
      output.push(value[cursor]); remainder.push(value[cursor]); cursor++;
    }
  }
  const rest = remainder.join('');
  if (stripUrlQueries(rest) !== rest || rest.includes('?')) return '';
  return output.join('');
}

function scrubNode(value: unknown, state: Walk, key = '', css = false, depth = 0): unknown {
  if (++state.count > 200000 || depth > 80 || Date.now() > state.deadline) throw new Error('replay limits');
  if (typeof value === 'string') {
    let clean: string;
    if (key === 'srcdoc' || ((key === 'srcset' || key === 'imagesrcset') && /[?#]/.test(value))) clean = '';
    else if (css || ['style', '_cssText', 'rule', 'replace', 'replaceSync'].includes(key)) clean = scrubCss(value);
    else if (URL_KEYS.has(key)) clean = cutUrl(value);
    else if (/url\(|@import|\\/i.test(value)) clean = scrubCss(value, true);
    else clean = stripUrlQueries(value);
    const redacted = redactTokenShapes(clean);
    if (redacted !== clean) state.tripwire = true;
    return redacted;
  }
  if (Array.isArray(value)) return value.map((child) => scrubNode(child, state, key, css, depth + 1));
  if (value && typeof value === 'object') {
    const bag = value as Record<string, unknown>;
    const out: Record<string, unknown> = Object.create(null);
    const style = css || bag.tagName === 'style' || bag.isStyle === true || key === 'style' || (typeof bag.property === 'string' && 'value' in bag);
    for (const name of Object.keys(bag)) {
      if (!QUERY_KEYS.has(name)) out[name] = scrubNode(bag[name], state, name, style, depth + 1);
    }
    return out;
  }
  return value;
}

async function transform(bytes: Uint8Array<ArrayBuffer>, compress: boolean, deadline: number): Promise<Uint8Array<ArrayBuffer>> {
  const stream = compress ? new CompressionStream('deflate') : new DecompressionStream('deflate');
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('replay deadline');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('replay deadline')), remaining); }),
      ]).finally(() => clearTimeout(timer));
      if (result.done) break;
      length += result.value.length;
      if (length > MAX_BYTES) throw new Error('replay size');
      chunks.push(result.value);
    }
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    return joined;
  } finally {
    // Cancellation must not itself keep the privacy deadline open.
    void reader.cancel().catch(() => undefined);
  }
}

async function scrubRecording(payload: unknown, state: Walk): Promise<string | Uint8Array> {
  if (typeof payload !== 'string' && !(payload instanceof Uint8Array)) throw new Error('replay payload');
  if (payload.length > MAX_BYTES) throw new Error('replay size');
  const bytes = typeof payload === 'string' ? encoder.encode(payload) : new Uint8Array(payload);
  if (bytes.length > MAX_BYTES) throw new Error('replay size');
  const split = bytes.indexOf(10);
  if (split < 1 || split > 1024) throw new Error('replay segment');
  const header = JSON.parse(decoder.decode(bytes.subarray(0, split)));
  if (!header || !Number.isSafeInteger(header.segment_id) || header.segment_id < 0) throw new Error('replay segment');
  const compressed = typeof payload !== 'string';
  const body = bytes.slice(split + 1);
  const raw = compressed ? await transform(body, false, state.deadline) : body;
  const records: unknown = JSON.parse(decoder.decode(raw));
  if (!Array.isArray(records) || !records.length || records.some((record) =>
    !record || !Number.isInteger(record.type) || record.type < 0 || record.type > 6 || !Number.isFinite(record.timestamp))) {
    throw new Error('replay records');
  }
  const cleaned = encoder.encode(JSON.stringify(scrubNode(records, state)));
  if (cleaned.length > MAX_BYTES) throw new Error('replay size');
  // The SDK's segment header is uncompressed. Only the JSON event array is deflated.
  const prefix = encoder.encode(`${JSON.stringify({ segment_id: header.segment_id })}\n`);
  if (!compressed) return decoder.decode(prefix) + decoder.decode(cleaned);
  const zipped = await transform(cleaned, true, state.deadline);
  const output = new Uint8Array(prefix.length + zipped.length);
  output.set(prefix); output.set(zipped, prefix.length);
  return output;
}

/** Replay bypasses beforeSend and beforeEnvelope in SDK 9.47.1. Never return its raw payload on failure. */
export async function scrubReplayEnvelope(envelope: Envelope): Promise<Envelope | null> {
  try {
    const state: Walk = { count: 0, tripwire: false, deadline: Date.now() + MAX_WORK_MS };
    const header = scrubNode(JSON.parse(JSON.stringify(envelope[0])), state);
    const items: EnvelopeItem[] = [];
    for (const [itemHeader, payload] of envelope[1]) {
      if (itemHeader.type === 'replay_recording') {
        const clean = await scrubRecording(payload, state);
        items.push([{ ...itemHeader, length: typeof clean === 'string' ? encoder.encode(clean).length : clean.length }, clean] as Envelope[1][number]);
      } else if (itemHeader.type === 'replay_event') {
        const clean = scrubEvent(scrubNode(JSON.parse(JSON.stringify(payload)), state) as object);
        if (!clean) return null;
        items.push([{ ...itemHeader }, clean] as Envelope[1][number]);
      } else {
        // Mixed/unknown Replay envelope formats require a new verified contract.
        return null;
      }
    }
    if (state.tripwire) {
      for (const [itemHeader, payload] of items) {
        if (itemHeader.type === 'replay_event') {
          const event = payload as { tags?: Record<string, string> };
          event.tags = { ...event.tags, [TRIPWIRE_KEY]: '1' };
        }
      }
    }
    return [header, items] as Envelope;
  } catch {
    return null;
  }
}
