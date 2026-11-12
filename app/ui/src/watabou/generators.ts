// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A "generated map" note (ADR 0120 item 5): the generator of
// watabou.github.io shown inside the note as an embedded page (ADR 0056:
// asked for once per site, like any other), at an address Verso writes
// with the seed it drew — kept in the note's properties, so that the same
// map can be made again. Pure.

import { CREDIT, type NoteWords, frontMatter, generatorFrame, webLink } from "./notes";
import { WATABOU } from "./region";

/** The generators whose address takes a seed, by the first part of their
 *  path; the names are the generators' own, never translated. */
export const GENERATORS: readonly { slug: string; name: string }[] = [
  { slug: "one-page-dungeon", name: "One Page Dungeon" },
  { slug: "perilous-shores", name: "Perilous Shores" },
  { slug: "city-generator", name: "Medieval Fantasy City Generator" },
  { slug: "village-generator", name: "Village Generator" },
  { slug: "dwellings", name: "Dwellings" },
  { slug: "cave-generator", name: "Cave/Glade Generator" },
  { slug: "neighbourhood", name: "Neighbourhood" },
];

/** The largest seed drawn: the generators' own seeds fit in 31 bits. */
export const MAX_SEED = 2147483646;

/** A seed drawn at random, from 1 to MAX_SEED. */
export function drawSeed(random: (n: number) => number = cryptoRandom): number {
  return random(MAX_SEED) + 1;
}

function cryptoRandom(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] ?? 0) % n;
}

/** The generator's address for `seed`, with the map's name when given
 *  (the generators that take one write it on the map). */
export function generatorLink(slug: string, seed: number, name = ""): string | null {
  if (!GENERATORS.some((g) => g.slug === slug) || !Number.isSafeInteger(seed) || seed < 1) return null;
  const url = new URL(`${WATABOU}/${slug}/`);
  url.searchParams.set("seed", String(seed));
  if (name.trim() !== "") url.searchParams.set("name", name.trim());
  return url.href;
}

/** The note: its properties (the generator, the seed, the address), the
 *  title, the generator embedded, and a link to open it in a tab. */
export function generatedNote(slug: string, seed: number, title: string, name: string, w: NoteWords): string | null {
  const link = generatorLink(slug, seed, name);
  if (!link) return null;
  const props = frontMatter([
    ["generator", slug],
    ["seed", seed],
    ["generator_link", link],
    ["credit", CREDIT],
  ]);
  return `${props}# ${title}\n\n${generatorFrame(link) ?? ""}\n\n${webLink(w.openGenerator, link)}\n`;
}
