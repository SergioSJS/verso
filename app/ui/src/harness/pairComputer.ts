// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Pair with a computer at home" (ADR 0117, "The Verso app paired"), as the
// harness stands in for the host (src-tauri src/paired/): the code the
// computer's dialog shows is `code`; the right one, at an address with a
// port, pairs after a moment — the person at the computer answering — and
// the computer is then the first of `server_accounts`, its folders those a
// test sets on `server_folders`. A wrong code, or an address with no port,
// is refused as the host refuses it.

import type { ServerAccount } from "../bindings";
import type { Core } from "./core";

type Handler = (a: Record<string, unknown>) => unknown;

export class PairComputer {
  /** The code the computer at home shows. */
  code = "BCDF-GHJK";
  /** Its owner's name, as the computer's answer carries it. */
  name = "Sérgio";
  /** The computer as this app reaches it: a name made of its key's pin. */
  readonly url = "https://verso-0123456789abcdef0123.home.arpa:51234";
  /** The person at the computer refuses. */
  refuse = false;
  /** How long the person at the computer takes to answer, in ms. */
  wait = 150;
  private paired: ServerAccount | null = null;

  constructor(private readonly core: Core) {}

  handlers(): Record<string, Handler> {
    const accounts = this.core.handlers["server_accounts"];
    return {
      server_pair: async (a): Promise<ServerAccount> => {
        const address = String(a["address"] ?? "").trim();
        if (!/:\d+(\/|$)/.test(address)) {
          throw { kind: "refused", message: "the address has its port after a colon, like 192.168.1.20:51234: type it as the computer shows it" };
        }
        const typed = String(a["code"] ?? "").toUpperCase().replace(/[\s-]/g, "");
        if (typed !== this.code.replace("-", "")) {
          throw { kind: "refused", message: "the code was not right, was used, or its two minutes ran out: type the code the computer shows now (after three wrong tries, open Pair a phone again)" };
        }
        await new Promise((r) => setTimeout(r, this.wait));
        if (this.refuse) throw { kind: "refused", message: "the computer said no, or its two minutes ran out: nothing was paired" };
        this.paired = { url: this.url, email: "", name: this.name, paired: true };
        return this.paired;
      },
      server_accounts: (a) => {
        const others = (accounts?.(a) as ServerAccount[] | undefined) ?? [];
        return this.paired ? [this.paired, ...others.filter((o) => o.url !== this.url)] : others;
      },
    };
  }
}
