'use strict';

const assert = require('node:assert/strict');
const { inflateSync } = require('node:zlib');

// Preserve binary recording bytes until after the segment header is removed.
function parseBrowserEnvelope(buffer) {
  let offset = 0;
  const line = () => {
    const newline = buffer.indexOf(10, offset);
    const end = newline === -1 ? buffer.length : newline;
    const value = buffer.subarray(offset, end);
    offset = end + 1;
    return value;
  };
  const header = JSON.parse(line().toString('utf8'));
  const items = [];
  while (offset < buffer.length) {
    const itemHeader = JSON.parse(line().toString('utf8'));
    let bytes;
    if (Number.isInteger(itemHeader.length)) {
      assert.ok(itemHeader.length >= 0 && offset + itemHeader.length <= buffer.length, 'valid item byte length');
      bytes = buffer.subarray(offset, offset + itemHeader.length);
      offset += itemHeader.length;
      if (offset < buffer.length) assert.equal(buffer[offset++], 10, 'item boundary');
    } else bytes = line();
    if (itemHeader.type === 'replay_recording') {
      const split = bytes.indexOf(10);
      assert.ok(split > 0, 'recording segment header');
      const segment = JSON.parse(bytes.subarray(0, split).toString('utf8'));
      const body = bytes.subarray(split + 1);
      const compressed = body[0] !== 91; // SDK uses JSON array or zlib deflate.
      const records = JSON.parse((compressed ? inflateSync(body) : body).toString('utf8'));
      assert.ok(Array.isArray(records) && records.length > 0, 'nonempty recording');
      items.push({ header: itemHeader, payload: { segment, records }, compressed });
    } else items.push({ header: itemHeader, payload: JSON.parse(bytes.toString('utf8')) });
  }
  return { header, items };
}

function evaluateBrowserEnvelopes(envelopes) {
  const items = envelopes.flatMap((envelope) => envelope.items);
  const errors = items.filter((item) => item.header.type === 'event' && JSON.stringify(item.payload).includes('browser-privacy-error'));
  const transactions = items.filter((item) => item.header.type === 'transaction' && item.payload.transaction?.includes('browser-privacy-transaction'));
  const replays = items.filter((item) => item.header.type === 'replay_event');
  const recordings = items.filter((item) => item.header.type === 'replay_recording');
  assert.ok(errors.length > 0, 'browser error delivered');
  assert.ok(errors.some((item) => item.payload.breadcrumbs?.some((crumb) => crumb.category === 'navigation')), 'navigation breadcrumb delivered');
  assert.ok(transactions.length > 0, 'transaction delivered');
  assert.ok(transactions.some((item) => item.payload.spans?.some((span) => span.op === 'http.client')), 'child span delivered');
  assert.ok(replays.length > 0 && recordings.length > 0, 'Replay metadata and recording delivered');
  assert.ok(recordings.some((item) => item.compressed), 'compressed recording exercised');
  const records = recordings.flatMap((item) => item.payload.records);
  assert.ok(records.some((event) => event.type === 4), 'rrweb Meta delivered');
  assert.ok(records.some((event) => event.type === 2), 'rrweb DOM snapshot delivered');
  assert.ok(records.some((event) => event.type === 3), 'rrweb mutation delivered');
  const objects = [];
  const collect = (value) => {
    if (!value || typeof value !== 'object') return;
    objects.push(value);
    for (const child of Object.values(value)) collect(child);
  };
  collect(records);
  assert.ok(objects.some((node) => typeof node.attributes?._cssText === 'string' && node.attributes._cssText.length > 0), 'inlined stylesheet remains nonempty');
  assert.ok(objects.some((node) => typeof node.textContent === 'string' && node.textContent.includes('.hover\\:bg-privacy') && node.textContent.includes('.w-1\\/2')), 'Tailwind selector escapes survive');
  assert.ok(records.some((event) => event.type === 3 && event.data.source === 8), 'CSS rule insertion captured');
  assert.ok(records.some((event) => event.type === 3 && event.data.source === 13), 'CSS declaration captured');
  assert.ok(records.some((event) => event.type === 5 && event.data.tag === 'performanceSpan'), 'Replay performance custom events captured');
  assert.ok(records.some((event) => event.type === 5 && event.data.tag === 'breadcrumb'), 'Replay breadcrumb custom events captured');
  const all = JSON.stringify(envelopes);
  const leaks = [...new Set(all.match(/privacy-[a-z-]+-(?:query|fragment|value)/g) || [])];
  assert.deepEqual(leaks, [], `URL/input canaries leaked: ${leaks.join(', ')}`);
  assert.ok(!all.includes('redaction.tripwire'), 'ordinary URL data must not need the token tripwire');
  return { errors: errors.length, transactions: transactions.length, replayEvents: replays.length, recordings: recordings.length, leaks: 0 };
}

module.exports = { parseBrowserEnvelope, evaluateBrowserEnvelopes };
