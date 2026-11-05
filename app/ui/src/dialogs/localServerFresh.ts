// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The host's status of *Transformar em servidor*, as the section draws it
// (ADR 0117 D1, D3 item 6). The section asks it again at every event of
// the host (the link's download says how far it got four times a second),
// and the answers do not come back in the order they were asked: an
// answer asked while the link was still starting could be drawn after
// the person's Cancel and after the answer that said the link was off
// (the re-test of 2026-11-04 on VM 104: the link's box ticked again, with
// "O link liga junto com o servidor." beside "Cancelado").

/** Answers drawn newest first: an answer asked before one already drawn
 *  is older than what the window shows, and is dropped. */
export type Newest = {
  /** A number for a request about to be asked. */
  ask: () => number;
  /** Whether the answer to request `n` may be drawn (and is, from now). */
  take: (n: number) => boolean;
};

export function newest(): Newest {
  let asked = 0;
  let drawn = 0;
  return {
    ask: () => ++asked,
    take: (n) => {
      if (n < drawn) return false;
      drawn = n;
      return true;
    },
  };
}

type LinkStatus = { serving: boolean; link: { state: string } };

/** Whether the box *Por um link na internet* stays ticked after drawing
 *  `s`, the box being `wish` and the link drawn last `wasUp`: ticked while
 *  the link starts or is on; not ticked once it went down (Cancel, Stop, a
 *  failure, its end: it is never kept across starts, D3 item 6) or while
 *  serving without it; otherwise the person's own tick, a wish for the
 *  next start. */
export function linkWish(wish: boolean, wasUp: boolean, s: LinkStatus): boolean {
  if (linkUp(s)) return true;
  if (wasUp || s.serving) return false;
  return wish;
}

/** The link starting or on. */
export function linkUp(s: LinkStatus): boolean {
  return s.link.state === "on" || s.link.state === "starting";
}
