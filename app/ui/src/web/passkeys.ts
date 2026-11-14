// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Passkeys in the browser (ADR 0074 item 3): the server's WebAuthn options
// (base64url, as webauthn-rs writes them) handed to the browser's
// `navigator.credentials`, and its answer sent back in the same form.

import { api, request } from "./api";

function fromB64url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function toB64url(buf: ArrayBuffer | null): string | null {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Json = Record<string, unknown>;

/** Whether the server offers a passkey at this door, as `/api/state`
 *  says: a computer that serves does not on its network, whose own
 *  certificate is no secure context — only through its internet link (ADR
 *  0117 D9, S13). */
let offered = true;

export function setPasskeysOffered(on: boolean): void {
  offered = on;
}

/** False where the server said a passkey is only its internet link's. */
export function passkeysOffered(): boolean {
  return offered;
}

/** Whether this browser offers passkeys here (a secure context), and the
 *  server at this door. */
export function passkeysHere(): boolean {
  return offered && typeof window.PublicKeyCredential === "function" && window.isSecureContext;
}

/** Add a passkey to the signed-in account, named `name`. */
export async function addPasskey(name: string): Promise<void> {
  const started = await api<{ ceremony: string; options: { publicKey: Json } }>("POST", "/api/me/passkeys", {});
  const pk = started.options.publicKey;
  const user = pk.user as Json;
  const publicKey = {
    ...pk,
    challenge: fromB64url(pk.challenge as string),
    user: { ...user, id: fromB64url(user.id as string) },
    excludeCredentials: ((pk.excludeCredentials as Json[] | undefined) ?? []).map((c) => ({ ...c, id: fromB64url(c.id as string) })),
  } as unknown as PublicKeyCredentialCreationOptions;
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error("cancelled");
  const response = credential.response as AuthenticatorAttestationResponse;
  await api("POST", "/api/me/passkeys/finish", {
    ceremony: started.ceremony,
    name,
    credential: {
      id: credential.id,
      rawId: toB64url(credential.rawId),
      type: credential.type,
      extensions: credential.getClientExtensionResults(),
      response: {
        attestationObject: toB64url(response.attestationObject),
        clientDataJSON: toB64url(response.clientDataJSON),
        transports: typeof response.getTransports === "function" ? response.getTransports() : undefined,
      },
    },
  });
}

type Started = { ceremony: string; options: { publicKey: Json } };

/** The device's answer to a ceremony the server started: what goes back
 *  to it, beside the ceremony's id. */
async function answer(started: Started): Promise<Json> {
  const pk = started.options.publicKey;
  const publicKey = {
    ...pk,
    challenge: fromB64url(pk.challenge as string),
    allowCredentials: ((pk.allowCredentials as Json[] | undefined) ?? []).map((c) => ({ ...c, id: fromB64url(c.id as string) })),
  } as unknown as PublicKeyCredentialRequestOptions;
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error("cancelled");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    ceremony: started.ceremony,
    credential: {
      id: credential.id,
      rawId: toB64url(credential.rawId),
      type: credential.type,
      extensions: credential.getClientExtensionResults(),
      response: {
        authenticatorData: toB64url(response.authenticatorData),
        clientDataJSON: toB64url(response.clientDataJSON),
        signature: toB64url(response.signature),
        userHandle: toB64url(response.userHandle),
      },
    },
  };
}

/** Sign in with a passkey of the account `email`; the session's CSRF token. */
export async function signInWithPasskey(email: string): Promise<string> {
  const started = await api<Started>("POST", "/api/passkey/start", { email });
  const done = await api<{ csrf: string }>("POST", "/api/passkey/finish", await answer(started));
  return done.csrf;
}

/** The person signed in proves who they are with one of their passkeys
 *  (ADR 0083 item 6). Sent once each: a proof is never itself asked to be
 *  proved. */
export async function provePasskey(): Promise<void> {
  const started = await request<Started>("POST", "/api/me/prove/passkey", {});
  await request("POST", "/api/me/prove", await answer(started));
}
