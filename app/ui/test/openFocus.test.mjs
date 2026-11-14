// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The focus rule's "a keyboard is at hand" (screen/openFocus.ts): the keys
// of the on-screen keyboard do not count, as the maintainer's phone showed
// them (Gboard, 2026-11-10): a letter as "Unidentified" with no code, Enter
// and Backspace as their keys with no code. A real keyboard's key has its
// physical code, and a shortcut holds Ctrl or ⌘.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

const src = readFileSync(new URL("../src/screen/openFocus.ts", import.meta.url), "utf8");
const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
const { fromKeyboard } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const key = (over) => ({ code: "", ctrlKey: false, metaKey: false, isComposing: false, ...over });

test("the on-screen keyboard's keys are not a keyboard at hand", () => {
  assert.equal(fromKeyboard(key({})), false, "a letter: Unidentified, no code");
  assert.equal(fromKeyboard(key({ isComposing: true })), false, "a letter in a composition");
  // Enter and Backspace of Gboard: key "Enter" / "Backspace", code "".
  assert.equal(fromKeyboard(key({})), false);
});

test("a real keyboard's key and a shortcut are", () => {
  assert.equal(fromKeyboard(key({ code: "Enter" })), true);
  assert.equal(fromKeyboard(key({ code: "KeyP", ctrlKey: true })), true);
  assert.equal(fromKeyboard(key({ metaKey: true })), true, "⌘ with no code still a shortcut");
  assert.equal(fromKeyboard(key({ code: "KeyA", isComposing: true })), false, "a composition is the IME's");
});
