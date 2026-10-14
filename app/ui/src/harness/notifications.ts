// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The system's notifications in the harness (ADR 0084 item 9): the page's
// `Notification` replaced as Tauri's notification plugin replaces it in
// the app — each call asked of the host — and the host's answers played
// here. A test says what the system answers when asked (`answer`), reads
// what was sent (`sent`), and clicks the last one (`click`), as a system
// that tells the page of a click (a browser) does.

type Permission = "granted" | "denied" | "prompt";

export class SystemNotifications {
  /** The system's permission now. */
  permission: Permission = "prompt";
  /** What the system answers when the window asks. */
  answer: Permission = "granted";
  /** Every notification sent, oldest first. */
  readonly sent: { title: string; body: string | null }[] = [];
  /** The last one made, to be clicked. */
  private last: { onclick: ((this: unknown, ev: Event) => unknown) | null } | null = null;

  /** A command of the plugin, answered as the desktop's host answers. */
  handle(cmd: string, args: Record<string, unknown>): unknown {
    switch (cmd) {
      case "plugin:notification|is_permission_granted":
        return this.permission === "granted" ? true : this.permission === "denied" ? false : null;
      case "plugin:notification|request_permission":
        this.permission = this.answer;
        return this.permission;
      case "plugin:notification|notify": {
        const o = (args["options"] ?? {}) as { title?: string; body?: string };
        this.sent.push({ title: String(o.title ?? ""), body: o.body ?? null });
        return null;
      }
      default:
        return null;
    }
  }

  /** A click on the last notification sent. */
  click(): void {
    this.last?.onclick?.call(this.last, new Event("click"));
  }

  /** The page's `Notification`, as the plugin's script makes it. */
  install(invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>): void {
    let permission: NotificationPermission = "default";
    const set = (p: unknown) => {
      permission = p === "granted" ? "granted" : p === "denied" ? "denied" : "default";
    };
    const keep = (made: { onclick: ((this: unknown, ev: Event) => unknown) | null }) => (this.last = made);
    function Shim(this: { onclick: ((this: unknown, ev: Event) => unknown) | null }, title: string, options?: NotificationOptions): void {
      this.onclick = null;
      keep(this);
      void invoke("plugin:notification|notify", { options: { ...(options ?? {}), title } });
    }
    Shim.requestPermission = async (): Promise<NotificationPermission> => {
      const answer = await invoke("plugin:notification|request_permission");
      set(answer);
      return permission;
    };
    Object.defineProperty(Shim, "permission", { enumerable: true, get: () => permission });
    (window as unknown as { Notification: unknown }).Notification = Shim;
    void invoke("plugin:notification|is_permission_granted").then((granted) => set(granted === true ? "granted" : granted === false ? "denied" : "default"));
  }
}
