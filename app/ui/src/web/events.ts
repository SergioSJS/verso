// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window's events in a browser tab, where no Tauri host is: `listen`,
// `unlisten` and `emit` of `@tauri-apps/api/event` answered here. Tauri's
// own mock (`mockIPC`'s `shouldMockEvents`, 2.11.1) forgets no listener on
// `unlisten` — it looks for `args.id`, the API sends `eventId` — so every
// event heard after a listener went (a dialog closed, `once` answered)
// wrote "[TAURI] Couldn't find callback id …" to the page's console, dozens
// of times in a session (the maintainer's console, 2026-11-05).

type Callbacks = Map<number, (data: unknown) => void>;

const listeners = new Map<string, number[]>();

function callbacks(): Callbacks | undefined {
  return (window as unknown as { __TAURI_INTERNALS__?: { callbacks?: Callbacks } }).__TAURI_INTERNALS__?.callbacks;
}

/** A command of the event plugin, answered: `handled` false for any other. */
export function eventCall(cmd: string, a: Record<string, unknown>): { handled: boolean; value: unknown } {
  switch (cmd) {
    case "plugin:event|listen": {
      const event = String(a.event);
      const id = Number(a.handler);
      listeners.set(event, [...(listeners.get(event) ?? []), id]);
      return { handled: true, value: id };
    }
    case "plugin:event|unlisten": {
      const event = String(a.event);
      const left = (listeners.get(event) ?? []).filter((id) => id !== Number(a.eventId));
      if (left.length > 0) listeners.set(event, left);
      else listeners.delete(event);
      return { handled: true, value: null };
    }
    case "plugin:event|emit":
    case "plugin:event|emit_to": {
      const event = String(a.event);
      const all = callbacks();
      // A listener whose callback is gone is forgotten, never warned of.
      const live = (listeners.get(event) ?? []).filter((id) => all?.has(id));
      if (live.length > 0) listeners.set(event, live);
      else listeners.delete(event);
      for (const id of live) all?.get(id)?.({ event, id, payload: a.payload });
      return { handled: true, value: null };
    }
    default:
      return { handled: false, value: null };
  }
}

/** How many listeners an event has: for the tests. */
export function listenersOf(event: string): number {
  return listeners.get(event)?.length ?? 0;
}
