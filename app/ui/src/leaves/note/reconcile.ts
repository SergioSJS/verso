// The reading view drawn again without being rebuilt. The core hands the
// note over as HTML; its top-level nodes are the blocks. A block is known by
// what the core wrote for it (its serialized HTML), so a block that reads
// the same is never touched — its pictures, embeds, diagrams and cards keep
// their state — and only the blocks that differ are replaced, inserted or
// removed. The key is the *final* HTML (reader projection and secret
// filtering included), so nothing a reader may not see can come from here.

/** A top-level node of the reading view and what the core wrote for it. */
export interface Block {
  key: string;
  node: Node;
}

/** What the core wrote for a node: its HTML, or its text for a text node. */
export function keyOf(node: Node): string {
  return node instanceof Element ? node.outerHTML : `#${node.textContent ?? ""}`;
}

/** The blocks of `root` as they stand now (call right after the HTML is set,
 *  before anything is wired onto it). */
export function snapshot(root: ParentNode): Block[] {
  return Array.from(root.childNodes, (node) => ({ key: keyOf(node), node }));
}

/** Whether `blocks` still describes `root` exactly: same nodes, same order.
 *  Anything wired later may have replaced or added a top-level node (a
 *  footnote section, a node an embed replaced): then the next drawing is a
 *  full one. */
export function describes(blocks: readonly Block[] | null, root: ParentNode): blocks is Block[] {
  if (!blocks || blocks.length !== root.childNodes.length) return false;
  return blocks.every((b, i) => root.childNodes[i] === b.node);
}

export interface Plan {
  /** The nodes of the new drawing in order: kept ones are the very old nodes. */
  next: { key: string; node: Node; fresh: boolean }[];
  /** The new nodes, in order, still to be wired. */
  fresh: Node[];
  /** The old nodes that go. */
  removed: Node[];
}

/** Match the old blocks to the incoming nodes: the common head and tail by
 *  position, the middle by key (first unused old block of that key). */
export function plan(old: readonly Block[], incoming: readonly Node[]): Plan {
  const keys = incoming.map(keyOf);
  let head = 0;
  while (head < old.length && head < keys.length && old[head]!.key === keys[head]) head++;
  let tail = 0;
  while (tail < old.length - head && tail < keys.length - head && old[old.length - 1 - tail]!.key === keys[keys.length - 1 - tail]) tail++;
  const pool = new Map<string, Block[]>();
  for (const b of old.slice(head, old.length - tail)) {
    const list = pool.get(b.key);
    if (list) list.push(b);
    else pool.set(b.key, [b]);
  }
  const used = new Set<Node>();
  const next: Plan["next"] = [];
  const fresh: Node[] = [];
  incoming.forEach((node, i) => {
    const key = keys[i]!;
    let kept: Node | undefined;
    if (i < head) kept = old[i]!.node;
    else if (i >= incoming.length - tail) kept = old[old.length - (incoming.length - i)]!.node;
    else kept = pool.get(key)?.shift()?.node;
    if (kept) {
      used.add(kept);
      next.push({ key, node: kept, fresh: false });
    } else {
      next.push({ key, node, fresh: true });
      fresh.push(node);
    }
  });
  return { next, fresh, removed: old.filter((b) => !used.has(b.node)).map((b) => b.node) };
}

/** Whether some part of what changed is read across blocks, so a block-wise
 *  drawing could not be trusted: footnotes (gathered at the end), tables
 *  (their column widths go by order), bases, callouts that fold (their
 *  state goes by order), statblocks (written back by order), and the live
 *  embeds a removed block owned. `statblock` tells a code block that is one. */
export function crossesBlocks(fresh: readonly Node[], removed: readonly Node[], statblock: (code: Element) => boolean): boolean {
  const within = (n: Node, sel: string): boolean => n instanceof Element && (n.matches(sel) || n.querySelector(sel) !== null);
  const isStat = (n: Node): boolean => n instanceof Element && Array.from(n.matches("pre > code") ? [n] : n.querySelectorAll("pre > code")).some(statblock);
  const shared = ".footnote-definition, .footnotes, .footnote-reference, table, .callout[data-fold], pre > code.language-base, .statblock-card, .statblock-host";
  for (const n of fresh) if (within(n, shared) || isStat(n)) return true;
  for (const n of removed) if (within(n, shared + ", .embed-base, .embed-pdf") || isStat(n)) return true;
  return false;
}

/** Put `next` into `root` in order, taking `removed` out. Kept nodes are not
 *  touched unless they must move; returns how many nodes were inserted or
 *  removed (the cost of the update). */
export function apply(root: HTMLElement, next: readonly { node: Node }[], removed: readonly Node[]): number {
  let touched = 0;
  for (const n of removed) {
    n.parentNode?.removeChild(n);
    touched++;
  }
  let cursor: ChildNode | null = root.firstChild;
  for (const { node } of next) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    root.insertBefore(node, cursor);
    touched++;
  }
  return touched;
}

/** The block at the top of the sheet and how far down it starts, so that
 *  what is put in above it does not move what the person is reading. */
export function scrollAnchor(sheet: HTMLElement, root: HTMLElement, kept?: ReadonlySet<Node>): { node: Element; top: number } | null {
  const edge = sheet.getBoundingClientRect().top;
  for (const node of Array.from(root.children)) {
    // A block about to be replaced cannot hold the place: the first one
    // that stays does.
    if (kept && !kept.has(node)) continue;
    const r = node.getBoundingClientRect();
    if (r.bottom > edge) return { node, top: r.top };
  }
  return null;
}

/** Scroll back so the anchor stands where it stood. */
export function keepAnchor(sheet: HTMLElement, anchor: { node: Element; top: number } | null): void {
  if (!anchor || !anchor.node.isConnected) return;
  const moved = anchor.node.getBoundingClientRect().top - anchor.top;
  if (Math.abs(moved) >= 1) sheet.scrollTop += moved;
}

/** The mode part of a drawing's signature (`path\nXY\nhtml`): reader view
 *  and read-only. Blocks kept from a drawing in another mode would keep the
 *  affordances (task boxes) of that one, so a change of mode draws whole. */
export function modeOfSig(sig: string): string {
  return sig.split("\n", 3)[1] ?? "";
}
