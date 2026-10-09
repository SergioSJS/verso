// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The admin page (ADR 0074 items 4 to 6 and 9; ADR 0075 items 3, 4 and 7):
// accounts with what each takes, invitations with their state, the folders
// under the root, the audit log and the server itself. Entering a folder
// is a grant the admin gives themselves, in the log.

import { ApiError, api, type Account } from "./api";
import { auditTable, spaceText } from "./account";
import { checkbox, copyable, el, field, form, page, select } from "./form";
import { bytes, roleName, setLang, w, when } from "./strings";

function explain(e: unknown): string {
  return e instanceof ApiError ? e.said : w().failed;
}

function section(title: string, ...children: Node[]): HTMLElement {
  return el("section", { class: "web-section" }, el("h2", {}, title), ...children);
}

type AccountRow = { account: Account; created: number; folders: number; space: number; password: boolean };
type Invitation = { id: string; state: string; email: string | null; folder: string | null; role: string | null; created: number; expires: number; used: number | null; usedBy: string | null };
type FolderRow = { id: string; name: string; owners: string[]; members: number; space: Parameters<typeof spaceText>[0] };
type ServerInfo = { version: string; newer: string | null; updateCheck: boolean; dataOnNetwork: string | null; foldersOnNetwork: string | null; publicUrl: string | null; tls: boolean; proxy: string | null };

function stateName(state: string): string {
  const s = w();
  return state === "used" ? s.stateUsed : state === "expired" ? s.stateExpired : state === "ended" ? s.stateEnded : s.statePending;
}

export async function adminPage(me: Account): Promise<void> {
  setLang(me.lang);
  const s = w();
  const root = page(s.admin, el("nav", { class: "web-nav" }, el("a", { href: "/" }, s.backToNotes), el("a", { href: "/account" }, s.account)));
  const card = root.querySelector(".web-card") ?? root;

  // The server.
  const info = await api<ServerInfo>("GET", "/api/admin/server");
  const serverBox = el("div");
  serverBox.append(el("p", {}, `${s.version} ${info.version}`));
  serverBox.append(el("p", { role: "status" }, info.newer ? s.newerVersion(info.newer) : info.updateCheck ? s.upToDate : s.updateCheckOff));
  if (info.dataOnNetwork) serverBox.append(el("p", { class: "web-warn", role: "alert" }, s.dataOnNetwork(info.dataOnNetwork)));
  if (info.foldersOnNetwork) serverBox.append(el("p", {}, s.foldersOnNetwork(info.foldersOnNetwork)));
  card.append(section(s.server, serverBox));

  // Accounts.
  const accounts = el("ul", { class: "web-list" });
  const shownLink = el("div", { role: "status" });
  const drawAccounts = async () => {
    const list = await api<AccountRow[]>("GET", "/api/admin/accounts");
    accounts.replaceChildren(
      ...list.map((row) => {
        const a = row.account;
        const isAdmin = checkbox(s.makeAdmin, a.admin);
        const mayCreate = checkbox(s.mayCreate, a.mayCreate);
        const save = () =>
          void api("PATCH", `/api/admin/accounts/${a.id}`, {
            admin: (isAdmin.input as HTMLInputElement).checked,
            mayCreate: (mayCreate.input as HTMLInputElement).checked,
          })
            .catch((e: unknown) => shownLink.replaceChildren(el("p", { class: "web-error", role: "alert" }, explain(e))))
            .finally(drawAccounts);
        isAdmin.input.addEventListener("change", save);
        mayCreate.input.addEventListener("change", save);
        const reset = el("button", { type: "button" }, s.resetLink);
        reset.addEventListener("click", () => {
          void api<{ link: string }>("POST", `/api/admin/accounts/${a.id}/reset`, {}).then((r) =>
            shownLink.replaceChildren(el("p", {}, `${a.email} — ${s.resetLinkShown}`), copyable(r.link, s.copy, s.copied)),
          );
        });
        const remove = el("button", { type: "button", class: "web-danger" }, s.removeAccount);
        remove.disabled = a.id === me.id;
        remove.addEventListener("click", () => {
          if (!confirm(s.removeAccountAsk(a.email))) return;
          void api("DELETE", `/api/admin/accounts/${a.id}`)
            .catch((e: unknown) => shownLink.replaceChildren(el("p", { class: "web-error", role: "alert" }, explain(e))))
            .finally(drawAccounts);
        });
        return el(
          "li",
          {},
          el("span", {}, `${a.name} <${a.email}>`),
          el("small", {}, `${s.folderCount(row.folders)} · ${bytes(row.space)} · ${when(row.created)}`),
          isAdmin.row,
          mayCreate.row,
          reset,
          remove,
        );
      }),
    );
  };
  const nEmail = field(s.email, "email");
  const nName = field(s.name, "text");
  const nLang = select(s.language, [["pt", "Português (Brasil)"], ["en", "English"]], "pt");
  const newAccount = form(
    [nEmail, nName, nLang],
    s.addAccount,
    async () => {
      const r = await api<{ link: string }>("POST", "/api/admin/accounts", { email: nEmail.input.value, name: nName.input.value || nEmail.input.value.split("@")[0], lang: nLang.input.value });
      shownLink.replaceChildren(el("p", {}, `${nEmail.input.value} — ${s.resetLinkShown}`), copyable(r.link, s.copy, s.copied));
      nEmail.input.value = "";
      nName.input.value = "";
      await drawAccounts();
    },
    explain,
  );
  card.append(section(s.accounts, accounts, shownLink, el("details", {}, el("summary", {}, s.addAccount), newAccount.form)));
  void drawAccounts();

  // Folders, needed by invitations too.
  const foldersBox = el("div");
  let folders: FolderRow[] = [];
  const drawFolders = async () => {
    const r = await api<{ folders: FolderRow[]; unregistered: string[] }>("GET", "/api/admin/folders");
    folders = r.folders;
    foldersBox.replaceChildren(
      el(
        "ul",
        { class: "web-list" },
        ...r.folders.map((f) => {
          const enter = el("button", { type: "button" }, s.enter);
          enter.addEventListener("click", () => {
            if (!confirm(s.enterAsk)) return;
            void api("POST", `/api/admin/folders/${f.id}/enter`, { role: "editor" }).then(() => (location.href = `/?folder=${f.id}`));
          });
          return el("li", {}, el("span", {}, f.name), el("small", {}, `${s.owners}: ${f.owners.join(", ")} · ${s.members}: ${f.members} · ${spaceText(f.space)}`), enter);
        }),
      ),
    );
    if (r.unregistered.length) {
      const owner = field(s.adoptOwner, "email");
      owner.input.value = me.email;
      const which = select(s.folders, r.unregistered.map((d) => [d, d]));
      const adopt = form(
        [which, owner],
        s.adopt,
        async () => {
          await api("POST", "/api/admin/folders/adopt", { name: which.input.value, owner: owner.input.value });
          await drawFolders();
        },
        explain,
      );
      foldersBox.append(el("h3", {}, s.unregistered), adopt.form);
    }
  };
  await drawFolders();
  card.append(section(s.folders, foldersBox));

  // Invitations.
  const invitations = el("ul", { class: "web-list" });
  const inviteLink = el("div", { role: "status" });
  const drawInvitations = async () => {
    const list = await api<Invitation[]>("GET", "/api/admin/invitations");
    invitations.replaceChildren(
      ...list.map((i) => {
        const end = el("button", { type: "button" }, s.endInvite);
        end.hidden = i.state !== "pending";
        end.addEventListener("click", () => void api("DELETE", `/api/admin/invitations/${i.id}`).then(drawInvitations));
        const what = [i.email ?? "—", i.folder ? `${i.folder} (${roleName(i.role ?? "reader")})` : ""].filter(Boolean).join(" · ");
        return el(
          "li",
          {},
          el("span", {}, what),
          el("small", {}, `${stateName(i.state)}${i.usedBy ? ` · ${s.usedBy(i.usedBy)}` : ""} · ${when(i.created)} → ${when(i.expires)}`),
          end,
        );
      }),
    );
  };
  const iEmail = field(s.inviteEmailOptional, "email");
  const iFolder = select(s.inviteFolderOptional, [["", "—"], ...folders.map((f): [string, string] => [f.id, f.name])], "");
  const iRole = select(s.inviteRole, [["reader", s.roleReader], ["editor", s.roleEditor], ["owner", s.roleOwner]], "reader");
  const invite = form(
    [iEmail, iFolder, iRole],
    s.invite,
    async () => {
      const r = await api<{ link: string }>("POST", "/api/admin/invitations", {
        email: iEmail.input.value || null,
        folder: iFolder.input.value || null,
        role: iFolder.input.value ? iRole.input.value : null,
      });
      inviteLink.replaceChildren(el("p", {}, s.inviteLink), copyable(r.link, s.copy, s.copied));
      iEmail.input.value = "";
      await drawInvitations();
    },
    explain,
  );
  card.append(section(s.invitations, invite.form, inviteLink, invitations));
  void drawInvitations();

  // The audit log.
  const log = el("details", {}, el("summary", {}, s.audit));
  log.addEventListener("toggle", () => {
    if (!log.open || log.querySelector("table")) return;
    void api<Parameters<typeof auditTable>[0]>("GET", "/api/admin/audit").then((entries) => log.append(auditTable(entries)));
  });
  card.append(section(s.audit, log));
}
