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
import { passkeysHere, signInWithPasskey } from "./passkeys";
import { roleName, setLang, w } from "./strings";
import { icon } from "../icons";

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

export function signInPage(secure: boolean, mail = false): void {
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
    lead(secure ? s.signInLead : s.tlsRequired),
    f.form,
    others ? divider(s.orDivider) : el("span"),
    el("div", { class: "web-others" }, withKey, mailLink),
    keyError,
  );
  email.input.focus();
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
  page(s.setupTitle, lead(s.setupLead), f.form);
  email.input.focus();
}

export async function invitePage(token: string): Promise<void> {
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
      await api("POST", `/api/invite/${encodeURIComponent(token)}`, {
        email: email.input.value,
        name: name.input.value || email.input.value.split("@")[0],
        password: password.input.value,
        lang: lang.input.value,
      });
      location.href = "/";
    },
    explain,
  );
  page(
    s.inviteTitle,
    lead(s.inviteLead),
    offer.folder && offer.role ? el("p", { class: "web-lead" }, s.inviteFolder(offer.folder, roleName(offer.role))) : el("span"),
    f.form,
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
  page(s.resetTitle, lead(s.resetLead(link.email)), f.form);
  password.input.focus();
}

type Asked = { code: string; device: string; address: string; asked: string };

/** What is asking under `code`: the server reads the code, from the link
 *  or typed, and a wrong one costs a try of the address's delay. */
function describeCode(code: string): Promise<Asked> {
  return api<Asked>("POST", "/api/device/describe", { code });
}

export async function devicePage(account: Account | null): Promise<void> {
  const s = w();
  const linked = (new URLSearchParams(location.search).get("code") ?? "").trim();
  if (!account) {
    location.href = `/signin?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  setLang(account.lang);
  // Without a code in the link, the person types the one the device shows
  // (ADR 0083 item 17), as GitHub asks; the link keeps the app's own flow.
  if (!linked) {
    typeCodePage(account);
    return;
  }
  let what: Asked;
  try {
    what = await describeCode(linked);
  } catch (e) {
    page(s.deviceTitle, lead(explain(e)));
    return;
  }
  askPage(account, what, false);
}

/** The code typed from the device's screen; the question once the server
 *  knows it, the error said in place otherwise. */
function typeCodePage(account: Account): void {
  const s = w();
  const code = field(s.deviceTypeLabel, "text", { autocomplete: "off", autocapitalize: "characters", spellcheck: "false", maxlength: "20", required: "" }, s.deviceTypeHint);
  const bad = new Error(s.deviceCodeBad);
  const f = form(
    [code],
    s.deviceContinue,
    async () => {
      const read = readCode(code.input.value);
      if (!read) throw bad;
      askPage(account, await describeCode(read), true);
    },
    (e) => (e === bad ? bad.message : explain(e)),
  );
  page(s.deviceTitle, lead(s.deviceTypeLead), f.form);
  code.input.focus();
}

/** Who asked, and the question: approve — with a fresh proof, asked on the
 *  spot (ADR 0083 item 6) — or refuse. A typed code is shown beside who
 *  asked, as the server read it. */
function askPage(account: Account, what: Asked, typed: boolean): void {
  const s = w();
  const sent = { code: what.code };
  // Who asked, before the question (threat-model.md, gap 12): a link
  // someone else sent shows an address and a time that are not the
  // person's, and the device's name as that someone gave it.
  const asked = new Date(what.asked);
  const when = Number.isNaN(asked.getTime())
    ? what.asked
    : asked.toLocaleString(account.lang.startsWith("pt") ? "pt-BR" : "en", { dateStyle: "long", timeStyle: "medium" });
  const fact = (term: string, value: string) => [el("dt", {}, term), el("dd", {}, value)];
  const heading = el("h2", { id: "device-who", class: "web-subtitle", tabindex: "-1" }, s.deviceWho);
  const who = el(
    "section",
    { class: "web-asked", "aria-labelledby": "device-who" },
    heading,
    el(
      "dl",
      { class: "web-facts" },
      ...(typed ? fact(s.deviceCodeTyped, what.code) : []),
      ...fact(s.deviceName, what.device),
      ...fact(s.deviceAddress, what.address),
      ...fact(s.deviceWhen, when),
    ),
  );
  const f = form(
    [],
    s.deviceApprove(what.device),
    async () => {
      await api("POST", "/api/device/approve", sent);
      page(s.deviceTitle, lead(s.deviceDone));
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
    api("POST", "/api/device/refuse", sent)
      .then(() => page(s.deviceTitle, lead(s.deviceRefused)))
      .catch((e: unknown) => {
        f.error.textContent = explain(e);
        refuse.disabled = false;
      });
  });
  f.form.append(refuse);
  page(
    s.deviceTitle,
    lead(s.deviceLead(what.device)),
    typed ? el("span") : el("p", { class: "web-code", "aria-label": s.deviceCode }, what.code),
    who,
    question,
    el("p", { id: "device-ask-why", class: "web-lead" }, s.deviceAskWhy),
    f.form,
  );
  // The page changed under the person's hands: they land on who asked.
  if (typed) heading.focus();
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
        list.append(el("li", { role: "alert" }, explain(e)));
        dialog.append(el("div", { class: "web-actions" }, cancel));
      });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** The link from a sign-in e-mail: used at once, then the window. */
export async function signInLinkPage(token: string): Promise<void> {
  const s = w();
  page(s.signInTitle, el("p", { class: "web-lead", role: "status" }, s.linkSigningIn));
  try {
    const r = await api<{ csrf: string }>("POST", `/api/signin/link/${encodeURIComponent(token)}`, {});
    setCsrf(r.csrf);
    location.href = "/";
  } catch (e) {
    page(s.signInTitle, lead(explain(e)));
  }
}
