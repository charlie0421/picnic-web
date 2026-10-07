// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import type { Envelope, Transport } from '@sentry/core';
import { scrubReplayEnvelope } from '@/lib/sentry/replay-scrub';
import { withReplayScrubbing } from '@/lib/sentry/browser-transport';

const records = () => [
  { type: 4, timestamp: 1, data: { href: 'https://picnic.test/callback?code=secret-meta#secret-fragment', width: 1280, height: 720 } },
  { type: 2, timestamp: 2, data: { node: { id: 1, type: 2, tagName: 'a', attributes: {
    href: 'callback?code=secret-dom', style: 'background: url("/asset?token=secret-css"); color: #fff;',
    srcset: '/a?token=secret-srcset 1x, /b?token=secret-srcset2 2x',
  }, childNodes: [{ id: 2, type: 3, textContent: '한국어 ***' }] } } },
  { type: 3, timestamp: 3, data: { source: 0, attributes: [{ id: 1, attributes: { href: '?token=secret-mutation' } }], adds: [], removes: [], texts: [] } },
];

function envelope(compressed = false, value = records()): Envelope {
  const json = JSON.stringify(value);
  const prefix = Buffer.from('{"segment_id":0}\n');
  const payload = compressed ? new Uint8Array(Buffer.concat([prefix, deflateSync(json)])) : prefix.toString() + json;
  return [{ trace: { transaction: '/callback?code=secret-header' } }, [
    [{ type: 'replay_event' }, { type: 'replay_event', urls: ['https://picnic.test/?code=secret-event'], replay_id: 'safe-id', segment_id: 0 }],
    [{ type: 'replay_recording', length: typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length }, payload],
  ]] as Envelope;
}
function decoded(value: Envelope) {
  const item = value[1].find(([header]) => header.type === 'replay_recording')!;
  const bytes = Buffer.from(item[1] as Uint8Array);
  expect(item[0].length).toBe(bytes.length);
  const split = bytes.indexOf(10);
  expect(JSON.parse(bytes.subarray(0, split).toString())).toEqual({ segment_id: 0 });
  const body = bytes.subarray(split + 1);
  return JSON.parse((body[0] === 91 ? body : inflateSync(body)).toString());
}
afterEach(() => vi.unstubAllGlobals());

describe('Replay privacy transport', () => {
  it.each([
    [String.raw`/callback\?code=secret-opaque`, ''],
    [String.raw`/callback\#secret-opaque`, ''],
    [String.raw`/callback\3f code=secret-opaque`, ''],
    [String.raw`/callback\23 secret-opaque`, ''],
    [String.raw`/a?x=1 /callback\3f code=secret-opaque`, ''],
    [String.raw`/callback\?state=x\26 code=secret-opaque`, ''],
  ])('redacts escaped URL delimiters in an opaque recording string: %s', async (value, expected) => {
    for (const compressed of [false, true]) {
      const input = [{ type: 5, timestamp: 1, data: { tag: 'note', payload: { message: value } } }];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(output).not.toBeNull();
      expect(decoded(output!)[0].data.payload.message).toBe(expected);
    }
  });
  it('preserves CSS text mutation syntax while removing a root-relative URL query', async () => {
    const input = [{ type: 3, timestamp: 1, data: { source: 0, texts: [{ id: 10, value: '.w-1\\/2{background:url(/img?code=secret-css);color:#fff}' }] } }];
    const output = await scrubReplayEnvelope(envelope(false, input as never));
    expect(decoded(output!)[0].data.texts[0].value).toBe('.w-1\\/2{background:url("/img");color:#fff}');
  });
  it('preserves escaped CSS text selectors and hex colors without a URL token', async () => {
    const value = '.w-1\\/2{width:50%;color:#fff}';
    for (const compressed of [false, true]) {
      const input = [{ type: 3, timestamp: 1, data: { source: 0, texts: [{ id: 10, value }] } }];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(decoded(output!)[0].data.texts[0].value).toBe(value);
    }
  });
  it.each([false, true])('redacts recording and metadata, preserves DOM/CSS/UTF-8, compressed=%s', async (compressed) => {
    const input = envelope(compressed);
    const before = structuredClone(input);
    const output = await scrubReplayEnvelope(input);
    expect(output).not.toBeNull();
    expect(input).toEqual(before);
    const clean = decoded(output!);
    expect(JSON.stringify([output![0], output![1][0], clean])).not.toContain('secret-');
    expect(clean[0].data).toEqual({ href: 'https://picnic.test/callback', width: 1280, height: 720 });
    expect(clean[1].data.node.id).toBe(1);
    expect(clean[1].data.node.childNodes).toEqual([{ id: 2, type: 3, textContent: '한국어 ***' }]);
    expect(clean[1].data.node.attributes.style).toBe('background: url("/asset"); color: #fff;');
    expect(clean[2].data.attributes[0].attributes.href).toBe('');
    expect(output![1][1][1] instanceof Uint8Array).toBe(compressed);
  });

  it.each(['bad JSON', '{"segment_id":0}\n{}', '{"segment_id":-1}\n[]', '{"segment_id":0}\n[{"type":4}]'])('drops malformed recording: %s', async (payload) => {
    const input = envelope(); input[1][1][1] = payload;
    expect(await scrubReplayEnvelope(input)).toBeNull();
  });
  it('drops corrupt compressed data', async () => {
    const input = envelope(true); input[1][1][1] = new TextEncoder().encode('{"segment_id":0}\ncorrupt');
    expect(await scrubReplayEnvelope(input)).toBeNull();
  });
  it('redacts relative URLs in Replay metadata and trace headers', async () => {
    const input = envelope();
    input[0].trace = { transaction: 'callback#secret-header' };
    (input[1][0][1] as { urls: string[] }).urls = ['callback#secret-event'];
    const output = await scrubReplayEnvelope(input);
    expect(JSON.stringify(output)).not.toContain('secret-');
  });
  it('drops unsupported compression without sending raw bytes', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await scrubReplayEnvelope(envelope(true))).toBeNull();
  });
  it('bounds expanded compressed data', async () => {
    const input = envelope(true, [{ type: 4, timestamp: 1, data: { href: '/' + 'x'.repeat(9 * 1024 * 1024) } }] as never);
    expect(await scrubReplayEnvelope(input)).toBeNull();
  });
  it('bounds nesting instead of overflowing the stack', async () => {
    let node: unknown = { url: '/?secret=private' };
    for (let i = 0; i < 120; i++) node = { child: node };
    expect(await scrubReplayEnvelope(envelope(false, [{ type: 2, timestamp: 1, data: node }] as never))).toBeNull();
  });
  it('fails closed for escaped CSS URL and embedded HTML attributes', async () => {
    const input = records();
    Object.assign(input[1].data.node!.attributes, { style: 'background:url(/a\\3f token=secret-css)', srcdoc: '<a href="/?secret=private">' });
    const output = await scrubReplayEnvelope(envelope(false, input));
    const attrs = decoded(output!)[1].data.node.attributes;
    expect(attrs.style).toBe('background:url("")'); expect(attrs.srcdoc).toBe('');
  });
  it('preserves escaped Tailwind selectors and safe declarations while scrubbing CSS URLs', async () => {
    const input = records();
    Object.assign(input[1].data.node!.attributes, {
      _cssText: '.hover\\:bg-blue:hover{background:url("/a?token=secret-css");color:#fff}.w-1\\/2{width:50%}',
    });
    const output = await scrubReplayEnvelope(envelope(false, input));
    expect(decoded(output!)[1].data.node.attributes._cssText).toBe('.hover\\:bg-blue:hover{background:url("/a");color:#fff}.w-1\\/2{width:50%}');
  });
  it.each([
    { type: 3, timestamp: 1, data: { source: 0, adds: [{ node: { type: 3, id: 10, isStyle: true, textContent: '.x{background:url(img?secret-opaque)}' } }] } },
    { type: 3, timestamp: 1, data: { source: 0, texts: [{ id: 10, value: '.x{background:url(img?secret-opaque)}' }] } },
    { type: 3, timestamp: 1, data: { source: 8, adds: [{ rule: '.x{background:url(img?secret-opaque)}', index: 0 }] } },
    { type: 3, timestamp: 1, data: { source: 8, replace: '.x{background:url(img?secret-opaque)}' } },
    { type: 3, timestamp: 1, data: { source: 8, replaceSync: '.x{background:url(img?secret-opaque)}' } },
    { type: 3, timestamp: 1, data: { source: 13, set: { property: 'background', value: 'url(img?secret-opaque)', priority: '' } } },
    { type: 3, timestamp: 1, data: { source: 15, styles: [{ styleId: 1, rules: [{ rule: '.x{background:url(img?secret-opaque)}', index: 0 }] }] } },
  ])('scrubs dynamic CSS recording without cutting the rule: %j', async (record) => {
    const output = await scrubReplayEnvelope(envelope(false, [record] as never));
    expect(output).not.toBeNull();
    const text = JSON.stringify(decoded(output!));
    expect(text).not.toContain('secret-');
    expect(text).toContain('url(\\"img\\")');
    expect(decoded(output!)[0].type).toBe(3);
  });
  it('redacts opaque relative URLs in DOM URL attributes', async () => {
    const input = records();
    Object.assign(input[1].data.node!.attributes, { formaction: 'pay?secret-opaque', cite: '#secret-cite', background: 'bg?secret-bg', imagesrcset: 'img?secret-img 1x' });
    const output = await scrubReplayEnvelope(envelope(false, input));
    expect(JSON.stringify(decoded(output!))).not.toContain('secret-');
  });
  it('preserves URL detection after a Unicode CSS selector', async () => {
    const input = records();
    input[1].data.node!.attributes.style = '.İ{background:url(img?secret-css)}';
    const output = await scrubReplayEnvelope(envelope(false, input));
    expect(decoded(output!)[1].data.node.attributes.style).toBe('.İ{background:url("img")}');
  });
  it('recognizes an escaped url function without changing escaped numeric selectors', async () => {
    const input = records();
    input[1].data.node!.attributes.style = '.\\32 xl\\:bg{background:u\\72l(img#secret-css)}';
    const output = await scrubReplayEnvelope(envelope(false, input));
    expect(decoded(output!)[1].data.node.attributes.style).toBe('.\\32 xl\\:bg{background:url("img")}');
  });
  it('bounds malformed CSS URL scanning without quadratic backtracking', async () => {
    const input = records();
    input[1].data.node!.attributes.style = 'url('.repeat(20000);
    const started = performance.now();
    const output = await scrubReplayEnvelope(envelope(false, input));
    expect(performance.now() - started).toBeLessThan(1500);
    expect(output).not.toBeNull();
    expect(decoded(output!)[1].data.node.attributes.style).toBe('');
  });
  it('flush waits for sanitizing and sending; keeps rate-limit responses', async () => {
    const sent: Envelope[] = [];
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const response = { statusCode: 429, headers: { 'x-sentry-rate-limits': '60:replay', 'retry-after': '60' } };
    const transport: Transport = {
      send: async (value) => { sent.push(value); await gate; return response; },
      flush: async () => { expect(sent).toHaveLength(1); return true; },
    };
    const wrapped = withReplayScrubbing(transport, vi.fn());
    const sending = wrapped.send(envelope(true));
    const flushing = wrapped.flush(2000);
    let flushed = false; void Promise.resolve(flushing).then(() => { flushed = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flushed).toBe(false);
    finish();
    expect(await sending).toEqual(response); expect(await flushing).toBe(true);
    expect(JSON.stringify(decoded(sent[0]))).not.toContain('secret-');
  });
  it('flush timeout returns false while send remains pending', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const wrapped = withReplayScrubbing({ send: async () => { await gate; return {}; }, flush: async () => true }, vi.fn());
    const sending = wrapped.send(envelope(true));
    expect(await wrapped.flush(5)).toBe(false);
    finish(); await sending;
    expect(await wrapped.flush(1000)).toBe(true);
  });
  it('reports a privacy drop without forwarding malformed replay or logging its contents', async () => {
    const send = vi.fn(); const drop = vi.fn();
    const wrapped = withReplayScrubbing({ send, flush: async () => true }, drop);
    const input = envelope(); input[1][1][1] = 'private malformed';
    expect(await wrapped.send(input)).toEqual({});
    expect(send).not.toHaveBeenCalled(); expect(drop).toHaveBeenCalledWith('before_send', 'replay');
  });
  it('preserves ordinary envelopes and transport failures', async () => {
    const input = [{}, [[{ type: 'event' }, { message: 'already scrubbed' }]]] as Envelope;
    const failure = new Error('network unavailable');
    const wrapped = withReplayScrubbing({ send: (value) => { expect(value).toBe(input); return Promise.reject(failure); }, flush: async () => true }, vi.fn());
    await expect(wrapped.send(input)).rejects.toBe(failure);
    expect(await wrapped.flush()).toBe(true);
  });
});
