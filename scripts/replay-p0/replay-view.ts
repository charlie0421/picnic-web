/** Independent P0 reconstruction of received records. No projection state or SDK internals. */
type RecordedNode = { id: number; type: number; tagName?: string; textContent?: string;
  attributes?: Record<string, string | null>; childNodes?: RecordedNode[];
  isSVG?: boolean; isShadowHost?: boolean; isShadow?: boolean };
type RecordEvent = { type: number; data: { source?: number; node?: RecordedNode;
  removes?: { id: number }[]; adds?: { parentId: number; nextId: number | null; node: RecordedNode }[];
  texts?: { id: number; value: string }[]; attributes?: { id: number; attributes: Record<string, string | null> }[];
  id?: number; type?: number; x?: number; y?: number } };
const P0_TAGS = ['html', 'head', 'style', 'body', 'div', 'span', 'button'];
const SVG_NS = 'http://www.w3.org/2000/svg';
const PLACEHOLDERS = ['img', 'svg', 'link'];
export type LayoutBox = { selector: string; index: number; x: number; y: number; width: number; height: number; opacity: number };
export function createReplayView(target: Document, options: { tags?: readonly string[] } = {}) {
  const tags = options.tags ?? P0_TAGS;
  const nodes = new Map<number, Node>();
  const clicks: number[] = [];
  function attrs(node: Element, values: Record<string, string | null>) {
    for (const [name, value] of Object.entries(values)) {
      if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
    }
  }
  function element(raw: RecordedNode): Element {
    if (!tags.includes(raw.tagName!)) throw new Error('view-tag');
    const values = { ...(raw.attributes || {}) };
    if (raw.tagName === 'link' && typeof values._cssText === 'string') {
      // rrweb replays inlined stylesheets as <style>; do the same without the source link.
      const style = target.createElement('style'); style.textContent = values._cssText; return style;
    }
    const node = raw.isSVG ? target.createElementNS(SVG_NS, raw.tagName!) : target.createElement(raw.tagName!);
    const width = values.rr_width, height = values.rr_height;
    const placeholder = PLACEHOLDERS.includes(raw.tagName!) && typeof width === 'string' && typeof height === 'string';
    if (placeholder) { delete values.rr_width; delete values.rr_height; }
    attrs(node, values);
    if (placeholder) { (node as HTMLElement).style.width = width; (node as HTMLElement).style.height = height; }
    return node;
  }
  function attach(parent: Node, child: Node, raw: RecordedNode, before: Node | null = null) {
    if (raw.isShadow) {
      const host = parent as Element; (host.shadowRoot ?? host.attachShadow({ mode: 'open' })).insertBefore(child, before);
    } else parent.insertBefore(child, before);
  }
  function make(raw: RecordedNode): Node {
    let node: Node;
    if (raw.type === 0) { target.replaceChildren(); node = target; }
    else if (raw.type === 1) node = target.implementation.createDocumentType('html', '', '');
    else if (raw.type === 2) node = element(raw);
    else if (raw.type === 3) node = target.createTextNode(raw.textContent!);
    else if (raw.type === 5) node = target.createComment(raw.textContent!);
    else throw new Error('view-node');
    nodes.set(raw.id, node);
    for (const child of raw.childNodes || []) attach(node, make(child), child);
    return node;
  }
  function get(id: number) { const node = nodes.get(id); if (!node) throw new Error('view-reference'); return node; }
  return {
    apply(records: readonly unknown[]) {
      for (const record of records as RecordEvent[]) {
        const d = record.data;
        if (record.type === 2) { nodes.clear(); make(d.node!); }
        if (record.type !== 3) continue;
        if (d.source === 0) {
          for (const r of d.removes!) { const node = get(r.id); node.parentNode!.removeChild(node); }
          for (const a of d.adds!) attach(get(a.parentId), make(a.node), a.node, a.nextId === null ? null : get(a.nextId));
          for (const t of d.texts!) get(t.id).textContent = t.value;
          for (const a of d.attributes!) attrs(get(a.id) as Element, a.attributes);
        } else if (d.source === 2) {
          const node = get(d.id!) as HTMLElement;
          if (d.type === 2) clicks.push(d.id!);
          if (d.type === 5) node.focus();
          if (d.type === 6) node.blur();
        }
        else if (d.source === 3) {
          const node = get(d.id!);
          if (node === target) target.defaultView!.scrollTo(d.x!, d.y!);
          else (node as Element).scrollTo(d.x!, d.y!);
        }
      }
    },
    inspect: () => ({ nodeCount: Array.from(nodes.values()).filter(n => n === target || n.isConnected).length, clicks: [...clicks] }),
    layout(selectors: readonly string[]): LayoutBox[] {
      const view = target.defaultView!; const boxes: LayoutBox[] = [];
      for (const selector of selectors) {
        target.querySelectorAll(selector).forEach((el, index) => {
          const r = el.getBoundingClientRect();
          boxes.push({ selector, index, x: r.x + view.scrollX, y: r.y + view.scrollY, width: r.width, height: r.height,
            opacity: Number(view.getComputedStyle(el).opacity) });
        });
      }
      return boxes;
    },
    dispose() { nodes.clear(); clicks.length = 0; target.replaceChildren(); },
  };
}
