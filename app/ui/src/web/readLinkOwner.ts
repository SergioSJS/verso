// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The owner's read links (ADR 0105) in a browser: the contract's four
// commands asked of the server's pages with the session, as the desktop
// app asks them with its token. The server's JSON is camel-cased; the
// contract's is not.

import type { ContractError, ReadLinkInfo, ReadLinkMade, ReadLinks } from "../bindings";
import { api, ApiError, byApp } from "./api";

type Wire = {
  id: string;
  kind: string;
  path: string;
  madeBy: string;
  madeAt: number;
  expires: number | null;
  hasPassword: boolean;
  lastOpened: number | null;
  open: number;
};

/** A link as the contract says it. Exported for its test. */
export function linkOf(w: Wire): ReadLinkInfo {
  return { id: w.id, kind: w.kind, path: w.path, made_by: w.madeBy, made_at: w.madeAt, expires: w.expires, has_password: w.hasPassword, last_opened: w.lastOpened, open: w.open };
}

/** A command of the read links, answered as the contract does; refused
 *  as the contract refuses. */
export async function readLinkCall(folderId: string | null, cmd: string, a: Record<string, unknown>): Promise<ReadLinks | number | ReadLinkMade | null> {
  const refused = (message: string): ContractError => ({ kind: "refused", message });
  if (!folderId) throw refused("no folder");
  // A desktop app serving a phone has no read links (ADR 0105; ADR 0096).
  if (byApp()) throw refused("read links are a server's");
  const at = `/api/folders/${encodeURIComponent(folderId)}/readlinks`;
  try {
    switch (cmd) {
      case "read_link_list": {
        const r = await api<{ enabled: boolean; links: Wire[] }>("GET", at);
        return { enabled: r.enabled, links: r.links.map(linkOf) };
      }
      case "read_link_secrets": {
        const q = new URLSearchParams({ kind: String(a["kind"] ?? ""), path: String(a["path"] ?? "") });
        const r = await api<{ notes: number }>("GET", `${at}/secrets?${q}`);
        return r.notes;
      }
      case "read_link_create": {
        const r = await api<{ path: string; link: Wire }>("POST", at, {
          kind: a["kind"],
          path: a["path"],
          expiresDays: a["expiresDays"] ?? undefined,
          expiresAt: a["expiresAt"] ?? undefined,
          password: a["password"] ?? undefined,
        });
        return { url: `${location.origin}${r.path}`, link: linkOf(r.link) };
      }
      default:
        await api("DELETE", `${at}/${encodeURIComponent(String(a["id"] ?? ""))}`);
        return null;
    }
  } catch (e) {
    if (e instanceof ApiError) {
      // The sensitive action wants a proof again: said as the contract
      // does, so the window's own words answer.
      const kind = e.code === "prove_first" ? "prove_first" : e.status === 404 ? "not_found" : e.status === 401 || e.status === 403 ? "refused" : "failed";
      throw { kind, message: e.message } satisfies ContractError;
    }
    throw { kind: "unavailable", message: String(e) } satisfies ContractError;
  }
}
