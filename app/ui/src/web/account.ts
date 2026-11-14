// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The person's account, a section of the window's settings (ADR 0074
// items 3, 7, 8 and 9): the profile, the password, the passkeys, the
// sessions, the folders with their members, the access tokens, and the
// way out. Each group is drawn as the settings draw theirs.

import { ApiError, api, byApp, setSignedIn, type Account } from "./api";
import { act, block, button, choice, controls, el, input, said, snippet, toggle, type Entry, type Item } from "./form";
import { addPasskey, passkeysHere, passkeysOffered } from "./passkeys";
import { forgetSettings } from "./settingsSync";
import { bytes, roleName, w, when } from "./strings";

function explain(e: unknown): string {
  return e instanceof ApiError ? e.said : e instanceof Error && e.message ? e.message : w().failed;
}

type Session = { session: { id: string; kind: string; device: string; created: number; last_used: number; address: string }; current: boolean };
type Token = { id: string; name: string; write: boolean; expires: number | null; created: number; last_used: number | null; folders: string[] };
type Folder = { id: string; name: string; role: string; space: { total: number; notes: number; attachments: number; files: number; index: number } | null; owner?: { name: string; email: string } | null; share?: boolean; missing?: boolean };
type ByMe = { id: string; path: string; folder: string; folderName: string; people: { name: string; email: string; role: string }[]; missing: boolean };
type Member = { id: string; email: string; name: string; role: string };
type AuditEntry = { at: number; actor: string | null; action: string; subject: string | null; address: string | null; ok: boolean };
type Key = { id: string; name: string; created: number; last_used: number | null };

export function spaceText(space: Folder["space"]): string {
  const s = w();
  if (!space) return s.spaceUnknown;
  return `${bytes(space.total)} — ${s.spaceDetail(bytes(space.notes), bytes(space.attachments), space.files, bytes(space.index))}`;
}

const LANGS: [string, string][] = [["pt", "Português (Brasil)"], ["en", "English"]];

/** The account's groups, for the settings. */
export function accountEntries(me: Account, item: Item): Entry[] {
  const s = w();
  return [
    // An admin's way to the console, which is not part of Settings (ADR
    // 0077 item 1).
    ...(me.admin ? [{ group: s.admin, title: s.administer, desc: s.administerDesc, node: () => administer(item) }] : []),
    { group: s.profile, title: s.name, desc: `${s.email} ${s.language}`, node: () => profile(me, item) },
    { group: s.changePassword, title: s.password, desc: s.passwordHint, node: () => password(item) },
    { group: s.passkeys, title: s.passkeys, desc: s.passkeysLead, node: () => passkeys(item) },
    { group: s.sessions, title: s.sessions, desc: s.sessionsLead, node: () => sessions(item) },
    { group: s.folders, title: s.folders, desc: s.members, node: () => folders(me, item) },
    { group: s.tokens, title: s.tokens, desc: s.tokensLead, node: () => tokens(item) },
    { group: s.signOut, title: s.signOut, desc: me.email, node: () => signOut(me, item) },
  ];
}

function administer(item: Item): HTMLElement {
  const s = w();
  const open = el("a", { class: "save web-link-button", href: "/admin" }, s.administer);
  return el("div", { class: "web-block" }, item(s.administer, s.administerDesc, controls(open)));
}

function profile(me: Account, item: Item): HTMLElement {
  const s = w();
  const line = said();
  const name = input("text", { autocomplete: "name" });
  name.value = me.name;
  const lang = choice(LANGS, me.lang);
  const save = () => {
    line.classList.remove("web-error");
    api("PATCH", "/api/me", { name: name.value.trim() || me.name, lang: lang.value })
      .then(() => {
        me.name = name.value.trim() || me.name;
        me.lang = lang.value;
        setSignedIn(me);
        line.textContent = s.saved;
      })
      .catch((e: unknown) => {
        line.classList.add("web-error");
        line.textContent = explain(e);
      });
  };
  name.addEventListener("change", save);
  lang.addEventListener("change", save);
  const email = el("span", { class: "setting-value" }, me.email);
  return el("div", { class: "web-block" }, item(s.email, "", email), item(s.name, s.nameDesc, name), item(s.language, s.langDesc, lang), line);
}

function password(item: Item): HTMLElement {
  const s = w();
  const line = said();
  const current = input("password", { autocomplete: "current-password" });
  const next = input("password", { autocomplete: "new-password", minlength: "12" });
  // Checked by default: whoever took the old password may have made a
  // token (ADR 0083 item 4). Its row's title names it (aria-labelledby).
  const revoke = toggle(true);
  const go = button(s.changePassword, "save");
  act(
    go,
    line,
    async () => {
      const done = await api<{ tokensRevoked: number; tokensKept: number }>("POST", "/api/me/password", { current: current.value, new: next.value, revokeTokens: revoke.input.checked });
      current.value = "";
      next.value = "";
      line.textContent = revoke.input.checked ? s.tokensRevoked(done.tokensRevoked) : s.tokensKept(done.tokensKept);
    },
    explain,
  );
  return el("div", { class: "web-block" }, item(s.passwordCurrent, "", current), item(s.passwordNew, s.passwordHint, next), item(s.revokeTokens, s.revokeTokensDesc, revoke.el), item("", s.passwordChangeDesc, controls(go)), line);
}

function passkeys(item: Item): HTMLElement {
  const s = w();
  const list = el("div");
  const line = said();
  const draw = async () => {
    const keys = await api<Key[]>("GET", "/api/me/passkeys");
    list.replaceChildren(
      ...(keys.length === 0
        ? [el("p", { class: "settings-hint" }, s.passkeyNone)]
        : keys.map((k) => {
            const remove = button(s.leave, "danger");
            remove.setAttribute("aria-label", `${s.leave}: ${k.name}`);
            act(remove, line, async () => {
              await api("DELETE", `/api/me/passkeys/${k.id}`);
              await draw();
            }, explain);
            return item(k.name, `${when(k.created)}${k.last_used ? ` · ${s.lastUsed}: ${when(k.last_used)}` : ""}`, controls(remove));
          })),
    );
  };
  const name = input("text", { placeholder: s.passkeyName });
  name.setAttribute("aria-label", s.passkeyName);
  const add = button(s.passkeyAdd, "save");
  const here = passkeysHere();
  add.disabled = name.disabled = !here;
  act(add, line, async () => {
    await addPasskey(name.value);
    name.value = "";
    line.textContent = s.passkeyAdded;
    await draw();
  }, explain);
  return block(async (box) => {
    // A computer that serves (ADR 0117 D9): on its network the password,
    // through its link a passkey that lasts as long as the link's address.
    const lead = here ? s.passkeysLead : passkeysOffered() ? s.passkeyUnavailable : s.passkeyByLinkOnly;
    const quick = here && byApp() ? [el("p", { class: "settings-hint" }, s.passkeyQuickLink)] : [];
    box.append(el("p", { class: "settings-hint" }, lead), ...quick, list, item(s.passkeyAdd, s.passkeyName, controls(name, add)), line);
    await draw();
  }, explain);
}

function sessions(item: Item): HTMLElement {
  const s = w();
  const list = el("div");
  const line = said();
  const draw = async () => {
    const all = await api<Session[]>("GET", "/api/me/sessions");
    list.replaceChildren(
      ...all.map(({ session, current }) => {
        const end = button(s.end);
        act(end, line, async () => {
          await api("DELETE", `/api/me/sessions/${session.id}`);
          await draw();
        }, explain);
        const kind = session.kind === "device" ? s.device : s.browser;
        const title = `${session.device} · ${kind}${current ? ` · ${s.thisSession}` : ""}`;
        end.setAttribute("aria-label", `${s.end}: ${title}`);
        const row = item(title, `${s.lastUsed}: ${when(session.last_used)} · ${session.address}`, current ? null : controls(end));
        // The device's name as its app gave it, isolated: a name in another
        // direction does not carry into the words after it.
        row.querySelector(".setting-title")?.replaceChildren(el("bdi", {}, session.device), title.slice(session.device.length));
        return row;
      }),
    );
  };
  const others = button(s.endOthers);
  act(others, line, async () => {
    await api("DELETE", "/api/me/sessions/others");
    await draw();
  }, explain);
  return block(async (box) => {
    box.append(el("p", { class: "settings-hint" }, s.sessionsLead), list, item(s.endOthers, "", controls(others)), line);
    await draw();
  }, explain);
}

function folders(me: Account, item: Item): HTMLElement {
  const s = w();
  return block(async (box) => {
    const mine = await api<{ folders: Folder[]; byMe?: ByMe[] }>("GET", "/api/folders");
    if (mine.folders.length === 0) box.append(el("p", { class: "settings-hint" }, s.noFolders));
    // Shared with me, and shared by me (ADR 0081 item 5): regions with
    // their headings, after the person's own folders.
    const region = (id: string, title: string) => {
      const head = el("h3", { class: "web-subtitle", id }, title);
      const r = el("section", { role: "region", "aria-labelledby": id }, head);
      return r;
    };
    const theirs = mine.folders.filter((f) => f.owner);
    const shared = region("web-shared-with-me", s.sharedWithMe);
    if (theirs.length === 0) shared.append(el("p", { class: "settings-hint" }, s.noneSharedWithMe));
    for (const f of theirs) {
      shared.append(item(f.name, `${roleName(f.role)} · ${s.ofOwner(f.owner?.name ?? "?")}${f.missing ? ` · ${s.shareGone}` : ""}`, null));
    }
    const byMe = mine.byMe ?? [];
    const given = region("web-shared-by-me", s.sharedByMe);
    for (const b of byMe) {
      const people = b.people.map((p) => `${p.name} (${roleName(p.role)})`).join(", ");
      given.append(item(s.sharedPath(b.folderName, b.path), `${s.sharedPeople(people)}${b.missing ? ` · ${s.shareGone}` : ""}`, null));
    }
    for (const f of mine.folders.filter((x) => !x.owner)) {
      box.append(item(f.name, s.folderDesc(roleName(f.role), spaceText(f.space)), null));
      if (f.role !== "owner") continue;
      const open = el("details", { class: "web-members" }, el("summary", {}, s.membersOf(f.name)));
      let drawn = false;
      open.addEventListener("toggle", () => {
        if (!open.open || drawn) return;
        drawn = true;
        open.append(members(f.id, me.id, item));
      });
      box.append(open);
    }
    box.append(shared);
    if (byMe.length > 0) box.append(given);
  }, explain);
}

function members(folder: string, me: string, item: Item): HTMLElement {
  const s = w();
  const list = el("div");
  const line = said();
  const roles: [string, string][] = [["owner", s.roleOwner], ["editor", s.roleEditor], ["reader", s.roleReader]];
  const draw = async () => {
    const all = await api<Member[]>("GET", `/api/folders/${folder}/members`);
    list.replaceChildren(
      ...all.map((m) => {
        const role = choice(roles, m.role);
        role.setAttribute("aria-label", `${s.inviteRole}: ${m.name}`);
        role.disabled = m.id === me;
        role.addEventListener("change", () => {
          api("PUT", `/api/folders/${folder}/members/${m.id}`, { role: role.value })
            .then(() => (line.textContent = s.saved))
            .catch((e: unknown) => {
              line.textContent = explain(e);
              void draw();
            });
        });
        const remove = button(s.leave, "danger");
        remove.setAttribute("aria-label", `${s.leave}: ${m.name}`);
        remove.disabled = m.id === me;
        act(remove, line, async () => {
          await api("DELETE", `/api/folders/${folder}/members/${m.id}`);
          await draw();
        }, explain);
        return item(m.name, m.email, controls(role, remove));
      }),
    );
  };
  const email = input("email", { placeholder: s.email });
  email.setAttribute("aria-label", s.email);
  const role = choice([["reader", s.roleReader], ["editor", s.roleEditor], ["owner", s.roleOwner]], "reader");
  role.setAttribute("aria-label", s.inviteRole);
  const add = button(s.save, "save");
  act(add, line, async () => {
    await api("PUT", `/api/folders/${folder}/members/${encodeURIComponent(email.value)}`, { role: role.value });
    email.value = "";
    await draw();
  }, explain);
  const log = el("details", { class: "web-audit" }, el("summary", {}, s.audit));
  log.addEventListener("toggle", () => {
    if (!log.open || log.querySelector("table")) return;
    void api<AuditEntry[]>("GET", `/api/folders/${folder}/audit`).then((entries) => log.append(auditTable(entries)));
  });
  return block(async (box) => {
    box.append(list, item(s.addMember, s.memberAddDesc, controls(email, role, add)), line, log);
    await draw();
  }, explain);
}

function tokens(item: Item): HTMLElement {
  const s = w();
  const list = el("div");
  const line = said();
  const shown = el("div", { role: "status" });
  let folders: Folder[] = [];
  const draw = async () => {
    const all = await api<Token[]>("GET", "/api/me/tokens");
    list.replaceChildren(
      ...(all.length === 0
        ? [el("p", { class: "settings-hint" }, s.noTokens)]
        : all.map((t) => {
            const revoke = button(s.revoke, "danger");
            revoke.setAttribute("aria-label", `${s.revoke}: ${t.name}`);
            act(revoke, line, async () => {
              await api("DELETE", `/api/me/tokens/${t.id}`);
              await draw();
            }, explain);
            const names = t.folders.map((id) => folders.find((f) => f.id === id)?.name ?? id).join(", ");
            const desc = `${t.write ? s.tokenWrite : roleName("reader")} · ${t.expires ? when(t.expires) : s.tokenNever} · ${names}`;
            return item(t.name, desc, controls(revoke));
          })),
    );
  };
  return block(async (box) => {
    folders = (await api<{ folders: Folder[] }>("GET", "/api/folders")).folders;
    const name = input("text");
    const write = toggle(false);
    const days = choice([["30", s.tokenDays(30)], ["90", s.tokenDays(90)], ["365", s.tokenDays(365)], ["never", s.tokenNever]], "30");
    const neverWarn = el("p", { class: "settings-hint web-warn", hidden: "" }, s.tokenNeverWarn);
    days.addEventListener("change", () => {
      neverWarn.hidden = days.value !== "never";
    });
    const picks = folders.map((f) => ({ f, box: toggle(folders.length === 1, f.name) }));
    const create = button(s.tokenCreate, "save");
    act(create, line, async () => {
      const r = await api<{ secret: string }>("POST", "/api/me/tokens", {
        name: name.value,
        write: write.input.checked,
        days: days.value === "never" ? null : Number(days.value),
        folders: picks.filter((p) => p.box.input.checked).map((p) => p.f.id),
      });
      shown.replaceChildren(el("p", { class: "settings-hint" }, s.tokenShown), snippet(r.secret, s.copy, s.copied));
      name.value = "";
      await draw();
    }, explain);
    box.append(
      el("p", { class: "settings-hint" }, s.tokensLead),
      list,
      el("h4", { class: "web-subtitle" }, s.tokenNew),
      item(s.tokenName, s.tokenNewDesc, name),
      item(s.tokenWrite, "", write.el),
      item(s.tokenExpires, "", days),
      neverWarn,
      item(s.tokenFolders, "", controls(...picks.map((p) => p.box.el))),
      item("", "", controls(create)),
      line,
      shown,
    );
    await draw();
  }, explain);
}

function signOut(me: Account, item: Item): HTMLElement {
  const s = w();
  const line = said();
  const out = button(s.signOut);
  act(out, line, async () => {
    // What this device kept for use offline goes with the session (ADR 0092
    // item 6), after saying how many writes have not gone up.
    const { leave } = await import("./offline/leave");
    const left = await leave(async () => {
      await api("POST", "/api/signout", {});
      forgetSettings();
    });
    if (left) location.href = "/signin";
  }, explain);
  return el("div", { class: "web-block" }, item(s.signOut, s.signOutDesc(me.email), controls(out)), line);
}

export function auditTable(entries: AuditEntry[]): HTMLElement {
  const s = w();
  return el(
    "div",
    { class: "web-table-wrap" },
    el(
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
    ),
  );
}
