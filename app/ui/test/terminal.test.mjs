// The embedded terminal's pure parts (ADR 0115, section G): the keys that
// stay the app's (item 10), the chunked write and its "behind" signal
// (item 8), and the colours held to the 3:1 floor on the page's paper, in
// light and dark (item 12), and its own settings read back safely.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/terminal/keys"; export * from "./src/terminal/flow"; export * from "./src/terminal/palette"; export * from "./src/terminal/prefs"; export { contrast, parseColor } from "./src/theme/color";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/terminal.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/terminal.test-bundle.mjs");
const { routeKey, APP_KEYS, LEAVE_KEYS, Flow, terminalTheme, contrast, parseColor, FLOOR, readPrefs } = m;

test("the app keeps the tab, palette, settings, search and close keys on every system", () => {
  for (const mac of [true, false]) {
    for (const combo of ["Mod-Shift-]", "Mod-Shift-[", "Mod-1", "Mod-9", "Mod-p", "Mod-Shift-p", "Mod-,", "Mod-w", "Mod-Shift-w", "Mod-k"]) {
      assert.equal(routeKey(combo, mac, false), "app", `${combo} on ${mac ? "macOS" : "Windows/Linux"}`);
    }
  }
  // The keys that leave the terminal are the app's.
  for (const k of LEAVE_KEYS) assert.ok(APP_KEYS.includes(k), k);
});

test("Ctrl+C interrupts; with a selection Mod+C copies; Mod+V pastes", () => {
  // macOS: ⌘C copies a selection and never reaches the shell; ⌃C always does.
  assert.equal(routeKey("Mod-c", true, true), "copy");
  assert.equal(routeKey("Mod-c", true, false), "app");
  assert.equal(routeKey("Ctrl-c", true, false), "shell");
  assert.equal(routeKey("Ctrl-c", true, true), "shell");
  // Windows and Linux: Ctrl+C copies a selection, interrupts without one.
  assert.equal(routeKey("Mod-c", false, true), "copy");
  assert.equal(routeKey("Mod-c", false, false), "shell");
  assert.equal(routeKey("Mod-v", false, false), "paste");
  assert.equal(routeKey("Mod-v", true, false), "paste");
});

test("the shell's own keys reach it; ⌘ never does on macOS", () => {
  // The shell's Ctrl keys on Windows and Linux (Mod is Ctrl there).
  for (const combo of ["Mod-r", "Mod-d", "Mod-l", "Mod-a", "Mod-e", "Mod-u", "Mod-z"]) assert.equal(routeKey(combo, false, false), "shell", combo);
  // macOS: ⌘ is the app's; Ctrl and Option are the shell's.
  for (const combo of ["Mod-r", "Mod-t", "Mod-n", "Mod-q"]) assert.equal(routeKey(combo, true, false), "app", combo);
  for (const combo of ["Ctrl-r", "Ctrl-d", "Alt-b", "Alt-f", "Enter", "Tab", "Escape", "ArrowUp", "a", "ç"]) {
    assert.equal(routeKey(combo, true, false), "shell", combo);
    assert.equal(routeKey(combo, false, false), "shell", combo);
  }
});

test("a burst of output signals behind past the high mark and caught up below the low one", () => {
  const pending = [];
  const said = [];
  const flow = new Flow((text, done) => pending.push(done), (behind) => said.push(behind), 100, 20);
  for (let i = 0; i < 12; i += 1) flow.push("x".repeat(10));
  assert.deepEqual(said, [true], "told once, past 100");
  assert.equal(flow.waiting, 120);
  // Drawn, chunk by chunk.
  while (pending.length > 3) pending.shift()();
  assert.deepEqual(said, [true], "30 waiting: still above the low mark");
  pending.shift()();
  assert.deepEqual(said, [true, false], "20 waiting: caught up");
  while (pending.length > 0) pending.shift()();
  assert.deepEqual(said, [true, false], "caught up once");
  assert.equal(flow.isBehind, false);
  flow.push("");
  assert.equal(flow.waiting, 0);
});

const rgb = (css) => parseColor(css);
const PAPERS = {
  light: { background: rgb("oklch(97% 0.012 80)"), foreground: rgb("oklch(25% 0.02 60)") },
  dark: { background: rgb("oklch(21% 0.012 60)"), foreground: rgb("oklch(90% 0.012 80)") },
  white: { background: rgb("#ffffff"), foreground: rgb("#111111") },
  black: { background: rgb("#000000"), foreground: rgb("#eeeeee") },
};
const NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"];

test("every ANSI colour stands at 3:1 or more on the paper, light and dark", () => {
  for (const [name, paper] of Object.entries(PAPERS)) {
    // The window's own colours, and a theme's too pale semantic ones.
    for (const semantic of [{}, { red: rgb("#ffd0d0"), yellow: rgb("#fff8c0"), blue: rgb("#202040") }]) {
      const theme = terminalTheme({ ...paper, selection: rgb("#c0c0ff"), cursor: rgb("#a03020"), semantic });
      for (const c of NAMES) {
        const ratio = contrast(rgb(theme[c]), paper.background);
        assert.ok(ratio >= FLOOR - 0.01, `${name} ${c} ${theme[c]}: ${ratio.toFixed(2)}`);
      }
      assert.match(theme.background, /^#[0-9a-f]{6}$/);
      assert.ok(contrast(rgb(theme.cursor), paper.background) >= FLOOR - 0.01);
    }
  }
});

test("the terminal's settings read back safely", () => {
  assert.deepEqual(readPrefs(undefined), { shell: "powershell", meta: false, reader: false, noticed: [] });
  assert.deepEqual(readPrefs({ shell: "cmd", meta: true, reader: "yes", noticed: ["a", 1, "b"] }), { shell: "cmd", meta: true, reader: false, noticed: ["a", "b"] });
  assert.equal(readPrefs({ shell: "bash" }).shell, "powershell");
});
