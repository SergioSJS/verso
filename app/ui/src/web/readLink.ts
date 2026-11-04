// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The pages before a read link's window (ADR 0105): the address that does
// not open — revoked, expired, turned off or never made, all alike, the
// server says nothing of why —, the passphrase asked, and the page shown
// when a link ends under an open window. In the reader's browser language
// (item 8); no account, no cookie of the server's but the passphrase's.

import { el, field, form, lead, page } from "./form";
import { lang, setLang } from "./strings";

const pt = {
  goneTitle: "Este link não abre",
  goneLead: "Ele foi revogado, venceu ou não existe. Peça um link novo a quem o enviou.",
  lockedTitle: "Este link pede uma senha",
  lockedLead: "Quem enviou o link também combinou uma senha com você.",
  password: "Senha",
  open: "Abrir",
  wrong: "Senha incorreta.",
  tooMany: (s: number) => `Muitas tentativas. Tente de novo em ${s} s.`,
  failed: "Não deu certo. Tente de novo.",
  endedTitle: "O acesso a esta página acabou",
  endedLead: "O link foi revogado ou venceu enquanto você lia. Peça um link novo a quem o enviou.",
  banner: "Você está lendo uma página compartilhada, só para leitura.",
};

const en: typeof pt = {
  goneTitle: "This link does not open",
  goneLead: "It was revoked, it expired, or it does not exist. Ask whoever sent it for a new one.",
  lockedTitle: "This link asks for a password",
  lockedLead: "Whoever sent you the link also gave you a password.",
  password: "Password",
  open: "Open",
  wrong: "Wrong password.",
  tooMany: (s) => `Too many tries. Try again in ${s} s.`,
  failed: "It did not work. Try again.",
  endedTitle: "Access to this page has ended",
  endedLead: "The link was revoked or expired while you were reading. Ask whoever sent it for a new one.",
  banner: "You are reading a shared page, read only.",
};

/** The words, in the browser's language. */
export function rw(): typeof pt {
  return lang() === "pt" ? pt : en;
}

/** What the page says of a link, from the server's answer to
 *  `/r/<token>/state`: it does not open (any refusal, alike), or it wants
 *  its passphrase, or it opens. Exported for its test. */
export function verdict(status: number, body: { locked?: boolean } | null): "gone" | "locked" | "open" | "busy" {
  if (status === 429) return "busy";
  if (status < 200 || status >= 300) return "gone";
  return body?.locked ? "locked" : "open";
}

export function gonePage(): void {
  const s = rw();
  page(s.goneTitle, lead(s.goneLead));
}

/** The window's link ended while it was open: the window is replaced by
 *  this page (item 5: open pages included). */
export function endedPage(): void {
  const s = rw();
  // Whatever the window held is gone with the link: the notes read so far
  // are not left on the page.
  document.body.replaceChildren();
  delete document.documentElement.dataset["visitor"];
  page(s.endedTitle, lead(s.endedLead));
}

function passwordPage(token: string, opened: () => void): void {
  const s = rw();
  const password = field(s.password, "password", { autocomplete: "off", required: "" });
  const f = form(
    [password],
    s.open,
    async () => {
      const res = await fetch(`/r/${encodeURIComponent(token)}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: password.input.value }),
      });
      if (res.ok) return opened();
      const body = (await res.json().catch(() => null)) as { retry?: number } | null;
      if (res.status === 429) throw new Error(s.tooMany(body?.retry ?? 1));
      throw new Error(res.status === 401 ? s.wrong : s.failed);
    },
    (e) => (e instanceof Error ? e.message : s.failed),
  );
  page(s.lockedTitle, lead(s.lockedLead), f.form);
  password.input.focus();
}

/** What the window learns of a link that opens: the note it points at,
 *  when it points at one (there is nothing else to choose). */
export type Opened = { note: string | null; local: boolean };

type Gate = { locked?: boolean; open?: string | null; local?: boolean };

async function stateOf(token: string): Promise<{ status: number; body: Gate | null }> {
  const res = await fetch(`/r/${encodeURIComponent(token)}/state`, { credentials: "same-origin" });
  return { status: res.status, body: (await res.json().catch(() => null)) as Gate | null };
}

/** Ask the server about the link; show the page that fits. Resolves with
 *  what the window needs when it may open (the passphrase, if any,
 *  proved), or null. */
export async function readLinkGate(token: string): Promise<Opened | null> {
  setLang(undefined);
  const first = await stateOf(token);
  const v = verdict(first.status, first.body);
  if (v === "open") return { note: first.body?.open ?? null, local: first.body?.local === true };
  if (v === "locked") {
    return new Promise((resolve) =>
      passwordPage(token, () => {
        // The window comes back where the password page was.
        document.querySelector("main.web-page")?.remove();
        document.body.classList.remove("web-mode");
        // The note is told once the page may read: asked again.
        void stateOf(token).then((again) => resolve({ note: again.body?.open ?? null, local: again.body?.local === true }));
      }),
    );
  }
  if (v === "busy") {
    const s = rw();
    page(s.failed, lead(s.tooMany(1)), el("p"));
  } else {
    gonePage();
  }
  return null;
}
