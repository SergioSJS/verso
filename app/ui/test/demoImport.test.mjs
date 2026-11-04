// Importing the demo over a folder that already holds some of it (ADR 0058):
// an untouched copy of an older tutorial file is updated, the person's
// edit is kept, an absent file is created.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { decide, decideRetired, replaceable, sha256Hex } from "./src/demoImport";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/demoImport.test-bundle.mjs",
  logLevel: "error",
});
const { decide, decideRetired, replaceable, sha256Hex } = await import("./.bundles/demoImport.test-bundle.mjs");

const enc = new TextEncoder();

test("an old demo version is updated, an edit is kept, an absent file is created", async () => {
  const current = await sha256Hex(enc.encode("versão nova\n"));
  const old = await sha256Hex(enc.encode("versão antiga\n"));
  const edit = await sha256Hex(enc.encode("versão do usuário\n"));
  assert.equal(decide(old, current, [old]), "update");
  assert.equal(decide(edit, current, [old]), "keep");
  assert.equal(decide(undefined, current, [old]), "create");
  assert.equal(decide(current, current, [old]), "same");
  // Unreadable: kept, never replaced. No past versions known: kept.
  assert.equal(decide(null, current, [old]), "keep");
  assert.equal(decide(old, current), "keep");
});

test("sha256Hex is the standard digest", async () => {
  assert.equal(await sha256Hex(enc.encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("only text the core writes with a revision check is replaced", () => {
  for (const p of ["a.md", "Projetos.base", "Tour do Verso.canvas", "x/y.svg", "Web/a.html"]) assert.ok(replaceable(p), p);
  for (const p of ["a.png", "doc.pdf", "a.mp3"]) assert.ok(!replaceable(p), p);
});

test("the embedded demo carries the earlier versions of a note that changed", async () => {
  const src = readFileSync(new URL("../src/demoVault.ts", import.meta.url), "utf8");
  const welcome = src.slice(src.indexOf('"path": "00 - Bem-vindo ao Verso.md"'));
  const block = welcome.slice(0, welcome.indexOf('"b64"'));
  const old = readFileSync(new URL("../e2e/data/welcome-a126538b.md.txt", import.meta.url));
  assert.ok(block.includes(await sha256Hex(old)), "the first welcome note is among the past versions");
});

test("a note the tutorial renamed: the untouched old copy goes to the trash, an edit stays, nothing without the new note", async () => {
  const old = await sha256Hex(enc.encode("dados antigos\n"));
  const edit = await sha256Hex(enc.encode("dados do usuário\n"));
  const a = "24 - Dados e Tabelas Sorteadas.md";
  const b = "22 - Dados e Tabelas Sorteadas.md";
  assert.equal(decideRetired(old, [old], true, a, b), "trash");
  assert.equal(decideRetired(edit, [old], true, a, b), "keep");
  assert.equal(decideRetired(null, [old], true, a, b), "none");
  // The new note is not there (kept as an edit, or failed): the old stays.
  assert.equal(decideRetired(old, [old], false, a, b), "none");
  // A rename that only changes case is the same file on some disks.
  assert.equal(decideRetired(old, [old], true, "templates/Diário.md", "Templates/Diário.md"), "none");
});

test("the embedded demo knows the renamed dice note", () => {
  const src = readFileSync(new URL("../src/demoVault.ts", import.meta.url), "utf8");
  const at = src.indexOf('"path": "24 - Dados e Tabelas Sorteadas.md"');
  assert.ok(at > 0 && src.slice(at, at + 200).includes('"to": "22 - Dados e Tabelas Sorteadas.md"'));
});
