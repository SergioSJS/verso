// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What importing the demo does with a file that is already in the folder
// (ADR 0058). The demo carries, beside each file, the SHA-256 of every
// version of it the product ever shipped (`past`, from git history, made
// by `scripts/demo-vault.mjs build`). A file whose bytes are one of them
// is the person's untouched copy of an older tutorial and is replaced by
// the current version; a file that is none is the person's edit and is
// kept. No state is stored anywhere, so a folder imported before this
// existed is recognised too.

/** One file of the demo, as `demoVault.ts` embeds it. */
export type DemoItem = { path: string; b64: string; past?: string[] };

/** What to do with a file the folder already holds. */
export type Verdict = "create" | "same" | "update" | "keep";

/** The lower-case hex SHA-256 of `bytes`. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The decision. `have` is the hash of the file in the folder (`null`:
 *  there is none, or it could not be read — an unreadable file is kept),
 *  `current` the hash of the demo's version, `past` the hashes of the
 *  earlier ones. */
export function decide(have: string | null | undefined, current: string, past: readonly string[] = []): Verdict {
  if (have === undefined) return "create";
  if (have === null) return "keep";
  if (have === current) return "same";
  return past.includes(have) ? "update" : "keep";
}

/** Files the import can replace through the write path: text the core
 *  reads and writes with a revision check. Anything else is only ever
 *  created, never replaced. */
export function replaceable(path: string): boolean {
  return /\.(md|base|canvas|svg|html)$/i.test(path);
}
