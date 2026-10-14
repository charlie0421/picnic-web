'use strict';
const assert = require('node:assert/strict');
const contract = require('./fixtures/sdk-contract.json');
function keys(value, allowed) { assert.ok(Object.keys(value).every(k => allowed.includes(k)), 'wire field allowlist'); }
function auditReceived(envelopes) {
  const replay = envelopes.filter(e => e.items.some(i => i.header.type === 'replay_event'));
  for (const envelope of replay) {
    keys(envelope.header, ['event_id', 'sdk']); assert.equal(envelope.items.length, 2);
    const meta = envelope.items.find(i => i.header.type === 'replay_event').payload;
    keys(meta, ['type', 'replay_type', 'event_id', 'replay_id', 'segment_id', 'timestamp', 'replay_start_timestamp',
      'release', 'environment', 'platform', 'sdk', 'urls', 'error_ids', 'trace_ids']);
    assert.equal(meta.release, 'replay-p0-fixture'); assert.equal(meta.environment, 'replay-p0-local');
    assert.deepEqual(meta.urls, ['https://replay.invalid/ko/vote']);
    assert.deepEqual(meta.error_ids, []); assert.deepEqual(meta.trace_ids, []);
    function attrs(a) {
      keys(a, ['class', 'style', 'disabled', 'aria-expanded', 'rr_width', 'rr_height', 'rr_scrollLeft', 'rr_scrollTop', '_cssText']);
      if (a.class) assert.ok(a.class.split(/\s+/).every(c => contract.classes.includes(c)));
      if (a.style) assert.ok(a.style.split(';').filter(s => s.trim()).every(s => /^\s*(width|height|opacity|--banner-current-index): (?:\d+px|(?:0|1|\.\d+|0\.\d+)|[012])(?: !important)?$/.test(s)));
    }
    function node(n, parent) {
      keys(n, ['id', 'type', 'childNodes', 'tagName', 'attributes', 'textContent', 'isStyle', 'name', 'publicId', 'systemId']);
      assert.ok([0, 1, 2, 3, 5].includes(n.type));
      if (n.type === 2) { assert.ok(contract.tags.includes(n.tagName)); attrs(n.attributes); }
      if (n.type === 3) {
        if (parent === 'style') assert.equal(n.textContent, contract.rawCss);
        else assert.ok(/^[*\s]*$/.test(n.textContent));
      }
      for (const child of n.childNodes || []) node(child, n.tagName);
    }
    for (const r of envelope.items.find(i => i.header.type === 'replay_recording').payload.records) {
      keys(r, ['type', 'data', 'timestamp']);
      if (r.type === 2) { keys(r.data, ['node', 'initialOffset']); node(r.data.node); }
      else if (r.type === 4) { keys(r.data, ['href', 'width', 'height']); assert.equal(r.data.href, 'https://replay.invalid/ko/vote'); }
      else if (r.type === 0 || r.type === 1) keys(r.data, []);
      else {
        assert.equal(r.type, 3); const d = r.data;
        assert.ok([0, 1, 2, 3, 4, 6].includes(d.source));
        if (d.source === 0) {
          keys(d, ['source', 'texts', 'attributes', 'removes', 'adds']);
          d.texts.forEach(t => { keys(t, ['id', 'value']); assert.ok(/^[*\s]*$/.test(t.value)); });
          d.attributes.forEach(a => { keys(a, ['id', 'attributes']); attrs(a.attributes); });
          d.removes.forEach(x => keys(x, ['id', 'parentId']));
          d.adds.forEach(x => { keys(x, ['parentId', 'nextId', 'node']); node(x.node); });
        } else if (d.source === 1 || d.source === 6) {
          keys(d, ['source', 'positions']); d.positions.forEach(p => keys(p, ['id', 'x', 'y', 'timeOffset']));
        } else keys(d, d.source === 2 ? ['source', 'type', 'id', 'x', 'y', 'pointerType'] : d.source === 3 ? ['source', 'id', 'x', 'y'] : ['source', 'width', 'height']);
      }
    }
  }
  assert.ok(!JSON.stringify(replay).includes('canary'));
}
async function compareReplay(browser, origin, envelopes, expected) {
  auditReceived(envelopes);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/*', route => new URL(route.request().url()).href === origin + '/bundle.js' ? route.continue() : route.abort());
  await page.setContent('<iframe sandbox="allow-same-origin" style="width:1280px;height:720px;border:0"></iframe>');
  await page.addScriptTag({ url: origin + '/bundle.js' });
  await page.evaluate(() => { window.p0View = window.replayP0.createReplayView(document.querySelector('iframe').contentDocument); });
  const actual = [];
  for (const item of envelopes.flatMap(e => e.items.filter(i => i.header.type === 'replay_recording'))) {
    actual.push(await page.evaluate(records => {
      window.p0View.apply(records);
      const doc = document.querySelector('iframe').contentDocument;
      const rectangles = ['.fixture', '.track', '.card'].map(selector => {
        const el = doc.querySelector(selector); const r = el.getBoundingClientRect();
        return { selector, x: r.x, y: r.y, width: r.width, height: r.height, opacity: Number(doc.defaultView.getComputedStyle(el).opacity) };
      });
      const button = doc.querySelector('.toggle');
      return { rectangles, expanded: button.getAttribute('aria-expanded'), disabled: button.disabled, focused: doc.activeElement === button,
        index: doc.defaultView.getComputedStyle(doc.querySelector('.card')).getPropertyValue('--banner-current-index').trim(),
        ...window.p0View.inspect() };
    }, item.payload.records));
  }
  let maxRectError = 0, maxOpacityError = 0;
  assert.equal(actual.length, 3);
  actual.forEach((view, index) => {
    assert.equal(view.nodeCount, 15);
    for (const field of ['expanded', 'disabled', 'index', 'focused']) assert.equal(view[field], expected[index][field]);
    view.rectangles.forEach((r, i) => {
      for (const field of ['x', 'y', 'width', 'height']) maxRectError = Math.max(maxRectError, Math.abs(r[field] - expected[index].rectangles[i][field]));
      maxOpacityError = Math.max(maxOpacityError, Math.abs(r.opacity - expected[index].rectangles[i].opacity));
    });
    // Fixed fixture oracle, independent of the original screen and projector state.
    assert.equal(view.rectangles[2].width, [100, 120, 100][index]);
    assert.equal(view.rectangles[2].height, 100);
    assert.equal(view.rectangles[2].opacity, [1, 0.5, 1][index]);
    assert.equal(view.expanded, ['false', 'true', 'true'][index]);
    assert.equal(view.disabled, index === 2); assert.equal(view.index, ['', '1', ''][index]);
    assert.equal(view.focused, index === 1);
  });
  assert.deepEqual(actual[2].clicks, [13]);
  await page.close();
  return { maxRectError, maxOpacityError, views: actual };
}
module.exports = { compareReplay, auditReceived };
