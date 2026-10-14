// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A server's sensitive action from the desktop app (ADR 0083 item 6): the
// app reaches the server with its device's session, which proves itself
// as any session does, and a command whose server answered `prove_first`
// comes back with that kind. The window then asks the person — the web's
// own dialog (`web/proveDialog.ts`), through the host — and sends the
// command once more, with `web/proof.ts`'s rules: once only, one question
// for commands that meet it together, cancelled and the first answer
// stands. No DOM here.

import type { ContractError } from "./bindings";
import { withProof, type Prover } from "./web/proof";

type Answer<T> = { status: "ok"; data: T } | { status: "error"; error: ContractError };

/** A command's `prove_first`, thrown for `withProof` to see. */
class ProveFirst<T> extends Error {
  readonly code = "prove_first";
  constructor(readonly answer: Answer<T>) {
    super("prove_first");
  }
}

/** `call`, and, when its server wants a fresh proof, the person asked
 *  with `prove` and `call` once more; with no `prove` (in a browser, whose
 *  pages ask themselves), the answer as it came. */
export async function withServerProof<T>(call: () => Promise<Answer<T>>, prove: Prover | null): Promise<Answer<T>> {
  try {
    return await withProof(async () => {
      const r = await call();
      if (r.status === "error" && r.error.kind === "prove_first") throw new ProveFirst(r);
      return r;
    }, prove);
  } catch (e) {
    if (e instanceof ProveFirst) return e.answer as Answer<T>;
    throw e;
  }
}
