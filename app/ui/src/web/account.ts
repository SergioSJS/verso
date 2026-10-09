// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The person's own page (ADR 0074 items 3, 7, 8 and 9): the profile, the
// password, the sessions and the access tokens, and for each folder they
// own its members and what the audit log says about it.

import { ApiError, api, type Account } from "./api";
import { checkbox, copyable, el, field, form, page, select } from "./form";
import { bytes, roleName, setLang, w, when } from "./strings";

function explain(e: unknown): string {
  return e instanceof ApiError ? e.said : w().failed;
}

function section(title: string, ...children: Node[]): HTMLElement {
  return el("section", { class: "web-section" }, el("h2", {}, title), ...children);
}

type Session = { session: { id: string; kind: string; device: string; created: number; last_used: number; address: string }; current: boolean };
type Token = { id: string; name: string; write: boolean; expires: number | null; created: number; last_used: number | null; folders: string[] };
type Folder = { id: string; name: string; role: string; space: { total: number; notes: number; attachments: number; files: number; index: number } | null };
type Member = { id: string; email: string; name: string; role: string };
type AuditEntry = { at: number; actor: string | null; action: string; subject: string | null; address: string | null; ok: boolean };

export function spaceText(space: Folder["space"]): string {
  const s = w();
  if (!space) return s.spaceUnknown;
  return `${bytes(space.total)} — ${s.spaceDetail(bytes(space.notes), bytes(space.attachments), space.files, bytes(space.index))}`;
}

export async function accountPage(account: Account, admin: boolean): Promise<void> {
  setLang(account.lang);
  const s = w();
  const nav = el(
    "nav",
    { class: "web-nav" },
    el("a", { href: "/" }, s.backToNotes),
    admin ? el("a", { href: "/admin" }, s.admin) : null,
  );
  const root = page(s.account, nav);
  const card = root.querySelector(".web-card") ?? root;

  // Profile.
  const name = field(s.name, "text", { autocomplete: "name" });
  name.input.value = account.name;
  const lang = select(s.language, [["pt", "Português (Brasil)"], ["en", "English"]], account.lang);
  const profileSaved = el("p", { role: "status" });
  const profile = form(
    [name, lang],
    s.save,
    async () => {
      await api("PATCH", "/api/me", { name: name.input.value, lang: lang.input.value });
      profileSaved.textContent = s.saved;
    },
    explain,
  );
  card.append(section(s.profile, el("p", {}, account.email), profile.form, profileSaved));

  // Password.
  const current = field(s.passwordCurrent, "password", { autocomplete: "current-password" });
  const next = field(s.passwordNew, "password", { autocomplete: "new-password", minlength: "12" }, s.passwordHint);
  const pwSaved = el("p", { role: "status" });
  const pw = form(
    [current, next],
    s.changePassword,
    async () => {
      await api("POST", "/api/me/password", { current: current.input.value, new: next.input.value });
      current.input.value = "";
      next.input.value = "";
      pwSaved.textContent = s.saved;
    },
    explain,
  );
  card.append(section(s.changePassword, pw.form, pwSaved));

  // Sessions.
  const sessions = el("ul", { class: "web-list" });
  const drawSessions = async () => {
    const list = await api<Session[]>("GET", "/api/me/sessions");
    sessions.replaceChildren(
      ...list.map(({ session, current }) => {
        const end = el("button", { type: "button" }, s.end);
        end.disabled = current;
        end.addEventListener("click", () => void api("DELETE", `/api/me/sessions/${session.id}`).then(drawSessions));
        return el(
          "li",
          {},
          el("span", {}, `${session.device} · ${session.kind === "device" ? s.device : s.browser}${current ? ` · ${s.thisSession}` : ""}`),
          el("small", {}, `${s.lastUsed}: ${when(session.last_used)} · ${session.address}`),
          end,
        );
      }),
    );
  };
  const endOthers = el("button", { type: "button" }, s.endOthers);
  endOthers.addEventListener("click", () => void api("DELETE", "/api/me/sessions/others").then(drawSessions));
  card.append(section(s.sessions, el("p", {}, s.sessionsLead), sessions, endOthers));
  void drawSessions();

  // Folders: the person's own, with their members for an owner.
  const mine = await api<{ folders: Folder[] }>("GET", "/api/folders");
  const foldersBox = el("div");
  for (const f of mine.folders) {
    const box = el("div", { class: "web-folder-box" }, el("h3", {}, `${f.name} · ${roleName(f.role)}`), el("p", {}, spaceText(f.space)));
    if (f.role === "owner") box.append(await membersOf(f.id, account.id));
    foldersBox.append(box);
  }
  card.append(section(s.folders, foldersBox));

  // Tokens.
  const tokens = el("ul", { class: "web-list" });
  const shown = el("div", { role: "status" });
  const drawTokens = async () => {
    const list = await api<Token[]>("GET", "/api/me/tokens");
    tokens.replaceChildren(
      ...list.map((t) => {
        const revoke = el("button", { type: "button" }, s.revoke);
        revoke.addEventListener("click", () => void api("DELETE", `/api/me/tokens/${t.id}`).then(drawTokens));
        const names = t.folders.map((id) => mine.folders.find((f) => f.id === id)?.name ?? id).join(", ");
        return el(
          "li",
          {},
          el("span", {}, `${t.name} · ${t.write ? s.tokenWrite : roleName("reader")}`),
          el("small", { class: t.expires ? "" : "web-warn" }, `${t.expires ? when(t.expires) : s.tokenNever} · ${names}`),
          revoke,
        );
      }),
    );
  };
  const tName = field(s.tokenName, "text");
  const tWrite = checkbox(s.tokenWrite, false);
  const tDays = select(s.tokenExpires, [["30", s.tokenDays(30)], ["90", s.tokenDays(90)], ["365", s.tokenDays(365)], ["never", s.tokenNever]], "30");
  const neverWarn = el("small", { class: "web-warn", hidden: "" }, s.tokenNeverWarn);
  tDays.input.addEventListener("change", () => {
    neverWarn.hidden = tDays.input.value !== "never";
  });
  tDays.row.append(neverWarn);
  const picks = mine.folders.map((f) => ({ f, box: checkbox(f.name, mine.folders.length === 1) }));
  const fieldset = el("fieldset", { class: "web-fieldset" }, el("legend", {}, s.tokenFolders), ...picks.map((p) => p.box.row));
  const make = form(
    [tName, tWrite, tDays],
    s.tokenCreate,
    async () => {
      const folders = picks.filter((p) => (p.box.input as HTMLInputElement).checked).map((p) => p.f.id);
      const r = await api<{ secret: string }>("POST", "/api/me/tokens", {
        name: tName.input.value,
        write: (tWrite.input as HTMLInputElement).checked,
        days: tDays.input.value === "never" ? null : Number(tDays.input.value),
        folders,
      });
      shown.replaceChildren(el("p", {}, s.tokenShown), copyable(r.secret, s.copy, s.copied));
      tName.input.value = "";
      await drawTokens();
    },
    explain,
  );
  make.form.insertBefore(fieldset, make.error);
  card.append(section(s.tokens, el("p", {}, s.tokensLead), tokens, make.form, shown));
  void drawTokens();

  const out = el("button", { type: "button" }, s.signOut);
  out.addEventListener("click", () => void api("POST", "/api/signout", {}).then(() => (location.href = "/signin")));
  card.append(el("div", { class: "web-actions" }, out));
}

async function membersOf(folder: string, me: string): Promise<HTMLElement> {
  const s = w();
  const box = el("div", { class: "web-members" });
  const list = el("ul", { class: "web-list" });
  const draw = async () => {
    const members = await api<Member[]>("GET", `/api/folders/${folder}/members`);
    list.replaceChildren(
      ...members.map((m) => {
        const role = select(s.inviteRole, [["owner", s.roleOwner], ["editor", s.roleEditor], ["reader", s.roleReader]], m.role);
        role.input.addEventListener("change", () => {
          void api("PUT", `/api/folders/${folder}/members/${m.id}`, { role: role.input.value }).catch((e: unknown) => {
            alertIn(box, explain(e));
            void draw();
          });
        });
        const remove = el("button", { type: "button" }, s.leave);
        remove.disabled = m.id === me;
        remove.addEventListener("click", () => void api("DELETE", `/api/folders/${folder}/members/${m.id}`).then(draw).catch((e: unknown) => alertIn(box, explain(e))));
        return el("li", {}, el("span", {}, `${m.name} <${m.email}>`), role.row, remove);
      }),
    );
  };
  const email = field(s.addMember, "email");
  const role = select(s.inviteRole, [["reader", s.roleReader], ["editor", s.roleEditor], ["owner", s.roleOwner]], "reader");
  const add = form(
    [email, role],
    s.save,
    async () => {
      await api("PUT", `/api/folders/${folder}/members/${encodeURIComponent(email.input.value)}`, { role: role.input.value });
      email.input.value = "";
      await draw();
    },
    explain,
  );
  const log = el("details", {}, el("summary", {}, s.audit));
  log.addEventListener("toggle", () => {
    if (!log.open || log.querySelector("table")) return;
    void api<AuditEntry[]>("GET", `/api/folders/${folder}/audit`).then((entries) => log.append(auditTable(entries)));
  });
  box.append(el("h4", {}, s.members_), list, add.form, log);
  await draw();
  return box;
}

function alertIn(box: HTMLElement, text: string): void {
  box.querySelector(".web-error")?.remove();
  box.prepend(el("p", { class: "web-error", role: "alert" }, text));
}

export function auditTable(entries: AuditEntry[]): HTMLElement {
  const s = w();
  return el(
    "table",
    { class: "web-table" },
    el("thead", {}, el("tr", {}, el("th", {}, s.when), el("th", {}, s.who), el("th", {}, s.what))),
    el(
      "tbody",
      {},
      ...entries.map((e) =>
        el(
          "tr",
          { class: e.ok ? "" : "web-failed" },
          el("td", {}, when(e.at)),
          el("td", {}, `${e.actor ?? "—"}${e.address ? ` · ${e.address}` : ""}`),
          el("td", {}, `${e.action}${e.subject ? ` · ${e.subject}` : ""}`),
        ),
      ),
    ),
  );
}
