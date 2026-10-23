// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The server's HTTP API, for the pages of accounts and access (ADR 0074).
// A request that changes something carries the session's CSRF token; the
// cookie is the browser's, never read here (HttpOnly).

import { withProof } from "./proof";
import { lang, w } from "./strings";

export type Account = { id: string; email: string; name: string; lang: string; admin: boolean; mayCreate: boolean };

export type State = {
  /** Told only to someone signed in (threat-model.md, gap 15). */
  version: string | null;
  contract: string | null;
  secure: boolean;
  /** Whether the server serves the notes' window in a browser (`--web`). */
  web: boolean;
  /** Whether the server has a mail server (links by e-mail). */
  mail: boolean;
  /** "This app is a server" (ADR 0096): a desktop app serving a phone;
   *  there is no sign-in, only pairing. */
  local?: boolean;
  setup: boolean;
  account: Account | null;
  csrf: string | null;
};

let csrf: string | null = null;
let fromCache = false;

export function setCsrf(token: string | null): void {
  csrf = token;
}

/** An error the API answered, with its code, said in the person's words. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retry: number | null,
  ) {
    super(message);
  }

  /** What the page says. */
  get said(): string {
    const s = w();
    switch (this.code) {
      case "signin_failed":
        return s.signinFailed;
      case "too_many":
        return s.tooMany(this.retry ?? 1);
      case "weak_password":
        return s.weakPassword;
      case "common_password":
        return s.commonPassword;
      case "not_email":
        return s.notEmail;
      case "exists":
        return s.exists;
      case "wrong_account":
        return s.wrongAccount;
      case "link_gone":
        return s.linkGone;
      case "csrf":
        return s.stale;
      case "no_mail":
        return s.failed;
      case "no_passkey":
        return s.noPasskey;
      case "folder_exists":
        return s.folderExists;
      case "bad_name":
        return s.badName;
      case "last_admin":
        return s.lastAdmin;
      case "last_owner":
        return s.lastOwner;
      case "no_account":
        return s.noAccount;
      case "no_address":
        return s.noAddress;
      case "passkey":
        return s.passkeyFailed;
      case "bad_request":
        return s.badRequest;
      case "prove_first":
        return s.proveFirst;
      case "not_writable": {
        // Both languages in one sentence, for a program and the log (ADR
        // 0075 item 3, amended 2026-10-16): the window shows its own half.
        // The server's separator: a newline, U+2063, a newline (storage.rs).
        const halves = this.message.split("\n\u2063\n");
        const [pt, en] = halves;
        if (halves.length !== 2 || pt === undefined || en === undefined) return this.message;
        return lang() === "pt" ? pt : en;
      }
      default:
        return this.message || s.failed;
    }
  }
}

/** A request of the API, sent once, whatever it answers. */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // A page opened with no network knows no token: asked for once the server
  // answers, before the first change it makes.
  if (fromCache && !csrf && method !== "GET") {
    try {
      const fresh = (await (await fetch("/api/state", { credentials: "same-origin" })).json()) as State;
      setCsrf(fresh.csrf);
      fromCache = false;
    } catch {
      /* still no network: the request below fails as it would */
    }
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (csrf && method !== "GET") headers["x-verso-csrf"] = csrf;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(data?.error ?? "failed"),
      String(data?.message ?? res.statusText),
      typeof data?.retry === "number" ? data.retry : null,
    );
  }
  return data as T;
}

/** A request of the API; when it wants a fresh proof (`prove_first`, ADR
 *  0083 item 6), the person is asked on the spot and it is sent once more
 *  (`web/proof.ts`). */
export function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  return withProof(() => request<T>(method, path, body));
}

let account: Account | null = null;

/** What stands in for the server's answer when there is no network: the
 *  last one this browser got, kept by the offline store (ADR 0092 item 2). */
let fallback: (() => Promise<State | null>) | null = null;

export function setStateFallback(f: () => Promise<State | null>): void {
  fallback = f;
}

/** Whether the last `state()` is the one kept, because the server could not
 *  be reached. */
export function stateWasKept(): boolean {
  return fromCache;
}

export async function state(): Promise<State> {
  let s: State;
  try {
    s = await api<State>("GET", "/api/state");
    fromCache = false;
  } catch (e) {
    // No network: a page that was open before opens again, as the person it
    // was open for. Any answer of the server's, an error included, is its.
    const kept = e instanceof TypeError && fallback ? await fallback() : null;
    if (!kept) throw e;
    fromCache = true;
    s = kept;
  }
  setCsrf(s.csrf);
  account = s.account;
  return s;
}

/** Who is signed in, as the last `state()` said: the settings' account
 *  and administration sections are theirs. */
export function signedIn(): Account | null {
  return account;
}

let servedByApp = false;

/** Whether a desktop app serves this window ("This app is a server",
 *  ADR 0096): a paired phone, with no account pages and no shares. */
export function byApp(): boolean {
  return servedByApp;
}

export function setByApp(local: boolean): void {
  servedByApp = local;
}

export function setSignedIn(a: Account): void {
  account = a;
}

/** The contract this page was built with (`build-index.mjs --web` writes
 *  it in a meta tag): the server's must be the same (ADR 0073 item 2). */
export function pageContract(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="verso-contract"]')?.content ?? "";
}
