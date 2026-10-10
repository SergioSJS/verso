// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The server's administration, a section of the window's settings for an
// admin (ADR 0074 items 4 to 6 and 9; ADR 0075 items 3, 4 and 7): the
// server itself, the accounts with what each takes, the invitations with
// their state, the folders under the root, and the audit log. Entering a
// folder is a grant the admin gives themselves, in the log.

import { ApiError, api, type Account } from "./api";
import { auditTable, spaceText } from "./account";
import { act, block, button, choice, controls, el, input, said, snippet, toggle, type Entry, type Item } from "./form";
import { bytes, roleName, w, when } from "./strings";

function explain(e: unknown): string {
  return e instanceof ApiError ? e.said : w().failed;
}

type AccountRow = { account: Account; created: number; folders: number; space: number; password: boolean };
type Invitation = { id: string; state: string; email: string | null; folder: string | null; role: string | null; created: number; expires: number; used: number | null; usedBy: string | null };
type FolderRow = { id: string; name: string; owners: string[]; members: number; space: Parameters<typeof spaceText>[0] };
type ServerInfo = { version: string; newer: string | null; updateCheck: boolean; dataOnNetwork: string | null; foldersOnNetwork: string | null; publicUrl: string | null; tls: boolean; proxy: string | null };

function stateName(state: string): string {
  const s = w();
  return state === "used" ? s.stateUsed : state === "expired" ? s.stateExpired : state === "ended" ? s.stateEnded : s.statePending;
}

/** The administration's groups, for the settings. */
export function adminEntries(me: Account, item: Item): Entry[] {
  const s = w();
  return [
    { group: s.server, title: s.version, desc: s.updates, node: () => server(item) },
    { group: s.folders, title: s.folders, desc: s.unregistered, node: () => folders(me, item) },
    { group: s.accounts, title: s.accounts, desc: s.accountNew, node: () => accounts(me, item) },
    { group: s.invitations, title: s.invitations, desc: s.inviteDesc, node: () => invitations(item) },
    { group: s.audit, title: s.audit, desc: s.auditDesc, node: () => audit(item) },
  ];
}

function server(item: Item): HTMLElement {
  const s = w();
  return block(async (box) => {
    const info = await api<ServerInfo>("GET", "/api/admin/server");
    const update = el("span", { class: info.newer ? "setting-value web-warn" : "setting-value", role: "status" }, info.newer ? s.newerVersion(info.newer) : info.updateCheck ? s.upToDate : s.updateCheckOff);
    box.append(item(s.version, "", el("span", { class: "setting-value" }, info.version)), item(s.updates, "", update));
    if (info.dataOnNetwork) box.append(el("p", { class: "settings-hint web-warn", role: "alert" }, s.dataOnNetwork(info.dataOnNetwork)));
    if (info.foldersOnNetwork) box.append(item(s.storage, s.foldersOnNetwork(info.foldersOnNetwork), null));
  }, explain);
}

function accounts(me: Account, item: Item): HTMLElement {
  const s = w();
  const list = el("div");
  const line = said();
  const shown = el("div", { role: "status" });
  const draw = async () => {
    const all = await api<AccountRow[]>("GET", "/api/admin/accounts");
    list.replaceChildren(
      ...all.map((row) => {
        const a = row.account;
        const isAdmin = toggle(a.admin, s.adminShort);
        const mayCreate = toggle(a.mayCreate, s.createShort);
        isAdmin.input.disabled = a.id === me.id;
        const save = () =>
          void api("PATCH", `/api/admin/accounts/${a.id}`, { admin: isAdmin.input.checked, mayCreate: mayCreate.input.checked })
            .then(() => (line.textContent = s.saved))
            .catch((e: unknown) => {
              line.textContent = explain(e);
              void draw();
            });
        isAdmin.input.addEventListener("change", save);
        mayCreate.input.addEventListener("change", save);
        const reset = button(s.resetLink);
        reset.setAttribute("aria-label", `${s.resetLink}: ${a.email}`);
        act(reset, line, async () => {
          const r = await api<{ link: string }>("POST", `/api/admin/accounts/${a.id}/reset`, {});
          shown.replaceChildren(el("p", { class: "settings-hint" }, `${a.email} — ${s.resetLinkShown}`), snippet(r.link, s.copy, s.copied));
        }, explain);
        const remove = button(s.removeAccount, "danger");
        remove.setAttribute("aria-label", `${s.removeAccount}: ${a.email}`);
        remove.disabled = a.id === me.id;
        act(remove, line, async () => {
          if (!confirm(s.removeAccountAsk(a.email))) return;
          await api("DELETE", `/api/admin/accounts/${a.id}`);
          await draw();
        }, explain);
        return item(a.name, s.accountDetail(a.email, s.folderCount(row.folders), bytes(row.space)), controls(isAdmin.el, mayCreate.el, reset, remove));
      }),
    );
  };
  const email = input("email");
  const name = input("text");
  const lang = choice([["pt", "Português (Brasil)"], ["en", "English"]], "pt");
  const create = button(s.addAccount, "save");
  act(create, line, async () => {
    const r = await api<{ link: string }>("POST", "/api/admin/accounts", { email: email.value, name: name.value || email.value.split("@")[0], lang: lang.value });
    shown.replaceChildren(el("p", { class: "settings-hint" }, `${email.value} — ${s.resetLinkShown}`), snippet(r.link, s.copy, s.copied));
    email.value = "";
    name.value = "";
    await draw();
  }, explain);
  return block(async (box) => {
    box.append(
      list,
      line,
      shown,
      el("h4", { class: "web-subtitle" }, s.accountNew),
      item(s.email, s.accountNewDesc, email),
      item(s.name, "", name),
      item(s.language, "", lang),
      item("", "", controls(create)),
    );
    await draw();
  }, explain);
}

function invitations(item: Item): HTMLElement {
  const s = w();
  const list = el("div");
  const line = said();
  const shown = el("div", { role: "status" });
  const draw = async () => {
    const all = await api<Invitation[]>("GET", "/api/admin/invitations");
    list.replaceChildren(
      ...(all.length === 0
        ? [el("p", { class: "settings-hint" }, s.noInvitations)]
        : all.map((i) => {
            const title = i.email ?? "—";
            const where = i.folder ? ` · ${i.folder} (${roleName(i.role ?? "reader")})` : "";
            const desc = `${stateName(i.state)}${i.usedBy ? ` · ${s.usedBy(i.usedBy)}` : ""}${where} · ${when(i.created)} → ${when(i.expires)}`;
            const row = item(title, desc, null);
            row.classList.add("web-invitation");
            if (i.state !== "pending") return row;
            const end = button(s.endInvite);
            end.setAttribute("aria-label", `${s.endInvite}: ${title}`);
            act(end, line, async () => {
              await api("DELETE", `/api/admin/invitations/${i.id}`);
              await draw();
            }, explain);
            row.append(controls(end));
            return row;
          })),
    );
  };
  return block(async (box) => {
    const { folders } = await api<{ folders: FolderRow[] }>("GET", "/api/admin/folders");
    const email = input("email");
    const folder = choice([["", "—"], ...folders.map((f): [string, string] => [f.id, f.name])], "");
    const role = choice([["reader", s.roleReader], ["editor", s.roleEditor], ["owner", s.roleOwner]], "reader");
    const roleRow = item(s.inviteRole, "", role);
    roleRow.hidden = true;
    folder.addEventListener("change", () => {
      roleRow.hidden = folder.value === "";
    });
    const go = button(s.invite, "save");
    act(go, line, async () => {
      const r = await api<{ link: string; mailed: boolean }>("POST", "/api/admin/invitations", {
        email: email.value || null,
        folder: folder.value || null,
        role: folder.value ? role.value : null,
      });
      shown.replaceChildren(el("p", { class: "settings-hint" }, s.inviteLink), snippet(r.link, s.copy, s.copied));
      email.value = "";
      await draw();
    }, explain);
    box.append(
      el("h4", { class: "web-subtitle" }, s.inviteNew),
      el("p", { class: "settings-hint" }, s.inviteDesc),
      item(s.inviteEmailOptional, "", email),
      item(s.inviteFolderOptional, "", folder),
      roleRow,
      item("", "", controls(go)),
      line,
      shown,
      list,
    );
    await draw();
  }, explain);
}

function folders(me: Account, item: Item): HTMLElement {
  const s = w();
  const line = said();
  const box = el("div", { class: "web-block" });
  const draw = async () => {
    const r = await api<{ folders: FolderRow[]; unregistered: string[] }>("GET", "/api/admin/folders");
    const rows: HTMLElement[] = r.folders.map((f) => {
      const enter = button(s.enter);
      enter.setAttribute("aria-label", `${s.enter}: ${f.name}`);
      act(enter, line, async () => {
        if (!confirm(s.enterAsk)) return;
        await api("POST", `/api/admin/folders/${f.id}/enter`, { role: "editor" });
        location.href = `/?folder=${f.id}`;
      }, explain);
      return item(f.name, s.folderAdminDesc(f.owners.join(", ") || "—", f.members, spaceText(f.space)), controls(enter));
    });
    if (r.folders.length === 0 && r.unregistered.length === 0) rows.push(el("p", { class: "settings-hint" }, s.noFolders));
    if (r.unregistered.length) {
      rows.push(el("h4", { class: "web-subtitle" }, s.unregistered));
      for (const dir of r.unregistered) {
        const owner = input("email");
        owner.value = me.email;
        owner.setAttribute("aria-label", `${s.adoptOwner}: ${dir}`);
        const adopt = button(s.adopt, "save");
        adopt.setAttribute("aria-label", `${s.adopt}: ${dir}`);
        act(adopt, line, async () => {
          // Registered or not, the list says what the server has now.
          try {
            await api("POST", "/api/admin/folders/adopt", { name: dir, owner: owner.value });
          } finally {
            await draw();
          }
        }, explain);
        rows.push(item(dir, s.adoptDesc, controls(owner, adopt)));
      }
    }
    box.replaceChildren(...rows, line);
  };
  draw().catch((e: unknown) => box.append(el("p", { class: "settings-hint web-error", role: "alert" }, explain(e))));
  return box;
}

function audit(item: Item): HTMLElement {
  const s = w();
  const box = el("div", { class: "web-block" });
  const line = said();
  const show = button(s.show);
  act(show, line, async () => {
    const entries = await api<Parameters<typeof auditTable>[0]>("GET", "/api/admin/audit");
    show.hidden = true;
    box.append(auditTable(entries));
  }, explain);
  box.append(item(s.audit, s.auditDesc, controls(show)), line);
  return box;
}
