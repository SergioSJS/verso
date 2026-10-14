// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A request the server tells to wait — 429 with the seconds in its answer,
// as the device page's lookups are past the address's free tries (ADR
// 0083 item 17) — is said waiting and sent again by itself once they are
// past, instead of leaving the page on "too many attempts". The server
// still counts every try it hears: a wrong code sent again is a wrong code
// again.

/** The seconds to wait before a request is sent again. */
export type Wait = (seconds: number) => Promise<void>;

const sleep: Wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/** The seconds a refusal asks to wait, or null when it is no such refusal. */
function waitAsked(e: unknown): number | null {
  if (!(e instanceof Error) || (e as { status?: unknown }).status !== 429) return null;
  const retry = (e as { retry?: unknown }).retry;
  return typeof retry === "number" && retry >= 1 ? Math.ceil(retry) : 1;
}

/** `send`, sent again after each wait the server asks for — `told` the
 *  seconds first, for the page to say — at most `most` times; any other
 *  answer, and the last refusal, is the caller's. */
export async function afterWaits<T>(send: () => Promise<T>, told: (seconds: number) => void, wait: Wait = sleep, most = 10): Promise<T> {
  for (let waits = 0; ; waits++) {
    try {
      return await send();
    } catch (e) {
      const seconds = waitAsked(e);
      if (seconds === null || waits >= most) throw e;
      told(seconds);
      await wait(seconds);
    }
  }
}
