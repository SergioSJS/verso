// 3D dice appearance (ADR 0101): Rolai's model — three colour slots, the
// presets, textures and materials, the size in percent — read from storage,
// edited, the contrast warning, and the size in pixels. Pure; no WebGL here
// (the settings and the stage are tested in e2e/dice3d.spec.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { existsSync } from "node:fs";

await esbuild.build({
  stdin: { contents: `export * from "./src/dice3d/look"; export * from "./src/dice3d/textures"; export * from "./src/theme/color"; export * from "./src/dice3d/sound";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/dice3dLook.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/dice3dLook.test-bundle.mjs");

test("Rolai's lists, with its names: 20 textures, 6 materials, 3 slots, 8 presets and Verso's own", () => {
  assert.equal(m.TEXTURES.length, 20);
  assert.deepEqual([...m.MATERIALS], ["auto", "plastic", "metal", "wood", "glass", "none"]);
  assert.deepEqual([...m.SLOTS], ["1", "2", "3"]);
  assert.deepEqual(m.PRESETS.map((p) => p.id), ["verso", "esmeralda", "osso", "obsidiana", "sangue", "abissal", "gelo", "escamas", "madeira"]);
  assert.equal(m.PRESETS.find((p) => p.id === "obsidiana").style.number, "#e5c07b");
  assert.equal(m.PRESETS.find((p) => p.id === "madeira").style.material, "wood");
});

test("every texture has a painter, and every painter is a texture", () => {
  assert.deepEqual([...m.PAINTED].sort(), m.TEXTURES.filter((t) => t !== "none").sort());
  for (const t of m.TEXTURES) assert.ok(m.NATURAL[t], `${t} has a natural material`);
});

test("nothing stored, or garbage, reads as the default look", () => {
  for (const raw of [undefined, null, 7, "x", [], { size: "big", styles: 3 }, { theme: "ruby", font: "mono" }]) {
    assert.deepEqual(m.readDiceLook(raw), m.defaultLook());
  }
  const d = m.defaultLook();
  assert.equal(d.size, 100);
  // Slot 1 follows the app's palette; 2 and 3 are Rolai's.
  assert.equal(d.styles["1"].app, true);
  assert.equal(d.styles["2"].body, "#14171c");
  assert.equal(d.styles["3"].texture, "wood");
});

test("a stored look is kept field by field, colours normalised, the rest from the default", () => {
  const l = m.readDiceLook({ size: 130.4, styles: { "2": { body: "#ABC", number: "rgb(0 0 0)", outline: "javascript:1", texture: "dragon", material: "glass" }, "3": { texture: "nonsense" } } });
  assert.equal(l.size, 130);
  assert.deepEqual(l.styles["2"], { body: "#aabbcc", number: "#000000", outline: m.DEFAULT_STYLES["2"].outline, texture: "dragon", material: "glass" });
  assert.deepEqual(l.styles["3"], m.DEFAULT_STYLES["3"]);
});

test("the size is a whole percent within 70 to 160", () => {
  assert.equal(m.clampSize(10), 70);
  assert.equal(m.clampSize(999), 160);
  assert.equal(m.clampSize(NaN), 100);
  assert.equal(m.clampSize("90"), 100);
});

test("a preset is applied whole; a colour edit leaves 'Do Verso'; a texture edit keeps it", () => {
  const ouro = m.applyPreset("gelo");
  assert.deepEqual(ouro, m.PRESETS.find((p) => p.id === "gelo").style);
  assert.equal(m.presetOf(ouro).id, "gelo");
  assert.equal(m.applyPreset("nope"), null);
  const verso = m.applyPreset("verso");
  assert.equal(verso.app, true);
  assert.equal(m.presetOf(verso).id, "verso");
  assert.equal(m.withField(verso, { texture: "fire" }).app, true);
  const edited = m.withField(verso, { body: "#112233" });
  assert.equal(edited.app, undefined);
  assert.equal(m.presetOf(edited), null);
  assert.equal(m.presetOf(m.withField(ouro, { outline: "#000001" })), null);
});

test("every preset's number reads on its body (3:1 at least), except where Rolai's own value does not", () => {
  for (const p of m.PRESETS) {
    if (p.style.app) continue;
    const c = m.numberContrast(p.style);
    assert.ok(c > 3, `${p.id} ${c}`);
  }
});

test("the contrast warning: same colour warns, black on white does not", () => {
  assert.equal(m.lowContrast({ body: "#ffffff", number: "#ffffff" }), true);
  assert.equal(m.lowContrast({ body: "#777777", number: "#888888" }), true);
  assert.equal(m.lowContrast({ body: "#ffffff", number: "#000000" }), false);
  assert.ok(Math.abs(m.numberContrast({ body: "#ffffff", number: "#000000" }) - 21) < 0.01);
  assert.equal(m.numberContrast({ body: "nope", number: "#000" }), null);
  assert.equal(m.lowContrast({ body: "nope", number: "#000" }), false);
});

test("'Automático' follows the texture's material; a choice overrides it", () => {
  assert.equal(m.materialOf({ material: "auto", texture: "ice" }), "glass");
  assert.equal(m.materialOf({ material: "auto", texture: "paper" }), "wood");
  assert.equal(m.materialOf({ material: "auto", texture: "none" }), "plastic");
  assert.equal(m.materialOf({ material: "metal", texture: "ice" }), "metal");
  const f = m.FINISHES;
  assert.ok(f.none.roughness > f.plastic.roughness && f.metal.metalness > 0.5 && f.glass.opacity < 1 && f.none.metalness === 0);
});

test("the size in pixels: about 70 on a laptop at 100%, in order, scaled for phones and big screens", () => {
  const laptop = m.diePixels(100, 1440, 900);
  assert.ok(laptop >= 60 && laptop <= 80, `100% on a laptop is ${laptop}px`);
  assert.ok(m.diePixels(70, 1440, 900) < laptop && laptop < m.diePixels(160, 1440, 900));
  const phone = m.diePixels(100, 390, 844);
  const big = m.diePixels(100, 3840, 2160);
  assert.ok(phone < laptop && laptop < big);
  assert.ok(phone >= 55, `phone ${phone}`);
  assert.ok(m.diePixels(160, 1440, 900) <= 120);
});

test("the throw region is the lower part of the area, never past it, taller for many dice", () => {
  const area = { left: 100, top: 40, width: 1000, height: 800 };
  const r = m.throwRegion(area, 2);
  assert.equal(r.top + r.height, 840);
  assert.ok(r.height < 800 * 0.5 && r.height >= 260);
  assert.ok(m.throwRegion(area, 20).height > r.height);
  assert.deepEqual(m.throwRegion({ left: 0, top: 0, width: 500, height: 200 }, 2), { left: 0, top: 0, width: 500, height: 200 });
});

test("the seeded generator repeats itself", () => {
  const a = m.seeded(5);
  const b = m.seeded(5);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test("a dice style is closed JSON: whatever arrives, only listed ids and #rrggbb come out, and size is not in it", () => {
  const hostile = { "1": { body: "url(http://x/y.png)", number: "red; background:url(1)", outline: 5, texture: "../../etc/passwd", material: "<script>", app: "yes", extra: 1 }, "9": { body: "#fff" } };
  const out = m.readDiceStyles(hostile);
  assert.deepEqual(Object.keys(out), ["1", "2", "3"]);
  for (const slot of m.SLOTS) {
    const st = out[slot];
    assert.match(st.body, /^#[0-9a-f]{6}$/);
    assert.match(st.number, /^#[0-9a-f]{6}$/);
    assert.match(st.outline, /^#[0-9a-f]{6}$/);
    assert.ok(m.TEXTURES.includes(st.texture) && m.MATERIALS.includes(st.material));
    assert.ok(!("size" in st) && !("extra" in st));
  }
  assert.equal(out["1"].app, undefined);
  // It survives JSON as it is.
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  assert.deepEqual(m.readDiceLook(m.defaultLook()).styles, m.defaultLook().styles);
});

test("the original texture images: one file per texture but Plain, each shipped", () => {
  assert.equal(m.TEXTURE_FILES.none, null);
  for (const t of m.TEXTURES.filter((x) => x !== "none")) assert.ok(existsSync(`dice-textures/${m.TEXTURE_FILES[t]}`), t);
});

test("the roll time and the sound switch: closed values, Normal, and sound on by default", () => {
  const d = m.defaultLook();
  assert.equal(d.time, "normal");
  assert.equal(d.sound, true);
  // Rolai plays by default; a stored false counts only once the person chose it.
  assert.equal(m.readDiceLook(undefined).sound, true);
  assert.equal(m.readDiceLook({ size: 50 }).sound, true);
  assert.equal(m.readDiceLook({ sound: false }).sound, true, "saved by an edit of another field");
  assert.equal(m.readDiceLook({ sound: false, soundChosen: true }).sound, false);
  assert.equal(m.readDiceLook({ sound: true, soundChosen: true }).sound, true);
  assert.equal(m.readDiceLook({ time: "slow", sound: true }).time, "slow");
  assert.equal(m.readDiceLook({ time: "slow", sound: true }).sound, true);
  for (const odd of ["", "turbo", 3, null, {}]) assert.equal(m.readDiceLook({ time: odd }).time, "normal", String(odd));
  for (const odd of ["true", 1, null, undefined, "x"]) assert.equal(m.readDiceLook({ sound: odd, soundChosen: true }).sound, false, String(odd));
});

test("the sound's rules are Rolai's: slow hits are silent, the volume follows the speed, wood and metal are their own", () => {
  assert.equal(m.hitVolume(m.HIT_MIN_SPEED - 0.01), null);
  assert.ok(m.hitVolume(m.HIT_MIN_SPEED) > 0);
  assert.equal(m.hitVolume(1e6), 1);
  assert.ok(m.hitVolume(10) < m.hitVolume(20));
  assert.equal(m.soundMaterial("wood"), "wood");
  assert.equal(m.soundMaterial("metal"), "metal");
  for (const other of ["plastic", "glass", "none", "auto"]) assert.equal(m.soundMaterial(other), "plastic", other);
  for (const [name, n] of Object.entries(m.SOUND_COUNTS)) {
    const prefix = name === "felt" ? "surface_felt" : `dicehit_${name}`;
    for (let i = 1; i <= n; i++) assert.ok(existsSync(`dice-sounds/${prefix}${i}.mp3`), `${prefix}${i}`);
  }
});

test("dice styles for the wire: a style that follows the app carries the sender's theme colours, never the flag", () => {
  const styles = m.defaultLook().styles;
  assert.equal(styles["1"].app, true);
  const out = m.resolveApp(styles, "#6a3fb5", "#ffffff");
  assert.equal(out["1"].app, undefined);
  assert.equal(out["1"].body, "#6a3fb5");
  assert.equal(out["1"].number, "#ffffff");
  assert.equal(out["1"].outline, m.edgeFor("#6a3fb5"));
  // A style with its own colours is copied as it is.
  const own = { ...styles, "2": { body: "#aa0000", number: "#ffffff", outline: "#330000", texture: "marble", material: "glass" } };
  assert.deepEqual(m.resolveApp(own, "#6a3fb5", "#fff")["2"], own["2"]);
  assert.notEqual(m.resolveApp(own, "#6a3fb5", "#fff")["2"], own["2"]);
});
