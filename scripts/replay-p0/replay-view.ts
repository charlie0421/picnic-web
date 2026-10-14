/** Independent P0 reconstruction of received records. No projection state or SDK internals. */
type RecordedNode = { id: number; type: number; tagName?: string; textContent?: string;
  attributes?: Record<string, string | null>; childNodes?: RecordedNode[] };
type RecordEvent = { type: number; data: { source?: number; node?: RecordedNode;
  removes?: { id: number }[]; adds?: { parentId: number; nextId: number | null; node: RecordedNode }[];
  texts?: { id: number; value: string }[]; attributes?: { id: number; attributes: Record<string, string | null> }[];
  id?: number; type?: number; x?: number; y?: number } };
export function createReplayView(target: Document) {
  const nodes = new Map<number, Node>();
  const clicks: number[] = [];
  function attrs(node: Element, values: Record<string, string | null>) {
    for (const [name, value] of Object.entries(values)) {
      if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
    }
  }
  function make(raw: RecordedNode): Node {
    let node: Node;
    if (raw.type === 0) { target.replaceChildren(); node = target; }
    else if (raw.type === 1) node = target.implementation.createDocumentType('html', '', '');
    else if (raw.type === 2) {
      if (!['html', 'head', 'style', 'body', 'div', 'span', 'button'].includes(raw.tagName!)) throw new Error('view-tag');
      node = target.createElement(raw.tagName!); attrs(node as Element, raw.attributes || {});
    } else if (raw.type === 3) node = target.createTextNode(raw.textContent!);
    else if (raw.type === 5) node = target.createComment(raw.textContent!);
    else throw new Error('view-node');
    nodes.set(raw.id, node);
    for (const child of raw.childNodes || []) node.appendChild(make(child));
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
          for (const a of d.adds!) get(a.parentId).insertBefore(make(a.node), a.nextId === null ? null : get(a.nextId));
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
    dispose() { nodes.clear(); clicks.length = 0; target.replaceChildren(); },
  };
}
