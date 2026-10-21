// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The theme builder as a tab (ADR 0100). Settings is a modal, which a long
// edit with a large sample beside the controls does not fit in; a tab can
// be as large as the pane, can be split beside a note, and works in the
// phone's layout (ADR 0076) as every tab does. It is never kept in the
// saved layout (no path), so the window starts without it.
//
// It edits the live look without writing it down; Save keeps a profile,
// Cancel — or closing the tab and answering "Discard" — puts the look back.
// Either way the settings page comes back, on the theme's card.

import { ask } from "../dialog";
import { icon } from "../icons";
import type { Pane } from "../layout/pane";
import { settingsDialog } from "../main";
import { Kind } from "../paths";
import { t } from "../strings";
import { type Builder, type BuildSpec, themeBuilder } from "../theme/builder";
import { W } from "../theme/strings";
import { Leaf } from "./leaf";

export class ThemeLeaf extends Leaf {
  readonly kind: Kind = "theme";
  private readonly builder: Builder;
  private saved: string | null = null;
  private gone = false;
  constructor(pane: Pane, readonly spec: BuildSpec) {
    super(pane);
    this.setTitle(W.builder.title);
    this.tabIcon.replaceChildren(icon("palette"));
    this.builder = themeBuilder(spec, {
      onChange: () => this.setDirty(true),
      onSaved: (name) => {
        this.saved = name;
        this.setDirty(false);
        void this.close(true);
      },
      onCancel: () => {
        this.setDirty(false);
        void this.close(true);
      },
    });
    this.el.classList.add("theme-leaf");
    this.el.append(this.builder.el);
  }
  async load(): Promise<void> {}
  override focusContent(): void {
    this.builder.focus();
  }
  /** Closing with changes asks first; "Discard" puts the look back. */
  override async flush(): Promise<boolean> {
    if (!this.dirty) return true;
    return ask(W.builder.discardQ, { yes: W.builder.discard, no: t.cancel });
  }
  override destroy(): void {
    if (this.gone) return;
    this.gone = true;
    if (this.saved === null) this.builder.revert();
    // The settings page comes back on the theme's card, after the pane has
    // taken its own focus.
    const name = this.saved ?? (this.spec.mode === "edit" ? this.spec.name : null);
    window.setTimeout(() => {
      settingsDialog.show("appearance");
      if (name === null) return;
      const card = [...document.querySelectorAll<HTMLElement>("[data-theme-card]")].find((n) => n.dataset["themeCard"] === name);
      card?.querySelector<HTMLElement>(".theme-pick")?.focus();
    }, 0);
  }
}
