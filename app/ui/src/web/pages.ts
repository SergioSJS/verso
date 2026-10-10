// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The pages before the window (ADR 0074): signing in, the first admin's
// setup, an invitation accepted, a new password from a reset link, a
// device approved — and the list of folders the person may open.

import { ApiError, api, setCsrf, type Account } from "./api";
import { divider, el, field, form, lead, page, select } from "./form";
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
  const n = new URLSearchParams(location.search).get("next") ?? "/";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
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

export async function devicePage(account: Account | null): Promise<void> {
  const s = w();
  const code = (new URLSearchParams(location.search).get("code") ?? "").toUpperCase();
  if (!account) {
    location.href = `/signin?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  setLang(account.lang);
  let what: { device: string };
  try {
    what = await api("GET", `/api/device/${encodeURIComponent(code)}`);
  } catch (e) {
    page(s.deviceTitle, lead(explain(e)));
    return;
  }
  const f = form(
    [],
    s.deviceApprove,
    async () => {
      await api("POST", `/api/device/${encodeURIComponent(code)}`, {});
      page(s.deviceTitle, lead(s.deviceDone));
    },
    explain,
  );
  page(
    s.deviceTitle,
    lead(s.deviceLead(what.device)),
    el("p", { class: "web-code", "aria-label": s.deviceCode }, code),
    f.form,
  );
}

type FolderRow = { id: string; name: string; role: string };

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
        for (const f of folders) {
          const b = el("button", { type: "button", class: "web-folder" }, icon("folder"), el("span", {}, f.name), el("small", {}, roleName(f.role)));
          b.addEventListener("click", () => close(f.id));
          list.append(el("li", {}, b));
        }
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
