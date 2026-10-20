// Rolai's rules-engine tests (expression language and the 19 profile test
// files), copied into test/rolai/ unchanged but for the import of the engine
// (ADR 0088 item 5), each bundled with esbuild and run here. `vitest` is
// answered by test/rolai/vitest.mjs. Also: the bundled profile module is what
// the YAML files generate, and the expression parser never reaches eval.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as esbuild from "esbuild";

const dir = new URL("./rolai/", import.meta.url);
const files = readdirSync(dir).filter((n) => n.endsWith(".test.ts")).sort();
for (const f of files) {
  await esbuild.build({
    entryPoints: [new URL(f, dir).pathname],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: `test/.bundles/rolai-${f.replace(/\.ts$/, ".mjs")}`,
    logLevel: "error",
    external: ["yaml"],
    alias: { vitest: new URL("./vitest.mjs", dir).pathname },
  });
  await import(`./.bundles/rolai-${f.replace(/\.ts$/, ".mjs")}`);
}

test("the bundled profiles are the YAML files, all 21", () => {
  execFileSync("node", ["scripts/profilesData.mjs", "--check"], { stdio: "pipe" });
  assert.equal(readdirSync(new URL("../src/dice/rolai/profiles/", import.meta.url)).length, 21);
});

test("the expression language is parsed, never evaluated", () => {
  for (const f of ["expression.ts", "profile.ts"]) {
    const src = readFileSync(new URL(`../src/dice/rolai/${f}`, import.meta.url), "utf8")
      .split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    assert.doesNotMatch(src, /\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/, f);
  }
});
