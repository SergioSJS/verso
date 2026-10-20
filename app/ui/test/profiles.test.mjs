// Rolai's system profiles through Verso's face for them (ADR 0088 item 5):
// the list, the inputs, a roll in both languages, the words of every outcome
// the 21 profiles can give, and the Fractal pool worked out before the roll.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { listProfiles, getProfile, profileInputs, rollProfile } from "./src/dice/profiles";
export { outcomeWord } from "./src/dice/profileWords";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/profiles.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*", "yaml"],
});
const { listProfiles, getProfile, profileInputs, rollProfile, outcomeWord } = await import("./.bundles/profiles.test-bundle.mjs");

test("the 21 profiles are listed, named in the language asked", () => {
  const pt = listProfiles("pt");
  const en = listProfiles("en");
  assert.equal(pt.length, 21);
  assert.ok(pt.some((p) => p.id === "ironsworn" && p.label === "Ironsworn — Ação"));
  assert.ok(en.some((p) => p.id === "ironsworn" && p.label === "Ironsworn — Action"));
  assert.ok(en.some((p) => p.id === "pbta" && p.label === "PbtA (2d6)"));
  assert.equal(pt.filter((p) => !p.rollable).length, 1);
  assert.throws(() => getProfile("nope"), /No dice profile/);
  assert.throws(() => getProfile("__proto__"), /No dice profile/);
});

test("a roll comes back with its dice, outcome ids, words and a line", async () => {
  const r = await rollProfile("d20", { mode: "", mod: 3, dc: 15 }, { deterministic: [14], lang: "en" });
  assert.equal(r.notation, "1d20+3");
  assert.deepEqual(r.outcomes, ["success"]);
  assert.deepEqual(r.outcomeWords, ["Success"]);
  assert.deepEqual(r.tested, [{ label: "DC", value: 15 }]);
  assert.equal(r.dice[0].total, 17);
  assert.equal(r.line, "d20 — test against a DC: 17 — Success");
  const pt = await rollProfile("d20", { mode: "", mod: 3, dc: 15 }, { deterministic: [14], lang: "pt" });
  assert.equal(pt.line, "d20 — teste contra CD: 17 — Sucesso");
  assert.deepEqual(pt.tested, [{ label: "CD", value: 15 }]);
});

test("a missing input is refused", async () => {
  await assert.rejects(rollProfile("ironsworn", {}), /attribute/);
});

test("Fractal's pool is worked out from the Facts and the Advantage", async () => {
  // 2 Facts + Advantage = 3d6; Advantage with no Fact adds nothing.
  const a = await rollProfile("fractal", { fatos_aplicaveis: 2, vantagem: "sim" }, { deterministic: [6, 6, 3] });
  assert.equal(a.dice[0].rolls.length, 3);
  const b = await rollProfile("fractal", { fatos_aplicaveis: 0, vantagem: "sim" }, { deterministic: [4] });
  assert.equal(b.dice[0].rolls.length, 1);
});

test("inputs come with labels in the language asked", () => {
  const en = profileInputs("d20", "en");
  assert.deepEqual(en.map((i) => i.label), ["Mode", "DC", "Modifier"]);
  assert.deepEqual(en[0].options.map((o) => o.label), ["Normal", "Advantage", "Disadvantage"]);
});

test("every outcome id of every profile has its words in both languages", () => {
  const dir = new URL("../src/dice/rolai/profiles/", import.meta.url);
  const missing = new Set();
  for (const f of readdirSync(dir)) {
    for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/^\s*result:\s*"?([a-z0-9_]+)"?/gm)) {
      for (const lang of ["pt", "en"]) if (outcomeWord(m[1], lang) === m[1] && !["animal"].includes(m[1])) missing.add(`${m[1]}/${lang}`);
    }
  }
  assert.deepEqual([...missing], []);
  assert.equal(outcomeWord("something_new", "en"), "something_new");
});
