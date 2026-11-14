// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The pages before the window (ADR 0074): signing in, the first admin's
// setup, an invitation accepted, a new password from a reset link, a
// device approved — and the list of folders the person may open.

import { ApiError, api, setCsrf, type Account } from "./api";
import { divider, el, field, form, lead, page, select } from "./form";
import { readCode } from "./deviceCode";
import { nextPath } from "./nextPath";
import { afterWaits } from "./retry";
import { passkeysHere, signInWithPasskey } from "./passkeys";
import { noNetwork, offline } from "./offline/manager";
import { o } from "./offline/strings";
import { roleName, setLang, w } from "./strings";
import { icon } from "../icons";
import { plainHttpLine } from "./plainHttp";
import { landing, signInJoin, signedInJoin } from "./inviteJoin";
import { focusOnOpen } from "../screen/openFocus";

function explain(e: unknown): string {
  return e instanceof ApiError ? e.said : w().failed;
}

function langField(): ReturnType<typeof select> {
  const pt = navigator.language.toLowerCase().startsWith("pt");
  return select(w().language, [["pt", "Português (Brasil)"], ["en", "English"]], pt ? "pt" : "en");
}

/** Where to go once signed in: the `next` of the address, when it is a
 *  path of this server. */
function next(): string {
  return nextPath(new URLSearchParams(location.search).get("next"), location.origin);
}

type SignedIn = { account: Account; csrf: string };

export function signInPage(mail = false): void {
  const s = w();
  const email = field(s.email, "email", { autocomplete: "username", required: "" });
  const password = field(s.password, "password", { autocomplete: "current-password", required: "" });
  const f = form(
    [email, password],
    s.signIn,
    async () => {
      const r = await api<SignedIn>("POST", "/api/signin", { email: email.input.value, password: password.input.value });
      setCsrf(r.csrf);
      location.href = next();
    },
    explain,
  );
  const withKey = el("button", { type: "button", class: "web-secondary" }, s.passkeySignIn);
  const keyError = el("p", { class: "web-error", role: "alert" });
  withKey.hidden = !passkeysHere();
  withKey.addEventListener("click", () => {
    keyError.textContent = "";
    if (!email.input.value.trim()) {
      keyError.textContent = s.passkeyNeedsEmail;
      email.input.focus();
      return;
    }
    void signInWithPasskey(email.input.value)
      .then((csrf) => {
        setCsrf(csrf);
        location.href = next();
      })
      .catch((e: unknown) => {
        keyError.textContent = e instanceof ApiError ? e.said : s.failed;
      });
  });
  // With a mail server: a link to sign in, and a reset for a forgotten
  // password, sent to the address (ADR 0074 items 3 and 5).
  const byMail = (path: string) => () => {
    keyError.textContent = "";
    if (!email.input.value.trim()) {
      keyError.textContent = s.passkeyNeedsEmail;
      email.input.focus();
      return;
    }
    void api("POST", path, { email: email.input.value })
      .then(() => {
        keyError.textContent = s.mailSent;
      })
      .catch((e: unknown) => {
        keyError.textContent = e instanceof ApiError ? e.said : s.failed;
      });
  };
  const mailLink = el("button", { type: "button", class: "web-secondary" }, s.mailLink);
  mailLink.addEventListener("click", byMail("/api/signin/link"));
  const forgot = el("button", { type: "button", class: "web-link" }, s.forgot);
  forgot.addEventListener("click", byMail("/api/forgot"));
  mailLink.hidden = forgot.hidden = !mail;
  // The password's own way back sits under it; the other ways in come
  // after the button, in the same column.
  password.row.append(forgot);
  const others = !withKey.hidden || mail;
  page(
    s.signInTitle,
    lead(s.signInLead),
    plainHttpLine(s.plainHttpSignIn) ?? el("span"),
    f.form,
    others ? divider(s.orDivider) : el("span"),
    el("div", { class: "web-others" }, withKey, mailLink),
    keyError,
  );
  focusOnOpen(email.input);
}

export function setupPage(): void {
  const s = w();
  const token = new URLSearchParams(location.search).get("token");
  if (!token) {
    page(s.setupTitle, lead(s.setupMissing));
    return;
  }
  const email = field(s.email, "email", { autocomplete: "username" });
  const name = field(s.name, "text", { autocomplete: "name" });
  const password = field(s.passwordNew, "password", { autocomplete: "new-password", minlength: "12" }, s.passwordHint);
  const lang = langField();
  const f = form(
    [email, name, password, lang],
    s.createAccount,
    async () => {
      await api("POST", "/api/setup", {
        token,
        email: email.input.value,
        name: name.input.value || email.input.value.split("@")[0],
        password: password.input.value,
        lang: lang.input.value,
      });
      location.href = "/admin";
    },
    explain,
  );
  page(s.setupTitle, lead(s.setupLead), plainHttpLine(s.plainHttpSignIn) ?? el("span"), f.form);
  focusOnOpen(email.input);
}

export async function invitePage(token: string, account: Account | null = null): Promise<void> {
  const s = w();
  let offer: { email: string | null; folder: string | null; role: string | null };
  try {
    offer = await api("GET", `/api/invite/${encodeURIComponent(token)}`);
  } catch (e) {
    page(s.inviteTitle, lead(explain(e)));
    return;
  }
  const email = field(s.email, "email", { autocomplete: "username" });
  if (offer.email) {
    email.input.value = offer.email;
    email.input.setAttribute("readonly", "");
  }
  const name = field(s.name, "text", { autocomplete: "name" });
  const password = field(s.passwordNew, "password", { autocomplete: "new-password", minlength: "12" }, s.passwordHint);
  const lang = langField();
  const f = form(
    [email, name, password, lang],
    s.createAccount,
    async () => {
      const made = await api<{ done?: { open?: string | null } | null }>("POST", `/api/invite/${encodeURIComponent(token)}`, {
        email: email.input.value,
        name: name.input.value || email.input.value.split("@")[0],
        password: password.input.value,
        lang: lang.input.value,
      });
      location.href = landing(made.done?.open);
    },
    (e) => (e instanceof ApiError && e.code === "exists" ? s.inviteExists : explain(e)),
  );
  const folderLine = offer.folder && offer.role ? el("p", { class: "web-lead" }, s.inviteFolder(offer.folder, roleName(offer.role))) : el("span");
  // Signed in: one button as themselves. Not: sign in and accept, or make
  // an account (the e-mail of an invitation names the account).
  if (account) {
    page(s.inviteTitle, lead(s.inviteLead), folderLine, signedInJoin(token, offer, account));
    return;
  }
  page(
    s.inviteTitle,
    lead(s.inviteLead),
    plainHttpLine(s.plainHttpSignIn) ?? el("span"),
    folderLine,
    signInJoin(token, offer),
    divider(s.orDivider),
    el("div", { class: "web-block" }, el("h2", { class: "web-subtitle" }, s.inviteCreateTitle), f.form),
  );
}

export async function resetPage(token: string): Promise<void> {
  const s = w();
  let link: { email: string };
  try {
    link = await api("GET", `/api/reset/${encodeURIComponent(token)}`);
  } catch (e) {
    page(s.resetTitle, lead(explain(e)));
    return;
  }
  const password = field(s.passwordNew, "password", { autocomplete: "new-password", minlength: "12" }, s.passwordHint);
  const f = form(
    [password],
    s.savePassword,
    async () => {
      await api("POST", `/api/reset/${encodeURIComponent(token)}`, { password: password.input.value });
      location.href = "/";
    },
    explain,
  );
  page(s.resetTitle, lead(s.resetLead(link.email)), plainHttpLine(s.plainHttpSignIn) ?? el("span"), f.form);
  focusOnOpen(password.input);
}

type Asked = { code: string; device: string; address: string; asked: string };

/** A line that says, as it happens, that the page waits the delay the
 *  server asked for before it asks again (`web/retry.ts`). */
function waitLine(): { node: HTMLElement; told: (seconds: number) => void; done: () => void } {
  const node = el("p", { class: "web-wait", role: "status" });
  return {
    node,
    told: (seconds) => {
      node.textContent = w().deviceWaiting(seconds);
    },
    done: () => {
      node.textContent = "";
    },
  };
}

/** A request of the device page: past the address's free tries the server
 *  answers 429 with the seconds to wait (ADR 0083 item 17), and the page
 *  says so and asks again by itself — every try still counted there. */
function device<T>(path: string, body: unknown, told: (seconds: number) => void): Promise<T> {
  return afterWaits(() => api<T>("POST", path, body), told);
}

/** What is asking under `code`: the server reads the code the person
 *  entered, and a wrong one costs a try of the address's delay. */
function describeCode(code: string, told: (seconds: number) => void): Promise<Asked> {
  return device<Asked>("/api/device/describe", { code }, told);
}

export async function devicePage(account: Account | null): Promise<void> {
  if (!account) {
    location.href = `/signin?next=${encodeURIComponent(location.pathname)}`;
    return;
  }
  setLang(account.lang);
  // The person always enters the code their app shows — pasted, since the
  // app copied it, or typed (ADR 0083 item 17). A code in the address is
  // never read: a link sent by someone else would approve their device
  // with one click from a person who never looked at their own app
  // (decided 2026-10-14, ADR 0083 As built; `gh auth login`'s way).
  typeCodePage(account);
}

/** The code entered from the device's screen; the question once the
 *  server knows it, the error said in place otherwise. */
function typeCodePage(account: Account): void {
  const s = w();
  const code = field(s.deviceTypeLabel, "text", { autocomplete: "off", autocapitalize: "characters", spellcheck: "false", maxlength: "20", required: "" }, s.deviceTypeHint);
  const bad = new Error(s.deviceCodeBad);
  const waiting = waitLine();
  const f = form(
    [code],
    s.deviceContinue,
    async () => {
      const read = readCode(code.input.value);
      if (!read) throw bad;
      try {
        askPage(account, await describeCode(read, waiting.told));
      } finally {
        waiting.done();
      }
    },
    (e) => (e === bad ? bad.message : explain(e)),
  );
  f.form.append(waiting.node);
  page(s.deviceTitle, lead(s.deviceTypeLead), f.form);
  focusOnOpen(code.input);
}

/** Who asked, and the question: approve — with a fresh proof, asked on the
 *  spot (ADR 0083 item 6) — or refuse. The code entered is shown beside
 *  who asked, as the server read it. */
function askPage(account: Account, what: Asked): void {
  const s = w();
  const sent = { code: what.code };
  // Who asked, before the question (threat-model.md, gap 12): a code
  // someone else dictated shows an address and a time that are not the
  // person's, and the device's name as that someone gave it.
  const asked = new Date(what.asked);
  const when = Number.isNaN(asked.getTime())
    ? what.asked
    : asked.toLocaleString(account.lang.startsWith("pt") ? "pt-BR" : "en", { dateStyle: "long", timeStyle: "medium" });
  const fact = (term: string, value: string | Node) => [el("dt", {}, term), el("dd", {}, value)];
  // The device's name as its app gave it, isolated wherever it is said: a
  // name in another direction does not carry into the words around it.
  const named = () => el("bdi", {}, what.device);
  const heading = el("h2", { id: "device-who", class: "web-subtitle", tabindex: "-1" }, s.deviceWho);
  const who = el(
    "section",
    { class: "web-asked", "aria-labelledby": "device-who" },
    heading,
    el(
      "dl",
      { class: "web-facts" },
      ...fact(s.deviceCodeTyped, what.code),
      ...fact(s.deviceName, named()),
      ...fact(s.deviceAddress, what.address),
      ...fact(s.deviceWhen, when),
    ),
  );
  const waiting = waitLine();
  const f = form(
    [],
    s.deviceApprove(named()),
    async () => {
      try {
        await device("/api/device/approve", sent, waiting.told);
      } finally {
        waiting.done();
      }
      // The app was let in; this browser may go on to the window itself
      // (the maintainer, 2026-10-16: no way back from here).
      const open = el("a", { href: "/", class: "web-primary web-open" }, s.deviceOpen);
      page(s.deviceTitle, lead(s.deviceDone), open);
    },
    explain,
  );
  // The question is the form's name, read before its buttons.
  const question = el("h2", { id: "device-ask", class: "web-subtitle" }, s.deviceAsk);
  f.form.setAttribute("aria-labelledby", "device-ask");
  f.form.setAttribute("aria-describedby", "device-ask-why");
  const refuse = el("button", { type: "button", class: "web-secondary" }, s.deviceRefuse);
  refuse.addEventListener("click", () => {
    f.error.textContent = "";
    refuse.disabled = true;
    device("/api/device/refuse", sent, waiting.told)
      .then(() => page(s.deviceTitle, lead(s.deviceRefused)))
      .catch((e: unknown) => {
        waiting.done();
        f.error.textContent = explain(e);
        refuse.disabled = false;
      });
  });
  f.form.append(refuse, waiting.node);
  page(
    s.deviceTitle,
    el("p", { class: "web-lead" }, ...s.deviceLead(named())),
    who,
    question,
    el("p", { id: "device-ask-why", class: "web-lead" }, s.deviceAskWhy),
    f.form,
  );
  // The page changed under the person's hands: they land on who asked.
  heading.focus();
}

type FolderRow = { id: string; name: string; role: string; owner?: { name: string } | null; share?: boolean; missing?: boolean };

/** The folders the person may open, over the window, as the desktop's
 *  folder picker is: the id chosen, or null. */
export function chooseFolder(): Promise<string | null> {
  const s = w();
  return new Promise((resolve) => {
    const dialog = el("dialog", { class: "web-dialog", "aria-labelledby": "web-choose-title" });
    const list = el("ul", { class: "web-folders" });
    const close = (id: string | null) => {
      dialog.close();
      dialog.remove();
      resolve(id);
    };
    const cancel = el("button", { type: "button", class: "ghost web-ghost" }, s.cancel);
    cancel.addEventListener("click", () => close(null));
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(null);
    });
    dialog.append(el("h2", { id: "web-choose-title", class: "web-dialog-title" }, s.chooseFolder), el("p", { class: "settings-hint" }, s.chooseFolderLead), list);
    void api<{ folders: FolderRow[]; mayCreate: boolean }>("GET", "/api/folders")
      .then(({ folders, mayCreate }) => {
        if (!folders.length) list.append(el("li", {}, s.noFolders));
        // Mine, then shared with me (ADR 0081 item 5): a folder someone
        // else owns, or a folder inside one, with its owner.
        const row = (f: FolderRow) => {
          const note = f.owner ? `${roleName(f.role)} · ${s.ofOwner(f.owner.name)}${f.missing ? ` · ${s.shareGone}` : ""}` : roleName(f.role);
          const b = el("button", { type: "button", class: "web-folder" }, icon(f.share ? "user" : "folder"), el("span", {}, f.name), el("small", {}, note));
          b.addEventListener("click", () => close(f.id));
          return el("li", {}, b);
        };
        const mine = folders.filter((f) => !f.owner);
        const theirs = folders.filter((f) => f.owner);
        if (mine.length && theirs.length) list.append(el("li", { class: "web-folders-head", role: "presentation" }, s.mine));
        for (const f of mine) list.append(row(f));
        if (theirs.length) list.append(el("li", { class: "web-folders-head", role: "presentation" }, s.sharedWithMe));
        for (const f of theirs) list.append(row(f));
        if (mayCreate) {
          const name = field(s.newFolderName, "text");
          const made = form(
            [name],
            s.create,
            async () => {
              const r = await api<FolderRow>("POST", "/api/folders", { name: name.input.value });
              close(r.id);
            },
            explain,
          );
          dialog.append(el("details", { class: "web-new-folder" }, el("summary", {}, s.newFolder), made.form));
        }
        dialog.append(el("div", { class: "web-actions" }, cancel));
        list.querySelector("button")?.focus();
      })
      .catch((e: unknown) => {
        // No network: the folders kept on this device open without it (ADR
        // 0092 item 2).
        const kept = noNetwork(e) ? offline.choices() : [];
        if (kept.length > 0) {
          list.append(el("li", { class: "web-folders-head", role: "presentation" }, o().chooseOffline));
          for (const f of kept) {
            const b = el("button", { type: "button", class: "web-folder" }, icon("folder"), el("span", {}, f.name), el("small", {}, roleName(f.role)));
            b.addEventListener("click", () => close(f.id));
            list.append(el("li", {}, b));
          }
          list.querySelector("button")?.focus();
        } else list.append(el("li", { role: "alert" }, noNetwork(e) ? o().nothingKept : explain(e)));
        dialog.append(el("div", { class: "web-actions" }, cancel));
      });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** The link from a sign-in e-mail: whose it is, asked first — "sign in
 *  as …?" — and used only on the click, so that a link someone else sent,
 *  for their own account, does not sign the person in to it on a load. */
export async function signInLinkPage(token: string): Promise<void> {
  const s = w();
  const path = `/api/signin/link/${encodeURIComponent(token)}`;
  page(s.signInTitle, el("p", { class: "web-lead", role: "status" }, s.linkSigningIn));
  let email: string;
  try {
    ({ email } = await api<{ email: string }>("GET", path));
  } catch (e) {
    page(s.signInTitle, lead(explain(e)));
    return;
  }
  const f = form(
    [],
    s.signIn,
    async () => {
      const r = await api<{ csrf: string }>("POST", path, {});
      setCsrf(r.csrf);
      location.href = "/";
    },
    explain,
  );
  const question = el("h2", { id: "link-ask", class: "web-subtitle" }, s.linkSignInAs(email));
  f.form.setAttribute("aria-labelledby", "link-ask");
  const go = f.form.querySelector<HTMLButtonElement>("button[type=submit]");
  go?.setAttribute("aria-describedby", "link-ask link-ask-why");
  page(s.signInTitle, question, el("p", { id: "link-ask-why", class: "web-lead" }, s.linkSignInWhy), f.form);
  go?.focus();
}

/* ---------- Pairing a phone with the computer that serves it (ADR 0096) ---------- */

/** How often a phone asks whether the computer answered. */
const PAIR_POLL_MS = 2000;

/** The pairing page: the QR's address carries the token in its fragment,
 *  which the browser never sends in a request; it is read here and taken
 *  out of the address bar at once. Without a token, the code is typed.
 *  Through the internet link (`link`, ADR 0117 D5) it says so, and nothing
 *  of the network's own certificate. */
export function pairPage(link = false): void {
  const s = w();
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  // The secret leaves the address bar, the history and the screen.
  history.replaceState(null, "", "/pair");
  if (token) {
    void redeem(token);
    return;
  }
  const code = field(s.pairCodeLabel, "text", { autocomplete: "off", autocapitalize: "characters", spellcheck: "false", maxlength: "20", required: "" }, s.pairCodeHint);
  const f = form(
    [code],
    s.pairContinue,
    async () => {
      await redeem(code.input.value);
    },
    explainPair,
  );
  if (link) page(s.pairTitle, lead(s.pairLeadLink), el("p", { class: "web-lead" }, s.pairHow), f.form);
  else page(s.pairTitle, lead(s.pairLead), el("p", { class: "web-lead" }, s.pairHow), f.form, el("p", { class: "web-note" }, s.pairTofu));
  focusOnOpen(code.input);
}

function explainPair(e: unknown): string {
  const s = w();
  if (e instanceof ApiError) {
    if (e.status === 404) return s.pairClosed;
    if (e.code === "link_gone") return s.pairGone;
  }
  return explain(e);
}

/** Show the computer's question on the phone and wait for its answer. */
async function redeem(presented: string): Promise<void> {
  const s = w();
  const status = el("p", { class: "web-lead", role: "status", "aria-live": "polite" }, s.pairAsking);
  const why = el("p", { class: "web-lead" }, s.pairAskingWhy);
  page(s.pairTitle, status, why);
  try {
    const asked = await api<{ poll: string; interval: number }>("POST", "/api/pair", { token: presented });
    for (;;) {
      await new Promise((r) => setTimeout(r, Math.max(PAIR_POLL_MS, asked.interval * 1000)));
      const r = await api<{ state: string; csrf?: string }>("POST", "/api/pair/poll", { poll: asked.poll });
      if (r.state === "allowed") {
        setCsrf(r.csrf ?? null);
        status.textContent = s.pairAllowed;
        location.replace("/");
        return;
      }
    }
  } catch (e) {
    const refused = e instanceof ApiError && e.code === "link_gone";
    status.textContent = refused ? s.pairGone : explainPair(e);
    why.textContent = "";
    status.classList.add("web-error");
    status.setAttribute("role", "alert");
  }
}
