// Template Bundles and World Wizard (ADR 0098)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { validateBundle } from "./src/bundles/types";
export { BUNDLE_SYSTEM_PROMPT } from "./src/bundles/systemPrompt";
export { BUILTIN_PRESETS, DADOS_CRITICOS_CAMPAIGN, DADOS_CRITICOS_MUNDO } from "./src/bundles/presets";
export { substituteVariables, validateRelativePath, renderFrontmatter, sanitizePathName } from "./src/bundles/instantiate";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/bundles.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const {
  validateBundle,
  BUNDLE_SYSTEM_PROMPT,
  BUILTIN_PRESETS,
  DADOS_CRITICOS_CAMPAIGN,
  DADOS_CRITICOS_MUNDO,
  substituteVariables,
  validateRelativePath,
  renderFrontmatter,
  sanitizePathName,
} = await import("./.bundles/bundles.test-bundle.mjs");

test("all builtin presets pass bundle schema validation", () => {
  assert.ok(BUILTIN_PRESETS.length >= 4);
  for (const preset of BUILTIN_PRESETS) {
    const res = validateBundle(preset);
    assert.equal(res.valid, true, `Preset ${preset.id} failed validation: ${res.error}`);
    assert.ok(res.bundle);
    assert.ok(res.bundle.folders.length > 0);
  }
});

test("dados criticos campaign preset has the 7 core folders, Modelos, and templates", () => {
  assert.equal(DADOS_CRITICOS_CAMPAIGN.id, "dados-criticos-campanha");
  assert.ok(DADOS_CRITICOS_CAMPAIGN.folders.some((f) => f.includes("1. Grupo")));
  assert.ok(DADOS_CRITICOS_CAMPAIGN.folders.some((f) => f.includes("2. Sessões")));
  assert.ok(DADOS_CRITICOS_CAMPAIGN.folders.some((f) => f.includes("4. NPCs")));
  assert.ok(DADOS_CRITICOS_CAMPAIGN.folders.some((f) => f.includes("Modelos")));
  assert.ok(DADOS_CRITICOS_CAMPAIGN.files.some((f) => f.path.includes("Painel do Mestre.md")));
  assert.ok(DADOS_CRITICOS_CAMPAIGN.files.some((f) => f.path.includes("Modelos/Ficha de Personagem.md")));
});

test("dados criticos mundo preset has lore and culture templates", () => {
  assert.equal(DADOS_CRITICOS_MUNDO.id, "dados-criticos-mundo");
  assert.ok(DADOS_CRITICOS_MUNDO.files.some((f) => f.path.includes("Cultura.md")));
  assert.ok(DADOS_CRITICOS_MUNDO.files.some((f) => f.path.includes("Divindades.md")));
  assert.ok(DADOS_CRITICOS_MUNDO.files.some((f) => f.path.includes("Lore.md")));
});

test("validateBundle accepts JSON strings as well as parsed objects", () => {
  const jsonStr = JSON.stringify(DADOS_CRITICOS_MUNDO);
  const res = validateBundle(jsonStr);
  assert.equal(res.valid, true);
  assert.equal(res.bundle?.id, "dados-criticos-mundo");
});

test("validateBundle rejects malformed structures and generates recovery prompt", () => {
  const malformed = {
    id: "invalid-one",
    // missing name and version
    folders: "not-an-array",
  };
  const res = validateBundle(malformed);
  assert.equal(res.valid, false);
  assert.ok(res.error);
  assert.ok(res.errorPrompt);
  assert.ok(res.errorPrompt.includes("Verso"));
  assert.ok(res.errorPrompt.includes("Template Bundle"));
  assert.ok(res.errorPrompt.includes(res.error));
});

test("substituteVariables replaces {{title}}, {{date}}, {{time}}, and {{uuid}}", () => {
  const out = substituteVariables(
    "Bem-vindo a {{title}} criado em {{date}} as {{time}} (id: {{uuid}})",
    "Tormenta",
    () => "fixed-uuid-123"
  );
  assert.ok(out.includes("Bem-vindo a Tormenta criado em "));
  assert.ok(out.includes("as "));
  assert.ok(out.includes("id: fixed-uuid-123"));
  assert.ok(!out.includes("{{title}}"));
  assert.ok(!out.includes("{{date}}"));
  assert.ok(!out.includes("{{time}}"));
  assert.ok(!out.includes("{{uuid}}"));
});

test("validateRelativePath rejects traversal, absolute paths, internal folders, and forbidden chars", () => {
  // Safe relative paths
  assert.equal(validateRelativePath("1. Grupo/Ficha.md").ok, true);
  assert.equal(validateRelativePath("Campaign/Notes/Session_01").ok, true);

  // Traversal
  assert.equal(validateRelativePath("../evil.md").ok, false);
  assert.equal(validateRelativePath("foo/../../bar.md").ok, false);
  assert.equal(validateRelativePath("..").ok, false);

  // Absolute paths
  assert.equal(validateRelativePath("/etc/passwd").ok, false);
  assert.equal(validateRelativePath("C:/Windows/System32").ok, false);

  // Internal folders
  assert.equal(validateRelativePath(".obsidian/plugins/evil.js").ok, false);
  assert.equal(validateRelativePath(".verso/themes/hack.json").ok, false);
  assert.equal(validateRelativePath(".git/config").ok, false);

  // Forbidden Windows characters
  assert.equal(validateRelativePath("folder:name/file.md").ok, false);
  assert.equal(validateRelativePath("world*star/file.md").ok, false);
  assert.equal(validateRelativePath("a?b/file.md").ok, false);
});

test("sanitizePathName replaces illegal filesystem characters", () => {
  const clean = sanitizePathName('Mundo: A "Grande" Criação? <2026>*|');
  assert.equal(clean, "Mundo_ A _Grande_ Criação_ _2026___");
});

test("renderFrontmatter properly quotes wikilinks and YAML keywords", () => {
  const props = {
    title: "NPC Importante",
    tags: ["npc", "[[Facção]]", "guarda:capitão"],
    draft: true,
    aliases: ["[[Lord Victor]]", "Lord V."],
  };
  const yaml = renderFrontmatter(props);
  assert.ok(yaml.startsWith("---\n"));
  assert.ok(yaml.endsWith("---\n"));
  // Wikilinks must be in quotes so Obsidian YAML parser doesn't break
  assert.ok(yaml.includes('  - "[[Facção]]"'));
  assert.ok(yaml.includes('  - "[[Lord Victor]]"'));
  assert.ok(yaml.includes('  - "guarda:capitão"'));
  assert.ok(yaml.includes("  - npc"));
  assert.ok(yaml.includes("  - Lord V."));
});

test("BUNDLE_SYSTEM_PROMPT includes interview instructions and json schema", () => {
  assert.ok(BUNDLE_SYSTEM_PROMPT.includes("Template Bundle"));
  assert.ok(BUNDLE_SYSTEM_PROMPT.includes("Schema v1"));
  assert.ok(BUNDLE_SYSTEM_PROMPT.includes("Entrevista"));
});

