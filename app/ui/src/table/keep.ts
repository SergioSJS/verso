// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The log keeps the card it drew for an entry while the entry is unchanged (ADR 0107): a roll arriving draws
// ONE new card and leaves every other card, its pictures included, untouched, so nothing blinks or jumps.

/** What a card shows, as a string: the same string, the same card. */
export const signature = (e: unknown, extra: string): string => JSON.stringify([e, extra]);

export class Cards<N> {
  private readonly held = new Map<string, { sig: string; node: N }>();

  /** `onDrop` hears every node the log lets go (replaced, pruned, cleared): it releases what the card holds (watchers, timers). */
  constructor(private readonly onDrop: (node: N) => void = () => {}) {}

  /** The card for `id`: the one kept when its signature is unchanged, else a new one from `make`. */
  card(id: string, sig: string, make: () => N): N {
    const kept = this.held.get(id);
    if (kept && kept.sig === sig) return kept.node;
    if (kept) this.onDrop(kept.node);
    const node = make();
    this.held.set(id, { sig, node });
    return node;
  }

  /** Forget the cards of entries no longer in `ids`; returns the nodes dropped. */
  prune(ids: ReadonlySet<string>): N[] {
    const gone: N[] = [];
    for (const [id, k] of this.held) {
      if (!ids.has(id)) {
        gone.push(k.node);
        this.onDrop(k.node);
        this.held.delete(id);
      }
    }
    return gone;
  }

  clear(): void {
    for (const k of this.held.values()) this.onDrop(k.node);
    this.held.clear();
  }
}

/** Make `parent`'s children exactly `desired`, in order, touching only what differs (an unchanged node is not moved). */
export function syncChildren(parent: Element, desired: readonly Element[]): void {
  let cur = parent.firstElementChild;
  for (const node of desired) {
    if (cur === node) cur = cur.nextElementSibling;
    else parent.insertBefore(node, cur);
  }
  while (cur) {
    const next: Element | null = cur.nextElementSibling;
    cur.remove();
    cur = next;
  }
}
