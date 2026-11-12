// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Words written for a computer, said on a phone (screen/phoneWords.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

const src = readFileSync(new URL("../src/screen/phoneWords.ts", import.meta.url), "utf8");
const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
const { phoneText, onPhone } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("this computer becomes this phone, in both languages", () => {
  assert.equal(phoneText("Nome deste computador"), "Nome deste celular");
  assert.equal(phoneText("Este computador não está guardando a lista"), "Este celular não está guardando a lista");
  assert.equal(phoneText("as notas são editadas neste computador e cruzam"), "as notas são editadas neste celular e cruzam");
  assert.equal(phoneText("This computer's name"), "This phone's name");
  assert.equal(phoneText("kept on this computer"), "kept on this phone");
  assert.equal(phoneText("um computador da rede"), "um computador da rede");
});

test("a set of words, its functions too, on a phone only", () => {
  const words = { a: "neste computador", f: (n) => `${n} deste computador`, deep: { b: "this computer" } };
  const phone = onPhone(words, true);
  assert.equal(phone.a, "neste celular");
  assert.equal(phone.f("X"), "X deste celular");
  assert.equal(phone.deep.b, "this phone");
  assert.equal(onPhone(words, true), phone, "made once");
  assert.equal(onPhone(words, false), words);
});
