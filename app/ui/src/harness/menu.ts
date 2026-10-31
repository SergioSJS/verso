// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The in-window menu's spec in the browser harness (which has no host):
// the file the host's test writes and checks (`menu_spec.rs`,
// `the_harness_has_the_spec_the_host_exposes`), with the rows of a feature
// that is off dropped as the host does.

import type { MenuSection } from "../bindings";
import { visibleEntries } from "../winMenuModel";
import spec from "./menuSpec.json";

export function menuSections(language: string, features: string[]): MenuSection[] {
  const on = new Set(features);
  const sections = (language === "en" ? spec.en : spec.pt) as MenuSection[];
  return sections.map((s) => ({ ...s, items: visibleEntries(s.items, on) }));
}
