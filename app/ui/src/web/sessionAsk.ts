// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Whether the session of this browser is still there, asked after a
// WebSocket that closed before it ever opened. A browser never sees the
// status of a refused upgrade, only its close (1006): a session the server
// ended while the connection was down (an admin ending the device's
// sessions, its expiry) refuses every upgrade with 401 and looks exactly
// like a network that is not back. Without asking, the window says
// "offline" for ever and goes on taking edits into a copy that the next
// page load deletes (ADR 0092 item 6). `/api/state` answers either way:
// with no account, the session is over, and the window takes the same path
// as the server's `{"gone":"session"}` on an open connection.

/** What the server said about the session: still there, over, or not
 *  known (no network, the server not there, an answer that is not its). */
export type SessionAnswer = "signed-in" | "ended" | "unknown";

type Get = (path: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const get: Get = (path) => fetch(path, { credentials: "same-origin", cache: "no-store" });

/** Ask the server. Only an answer of the server's own, a success that names
 *  no account, says the session ended: anything else is not known, and the
 *  window goes on as a connection that is down. */
export async function askSession(fetcher: Get = get): Promise<SessionAnswer> {
  try {
    const res = await fetcher("/api/state");
    if (!res.ok) return "unknown";
    const body = (await res.json()) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || !("account" in body)) return "unknown";
    return body.account === null ? "ended" : "signed-in";
  } catch {
    return "unknown";
  }
}
