// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "View as a reader" (ADR 0087 item 5, decided 2026-10-14): a writer of a
// note with secret blocks sees it as one who may only read it receives it
// — drawn from the same projection the server serves readers
// (`project_secrets`, the core's), read-only. Offered only to one who may
// write a note that holds a secret block; a reader is served the
// projection already.

import { commands } from "../bindings";
import { canWrite } from "../can";
import { h } from "../dom";
import { icon } from "../icons";
import { mayHoldSecret, projectSecretsWithPlaceholders } from "./text";
import { ss } from "./strings";

export class ReaderView {
  readonly button: HTMLButtonElement;
  readonly banner: HTMLElement;
  private readonly said: HTMLElement;
  private shown = false;
  /** The path the toggle was turned on for: another note turns it off. */
  private path: string | null = null;

  constructor(private readonly changed: () => void) {
    this.button = h("button", "reader-view");
    this.button.type = "button";
    this.button.title = ss.viewHint;
    this.button.append(icon("lock"), h("span", "", ss.view));
    this.button.setAttribute("aria-pressed", "false");
    this.button.hidden = true;
    this.button.addEventListener("click", () => this.set(!this.shown));
    this.banner = h("div", "reader-banner");
    this.banner.setAttribute("role", "status");
    this.said = h("span", "");
    const back = h("button", "reader-back", ss.back);
    back.type = "button";
    back.addEventListener("click", () => {
      this.banner.hidden = true;
      this.set(false);
      this.button.focus();
    });
    this.banner.append(icon("lock"), this.said, back);
    this.banner.hidden = true;
  }

  /** Whether the note is shown as a reader sees it. */
  get on(): boolean {
    return this.shown;
  }

  set(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.button.setAttribute("aria-pressed", String(on));
    this.said.textContent = ss.viewing;
    this.banner.hidden = !on;
    this.changed();
  }

  /** The note `path` with `text` is drawn: the toggle offered or not, and
   *  off for another note. */
  offer(path: string, text: string): void {
    if (this.path !== path) {
      this.path = path;
      if (this.shown) {
        this.shown = false;
        this.button.setAttribute("aria-pressed", "false");
        this.banner.hidden = true;
      }
    }
    this.button.hidden = !(canWrite() && mayHoldSecret(text));
  }

  /** The note as a reader receives it — its text and HTML — or `null`,
   *  the toggle turned off and why said, when the core could not project
   *  it. */
  async html(text: string): Promise<{ text: string; html: string } | null> {
    try {
      const shown = await commands.projectSecrets(text);
      const viewText = projectSecretsWithPlaceholders(text);
      return { text: shown, html: await commands.renderMarkdown(viewText) };
    } catch (e) {
      this.shown = false;
      this.button.setAttribute("aria-pressed", "false");
      this.said.textContent = ss.failed(e instanceof Error ? e.message : String(e));
      this.banner.hidden = false;
      return null;
    }
  }
}
