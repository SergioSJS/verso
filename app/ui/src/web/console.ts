// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The server's administration console (ADR 0077): a page of its own at
// /admin, not a section of the window's Settings, drawn with the window's
// pieces. A side navigation (a menu on a phone), a page per section, and
// an account's and a folder's own page, each at an address of its own.

import { ApiError, api, type Account } from "./api";
import { cw } from "./consoleStrings";
import { brand, button, controls, el, input, snippet, toggle } from "./form";
import { bytes, setLang, when } from "./strings";
import { table, type Page } from "./table";
import { icon } from "../icons";

type Ctx = { me: Account; go: (href: string) => void; title: (t: string) => void };

type AccountRow = { id: string; email: string; name: string; admin: boolean; mayCreate: boolean; created: number; password: boolean; folders: number; space: number; lastSeen: number | null };
type FolderRow = { id: string; name: string; created: number; owners: string[]; members: number; space: number; quota: number | null; changed: number | null };
type Invitation = { id: string; state: string; email: string | null; folder: string | null; role: string | null; created: number; expires: number; usedBy: string | null; madeBy: string | null };
type About = { kind: "account"; name: string; email: string } | { kind: "invitation"; email: string | null; folder: string | null } | { kind: "named"; name: string };
type AuditRow = { at: number; who: string | null; action: string; subject: string | null; about: About | null; folder: string | null; address: string | null; ok: boolean };
/** A change of a folder's files, with who made it: the account and, for a
 *  device's sync, the device (ADR 0079 item 4). */
type Change = { seq: number; at: number; path: string; deleted: boolean; renamedFrom: string | null; who: string | null; device: string | null };

type SessionRow = { id: string; kind: string; device: string; last_used: number; address: string };

/** A session of an account, as its page lists it. Exported for its test. */
export function sessionLine(x: SessionRow): HTMLElement {
  const s = cw();
  // The device's name as its app gave it, isolated: a name in another
  // direction does not carry into the words after it.
  return el("li", {}, el("bdi", {}, x.device), ` · ${x.kind === "device" ? s.device : s.browser} · ${s.lastSeen} ${when(x.last_used)} · ${x.address}`);
}

/** A change of a folder, as its page lists it. Exported for its test. */
export function changeLine(ch: Change): HTMLElement {
  const s = cw();
  const what = ` — ${s.changeWhat(ch.deleted, ch.renamedFrom, ch.path)}`;
  const who = `${when(ch.at)} · ${ch.who ?? s.onServerDisk}`;
  return ch.device ? el("li", {}, `${who} (`, el("bdi", {}, ch.device), `)${what}`) : el("li", {}, `${who}${what}`);
}
type Space = { total: number; notes: number; attachments: number; files: number; index: number } | null;

const SECTIONS = [
  ["", "overview", "grid"],
  ["accounts", "accounts", "user"],
  ["folders", "folders", "folder"],
  ["invitations", "invitations", "link"],
  ["audit", "audit", "list"],
  ["server", "server", "gear"],
] as const;

function explain(e: unknown): string {
  return e instanceof ApiError ? e.said : cw().failed;
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

function roleName(role: string | null): string {
  const s = cw();
  return role === "owner" ? s.roleOwner : role === "editor" ? s.roleEditor : role === "reader" ? s.roleReader : "—";
}

function stateName(state: string): string {
  const s = cw();
  return ({ pending: s.pending, used: s.used, expired: s.expired, ended: s.ended } as Record<string, string>)[state] ?? state;
}

function badge(text: string, kind = ""): HTMLElement {
  return el("span", { class: `console-badge ${kind}`.trim() }, text);
}

/** A labelled row of a console page: a title, a line, a control. */
function row(title: string, desc: string, control: Node | null): HTMLElement {
  return el("div", { class: "setting" }, el("div", { class: "setting-text" }, el("div", { class: "setting-title" }, title), el("div", { class: "setting-desc" }, desc)), control ?? el("span"));
}

function line(): HTMLElement {
  return el("p", { class: "settings-hint web-said", role: "status" });
}

/** Space against a quota, as a bar a screen reader reads as a value. */
function usage(space: number, quota: number | null): HTMLElement {
  const s = cw();
  if (quota === null) return el("span", {}, `${bytes(space)} · ${s.noQuota}`);
  const share = Math.min(100, Math.round((space / Math.max(1, quota)) * 100));
  const bar = el("span", { class: `console-bar ${share >= 90 ? "near" : ""}`.trim(), role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(share), "aria-label": s.of(bytes(space), bytes(quota)) }, el("span", { class: "console-bar-fill", style: `width:${share}%` }));
  return el("span", { class: "console-usage" }, bar, el("span", {}, s.of(bytes(space), bytes(quota))));
}

/* ---------- Overview ---------- */

async function overview(c: Ctx, body: HTMLElement): Promise<void> {
  const s = cw();
  c.title(s.overview);
  type Info = { version: string; newer: string | null; updateCheck: boolean; dataDir: string; foldersDir: string; dataOnNetwork: string | null; foldersOnNetwork: string | null; mail: boolean; tls: string; accounts: number; folders: number; space: number; trash?: { count: number; size: number }; history?: { count: number; size: number }; nearQuota: { id: string; name: string; space: number; quota: number }[]; twins: { id: string; name: string; count: number }[]; underAttack?: number; unwritable?: { dir: string; owner: string }[]; defaultQuota: number | null; auditDays?: number };
  const o = await api<Info>("GET", "/api/admin/overview");
  const card = (title: string, ...content: (Node | string)[]) => el("section", { class: "console-card" }, el("h2", {}, title), ...content);
  const attention: Node[] = [];
  if (o.newer) attention.push(el("li", {}, s.newer(o.newer)));
  // A directory the server cannot write (ADR 0075 item 3, amended 2026-10-16).
  for (const u of o.unwritable ?? []) attention.push(el("li", { class: "web-warn", "data-unwritable": "" }, s.unwritable(u.dir, u.owner)));
  if (o.dataOnNetwork) attention.push(el("li", { class: "web-warn" }, s.dataOnNetwork));
  const toFolder = (id: string, text: string): HTMLElement => {
    const a = el("a", { href: `/admin/folders/${id}` }, text);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      c.go(`/admin/folders/${id}`);
    });
    return el("li", {}, a);
  };
  for (const f of o.nearQuota) attention.push(toFolder(f.id, s.nearQuota(f.name, bytes(f.space), bytes(f.quota))));
  // A name in two files on the server's disk: one of them does not sync.
  for (const f of o.twins ?? []) attention.push(toFolder(f.id, s.twinsIn(f.name, f.count)));
  // Accounts told of 20 refused sign-ins within an hour (ADR 0083 item 2):
  // the audit log says which, and from where.
  if (o.underAttack) {
    const a = el("a", { href: "/admin/audit" }, s.underAttack(o.underAttack));
    a.addEventListener("click", (e) => {
      e.preventDefault();
      c.go("/admin/audit");
    });
    attention.push(el("li", { class: "web-warn", "data-under-attack": "" }, a));
  }
  const tls = ({ own: s.tlsOwn, proxy: s.tlsProxy, loopback: s.tlsLoopback } as Record<string, string>)[o.tls] ?? s.tlsNone;
  body.replaceChildren(
    el(
      "div",
      { class: "console-cards" },
      card(s.attention, attention.length ? el("ul", { class: "console-list" }, ...attention) : el("p", { class: "settings-hint" }, s.allGood)),
      card(s.totals, el("p", { class: "console-big" }, s.totalsLine(o.accounts, o.folders, bytes(o.space))), el("p", { class: "settings-hint" }, `${s.defaultQuota}: ${o.defaultQuota ? bytes(o.defaultQuota) : s.noQuota}`), el("p", { class: "settings-hint", "data-trash-total": "" }, s.trashTotal(o.trash?.count ?? 0, bytes(o.trash?.size ?? 0))), el("p", { class: "settings-hint", "data-history-total": "" }, s.historyTotal(o.history?.count ?? 0, bytes(o.history?.size ?? 0)))),
      card(s.version, el("p", { class: "console-big" }, o.version), el("p", { class: "settings-hint" }, o.newer ? s.newer(o.newer) : o.updateCheck ? s.upToDate : s.checkOff)),
      card(
        s.storage,
        el("p", {}, el("strong", {}, s.dataDir), el("br"), el("code", {}, o.dataDir), o.dataOnNetwork ? el("span", { class: "web-warn" }, ` — ${s.onNetwork(o.dataOnNetwork)}`) : ""),
        el("p", {}, el("strong", {}, s.foldersDir), el("br"), el("code", {}, o.foldersDir), o.foldersOnNetwork ? el("span", {}, ` — ${s.onNetwork(o.foldersOnNetwork)}`) : ""),
      ),
      card(s.mail, el("p", {}, o.mail ? s.mailOn : s.mailOff)),
      card(s.audit, el("p", { "data-audit-days": "" }, s.auditKept(o.auditDays ?? 365))),
      card(s.tls, el("p", {}, tls)),
    ),
  );
}

/* ---------- Accounts ---------- */

function accounts(c: Ctx, body: HTMLElement): void {
  const s = cw();
  c.title(s.accounts);
  const said = el("div", { role: "status" });
  const form = el("div", { class: "console-panel", hidden: "" });
  const email = input("email", { placeholder: s.email, "aria-label": s.email });
  const name = input("text", { placeholder: s.name, "aria-label": s.name });
  const lang = el("select", { "aria-label": s.language }, el("option", { value: "pt" }, "Português (Brasil)"), el("option", { value: "en" }, "English"));
  const make = button(s.create, "save");
  const cancel = button(s.cancel);
  const fail = line();
  form.append(el("h2", {}, s.newAccount), el("div", { class: "console-form-row" }, email, name, lang, make, cancel), fail);
  const t = table<AccountRow>({
    caption: s.accounts,
    search: s.searchAccounts,
    sort: "name",
    link: (r) => `/admin/accounts/${r.id}`,
    go: c.go,
    fetch: (a) => api<Page<AccountRow>>("GET", `/api/admin/accounts${qs({ q: a.q, sort: a.sort, desc: a.desc, offset: a.offset })}`),
    columns: [
      { key: "name", label: s.name, sort: "name", cell: (r) => el("span", {}, r.name, r.admin ? badge(s.admin, "seal") : "", r.mayCreate && !r.admin ? badge(s.mayCreate) : "") },
      { key: "email", label: s.email, sort: "email", cell: (r) => r.email },
      { key: "folders", label: s.folders, sort: "folders", numeric: true, cell: (r) => String(r.folders) },
      { key: "space", label: s.space, sort: "space", numeric: true, cell: (r) => bytes(r.space) },
      { key: "seen", label: s.lastSeen, sort: "seen", cell: (r) => (r.lastSeen ? when(r.lastSeen) : s.never) },
      { key: "created", label: s.created, sort: "created", cell: (r) => when(r.created) },
    ],
    tools: [(() => {
      const b = button(s.newAccount, "save");
      b.addEventListener("click", () => {
        form.hidden = false;
        email.focus();
      });
      return b;
    })()],
  });
  cancel.addEventListener("click", () => {
    form.hidden = true;
  });
  make.addEventListener("click", () => {
    fail.textContent = "";
    void api<{ link: string }>("POST", "/api/admin/accounts", { email: email.value, name: name.value || email.value.split("@")[0], lang: lang.value })
      .then((r) => {
        said.replaceChildren(el("p", { class: "settings-hint" }, s.linkFor(email.value)), snippet(r.link, s.copy, s.copied));
        email.value = "";
        name.value = "";
        form.hidden = true;
        return t.reload();
      })
      .catch((e: unknown) => {
        fail.textContent = explain(e);
      });
  });
  body.replaceChildren(form, said, t.el);
}

async function accountPage(c: Ctx, body: HTMLElement, id: string, note = ""): Promise<void> {
  const s = cw();
  type Detail = { account: Account; created: number; password: boolean; folders: { id: string; name: string; role: string; space: Space }[]; sessions: { id: string; kind: string; device: string; last_used: number; address: string }[]; tokens: { id: string; name: string; write: boolean; expires: number | null; folders: string[] }[] };
  const d = await api<Detail>("GET", `/api/admin/accounts/${id}`);
  const a = d.account;
  c.title(a.name);
  const said = line();
  const isAdmin = el("input", { type: "checkbox", "aria-label": s.makeAdmin });
  isAdmin.checked = a.admin;
  isAdmin.disabled = a.id === c.me.id;
  const mayCreate = el("input", { type: "checkbox", "aria-label": s.mayCreate });
  mayCreate.checked = a.mayCreate;
  const powers = () =>
    void api("PATCH", `/api/admin/accounts/${a.id}`, { admin: isAdmin.checked, mayCreate: mayCreate.checked })
      .then(() => (said.textContent = s.saved))
      .catch((e: unknown) => (said.textContent = explain(e)));
  isAdmin.addEventListener("change", powers);
  mayCreate.addEventListener("change", powers);
  const sw = (box: HTMLInputElement) => el("label", { class: "switch" }, box, el("span", { class: "switch-track" }));
  const shown = el("div", { role: "status" });
  const reset = button(s.resetLink);
  reset.addEventListener("click", () => {
    void api<{ link: string }>("POST", `/api/admin/accounts/${a.id}/reset`, {})
      .then((r) => shown.replaceChildren(el("p", { class: "settings-hint" }, s.linkFor(a.email)), snippet(r.link, s.copy, s.copied)))
      .catch((e: unknown) => (said.textContent = explain(e)));
  });
  const remove = button(s.remove, "danger");
  remove.disabled = a.id === c.me.id;
  remove.addEventListener("click", () => {
    if (!confirm(s.removeAsk(a.email))) return;
    void api("DELETE", `/api/admin/accounts/${a.id}`)
      .then(() => c.go("/admin/accounts"))
      .catch((e: unknown) => (said.textContent = explain(e)));
  });
  // Every session and token of the account, ended at once (ADR 0077 item
  // 3, decided 2026-10-11); the page drawn again says what went.
  const endAll = button(s.endSessions, "danger");
  endAll.disabled = a.id === c.me.id || (d.sessions.length === 0 && d.tokens.length === 0);
  endAll.addEventListener("click", () => {
    if (!confirm(s.endSessionsAsk(a.email))) return;
    void api<{ sessions: number; tokens: number }>("DELETE", `/api/admin/accounts/${a.id}/sessions`)
      .then((r) => accountPage(c, body, id, s.sessionsEnded(r.sessions, r.tokens)))
      .catch((e: unknown) => (said.textContent = explain(e)));
  });
  said.textContent = note;
  const list = (items: Node[]) => (items.length ? el("ul", { class: "console-list" }, ...items) : el("p", { class: "settings-hint" }, s.none));
  body.replaceChildren(
    el("p", { class: "console-sub" }, a.email, " · ", `${s.created} ${when(d.created)}`),
    row(s.makeAdmin, s.makeAdminDesc, sw(isAdmin)),
    row(s.mayCreate, s.mayCreateDesc, sw(mayCreate)),
    row(s.resetLink, s.resetLinkDesc, controls(reset)),
    shown,
    row(s.endSessions, s.endSessionsDesc, controls(endAll)),
    row(s.remove, s.removeDesc, controls(remove)),
    said,
    el("h2", { class: "settings-subheading" }, s.itsFolders),
    list(d.folders.map((f) => el("li", {}, el("a", { href: `/admin/folders/${f.id}` }, f.name), ` · ${roleName(f.role)} · ${bytes(f.space?.total ?? 0)}`))),
    el("h2", { class: "settings-subheading" }, s.sessions),
    list(d.sessions.map(sessionLine)),
    el("h2", { class: "settings-subheading" }, s.tokens),
    list(d.tokens.map((x) => el("li", {}, `${x.name} · ${x.write ? s.write : s.read} · ${x.folders.length} ${s.folders.toLowerCase()} · ${x.expires ? `${s.expires} ${when(x.expires)}` : s.never}`))),
  );
  for (const link of body.querySelectorAll<HTMLAnchorElement>("a[href^='/admin/']")) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      c.go(link.getAttribute("href") ?? "/admin");
    });
  }
}

/* ---------- Folders ---------- */

function folders(c: Ctx, body: HTMLElement): void {
  const s = cw();
  c.title(s.folders);
  const loose = el("div");
  const t = table<FolderRow>({
    caption: s.folders,
    search: s.searchFolders,
    sort: "name",
    link: (r) => `/admin/folders/${r.id}`,
    go: c.go,
    fetch: (a) => api<Page<FolderRow>>("GET", `/api/admin/folders${qs({ q: a.q, sort: a.sort, desc: a.desc, offset: a.offset })}`),
    columns: [
      { key: "name", label: s.name, sort: "name", cell: (r) => r.name },
      { key: "owners", label: s.owners, cell: (r) => r.owners.join(", ") || "—" },
      { key: "members", label: s.members, sort: "members", numeric: true, cell: (r) => String(r.members) },
      { key: "space", label: s.space, sort: "space", cell: (r) => usage(r.space, r.quota) },
      { key: "changed", label: s.changed, sort: "changed", cell: (r) => (r.changed ? when(r.changed) : "—") },
    ],
  });
  const drawLoose = async () => {
    const dirs = await api<string[]>("GET", "/api/admin/folders/unregistered");
    if (!dirs.length) {
      loose.replaceChildren();
      return;
    }
    const said = line();
    loose.replaceChildren(
      el("section", { class: "console-panel" }, el("h2", {}, s.unregistered), el("p", { class: "settings-hint" }, s.unregisteredDesc),
        ...dirs.map((dir) => {
          const owner = input("email", { "aria-label": `${s.owner}: ${dir}` });
          owner.value = c.me.email;
          const go = button(s.register, "save");
          go.setAttribute("aria-label", `${s.register}: ${dir}`);
          go.addEventListener("click", () => {
            void api("POST", "/api/admin/folders/adopt", { name: dir, owner: owner.value })
              .catch((e: unknown) => (said.textContent = explain(e)))
              .finally(() => {
                void drawLoose();
                void t.reload();
              });
          });
          return row(dir, s.owner, controls(owner, go));
        }), said),
    );
  };
  void drawLoose();
  body.replaceChildren(loose, t.el);
}

async function folderPage(c: Ctx, body: HTMLElement, id: string): Promise<void> {
  const s = cw();
  type Trash = { count: number; size: number; days: number; adminDays: number | null; ownerDays: number | null; defaultDays: number; ceiling: number; early: boolean };
  type Hist = { count: number; size: number; days: number; adminDays: number | null; defaultDays: number; early: boolean };
  type Detail = { id: string; name: string; created: number; trash?: Trash; history?: Hist; members: { id: string; name: string; email: string; role: string }[]; shares?: { id: string; path: string; attachments: string | null; people: { name: string; email: string; role: string }[] }[]; space: Space; quota: number | null; twins?: { kept: string; held: string }[]; tooLarge?: { path: string; size: number }[]; changes?: Change[] };
  const f = await api<Detail>("GET", `/api/admin/folders/${id}`);
  c.title(f.name);
  const said = line();
  const used = f.space?.total ?? 0;
  const meter = el("div", {}, usage(used, f.quota));
  const size = input("text", { placeholder: s.quotaPlaceholder, "aria-label": s.quotaTitle });
  if (f.quota) size.value = bytes(f.quota).replace(/\s/g, "");
  const setQ = (value: string | null) =>
    void api<{ quota: number | null }>("PUT", `/api/admin/folders/${f.id}/quota`, { quota: value })
      .then((r) => {
        said.textContent = s.saved;
        meter.replaceChildren(usage(used, r.quota));
        size.value = r.quota ? bytes(r.quota).replace(/\s/g, "") : "";
      })
      .catch((e: unknown) => (said.textContent = explain(e)));
  const set = button(s.setQuota, "save");
  set.addEventListener("click", () => setQ(size.value));
  const clear = button(s.clearQuota);
  clear.addEventListener("click", () => setQ(null));
  const enter = button(s.enter);
  enter.addEventListener("click", () => {
    if (!confirm(s.enterAsk)) return;
    void api("POST", `/api/admin/folders/${f.id}/enter`, { role: "editor" })
      .then(() => (location.href = `/?folder=${f.id}`))
      .catch((e: unknown) => (said.textContent = explain(e)));
  });
  // The folder's trash (ADR 0080 items 3, 4 and 8): shown, not counted;
  // its days set here, where only an admin lengthens them; emptied after
  // asking in the page.
  const trashSaid = el("p", { class: "settings-hint", "data-trash": "" });
  const trashAsk = el("div", { class: "trash-ask", hidden: "" });
  const days = input("number", { min: "0", max: "36500", placeholder: "", "aria-label": s.trashDays });
  const paintTrash = (tr: Trash) => {
    trashSaid.textContent = [s.trashLine(tr.count, bytes(tr.size)), s.trashKept(tr.days), tr.ownerDays !== null && tr.ownerDays === tr.days ? s.trashOwner(tr.days) : "", tr.early ? s.trashEarly : ""].filter(Boolean).join(" ");
    days.value = tr.adminDays === null ? "" : String(tr.adminDays);
    days.placeholder = s.trashDefault(tr.defaultDays);
    emptyB.disabled = tr.count === 0;
  };
  const setDays = (value: number | null) =>
    void api<Trash>("PUT", `/api/admin/folders/${f.id}/trash`, { days: value })
      .then((r) => {
        said.textContent = s.saved;
        paintTrash(r);
      })
      .catch((e: unknown) => (said.textContent = explain(e)));
  const setD = button(s.setTrashDays, "save");
  setD.addEventListener("click", () => setDays(days.value.trim() === "" ? null : Math.max(0, Math.floor(Number(days.value)))));
  const defD = button(s.defaultTrashDays);
  defD.addEventListener("click", () => setDays(null));
  const emptyB = button(s.emptyTrash, "danger");
  emptyB.addEventListener("click", () => {
    const tr = f.trash;
    const yes = button(s.emptyTrashYes, "danger");
    const no = button(s.cancel);
    const close = () => {
      trashAsk.hidden = true;
      trashAsk.replaceChildren();
      emptyB.focus();
    };
    no.addEventListener("click", close);
    yes.addEventListener("click", () => {
      close();
      void api<Trash>("POST", `/api/admin/folders/${f.id}/trash/empty`, {})
        .then((r) => {
          f.trash = r;
          said.textContent = s.saved;
          paintTrash(r);
        })
        .catch((e: unknown) => (said.textContent = explain(e)));
    });
    trashAsk.replaceChildren(el("p", {}, s.emptyTrashAsk(tr?.count ?? 0, bytes(tr?.size ?? 0))), yes, no);
    trashAsk.hidden = false;
    no.focus();
  });
  if (f.trash) paintTrash(f.trash);
  // The folder's version history (ADR 0091 items 3 and 7): shown, not
  // counted; its days set here, as the trash's.
  const histSaid = el("p", { class: "settings-hint", "data-history": "" });
  const histDays = input("number", { min: "0", max: "36500", placeholder: "", "aria-label": s.historyDays });
  const paintHist = (hi: Hist) => {
    histSaid.textContent = [s.historyLine(hi.count, bytes(hi.size)), s.historyKept(hi.days), hi.early ? s.historyEarly : ""].filter(Boolean).join(" ");
    histDays.value = hi.adminDays === null ? "" : String(hi.adminDays);
    histDays.placeholder = s.historyDefault(hi.defaultDays);
  };
  const setHist = (value: number | null) =>
    void api<Hist>("PUT", `/api/admin/folders/${f.id}/history`, { days: value })
      .then((r) => {
        said.textContent = s.saved;
        paintHist(r);
      })
      .catch((e: unknown) => (said.textContent = explain(e)));
  const setH = button(s.setTrashDays, "save");
  setH.addEventListener("click", () => setHist(histDays.value.trim() === "" ? null : Math.max(0, Math.floor(Number(histDays.value)))));
  const defH = button(s.defaultTrashDays);
  defH.addEventListener("click", () => setHist(null));
  if (f.history) paintHist(f.history);
  const sp = f.space;
  body.replaceChildren(
    el("p", { class: "console-sub" }, `${s.created} ${when(f.created)}`),
    row(s.space, sp ? s.spaceDetail(bytes(sp.notes), bytes(sp.attachments), sp.files, bytes(sp.index)) : "—", meter),
    row(s.quotaTitle, s.quotaDesc, controls(size, set, clear)),
    row(s.trashTitle, "", trashSaid),
    row(s.trashDays, s.trashDaysDesc, controls(days, setD, defD)),
    row(s.emptyTrash, "", controls(emptyB)),
    trashAsk,
    row(s.historyTitle, "", histSaid),
    row(s.historyDays, s.historyDaysDesc, controls(histDays, setH, defH)),
    row(s.enter, s.enterDesc, controls(enter)),
    said,
    // Files its last walk held: another's name in another form.
    ...(f.twins?.length ? [el("h2", { class: "settings-subheading" }, s.attention), el("ul", { class: "console-list", "data-twins": "" }, ...f.twins.map((tw) => el("li", { class: "web-warn" }, s.twin(tw.kept, tw.held))))] : []),
    // Files sync leaves out for their size (above 1 GiB), as the server's
    // last walk found them.
    ...(f.tooLarge?.length
      ? [
          el("h2", { class: "settings-subheading" }, s.tooLarge),
          el("p", { class: "settings-hint" }, s.tooLargeDesc),
          el("ul", { class: "console-list", "data-too-large": "" }, ...f.tooLarge.map((t) => el("li", {}, `${t.path} · ${bytes(t.size)}`))),
        ]
      : []),
    el("h2", { class: "settings-subheading" }, s.members),
    f.members.length ? el("ul", { class: "console-list" }, ...f.members.map((m) => el("li", {}, `${m.name} · ${m.email} · ${roleName(m.role)}`))) : el("p", { class: "settings-hint" }, s.none),
    // Its shares by path, with their people (ADR 0081 item 7).
    el("h2", { class: "settings-subheading" }, s.shares),
    f.shares?.length
      ? el("ul", { class: "console-list" }, ...f.shares.map((sh) => el("li", {}, `${sh.path}${sh.attachments ? ` (+ ${sh.attachments})` : ""} — ${sh.people.map((p) => `${p.name} · ${roleName(p.role)}`).join(", ")}`)))
      : el("p", { class: "settings-hint" }, s.none),
    el("h2", { class: "settings-subheading" }, s.latestChanges),
    f.changes?.length
      ? el("ul", { class: "console-list", "data-changes": "" }, ...f.changes.map(changeLine))
      : el("p", { class: "settings-hint" }, s.none),
    el("h2", { class: "settings-subheading" }, s.folderAudit),
    auditTable(c, { folder: f.id }).el,
  );
}

/* ---------- Invitations ---------- */

async function invitations(c: Ctx, body: HTMLElement): Promise<void> {
  const s = cw();
  c.title(s.invitations);
  const all = await api<Page<FolderRow>>("GET", "/api/admin/folders?limit=200&sort=name");
  const said = el("div", { role: "status" });
  const fail = line();
  const email = input("email", { "aria-label": s.inviteEmail, placeholder: s.inviteEmail });
  // Each choice under its own visible name: the empty folder is a choice
  // of its own, "none", not a label inside the list.
  const folder = el("select", {}, el("option", { value: "" }, s.noFolderChoice), ...all.rows.map((f) => el("option", { value: f.id }, f.name)));
  const role = el("select", {}, el("option", { value: "reader" }, s.roleReader), el("option", { value: "editor" }, s.roleEditor), el("option", { value: "owner" }, s.roleOwner));
  const labelled = (text: string, control: HTMLElement) => el("label", { class: "console-field" }, el("span", {}, text), control);
  role.disabled = true;
  folder.addEventListener("change", () => {
    role.disabled = folder.value === "";
  });
  const go = button(s.invite, "save");
  let state = "";
  const filter = el("select", { "aria-label": s.state }, ...[["", s.all], ["pending", s.pending], ["used", s.used], ["expired", s.expired], ["ended", s.ended]].map(([v, l]) => el("option", { value: v ?? "" }, l ?? "")));
  const t = table<Invitation>({
    caption: s.invitations,
    search: s.searchInvitations,
    fetch: (a) => api<Page<Invitation>>("GET", `/api/admin/invitations${qs({ q: a.q, offset: a.offset, state })}`),
    tools: [filter],
    columns: [
      { key: "email", label: s.email, cell: (r) => r.email ?? "—" },
      { key: "folder", label: s.inviteFolder.replace(/ \(.*\)/, ""), cell: (r) => (r.folder ? `${r.folder} (${roleName(r.role)})` : "—") },
      { key: "state", label: s.state, cell: (r) => badge(stateName(r.state), r.state === "pending" ? "seal" : "") },
      { key: "created", label: s.created, cell: (r) => when(r.created) },
      { key: "expires", label: s.expiresColumn, cell: (r) => when(r.expires) },
      { key: "usedBy", label: s.usedBy, cell: (r) => r.usedBy ?? "—" },
      // The admin's, or a game master's (ADR 0117 D7 (e)).
      { key: "madeBy", label: s.madeBy, cell: (r) => r.madeBy ?? "—" },
      {
        key: "end",
        label: "",
        cell: (r) => {
          if (r.state !== "pending") return "";
          const b = button(s.end);
          b.setAttribute("aria-label", `${s.end}: ${r.email ?? r.id}`);
          b.addEventListener("click", () => void api("DELETE", `/api/admin/invitations/${r.id}`).then(() => t.reload()));
          return b;
        },
      },
    ],
  });
  filter.addEventListener("change", () => {
    state = filter.value;
    void t.reload();
  });
  go.addEventListener("click", () => {
    fail.textContent = "";
    void api<{ link: string }>("POST", "/api/admin/invitations", { email: email.value || null, folder: folder.value || null, role: folder.value ? role.value : null })
      .then((r) => {
        said.replaceChildren(el("p", { class: "settings-hint" }, s.inviteLink), snippet(r.link, s.copy, s.copied));
        email.value = "";
        return t.reload();
      })
      .catch((e: unknown) => (fail.textContent = explain(e)));
  });
  body.replaceChildren(el("section", { class: "console-panel" }, el("h2", {}, s.newInvitation), el("div", { class: "console-form-row" }, email, labelled(s.inviteFolder, folder), labelled(s.inviteRole, role), go), fail, said), t.el);
}

/* ---------- Audit ---------- */

/** The actions whose subject is a name, never an id. */
const SUBJECT_IS_WORDS = new Set(["device_approved", "device_renamed", "folder_created", "sign_in", "account_deleted"]);

/** An action of the log in words; an action this console does not know
 *  yet (a newer server's) by its code. */
export function actionWords(code: string): string {
  const s = cw();
  const powers = /^powers_admin_(true|false)_create_(true|false)$/.exec(code);
  if (powers) return s.powers(powers[1] === "true", powers[2] === "true");
  return s.actions[code] ?? code;
}

/** Who or what a line is about, for a person: an account by its name and
 *  e-mail, an invitation by whom it was for, a quota as a size; an id
 *  whose thing is gone, said so. The raw subject is the cell's title. */
function subjectCell(r: AuditRow): Node | string {
  const s = cw();
  const raw = r.subject ?? "";
  const a = r.about;
  let shown: Node | string;
  if (a?.kind === "account") shown = el("span", {}, a.name, el("span", { class: "console-muted" }, ` · ${a.email}`));
  else if (a?.kind === "invitation") shown = el("span", {}, a.email ? s.invitationFor(a.email) : s.invitationOpen, a.folder ? el("span", { class: "console-muted" }, ` · ${a.folder}`) : "");
  else if (a?.kind === "named") shown = a.name;
  else if (!raw) return "";
  else if (r.action === "trash_days") shown = raw === "default" ? s.defaultTrashDays : raw === "0" ? s.trashKept(0) : s.trashKept(Number(raw));
  else if (r.action === "history_days") shown = raw === "default" ? s.defaultTrashDays : s.historyKept(Number(raw));
  else if (r.action === "folder_quota") shown = raw === "none" ? s.noQuota : /^\d+$/.test(raw) ? bytes(Number(raw)) : raw;
  else if (r.action === "sessions_ended" && /^\d+$/.test(raw)) shown = s.sessionsCount(Number(raw));
  // An id the server no longer knows (a session ended, a token revoked,
  // an account removed): not a word to read. A subject that is words
  // already (a device's name, a folder's, an e-mail) is shown as it is.
  else if (!SUBJECT_IS_WORDS.has(r.action) && /^[A-Za-z0-9_-]{16,}$/.test(raw)) shown = el("span", { class: "console-muted" }, s.goneSubject);
  else shown = raw;
  return el("span", { title: raw }, shown);
}

function auditTable(c: Ctx, fixed: { folder?: string }, filters?: () => Record<string, string>): ReturnType<typeof table<AuditRow>> {
  const s = cw();
  void c;
  return table<AuditRow>({
    caption: s.audit,
    fetch: (a) => api<Page<AuditRow>>("GET", `/api/admin/audit${qs({ offset: a.offset, ...fixed, ...(filters ? filters() : {}) })}`),
    columns: [
      { key: "at", label: s.when, cell: (r) => when(r.at) },
      { key: "who", label: s.who, cell: (r) => r.who ?? "—" },
      { key: "what", label: s.what, cell: (r) => el("span", { title: r.action, "data-action": r.action }, actionWords(r.action), r.ok ? "" : badge(s.failedRow, "seal")) },
      { key: "subject", label: s.subject, cell: subjectCell },
      // A folder's own log is all of that folder: no column to repeat it.
      ...(fixed.folder ? [] : [{ key: "folder", label: s.folderPage, cell: (r: AuditRow) => r.folder ?? "" }]),
      { key: "address", label: s.address, cell: (r) => r.address ?? "" },
    ],
  });
}

async function audit(c: Ctx, body: HTMLElement): Promise<void> {
  const s = cw();
  c.title(s.audit);
  const actions = await api<string[]>("GET", "/api/admin/audit/actions");
  const who = input("text", { "aria-label": s.person, placeholder: s.person });
  const named = actions.map((a) => [a, actionWords(a)] as const).sort(([, x], [, y]) => x.localeCompare(y));
  const action = el("select", { "aria-label": s.action }, el("option", { value: "" }, s.anyAction), ...named.map(([a, words]) => el("option", { value: a, title: a }, words)));
  const from = input("date", { "aria-label": s.from });
  const to = input("date", { "aria-label": s.to });
  const day = (v: string, end: boolean) => (v ? String(Math.floor(new Date(`${v}T${end ? "23:59:59" : "00:00:00"}`).getTime() / 1000)) : "");
  const values = () => ({ actor: who.value.trim(), action: action.value, from: day(from.value, false), to: day(to.value, true) });
  const t = auditTable(c, {}, values);
  const apply = button(s.filter, "save");
  apply.addEventListener("click", () => void t.reload());
  const csv = el("a", { class: "ghost web-ghost console-link-button", href: "/api/admin/audit?format=csv", download: "audit.csv" }, s.exportCsv);
  const refreshCsv = () => csv.setAttribute("href", `/api/admin/audit${qs({ format: "csv", ...values() })}`);
  for (const f of [who, action, from, to]) f.addEventListener("change", refreshCsv);
  body.replaceChildren(el("div", { class: "console-panel" }, el("div", { class: "console-form-row" }, who, action, from, to, apply, csv)), t.el);
}

/* ---------- Server ---------- */

/** The switch of read links (ADR 0105 item 3): off on a new server; off
 *  again ends every link at once, open pages included. */
async function readLinksSwitch(): Promise<HTMLElement> {
  const s = cw();
  const now = await api<{ enabled: boolean }>("GET", "/api/admin/read-links");
  const sw = toggle(now.enabled, s.readLinks);
  const line = el("p", { class: "settings-hint web-said", role: "status" });
  line.textContent = now.enabled ? s.readLinksOn : s.readLinksOff;
  sw.input.addEventListener("change", () => {
    const want = sw.input.checked;
    sw.input.disabled = true;
    api<{ enabled: boolean }>("PUT", "/api/admin/read-links", { enabled: want })
      .then((r) => {
        sw.input.checked = r.enabled;
        line.classList.remove("web-error");
        line.textContent = r.enabled ? s.readLinksOn : s.readLinksOff;
      })
      .catch((e: unknown) => {
        sw.input.checked = !want;
        line.classList.add("web-error");
        line.textContent = explain(e);
      })
      .finally(() => {
        sw.input.disabled = false;
      });
  });
  return el("section", { class: "console-panel", "aria-labelledby": "read-links-title" }, el("h2", { id: "read-links-title", class: "console-sub" }, s.readLinks), el("p", { class: "settings-hint" }, s.readLinksLead), sw.el, line);
}

async function server(c: Ctx, body: HTMLElement): Promise<void> {
  const s = cw();
  c.title(s.server);
  const rows = await api<{ name: string; set: boolean; secret: boolean; value: string | null }[]>("GET", "/api/admin/config");
  body.replaceChildren(
    await readLinksSwitch(),
    el("p", { class: "settings-hint" }, s.serverLead),
    el(
      "div",
      { class: "web-table-wrap" },
      el(
        "table",
        { class: "web-table console-table" },
        el("caption", { class: "sr-only" }, s.server),
        el("thead", {}, el("tr", {}, el("th", { scope: "col" }, s.variable), el("th", { scope: "col" }, s.value))),
        el(
          "tbody",
          {},
          ...rows.map((r) =>
            el(
              "tr",
              {},
              el("td", {}, el("code", {}, r.name)),
              el("td", {}, r.secret ? el("span", { title: s.secret }, r.set ? s.set : s.unset) : r.value ? el("code", {}, r.value) : el("span", { class: "settings-hint" }, s.unset)),
            ),
          ),
        ),
      ),
    ),
  );
}

/* ---------- The page ---------- */

export function consolePage(me: Account): void {
  setLang(me.lang);
  const s = cw();
  document.body.classList.add("web-mode");
  document.querySelector(".web-page")?.remove();
  const nav = el("nav", { class: "console-nav settings-nav", "aria-label": s.console });
  const heading = el("h1", { class: "console-title", tabindex: "-1" });
  const body = el("div", { class: "console-content" });
  const menu = el("button", { type: "button", class: "ghost web-ghost console-menu", "aria-expanded": "false", "aria-controls": "console-side" }, icon("sidebar"), el("span", {}, s.menu));
  const back = el("a", { class: "console-back", href: "/" }, icon("arrowLeft"), el("span", {}, s.backToNotes));
  const side = el("aside", { class: "console-side", id: "console-side" }, brand(28), nav, el("div", { class: "console-side-foot" }, el("span", { class: "settings-hint" }, me.email), back));
  const main = el("main", { class: "web-page console" }, side, el("section", { class: "console-main" }, el("header", { class: "console-head" }, menu, heading), body));
  document.body.append(main);
  menu.addEventListener("click", () => {
    const open = main.classList.toggle("console-open");
    menu.setAttribute("aria-expanded", String(open));
  });
  const ctx: Ctx = {
    me,
    go: (href) => {
      history.pushState(null, "", href);
      void draw();
    },
    title: (t) => {
      heading.textContent = t;
      document.title = `${t} — ${s.console} — UniVerso`;
    },
  };
  const draw = async () => {
    main.classList.remove("console-open");
    menu.setAttribute("aria-expanded", "false");
    const parts = location.pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
    const [section = "", id] = parts;
    nav.replaceChildren(
      ...SECTIONS.map(([path, key, ic]) => {
        const href = path ? `/admin/${path}` : "/admin";
        const a = el("a", { class: "settings-nav-item", href, "aria-current": section === path ? "page" : "false" }, icon(ic), el("span", {}, s[key]));
        a.addEventListener("click", (e) => {
          e.preventDefault();
          ctx.go(href);
        });
        return a;
      }),
    );
    body.replaceChildren(el("p", { class: "settings-hint" }, s.loading));
    try {
      if (section === "accounts" && id) await accountPage(ctx, body, id);
      else if (section === "accounts") accounts(ctx, body);
      else if (section === "folders" && id) await folderPage(ctx, body, id);
      else if (section === "folders") folders(ctx, body);
      else if (section === "invitations") await invitations(ctx, body);
      else if (section === "audit") await audit(ctx, body);
      else if (section === "server") await server(ctx, body);
      else await overview(ctx, body);
    } catch (e) {
      body.replaceChildren(el("p", { class: "web-error", role: "alert" }, explain(e)));
    }
    heading.focus({ preventScroll: true });
  };
  addEventListener("popstate", () => void draw());
  void draw();
}
