// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A fresh proof before a sensitive action (ADR 0083 item 6): the server
// answers `prove_first` when the session proved who it is more than ten
// minutes ago — a mark it alone keeps — and the page asks on the spot and
// sends the request once more. No DOM here: the question is the page's
// prover (`web/proveDialog.ts`), which sends the password or the passkey's
// answer itself and keeps nothing; this only decides when to ask and how
// often to send.

/** Asks the person to prove who they are: true once proved, false when
 *  they cancel. */
export type Prover = () => Promise<boolean>;

let prover: Prover | null = null;
/** The question on screen, which every request that meets `prove_first`
 *  meanwhile waits on: one dialog, not one per request. */
let asking: Promise<boolean> | null = null;

/** The page's prover; none, and `prove_first` is the answer. */
export function setProver(p: Prover | null): void {
  prover = p;
}

/** The page's prover, for a command that goes over the WebSocket and not
 *  through `api` (the table's invitation): null in the desktop app. */
export function pageProver(): Prover | null {
  return prover;
}

/** Whether an error is the server's `prove_first`. */
export function provesFirst(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "prove_first";
}

/** `send`, and, when the server answers `prove_first`, the person asked
 *  and `send` once more — once only: a second `prove_first` is the answer,
 *  never a loop. Cancelled, or a prover that fails, the first refusal is
 *  the answer. */
export async function withProof<T>(send: () => Promise<T>, prove: Prover | null = prover): Promise<T> {
  try {
    return await send();
  } catch (e) {
    if (!provesFirst(e) || !prove) throw e;
    if (!asking) {
      asking = prove()
        .catch(() => false)
        .finally(() => {
          asking = null;
        });
    }
    if (!(await asking)) throw e;
    return send();
  }
}
