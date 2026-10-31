// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { commands, type ContractError } from "./bindings";
import { afterFileChange, refreshLists } from "./changes";
import { DEMO_RETIRED, DEMO_VAULT_FILES, type DemoVaultFile } from "./demoVault";
import { ask, tell } from "./dialog";
import { ui } from "./dom";
import { flash } from "./notify";
import { fail } from "./errors";
import { b64ToUtf8 } from "./files";
import { decide, decideRetired, replaceable, sha256Hex, type Verdict } from "./demoImport";
import { currentFolder } from "./folder";
import { openNote } from "./layout/spaces";
import { openFolderBy } from "./open";
import { opening } from "./opening";
import { LOCALE, t } from "./strings";
import { openFolders } from "./tree/tree";

const encoder = new TextEncoder();

/** The SHA-256 of the file at `path` as it is in the folder: a note or a
 *  base read through the contract, as text; any other file byte for byte
 *  through the file protocol. `null` when it cannot be read: such a file
 *  is kept, and named. */
export async function hashOfFile(path: string): Promise<string | null> {
  try {
    if (path.endsWith(".md") || path.endsWith(".base")) {
      const r = await opening.readText(path, true);
      return r.status === "ok" ? await sha256Hex(encoder.encode(r.data.text)) : null;
    }
    const res = await fetch(convertFileSrc(path, "verso"));
    if (!res.ok) return null;
    return await sha256Hex(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

const bytesOf = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Replace the person's untouched copy of an older demo file by the
 *  current one, through the ordinary write (atomic, over the revision just
 *  read: a file that changed meanwhile is refused and kept). */
async function replaceFile(path: string, b64: string): Promise<boolean> {
  const read = await opening.readText(path);
  if (read.status !== "ok") return false;
  const written = await commands.writeText(path, b64ToUtf8(b64), read.data.revision);
  return written.status === "ok";
}

/** The tutorial's language that matches the window's (ADR 0058 point 15). */
export type DemoLang = "pt" | "en";
export const DEMO_LANG: DemoLang = LOCALE === "pt-BR" ? "pt" : "en";
/** The first note of each, the one the import opens. */
const WELCOME: Record<DemoLang, string> = { pt: "00 - Bem-vindo ao Verso.md", en: "00 - Welcome to Verso.md" };

/** The files of a language's tutorial. The English one is a chunk of its
 *  own, loaded only when it is imported; the images, the PDF and the theme
 *  are kept once, in the Portuguese embed, and joined here. */
async function demoFiles(lang: DemoLang): Promise<DemoVaultFile[]> {
  if (lang === "pt") return DEMO_VAULT_FILES;
  const { DEMO_VAULT_EN_FILES } = await import("./demoVaultEn");
  return [...DEMO_VAULT_EN_FILES, ...DEMO_VAULT_FILES.filter((f) => f.path.startsWith("assets/"))];
}

/** Populate the current vault with sample notes, bases, and templates, in
 *  the window's language unless another is asked for. */
export async function importDemoVault(lang: DemoLang = DEMO_LANG): Promise<void> {
  void commands.logWrite("INFO", "import demo: asked").catch(() => undefined);
  try {
    if (!currentFolder) {
      const picked = await openFolderBy(() => commands.pickFolder());
      if (!picked || !currentFolder) return;
    }
    const confirmed = await ask(t.importDemoVaultConfirm, { yes: t.importDemoVault, no: t.cancel });
    if (!confirmed) return void commands.logWrite("INFO", "import demo: declined").catch(() => undefined);

    ui.status.textContent = "…";
    const DEMO = await demoFiles(lang);

    // The demo's own folders, from its files' paths (a parent before its
    // children): a name written here once did not follow a rename of the
    // demo's folder, and a case-insensitive disk then put the files in it.
    const folders = [...new Set(DEMO.flatMap((f) => f.path.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"))))];
    for (const f of folders) {
      openFolders.add(f);
      try {
        await commands.createFolder(f);
      } catch {
        // folder may already exist
      }
    }

    // A file already there: the same content is left alone; the person's
    // untouched copy of an earlier version's demo (its bytes are one of
    // the hashes the demo carries) is replaced by the current one; any
    // other — the person's edit — is kept, and named. One that could not
    // be written is named too, and its reason goes to the log: an import
    // that wrote nothing said "imported" and left no trace (2026-10-01).
    void commands.logWrite("INFO", `import demo: ${DEMO.length} files`).catch(() => undefined);
    let createdCount = 0;
    const updated: string[] = [];
    // The files of the demo now in the folder, current: what an old name's
    // counterpart has to be before the old copy goes.
    const settled = new Set<string>();
    const kept: string[] = [];
    const failed: string[] = [];
    for (const [i, item] of DEMO.entries()) {
      ui.status.textContent = `… ${i + 1}/${DEMO.length}`;
      try {
        const res = await commands.createFile(item.path, item.b64);
        if (res.status === "ok") {
          createdCount++;
          settled.add(item.path);
        } else if (res.error.kind === "exists") {
          const verdict: Verdict = decide(await hashOfFile(item.path), await sha256Hex(bytesOf(item.b64)), item.past);
          if (verdict === "keep") kept.push(item.path);
          else if (verdict === "update") {
            if (replaceable(item.path) && (await replaceFile(item.path, item.b64))) {
              updated.push(item.path);
              settled.add(item.path);
            } else kept.push(item.path);
          } else settled.add(item.path);
        } else {
          failed.push(item.path);
          console.error(`import demo: ${item.path}: ${res.error.kind}: ${res.error.message}`);
        }
      } catch (e) {
        failed.push(item.path);
        console.error(`import demo: ${item.path}: ${String(e)}`);
      }
    }
    // A note the tutorial renamed: the person's untouched copy under the
    // old name goes to the trash (restorable, ADR 0080) once the current
    // note is there; an edited one stays and is named.
    let trashed = 0;
    for (const old of lang === "pt" ? DEMO_RETIRED : []) {
      const verdict = decideRetired(await hashOfFile(old.path), old.past, settled.has(old.to), old.path, old.to);
      if (verdict === "keep") kept.push(old.path);
      else if (verdict === "trash") {
        try {
          const res = await commands.deleteEntry(old.path);
          if (res.status === "ok") trashed++;
          else {
            failed.push(old.path);
            console.error(`import demo: ${old.path}: ${res.error.kind}: ${res.error.message}`);
          }
        } catch (e) {
          failed.push(old.path);
          console.error(`import demo: ${old.path}: ${String(e)}`);
        }
      }
    }
    void commands.logWrite("INFO", `import demo: ${createdCount} created, ${updated.length} updated, ${kept.length} kept, ${trashed} trashed, ${failed.length} failed`).catch(() => undefined);

    await afterFileChange();
    refreshLists();
    openNote(WELCOME[lang], false, true);
    const summary = t.demoVaultSummary(createdCount, updated.length, kept.length);
    const msg = `${t.demoVaultImported} (${trashed > 0 ? `${summary}; ${t.demoVaultTrashed(trashed)}` : summary})`;
    ui.status.textContent = msg;
    // The feedback of the person's own action: a toast, not a
    // notification — no kind, no line in the list (ADR 0084 item 1).
    flash("success", t.importDemoVault, msg);
    if (failed.length > 0) await tell(`${t.demoVaultFailed}\n${failed.join("\n")}`, t.demoVaultKeptOk);
    if (kept.length > 0) await tell(`${t.demoVaultKept}\n${kept.join("\n")}`, t.demoVaultKeptOk);
  } catch (err: unknown) {
    console.error("importDemoVault failed:", err);
    ui.status.textContent = "";
    fail(typeof err === "object" && err !== null && "message" in err ? (err as ContractError) : { kind: "failed", message: String(err) });
  }
}
