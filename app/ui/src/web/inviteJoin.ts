// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// An account that already exists accepts an invitation (ADR 0074 item 4,
// 2026-10-23): signed in already, one button; not signed in, the sign-in
// fields on the invitation's own page, then the join.

import { ApiError, api, setCsrf, type Account } from "./api";
import { el, field, form } from "./form";
import { w } from "./strings";

type Offer = { email: string | null };

function explain(e: unknown): string {
  return e instanceof ApiError ? e.said : w().failed;
}

const join = (token: string) => api<{ open?: string | null }>("POST", `/api/invite/${encodeURIComponent(token)}/join`, {});

/** Where the page goes once the invitation is taken: the folder or share
 *  just joined, open (the table the person came for), else the home. */
export function landing(open: unknown): string {
  return typeof open === "string" && open !== "" ? `/?folder=${encodeURIComponent(open)}` : "/";
}

/** "I am not them": the session ends and the page opens again, signed out. */
function notMe(label: string): HTMLButtonElement {
  const b = el("button", { type: "button", class: "web-link" }, label);
  b.addEventListener("click", () => {
    void api("POST", "/api/signout", {})
      .catch(() => undefined)
      .then(() => location.reload());
  });
  return b;
}

/** For someone signed in: the table as themselves, or the way out. */
export function signedInJoin(token: string, offer: Offer, account: Account): HTMLElement {
  const s = w();
  const other = offer.email !== null && offer.email.trim().toLowerCase() !== account.email.trim().toLowerCase();
  if (other) {
    return el("div", { class: "web-block" }, el("p", { class: "web-lead" }, s.inviteOtherAccount(offer.email ?? "", account.email)), notMe(s.inviteNotMe));
  }
  const f = form([], s.inviteJoinAs(account.name), async () => {
    location.href = landing((await join(token)).open);
  }, explain);
  return el("div", { class: "web-block" }, f.form, notMe(s.inviteNotMe));
}

/** For someone with an account who is not signed in here. */
export function signInJoin(token: string, offer: Offer): HTMLElement {
  const s = w();
  const email = field(s.email, "email", { autocomplete: "username", required: "" });
  if (offer.email) {
    email.input.value = offer.email;
    email.input.setAttribute("readonly", "");
  }
  const password = field(s.password, "password", { autocomplete: "current-password", required: "" });
  const f = form([email, password], s.inviteHaveAccount, async () => {
    const r = await api<{ csrf: string }>("POST", "/api/signin", { email: email.input.value, password: password.input.value });
    setCsrf(r.csrf);
    location.href = landing((await join(token)).open);
  }, explain);
  return el("div", { class: "web-block" }, el("h2", { class: "web-subtitle" }, s.inviteHaveAccountTitle), f.form);
}
