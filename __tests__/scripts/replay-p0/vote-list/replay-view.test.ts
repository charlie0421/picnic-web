import { describe, expect, it } from 'vitest';
import { createReplayView } from '../../../../scripts/replay-p0/replay-view';

const TAGS = ['html', 'head', 'body', 'img', 'svg'];
const snapshot = (media: Record<string, unknown>) => ({ type: 2, data: { node: { type: 0, id: 1, childNodes: [
  { type: 2, id: 2, tagName: 'html', attributes: {}, childNodes: [
    { type: 2, id: 3, tagName: 'head', attributes: {}, childNodes: [] },
    { type: 2, id: 4, tagName: 'body', attributes: {}, childNodes: [{ type: 2, id: 5, attributes: { rr_width: '10px', rr_height: '10px' }, childNodes: [], ...media }] }] }] } } });
const resize = (attributes: Record<string, string>) => ({ type: 3, data: { source: 0, adds: [], removes: [], texts: [], attributes: [{ id: 5, attributes }] } });

describe('replay view placeholders', () => {
  it.each([['img', { tagName: 'img' }], ['svg', { tagName: 'svg', isSVG: true }]])('applies later %s size changes to the box', (_name, media) => {
    const doc = document.implementation.createHTMLDocument('');
    const view = createReplayView(doc, { tags: TAGS });
    view.apply([snapshot(media), resize({ rr_width: '100px', rr_height: '20.5px' })]);
    const node = doc.body.firstElementChild as HTMLElement;
    expect([node.style.width, node.style.height]).toEqual(['100px', '20.5px']);
    expect(node.hasAttribute('rr_width')).toBe(false);
  });
});
