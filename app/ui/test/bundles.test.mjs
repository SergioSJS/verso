// Template Bundles and World Wizard (ADR 0098)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { validateBundle, unfence, MAX_PASTE_BYTES } from "./src/bundles/types";
export { systemPromptFor } from "./src/bundles/systemPrompt";
export { BUILTIN_PRESETS, DADOS_CRITICOS_CAMPAIGN, DADOS_CRITICOS_MUNDO } from "./src/bundles/presets";
export { planBundle, checkEdited, segmentProblem, titleForPath, fill, frontmatter, LIMITS } from "./src/bundles/plan";
export { applyPlan, toBase64, needsReading } from "./src/bundles/run";
export { bundleWords, PRESET_TEXT_EN } from "./src/bundles/words";
export { bundleInLanguage } from "./src/bundles/presetsEn";
export { parse } from "yaml";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/bundles.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*", "yaml"],
});
const {
  validateBundle, unfence, MAX_PASTE_BYTES, systemPromptFor, BUILTIN_PRESETS, DADOS_CRITICOS_CAMPAIGN, DADOS_CRITICOS_MUNDO,
  planBundle, checkEdited, segmentProblem, titleForPath, fill, frontmatter, LIMITS, applyPlan, toBase64, needsReading, bundleWords, PRESET_TEXT_EN, parse, bundleInLanguage,
} = await import("./.bundles/bundles.test-bundle.mjs");

const pt = bundleWords("pt-BR");
const en = bundleWords("en-US");
const NOW = new Date(2026, 9, 17, 14, 5);
let n = 0;
const input = (over = {}) => ({ target: "", title: "Tormenta", now: NOW, uuid: () => `id-${++n}`, words: pt, ...over });
const bundle = (over = {}) => ({ version: 1, id: "x", name: "X", description: "d", folders: [], files: [], ...over });


test("all builtin presets pass bundle schema validation and plan without a problem", () => {
  assert.ok(BUILTIN_PRESETS.length >= 4);
  for (const preset of BUILTIN_PRESETS) {
    const res = validateBundle(preset, pt);
    assert.equal(res.valid, true, `Preset ${preset.id} failed validation: ${res.error}`);
    const plan = planBundle(preset, input({ title: "Mundo Novo" }));
    assert.deepEqual(plan.problems, [], `Preset ${preset.id}: ${JSON.stringify(plan.problems)}`);
    assert.equal(plan.folders[0], "Mundo Novo");
  }
});

test("every builtin preset has its English name and description, and credits Igor Téuri", () => {
  for (const preset of BUILTIN_PRESETS) {
    assert.ok(PRESET_TEXT_EN[preset.id], preset.id);
    assert.ok(PRESET_TEXT_EN[preset.id].name && PRESET_TEXT_EN[preset.id].description);
  }
  assert.match(DADOS_CRITICOS_CAMPAIGN.description, /Igor Téuri/);
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

test("worldbuilding preset does not nest the project's name twice and spells Facções", () => {
  assert.equal(DADOS_CRITICOS_MUNDO.id, "dados-criticos-mundo");
  assert.ok(DADOS_CRITICOS_MUNDO.files.some((f) => f.path === "Cultura.md"));
  assert.ok(DADOS_CRITICOS_MUNDO.files.some((f) => f.path === "Divindades.md"));
  assert.ok(DADOS_CRITICOS_MUNDO.files.some((f) => f.path === "Lore.md"));
  assert.ok(DADOS_CRITICOS_MUNDO.folders.includes("Facções"));
  const plan = planBundle(DADOS_CRITICOS_MUNDO, input({ title: "Mundo" }));
  assert.ok(plan.files.every((f) => f.path.startsWith("Mundo/") && !f.path.startsWith("Mundo/Mundo")));
  assert.ok(plan.files.some((f) => f.path === "Mundo/Lore.md"));
});

test("the PARA preset links to no folder", () => {
  for (const f of BUILTIN_PRESETS.flatMap((p) => p.files)) assert.ok(!/\[\[[^\]]*\/\]\]/.test(f.content ?? ""), f.path);
});

test("validateBundle accepts JSON strings, fenced or not, as well as parsed objects", () => {
  const jsonStr = JSON.stringify(DADOS_CRITICOS_MUNDO);
  assert.equal(validateBundle(jsonStr, pt).valid, true);
  assert.equal(validateBundle("```json\n" + jsonStr + "\n```", pt).bundle?.id, "dados-criticos-mundo");
  assert.equal(validateBundle("```JSON\r\n" + jsonStr + "\r\n```", pt).valid, true);
  assert.equal(unfence("  plain  "), "plain");
});

test("validateBundle rejects malformed structures and generates a recovery prompt in each language", () => {
  const malformed = { id: "invalid-one", folders: "not-an-array" };
  const res = validateBundle(malformed, pt);
  assert.equal(res.valid, false);
  assert.ok(res.error && res.errorPrompt);
  assert.ok(res.errorPrompt.includes("Verso") && res.errorPrompt.includes("Template Bundle") && res.errorPrompt.includes(res.error));
  const eng = validateBundle(malformed, en);
  assert.match(eng.error, /version/);
  assert.match(eng.fixPrompt, /Please fix the JSON/);
  assert.match(res.fixPrompt, /Por favor, corrija/);
});

test("validateBundle refuses a bad category, key, value, and a huge paste", () => {
  assert.match(validateBundle(bundle({ category: "scifi" }), en).error, /category/);
  const file = (frontmatter) => bundle({ files: [{ path: "a.md", frontmatter }] });
  assert.match(validateBundle(file({ "": "x" }), en).error, /invalid name/);
  assert.match(validateBundle(file({ "a\nb": "x" }), en).error, /invalid name/);
  assert.match(validateBundle(file({ a: { deep: 1 } }), en).error, /does not fit/);
  assert.match(validateBundle(file({ a: [{}] }), en).error, /does not fit/);
  assert.equal(validateBundle(file({ a: ["x", 2], b: null, c: true, d: 3 }), en).valid, true);
  assert.equal(validateBundle([], pt).valid, false);
  assert.equal(validateBundle("x".repeat(MAX_PASTE_BYTES + 1), en).valid, false);
  assert.equal(validateBundle("{ not json", pt).valid, false);
  assert.match(validateBundle("{ not json", pt).error, /^JSON inválido/);
});

test("the system prompt's own example is plain JSON a bundle check accepts, in both languages", () => {
  for (const lang of ["pt-BR", "en"]) {
    const prompt = systemPromptFor(lang);
    assert.ok(prompt.includes("Template Bundle") && prompt.includes("Schema v1"));
    assert.ok(!prompt.includes("$schema"), "no unpublished schema URL");
    assert.ok(prompt.includes("{{time}}") && prompt.includes("{{uuid}}") && prompt.includes(".canvas"));
    const block = /```json\n([\s\S]*?)\n```/.exec(prompt);
    assert.ok(block, lang);
    const parsed = JSON.parse(block[1]);
    assert.equal(validateBundle(parsed, pt).valid, true, lang);
    assert.deepEqual(planBundle(parsed, input()).problems, [], lang);
  }
  assert.ok(systemPromptFor("pt-BR").includes("Entrevista"));
  assert.ok(systemPromptFor("en").includes("interview"));
});

test("fill replaces the four tags in one pass and leaves other tags alone", () => {
  const out = fill("{{title}} {{date}} {{time}} {{uuid}} {{uuid}} <% tp.x %> {{other}}", "T", NOW, () => `u${++n}`);
  assert.match(out, /^T 2026-10-17 14:05 u\d+ u\d+ <% tp\.x %> \{\{other\}\}$/);
  assert.notEqual(out.split(" ")[3], out.split(" ")[4]);
  // a title that holds a tag is not filled again
  assert.equal(fill("{{title}}", "{{date}}", NOW, () => "u"), "{{date}}");
});

test("fill reads {{date:FORMAT}} and {{time:FORMAT}} with Moment tokens, in the asked language", () => {
  const f = (t, lang) => fill(t, "T", NOW, () => "u", lang);
  assert.equal(f("{{date:YYYY}}|{{date:YY}}|{{date:MM}}|{{date:M}}|{{date:DD}}|{{date:D}}"), "2026|26|10|10|17|17");
  assert.equal(f("{{time:HH}}|{{time:H}}|{{time:mm}}|{{time:ss}}|{{time:HH:mm}}"), "14|14|05|00|14:05");
  assert.equal(f("{{date:ddd}}|{{date:dddd}}|{{date:MMM}}|{{date:MMMM}}|{{date:Do}}", "en"), "Sat|Saturday|Oct|October|17th");
  assert.equal(f("{{date:ddd}}|{{date:dddd}}|{{date:MMM}}|{{date:MMMM}}|{{date:Do}}", "pt-BR"), "sáb|sábado|out|outubro|17º");
  assert.equal(f("{{date:[Dia] D [de] MMMM}}", "pt-BR"), "Dia 17 de outubro");
  assert.equal(f("{{date:YYYY-MM-DD HH:mm}}"), "2026-10-17 14:05");
  // plain tags unchanged; an unknown letter leaves the tag as written
  assert.equal(f("{{date}} {{time}}"), "2026-10-17 14:05");
  assert.equal(f("{{date:YYYY Z}}"), "{{date:YYYY Z}}");
  assert.equal(f("{{title}}", "en"), "T");
});

test("segmentProblem refuses what the core and Windows refuse, in the asked language", () => {
  assert.equal(segmentProblem("Sessão 01.md", pt), null);
  for (const bad of ["", ".", "..", ".verso", ".trash", "a:b", "a*b", "a?b", 'a"b', "a|b", "a\\b", "Fim.", "Fim ", "CON", "con.txt", "LPT1", "COM²"]) {
    assert.ok(segmentProblem(bad, pt), JSON.stringify(bad));
  }
  assert.match(segmentProblem("CON", en), /reserved/);
  assert.match(segmentProblem("CON", pt), /reservado/);
});

test("titleForPath turns what Windows refuses into dashes, not underscores", () => {
  assert.equal(titleForPath('Mundo: A "Grande" Criação? <2026>*|'), "Mundo- A -Grande- Criação- -2026---");
  assert.equal(titleForPath("A/B\\C"), "A-B-C");
  assert.equal(titleForPath("Livro II..."), "Livro II");
  assert.equal(titleForPath("Sr."), "Sr");
});

test("planBundle: the project's folder first, parents before children, notes get .md", () => {
  const plan = planBundle(bundle({ folders: ["A/B/C"], files: [{ path: "A/Nota" }, { path: "Capítulo 1.2" }, { path: "Já.md" }] }), input({ target: "Campanhas/" }));
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.folders, ["Campanhas/Tormenta", "Campanhas/Tormenta/A", "Campanhas/Tormenta/A/B", "Campanhas/Tormenta/A/B/C"]);
  assert.deepEqual(plan.files.map((f) => f.path), ["Campanhas/Tormenta/A/Nota.md", "Campanhas/Tormenta/Capítulo 1.2.md", "Campanhas/Tormenta/Já.md"]);
  assert.ok(plan.files.every((f) => f.note));
});

test("planBundle: .canvas and .base stay files and never get frontmatter", () => {
  const plan = planBundle(bundle({ files: [{ path: "Mapa.canvas", content: '{"nodes":[]}' }, { path: "Lista.base", content: "views: []" }] }), input());
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.files.map((f) => [f.path, f.note]), [["Tormenta/Mapa.canvas", false], ["Tormenta/Lista.base", false]]);
  assert.equal(plan.files[0].text, '{"nodes":[]}');
  const bad = planBundle(bundle({ files: [{ path: "Mapa.canvas", frontmatter: { a: 1 } }] }), input());
  assert.equal(bad.problems[0].at, "/files/0/frontmatter");
});

test("planBundle: a title that ends in a dot or holds a slash still makes a folder; one that is a device name does not", () => {
  assert.deepEqual(planBundle(bundle(), input({ title: "Sr." })).folders, ["Sr"]);
  assert.deepEqual(planBundle(bundle(), input({ title: "A/B" })).folders, ["A-B"]);
  assert.equal(planBundle(bundle(), input({ title: "CON" })).problems[0].at, "/title");
  assert.equal(planBundle(bundle(), input({ title: "..." })).problems[0].at, "/title");
  assert.equal(planBundle(bundle(), input({ title: "   " })).problems[0].at, "/title");
});

test("planBundle refuses a bad target, traversal, absolute and hidden paths, depth, and twice", () => {
  assert.equal(planBundle(bundle(), input({ target: "../x" })).problems[0].at, "/target");
  assert.equal(planBundle(bundle(), input({ target: "a/.trash" })).problems[0].at, "/target");
  const plan = planBundle(
    bundle({ folders: ["../evil", "/abs", "C:/x", ".verso/themes", "a/b/c/d/e/f/g/h/i"], files: [{ path: "x/../y.md" }, { path: ".trash/a.md" }, { path: "Dup.md" }, { path: "dup" }] }),
    input(),
  );
  assert.deepEqual(plan.problems.map((p) => p.at), ["/folders/0", "/folders/1", "/folders/2", "/folders/3", "/folders/4", "/files/0/path", "/files/1/path", "/files/3/path"]);
  assert.match(plan.problems[7].message, /duas vezes/);
  assert.match(planBundle(bundle({ files: [{ path: "A.md" }, { path: "a.MD" }] }), input({ words: en })).problems[0].message, /twice/);
});

test("planBundle bounds: folders, files, file size and the total", () => {
  const many = (k, make) => Array.from({ length: k }, (_, i) => make(i));
  assert.ok(planBundle(bundle({ folders: many(LIMITS.folders + 1, (i) => `p${i}`) }), input()).problems.some((p) => p.at === "/folders"));
  assert.ok(planBundle(bundle({ files: many(LIMITS.files + 1, (i) => ({ path: `n${i}` })) }), input()).problems.some((p) => p.at === "/files"));
  assert.ok(planBundle(bundle({ files: [{ path: "big", content: "x".repeat(LIMITS.fileBytes + 1) }] }), input()).problems.some((p) => p.at === "/files/0/content"));
  const chunk = "x".repeat(LIMITS.fileBytes);
  assert.ok(planBundle(bundle({ files: many(17, (i) => ({ path: `n${i}`, content: chunk })) }), input()).problems.some((p) => p.message.includes("MB")));
});

test("frontmatter is written by a YAML library: values round-trip as the strings they were", () => {
  const props = {
    local: "Taverna #3",
    nivel: "05",
    data: "2026-10-17",
    sim: "yes",
    vazio: "",
    link: "[[Facção]]",
    dois: "a: b",
    nome: "Lord V.",
    lista: ["npc", "[[Lord Victor]]", "guarda:capitão", "05"],
    n: 5,
    ok: true,
    nada: null,
  };
  const text = frontmatter(props);
  assert.ok(text.startsWith("---\n") && text.endsWith("---\n"));
  const back = parse(text.slice(4, -4));
  assert.deepEqual(back, props);
  assert.equal(frontmatter({}), "");
  assert.equal(frontmatter(undefined), "");
});

test("planBundle counts the parent folders a path implies against the folder limit", () => {
  // 26 chains of 8 segments list 26 folders but make 26 * 8 + 1 > 200
  const deep = Array.from({ length: 26 }, (_, i) => `c${i}/b/c/d/e/f/g/h`);
  const plan = planBundle(bundle({ folders: deep }), input());
  assert.ok(plan.folders.length > LIMITS.folders);
  assert.ok(plan.problems.some((p) => p.at === "/folders"));
  // the same through the folders of the files
  const viaFiles = planBundle(bundle({ files: Array.from({ length: 30 }, (_, i) => ({ path: `x${i}/b/c/d/e/f/g/n` })) }), input());
  assert.ok(viaFiles.problems.some((p) => p.at === "/folders"));
});

test("planBundle fills tags in frontmatter strings and in lists", () => {
  const plan = planBundle(bundle({ files: [{ path: "a.md", frontmatter: { campanha: "{{title}}", tags: ["{{title}}", "x"], quando: "{{date}}" } }] }), input({ title: "Taverna #3" }));
  const back = parse(plan.files[0].text.split("---\n")[1]);
  assert.deepEqual(back, { campanha: "Taverna #3", tags: ["Taverna #3", "x"], quando: "2026-10-17" });
});

const answerer = (script = {}) => {
  const calls = [];
  const go = (kind) => async (path, ...rest) => {
    calls.push([kind, path, ...rest]);
    const r = script[path];
    if (r === "throw") throw new Error("boom");
    return r ?? { status: "ok" };
  };
  return { io: { createFolder: go("folder"), createNote: go("note"), createFile: go("file") }, calls };
};

test("applyPlan counts only what the core accepted, and says what was left alone or refused", async () => {
  const plan = planBundle(bundle({ folders: ["A"], files: [{ path: "A/n" }, { path: "Mapa.canvas", content: "{}" }, { path: "m" }] }), input());
  const { io, calls } = answerer({
    "Tormenta/A/n.md": { status: "error", error: { kind: "exists", message: "exists" } },
    "Tormenta/m.md": { status: "error", error: { kind: "unportable", message: "nope" } },
  });
  const report = await applyPlan(plan, io);
  assert.deepEqual(report.madeFolders, ["Tormenta", "Tormenta/A"]);
  assert.deepEqual(report.madeFiles, ["Tormenta/Mapa.canvas"]);
  assert.deepEqual(report.existed, ["Tormenta/A/n.md"]);
  assert.deepEqual(report.failed, [{ path: "Tormenta/m.md", message: "nope" }]);
  assert.equal(needsReading(report), true);
  // the canvas goes through createFile, as base64
  const canvas = calls.find((c) => c[0] === "file");
  assert.equal(Buffer.from(canvas[2], "base64").toString("utf8"), "{}");
  assert.ok(calls.findIndex((c) => c[0] === "folder") < calls.findIndex((c) => c[0] === "note"));
});

test("applyPlan on a project that already stands: everything is left alone, nothing counted", async () => {
  const plan = planBundle(bundle({ files: [{ path: "a" }, { path: "b" }] }), input());
  const exists = { status: "error", error: { kind: "exists", message: "exists" } };
  const { io } = answerer({ Tormenta: exists, "Tormenta/a.md": exists, "Tormenta/b.md": exists });
  const report = await applyPlan(plan, io);
  assert.equal(report.madeFolders.length + report.madeFiles.length, 0);
  assert.equal(report.existed.length, 3);
});

test("applyPlan treats a throw as a failure and goes on; a clean run needs no reading", async () => {
  const plan = planBundle(bundle({ files: [{ path: "a" }, { path: "b" }] }), input());
  const { io } = answerer({ "Tormenta/a.md": "throw" });
  const report = await applyPlan(plan, io);
  assert.deepEqual(report.madeFiles, ["Tormenta/b.md"]);
  assert.deepEqual(report.failed, [{ path: "Tormenta/a.md", message: "boom" }]);
  const clean = await applyPlan(plan, answerer().io);
  assert.equal(needsReading(clean), false);
});

test("toBase64 carries accents and emoji as UTF-8", () => {
  for (const s of ["", "ação", "📁 Mundo — é"]) assert.equal(Buffer.from(toBase64(s), "base64").toString("utf8"), s);
});

test("checkEdited checks a plan the person renamed or thinned out, path by path", () => {
  const plan = planBundle(bundle({ folders: ["A"], files: [{ path: "A/n" }] }), input());
  assert.deepEqual(checkEdited(plan, pt), []);
  const edited = { ...plan, folders: ["Tormenta", "Tormenta/CON", "Tormenta/ok"], files: [{ path: "../x.md", text: "", note: true }, { path: "Tormenta/ok/a.md", text: "", note: true }, { path: "tormenta/OK/A.md", text: "", note: true }] };
  assert.deepEqual(checkEdited(edited, en).map((p) => p.at), ["/folders/1", "/files/0/path", "/files/2/path"]);
});

test("the built-in bundles come in English for an English window: same shape, nothing left in Portuguese (ADR 0098 item 10)", () => {
  const PORTUGUESE = /[ãõáéíóúâêôçà]|\b(Sessão|Sessões|Facções|Modelos|Ficha|Capítulo|Projetos|Recursos)\b/;
  for (const preset of BUILTIN_PRESETS) {
    const english = bundleInLanguage(preset, false);
    assert.notEqual(english, preset, `${preset.id} has an English twin`);
    assert.equal(english.id, preset.id);
    assert.equal(english.folders.length, preset.folders.length, `${preset.id} folders`);
    assert.equal(english.files.length, preset.files.length, `${preset.id} files`);
    assert.equal(validateBundle(english, en).valid, true, `${preset.id} validates`);
    const plan = planBundle(english, input({ title: "New World", words: en, lang: "en" }));
    assert.deepEqual(plan.problems, [], `${preset.id}: ${JSON.stringify(plan.problems)}`);
    const everything = JSON.stringify([english.folders, english.files]);
    assert.doesNotMatch(everything, PORTUGUESE, `${preset.id} has Portuguese left`);
    // The same tags in the same notes: a tag lost in the translation is caught.
    english.files.forEach((f, i) => {
      const tags = (t) => (JSON.stringify(t).match(/\{\{[a-z]+(?::[^}]*)?\}\}/g) ?? []).sort().join();
      assert.equal(tags(f), tags(preset.files[i]), `${preset.id} file ${i} tags`);
    });
  }
  // Links in a note point at notes the bundle makes.
  for (const preset of BUILTIN_PRESETS) {
    const english = bundleInLanguage(preset, false);
    const made = new Set(english.files.map((f) => f.path.replace(/\.md$/, "")));
    for (const f of english.files) for (const link of (f.content ?? "").matchAll(/\[\[([^\]|]+)/g)) assert.ok(made.has(link[1]), `${preset.id}: [[${link[1]}]] is a note of the bundle`);
  }
  // Portuguese keeps the Portuguese; an imported bundle is never changed.
  assert.equal(bundleInLanguage(DADOS_CRITICOS_CAMPAIGN, true), DADOS_CRITICOS_CAMPAIGN);
  const mine = { version: 1, id: "dados-criticos-campanha", name: "X", description: "", folders: [], files: [] };
  assert.equal(bundleInLanguage(mine, false), mine);
});

test("review M13: past the count limit the plan stops reading and says so", () => {
  const many = (n) => Array.from({ length: n }, (_, i) => ({ path: `F${i}` }));
  const plan = planBundle(bundle({ files: many(LIMITS.files + 3000), folders: Array.from({ length: LIMITS.folders + 3000 }, (_, i) => `D${i}`) }), input());
  assert.ok(plan.files.length <= LIMITS.files);
  assert.ok(plan.folders.length <= LIMITS.folders + 1);
  assert.ok(plan.problems.some((p) => p.at === "/files"));
  assert.ok(plan.problems.some((p) => p.at === "/folders"));
});
