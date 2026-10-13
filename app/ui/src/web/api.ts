// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The server's HTTP API, for the pages of accounts and access (ADR 0074).
// A request that changes something carries the session's CSRF token; the
// cookie is the browser's, never read here (HttpOnly).

import { w } from "./strings";

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
  setup: boolean;
  account: Account | null;
  csrf: string | null;
};

let csrf: string | null = null;

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
      case "link_gone":
        return s.linkGone;
      case "tls_required":
        return s.tlsRequired;
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
      default:
        return this.message || s.failed;
    }
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
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

let account: Account | null = null;

export async function state(): Promise<State> {
  const s = await api<State>("GET", "/api/state");
  setCsrf(s.csrf);
  account = s.account;
  return s;
}

/** Who is signed in, as the last `state()` said: the settings' account
 *  and administration sections are theirs. */
export function signedIn(): Account | null {
  return account;
}

export function setSignedIn(a: Account): void {
  account = a;
}

/** The contract this page was built with (`build-index.mjs --web` writes
 *  it in a meta tag): the server's must be the same (ADR 0073 item 2). */
export function pageContract(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="verso-contract"]')?.content ?? "";
}
