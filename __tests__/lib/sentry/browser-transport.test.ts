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
  describe.each([false, true])('opaque escaped slash boundaries, compressed=%s', (compressed) => {
    it.each([
      String.raw`example.com\/~john#secret-opaque`,
      String.raw`..\/a,b#secret-opaque`,
      String.raw`.\/list(1)#secret-opaque`,
      String.raw`example.com\/a+b#secret-opaque`,
      String.raw`example.com\/a>b#secret-opaque`,
      String.raw`example.com\/index.html\#secret-opaque`, // A
      String.raw`example.com\/~john\#secret-opaque`, // B
      String.raw`..\/a,b\#secret-opaque`, // C
      String.raw`.\/list(1)\23 secret-opaque`, // D
      String.raw`#route\/a.b\#secret-opaque`, // E
      String.raw`example.com\2f index.html\23 secret-opaque`, // K5
      String.raw`example.com\/index.html\000023secret-opaque`, // K6
      String.raw`example.com\/a'b'\#secret-opaque`, // K7
    ])('removes a fragment after URL-compatible punctuation: %s', async (value) => {
      const input = [{ type: 5, timestamp: 1, data: { tag: 'note', payload: { message: value } } }];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(output).not.toBeNull();
      const clean = decoded(output!);
      expect(JSON.stringify(clean)).not.toContain('secret-opaque');
      expect(clean[0].data.payload.message).toBe('');
    });
    // Hex terminator spaces belong to the escape, not the segment boundary.
    const openedPaths = ['example.com', '..', '.', '#route'].flatMap((prefix) =>
      [String.raw`\/`, String.raw`\2f `].flatMap((slash) =>
        ['.html', '~john', ',b', '(1)', "'b'", '+b'].flatMap((punctuation) =>
          ['#', String.raw`\#`, String.raw`\23 `, String.raw`\000023`,
            '?', String.raw`\?`, String.raw`\3f `, String.raw`\00003f`].map((delimiter) =>
            `${prefix}${slash}a${punctuation}${delimiter}secret-opaque`))));
    it.each(openedPaths)('removes literal or decoded delimiters in an opened opaque segment: %s', async (value) => {
      const input = [{ type: 5, timestamp: 1, data: { tag: 'note', payload: { message: value } } }];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(output).not.toBeNull();
      const clean = decoded(output!);
      expect(JSON.stringify(clean)).not.toContain('secret-opaque');
      expect(clean[0].data.payload.message).toBe('');
    });
    it.each([
      String.raw`.w-1\/2#main{color:#fff}`,
      String.raw`.w-1\/2:not(#x){color:#fff}`,
      String.raw`.w-1\/2,#main{color:#fff}`,
      String.raw`.w-1\/2>#main{color:#fff}`,
      String.raw`.w-1\/2+#main{color:#fff}`,
      String.raw`.w-1\/2~#main{color:#fff}`,
      String.raw`:not(.w-1\/2)#x{color:#fff}`,
      String.raw`.w-1\/2.bg-\[\#fff\]{color:#fff}`, // L1: fail-closed cost
      String.raw`.w-1\/2{width:50%;color:#fff}`,
      String.raw`.w-1\/2{width:50%}#main{color:#fff}`, // L4: brace no longer closes the segment
    ])('fails closed for a compound selector indistinguishable from an opaque path: %s', async (value) => {
      const input = [{ type: 3, timestamp: 1, data: { source: 0, texts: [{ id: 10, value }] } }];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(output).not.toBeNull();
      expect(decoded(output!)[0].data.texts[0].value).toBe('');
    });
    it.each([
      String.raw`.w-1\/2 #main{color:#fff}`,
      String.raw`.w-1\/2{width:50%}`, // No fragment or color
      String.raw`.w-1\/2 {width:50%;color:#fff}`, // Whitespace still closes the segment
      String.raw`.hover\:bg-blue:hover{color:#fff}`,
      String.raw`.w-1\/2 .bg-\[\#fff\]{color:#fff}`, // I: whitespace boundary
      String.raw`.bg-\[\#fff\]\/50{color:red}`, // J: color before opening slash
      String.raw`.bg-\[\#fff\]{color:#fff}`, // L3: no slash
    ])('preserves opaque CSS without a fragment in the opened segment: %s', async (value) => {
      const input = [{ type: 3, timestamp: 1, data: { source: 0, texts: [{ id: 10, value }] } }];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(output).not.toBeNull();
      expect(decoded(output!)[0].data.texts[0].value).toBe(value);
    });
    const bracePaths = [String.raw`example.com\/users\/{id}`, String.raw`.\/a{b}`].flatMap((path) =>
      ['#', String.raw`\#`, String.raw`\23 `, String.raw`\000023`].map((fragment) => `${path}${fragment}secret-opaque`));
    it.each([...bracePaths, String.raw`example.com\/{id}\/callback#secret-opaque`])('removes a fragment after raw braces in an opened opaque segment: %s', async (value) => {
      const input = [{ type: 5, timestamp: 1, data: { tag: 'note', payload: { message: value } } }];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(output).not.toBeNull();
      const clean = decoded(output!);
      expect(JSON.stringify(clean)).not.toContain('secret-opaque');
      expect(clean[0].data.payload.message).toBe('');
    });
    it('preserves compound selectors and hex colors in known CSS modes', async () => {
      const value = String.raw`.w-1\/2#main,.w-1\/2:not(#x),.w-1\/2>#main,.w-1\/2+#main,.w-1\/2~#main,:not(.w-1\/2)#x{color:#fff;background:#123abc}.w-1\/2.bg-\[\#fff\]{color:#fff}.bg-\[\#fff\]\/50{color:red}.w-1\/2{width:50%;color:#fff}.w-1\/2{width:50%}#main{color:#fff}`;
      const attributes = { style: value, _cssText: value };
      const input = [
        { type: 2, timestamp: 1, data: { node: { id: 1, type: 2, tagName: 'div', attributes } } },
        { type: 3, timestamp: 2, data: { source: 8, adds: [{ rule: value, index: 0 }], replace: value, replaceSync: value } },
        { type: 3, timestamp: 3, data: { source: 0, adds: [{ node: { id: 10, type: 3, isStyle: true, textContent: value } }] } },
      ];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(output).not.toBeNull();
      const clean = decoded(output!);
      expect(clean[0].data.node.attributes).toEqual(attributes);
      expect(clean[1].data).toEqual({ source: 8, adds: [{ rule: value, index: 0 }], replace: value, replaceSync: value });
      expect(clean[2].data.adds[0].node.textContent).toBe(value);
    });
  });
  it.each([
    [String.raw`example.com\/callback#secret-opaque`, ''],
    [String.raw`..\/callback#secret-opaque`, ''],
    [String.raw`.\/callback#secret-opaque`, ''],
    [String.raw`#route\/callback#secret-opaque`, ''],
    [String.raw`callback\/path#secret-opaque`, ''],
    [String.raw`\2f callback#secret-opaque`, ''],
    [String.raw`\/callback#secret-opaque`, ''],
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
  it.each([false, true])('keeps presentation names opaque outside SVG attributes, compressed=%s', async (compressed) => {
    const attrs = { fill: String.raw`/callback\?code=secret-opaque`, stroke: String.raw`/callback\?code=secret-opaque`,
      filter: String.raw`/callback\?code=secret-opaque`, 'clip-path': String.raw`/callback\?code=secret-opaque`, mask: String.raw`/callback\?code=secret-opaque` };
    const input = [
      { type: 5, timestamp: 1, data: { tag: 'breadcrumb', payload: { data: attrs } } },
      { type: 2, timestamp: 2, data: { node: { id: 30, type: 2, tagName: 'div', attributes: attrs } } },
      { type: 3, timestamp: 3, data: { source: 0, attributes: [{ id: 31, attributes: attrs }] } },
    ];
    const source = envelope(compressed, input as never);
    Object.assign(source[0], attrs);
    Object.assign(source[1][0][1] as object, attrs);
    const before = structuredClone(source);
    const output = await scrubReplayEnvelope(source);
    expect(output).not.toBeNull();
    const empty = { fill: '', stroke: '', filter: '', 'clip-path': '', mask: '' };
    const clean = decoded(output!);
    expect(clean[0].data.payload.data).toEqual(empty);
    expect(clean[1].data.node.attributes).toEqual(empty);
    expect(clean[2].data.attributes[0].attributes).toEqual(empty);
    expect(output![0]).toMatchObject(empty);
    expect(output![1][0][1]).toMatchObject(empty);
    expect(source).toEqual(before);
  });
  it.each([false, true])('preserves presentation references for same-recording SVG mutation targets, compressed=%s', async (compressed) => {
    const input = [
      { type: 2, timestamp: 1, data: { node: { id: 30, type: 2, tagName: 'rect', isSVG: true, attributes: { fill: 'url(#gradient)' } } } },
      { type: 3, timestamp: 2, data: { source: 0, attributes: [{ id: 30, attributes: { fill: 'url(#next)', stroke: 'url(#stroke)', filter: 'url(#shadow)', 'clip-path': 'url(#clip)', mask: 'url(#mask)' } }] } },
    ];
    const output = await scrubReplayEnvelope(envelope(compressed, input as never));
    expect(decoded(output!)[1].data.attributes[0].attributes).toEqual({ fill: 'url("#next")', stroke: 'url("#stroke")', filter: 'url("#shadow")', 'clip-path': 'url("#clip")', mask: 'url("#mask")' });
  });
  it('recognizes SVG child nodes and added nodes without authorizing custom data with their IDs', async () => {
    const input = [
      { type: 2, timestamp: 1, data: { node: { id: 1, type: 0, childNodes: [{ id: 20, type: 2, tagName: 'rect', isSVG: true, attributes: { fill: 'url(#gradient)' } }] } } },
      { type: 3, timestamp: 2, data: { source: 0, adds: [{ parentId: 1, nextId: null, node: { id: 21, type: 2, tagName: 'use', isSVG: true, attributes: { href: '#shape' } } }] } },
      { type: 5, timestamp: 3, data: { tag: 'note', payload: { id: 21, attributes: { href: '#private-href', fill: 'url(#private-fill)' } } } },
      { type: 3, timestamp: 4, data: { source: 0, attributes: [{ id: 20, attributes: { fill: 'url(#next)' } }, { id: 21, attributes: { href: '#next-shape' } }] } },
    ];
    const output = await scrubReplayEnvelope(envelope(false, input as never));
    const clean = decoded(output!);
    expect(clean[0].data.node.childNodes[0].attributes.fill).toBe('url("#gradient")');
    expect(clean[1].data.adds[0].node.attributes.href).toBe('#shape');
    expect(clean[2].data.payload.attributes).toEqual({ href: '', fill: 'url("")' });
    expect(clean[3].data.attributes[0].attributes.fill).toBe('url("#next")');
    expect(clean[3].data.attributes[1].attributes.href).toBe('#next-shape');
  });
  it('does not let custom payloads or metadata establish SVG node identities', async () => {
    const fake = { id: 20, type: 2, tagName: 'use', isSVG: true, attributes: { href: '#private-href', fill: 'url(#private-fill)' } };
    const input = [
      { type: 5, timestamp: 1, data: { tag: 'note', payload: { node: fake } } },
      { type: 3, timestamp: 2, data: { source: 0, attributes: [{ id: 20, attributes: { href: '#private-mutation', fill: 'url(#private-fill)' } }] } },
    ];
    const source = envelope(false, input as never);
    Object.assign(source[0], { node: fake });
    Object.assign(source[1][0][1] as object, { node: fake });
    const output = await scrubReplayEnvelope(source);
    const attrs = { href: '', fill: 'url("")' };
    expect(output![0]).toMatchObject({ node: { attributes: attrs } });
    expect(output![1][0][1]).toMatchObject({ node: { attributes: attrs } });
    expect(decoded(output!)[0].data.payload.node.attributes).toEqual(attrs);
    expect(decoded(output!)[1].data.attributes[0].attributes).toEqual(attrs);
  });
  it.each([{ tagName: 'a' }, { tagName: 'use', isSVG: false }, { tagName: 'rect', isSVG: true }])('revokes prior SVG use identity on an explicit replacement: %j', async (replacement) => {
    const input = [
      { type: 2, timestamp: 1, data: { node: { id: 20, type: 2, tagName: 'use', isSVG: true, attributes: { href: '#shape' } } } },
      { type: 2, timestamp: 2, data: { node: { id: 20, type: 2, ...replacement, attributes: { href: '#private-navigation' } } } },
      { type: 3, timestamp: 3, data: { source: 0, attributes: [{ id: 20, attributes: { href: '#private-mutation' } }] } },
      { type: 2, timestamp: 4, data: { node: { id: 20, type: 2, tagName: 'use', isSVG: true, attributes: { href: '#new-shape' } } } },
      { type: 3, timestamp: 5, data: { source: 0, attributes: [{ id: 20, attributes: { href: '#new-mutation' } }] } },
    ];
    const output = await scrubReplayEnvelope(envelope(false, input as never));
    const clean = decoded(output!);
    expect(clean[1].data.node.attributes.href).toBe('');
    expect(clean[2].data.attributes[0].attributes.href).toBe('');
    expect(clean[4].data.attributes[0].attributes.href).toBe('#new-mutation');
  });
  it.each([false, true])('isolates SVG identities from later replay events and recordings, compressed=%s', async (compressed) => {
    const source = envelope(compressed, [{ type: 2, timestamp: 1, data: { node: { id: 20, type: 2, tagName: 'use', isSVG: true, attributes: { href: '#shape', fill: 'url(#gradient)' } } } }] as never);
    source[1].push([{ type: 'replay_event' }, { type: 'replay_event', extra: { id: 20, attributes: { href: '#private-navigation', fill: 'url(#private-fill)' } } }] as Envelope[1][number]);
    source[1].push(envelope(compressed, [{ type: 3, timestamp: 2, data: { source: 0, attributes: [{ id: 20, attributes: { href: '#private-next-recording', fill: 'url(#private-next-fill)' } }] } }] as never)[1][1]);
    const output = await scrubReplayEnvelope(source);
    expect(decoded(output!)[0].data.node.attributes.href).toBe('#shape');
    expect(output![1][2][1]).toMatchObject({ extra: { attributes: { href: '', fill: 'url("")' } } });
    const next = decoded([output![0], [output![1][3]]] as Envelope);
    expect(next[0].data.attributes[0].attributes).toEqual({ href: '', fill: 'url("")' });
  });
  it.each([false, true])('preserves bounded same-document SVG references, compressed=%s', async (compressed) => {
    const input = [
      { type: 2, timestamp: 1, data: { node: { id: 20, type: 2, tagName: 'use', isSVG: true,
        attributes: { href: '#shape', 'xlink:href': '#shape', style: 'fill:url(#gradient);filter:url("#shadow");color:#fff' }, childNodes: [] } } },
      { type: 3, timestamp: 2, data: { source: 0, attributes: [{ id: 20, attributes: { href: '#shape-2' } }, { id: 21, attributes: { href: '#private-navigation' } }] } },
    ];
    const output = await scrubReplayEnvelope(envelope(compressed, input as never));
    const clean = decoded(output!);
    expect(clean[0].data.node.attributes).toEqual({ href: '#shape', 'xlink:href': '#shape', style: 'fill:url("#gradient");filter:url("#shadow");color:#fff' });
    expect(clean[1].data.attributes[0].attributes.href).toBe('#shape-2');
    expect(clean[1].data.attributes[1].attributes.href).toBe('');
  });
  it('does not use envelope metadata as evidence for an SVG mutation target', async () => {
    const input = envelope(false, [{ type: 3, timestamp: 1, data: { source: 0, attributes: [{ id: 20, attributes: { href: '#private-navigation' } }] } }] as never);
    Object.assign(input[0], { fixture: { id: 20, tagName: 'use', isSVG: true } });
    const output = await scrubReplayEnvelope(input);
    expect(decoded(output!)[0].data.attributes[0].attributes.href).toBe('');
  });
  it('preserves SVG presentation attribute references without retaining opaque fragments', async () => {
    const input = [{ type: 2, timestamp: 1, data: { node: { id: 30, type: 2, tagName: 'rect', isSVG: true,
      attributes: { fill: 'url(#gradient)', stroke: 'url("#stroke")', filter: 'url(#shadow)', 'clip-path': 'url(#clip)', mask: 'url(#mask)', 'data-note': 'url(#private)' } } } }];
    const output = await scrubReplayEnvelope(envelope(false, input as never));
    expect(decoded(output!)[0].data.node.attributes).toEqual({ fill: 'url("#gradient")', stroke: 'url("#stroke")', filter: 'url("#shadow")', 'clip-path': 'url("#clip")', mask: 'url("#mask")', 'data-note': 'url("")' });
  });
  it('scrubs external and malformed SVG references while keeping a CSS local reference', async () => {
    const input = [{ type: 2, timestamp: 1, data: { node: { id: 20, type: 2, tagName: 'use', isSVG: true,
      attributes: { href: '/sprite.svg?code=secret#shape', 'xlink:href': '#Bearer secret', style: 'fill:url(#gradient);filter:url(/asset?code=secret#shadow);mask:url(#a.b.c)' } } } }];
    const output = await scrubReplayEnvelope(envelope(false, input as never));
    expect(decoded(output!)[0].data.node.attributes).toEqual({ href: '/sprite.svg', 'xlink:href': '', style: 'fill:url("#gradient");filter:url("/asset");mask:url("")' });
  });
  it('fails closed for opaque CSS text with an escaped slash and a later color', async () => {
    const input = [{ type: 3, timestamp: 1, data: { source: 0, texts: [{ id: 10, value: '.w-1\\/2{background:url(/img?code=secret-css);color:#fff}' }] } }];
    const output = await scrubReplayEnvelope(envelope(false, input as never));
    expect(decoded(output!)[0].data.texts[0].value).toBe('');
  });
  it('fails closed for opaque CSS text with an escaped slash and a later hex color', async () => {
    const value = '.w-1\\/2{width:50%;color:#fff}';
    for (const compressed of [false, true]) {
      const input = [{ type: 3, timestamp: 1, data: { source: 0, texts: [{ id: 10, value }] } }];
      const output = await scrubReplayEnvelope(envelope(compressed, input as never));
      expect(decoded(output!)[0].data.texts[0].value).toBe('');
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
