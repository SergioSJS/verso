// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Words written for a computer, said on a phone (ADR 0118: the Android
// app, 2026-11-12 — Settings › Sync said "Nome deste computador" and the
// notifications "Este computador não está guardando a lista" on the
// maintainer's phone). A set of words is given back with "this computer"
// as "this phone", in Portuguese and in English, its functions' sentences
// too; on a computer it is given back as it is.

/** Whether this app is a phone's: told by can.ts as the host answers, so
 *  this file imports nothing (the words' own tests load it alone). */
let phoneHost = false;
export function setPhoneHost(on: boolean): void {
  phoneHost = on;
}

const PT: [RegExp, string][] = [
  [/\b([Nn]e|[Dd]e|[Ee])ste computador\b/g, "$1ste celular"],
  [/\b([Nn]e|[Dd]e|[Ee])sse computador\b/g, "$1sse celular"],
];
const EN: [RegExp, string][] = [
  [/\bthis computer\b/g, "this phone"],
  [/\bThis computer\b/g, "This phone"],
];

/** `text` with a computer said as a phone. */
export function phoneText(text: string): string {
  let out = text;
  for (const [re, by] of [...PT, ...EN]) out = out.replace(re, by);
  return out;
}

function mapWords(value: unknown): unknown {
  if (typeof value === "string") return phoneText(value);
  if (typeof value === "function") {
    const f = value as (...a: unknown[]) => unknown;
    return (...a: unknown[]) => mapWords(f(...a));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapWords(v)]));
  }
  if (Array.isArray(value)) return value.map(mapWords);
  return value;
}

const made = new WeakMap<object, object>();

/** `words` as a phone says them, made once per set; as they are elsewhere. */
export function onPhone<T extends object>(words: T, phone = phoneHost): T {
  if (!phone) return words;
  let out = made.get(words);
  if (!out) {
    out = mapWords(words) as object;
    made.set(words, out);
  }
  return out as T;
}
