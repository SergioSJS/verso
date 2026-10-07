// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { commands, type ContractError } from "./bindings";
import { afterFileChange, refreshLists } from "./changes";
import { DEMO_VAULT_FILES } from "./demoVault";
import { ask, tell } from "./dialog";
import { showToast, ui } from "./dom";
import { fail } from "./errors";
import { b64ToUtf8 } from "./files";
import { currentFolder } from "./folder";
import { openNote } from "./layout/spaces";
import { openFolderBy } from "./open";
import { opening } from "./opening";
import { t } from "./strings";
import { openFolders } from "./tree/tree";

/** Whether the file at `path` holds exactly the demo's content. A note or
 *  a base is read through the contract, as text; any other file byte for
 *  byte through the file protocol. Unreadable counts as different: the
 *  file is kept either way, and then named. */
export async function sameAsDemo(path: string, b64: string): Promise<boolean> {
  try {
    if (path.endsWith(".md") || path.endsWith(".base")) {
      const r = await opening.readText(path);
      return r.status === "ok" && r.data.text === b64ToUtf8(b64);
    }
    const res = await fetch(convertFileSrc(path, "verso"));
    if (!res.ok) return false;
    const have = new Uint8Array(await res.arrayBuffer());
    const want = atob(b64);
    if (have.length !== want.length) return false;
    for (let i = 0; i < have.length; i++) if (have[i] !== want.charCodeAt(i)) return false;
    return true;
  } catch {
    return false;
  }
}
/** Populate the current vault with sample notes, bases, and templates. */
export async function importDemoVault(): Promise<void> {
  void commands.logWrite("INFO", "import demo: asked").catch(() => undefined);
  try {
    if (!currentFolder) {
      const picked = await openFolderBy(() => commands.pickFolder());
      if (!picked || !currentFolder) return;
    }
    const confirmed = await ask(t.importDemoVaultConfirm, { yes: t.importDemoVault, no: t.cancel });
    if (!confirmed) return void commands.logWrite("INFO", "import demo: declined").catch(() => undefined);

    ui.status.textContent = "…";

    // The demo's own folders, from its files' paths (a parent before its
    // children): a name written here once did not follow a rename of the
    // demo's folder, and a case-insensitive disk then put the files in it.
    const folders = [...new Set(DEMO_VAULT_FILES.flatMap((f) => f.path.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"))))];
    for (const f of folders) {
      openFolders.add(f);
      try {
        await commands.createFolder(f);
      } catch {
        // folder may already exist
      }
    }

    // A file already there is never written over: the same content is
    // left alone, any other — the user's edit, or an earlier version's
    // demo — is kept, and named. One that could not be written is named
    // too, and its reason goes to the log: an import that wrote nothing
    // said "imported" and left no trace (2026-10-01).
    void commands.logWrite("INFO", `import demo: ${DEMO_VAULT_FILES.length} files`).catch(() => undefined);
    let createdCount = 0;
    const kept: string[] = [];
    const failed: string[] = [];
    for (const [i, item] of DEMO_VAULT_FILES.entries()) {
      ui.status.textContent = `… ${i + 1}/${DEMO_VAULT_FILES.length}`;
      try {
        const res = await commands.createFile(item.path, item.b64);
        if (res.status === "ok") {
          createdCount++;
        } else if (res.error.kind === "exists") {
          if (!(await sameAsDemo(item.path, item.b64))) kept.push(item.path);
        } else {
          failed.push(item.path);
          console.error(`import demo: ${item.path}: ${res.error.kind}: ${res.error.message}`);
        }
      } catch (e) {
        failed.push(item.path);
        console.error(`import demo: ${item.path}: ${String(e)}`);
      }
    }
    void commands.logWrite("INFO", `import demo: ${createdCount} created, ${kept.length} kept, ${failed.length} failed`).catch(() => undefined);

    await afterFileChange();
    refreshLists();
    openNote("00 - Bem-vindo ao Verso.md", false, true);
    const msg = createdCount > 0 ? `${t.demoVaultImported} (${t.demoVaultNew(createdCount)})` : t.demoVaultImported;
    ui.status.textContent = msg;
    showToast(msg);
    if (failed.length > 0) await tell(`${t.demoVaultFailed}\n${failed.join("\n")}`, t.demoVaultKeptOk);
    if (kept.length > 0) await tell(`${t.demoVaultKept}\n${kept.join("\n")}`, t.demoVaultKeptOk);
  } catch (err: unknown) {
    console.error("importDemoVault failed:", err);
    ui.status.textContent = "";
    fail(typeof err === "object" && err !== null && "message" in err ? (err as ContractError) : { kind: "failed", message: String(err) });
  }
}
