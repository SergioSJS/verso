// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Scope } from "../../organize/layerRules";

/** One item of a settings page: where it lives, its words, and a control
 *  made when the page is drawn. */
export type SettingItem = { section: string; title: string; desc: string; node: () => HTMLElement; group?: string };

/** What a group of items needs from the dialog that draws them. */
export type ItemCtx = {
  item(title: string, desc: string, control: HTMLElement | null, scope?: Scope): HTMLElement;
  select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement;
  toggle(value: boolean, onChange: (v: boolean) => void): HTMLLabelElement;
  paint(): void;
  /** Go to another page of the settings (optional: tests omit it). */
  open?(section: string): void;
};
