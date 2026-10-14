// Secret blocks in the window (ADR 0087): the toggle is offered for a note
// whose text may hold a `[!secret]` callout, and the browser harness's
// stand-in for the core's projection takes out the block's lines at any
// depth and nothing else (the core's own is `verso_dialect::project`,
// tested in Rust).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { mayHoldSecret } from "./src/secret/text";
export { projectSecrets } from "./src/harness/secret";
export { ss } from "./src/secret/strings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/secret.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const { mayHoldSecret, projectSecrets, ss } = await import("./.bundles/secret.test-bundle.mjs");

test("the toggle is offered only where a secret callout may be", () => {
  assert.ok(mayHoldSecret("> [!secret]\n> x\n"));
  assert.ok(mayHoldSecret("> > [!SECRET]- t\n"));
  assert.ok(mayHoldSecret("> [! secret ]\n"));
  assert.ok(!mayHoldSecret("> [!secrets]\n> x\n"));
  assert.ok(!mayHoldSecret("a secret, said plainly\n"));
});

test("the harness's projection takes the block's lines out at any depth", () => {
  const note = "# T\n\nà vista\n\n> [!secret] s\n> escondido\nlazy\n\n> [!note] n\n> visível\n>\n> > [!secret]\n> > fundo\n>\n> fica\n\nfim\n";
  const shown = projectSecrets(note);
  for (const hidden of ["escondido", "lazy", "fundo", "[!secret]"]) assert.ok(!shown.includes(hidden), hidden);
  for (const kept of ["à vista", "visível", "fica", "fim", "[!note] n"]) assert.ok(shown.includes(kept), kept);
  assert.equal(projectSecrets("sem segredo\n"), "sem segredo\n");
});

test("both languages say what a secret block does", () => {
  for (const key of ["label", "hidden", "local", "view", "viewing", "back", "slashTitle", "slashDesc"]) {
    assert.equal(typeof ss[key], "string", key);
    assert.ok(ss[key].length > 0, key);
  }
});
