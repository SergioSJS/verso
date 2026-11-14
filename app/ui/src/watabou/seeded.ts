// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A town's or a danger's note, made when its link in a region's note is
// followed (ADR 0120 item 4): a link to a note that does not exist makes
// the note, as always; when the note the link is in is a region imported
// from Perilous Shores, the new note starts with what the region's export
// says of that place — its description and its generator's address with
// the seed — instead of a title alone. The export is read, never written.

import { commands, type Property } from "../bindings";
import { placeNamed, placeNote } from "./notes";
import { readRegion } from "./region";
import { ww } from "./words";

function prop(properties: Property[], key: string): string | null {
  const p = properties.find((x) => x.key === key);
  return p && p.value.kind === "text" ? p.value.value : null;
}

/** The first text of a note followed from the note at `from` to the
 *  missing note `name`, or null to make it as any other. */
export async function seededText(from: string, name: string): Promise<string | null> {
  try {
    const read = await commands.readNote(from);
    if (read.status !== "ok") return null;
    const props = read.data.properties;
    if (prop(props, "generator") !== "perilous-shores") return null;
    const target = /^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/.exec((prop(props, "export") ?? "").trim())?.[1];
    if (!target) return null;
    const at = await commands.resolveAttachment(from, target);
    if (at.status !== "ok" || !at.data) return null;
    const text = await commands.readFileText(at.data);
    if (text.status !== "ok") return null;
    const region = readRegion(JSON.parse(text.data) as unknown);
    const place = region ? placeNamed(region, name.split("/").pop() ?? name) : null;
    if (!place) return null;
    const regionName = (from.split("/").pop() ?? from).replace(/\.md$/i, "");
    return placeNote(place, regionName, ww.note);
  } catch {
    return null;
  }
}
