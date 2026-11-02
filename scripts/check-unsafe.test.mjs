// Tests of the `unsafe` guardrail (scripts/check-unsafe.mjs):
// `node --test scripts/check-unsafe.test.mjs`. The one exception to the
// workspace's `unsafe_code = "forbid"` is the native clipping of an
// embedded page, in two files (ADR 0029, revision of 2026-10-15); every
// way of writing `unsafe` elsewhere, or of loosening the lint, fails.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLOWED, manifestProblems, rustProblems, scan } from "./check-unsafe.mjs";

const file = (path, text) => ({ path, text });
const elsewhere = "crates/verso-fs/src/os.rs";

test("the two platform files of web_clip are the only ones allowed", () => {
  assert.ok(ALLOWED.test("app/src-tauri/src/web_clip/macos.rs"));
  assert.ok(ALLOWED.test("app/src-tauri/src/web_clip/windows.rs"));
  for (const no of [
    "app/src-tauri/src/web_clip/mod.rs",
    "app/src-tauri/src/web_clip/linux.rs",
    "app/src-tauri/src/web_clip/geometry.rs",
    "app/src-tauri/src/web.rs",
    "app/src-tauri/src/web_clip/macos.rs.bak",
    "x/app/src-tauri/src/web_clip/macos.rs",
    "app/src-tauri/src/audio_share/mod.rs",
    "app/src-tauri/src/audio_share/macos_source.rs",
    "app/src-tauri/src/audio_share/convert.rs",
    "app/src-tauri/src/audio_share/macos.rs.bak",
  ]) {
    assert.ok(!ALLOWED.test(no), no);
  }
});

test("the audio capture files of audio_share are allowed too (ADR 0116, Q9)", () => {
  for (const os of ["macos", "windows", "linux"]) {
    assert.ok(ALLOWED.test(`app/src-tauri/src/audio_share/${os}.rs`), os);
  }
});

test("every way of writing unsafe code outside them fails", () => {
  for (const code of [
    "fn f() { unsafe { g() } }",
    "let x = unsafe { *p };",
    "pub unsafe fn f() {}",
    "unsafe extern \"C\" { fn g(); }",
    "unsafe impl Send for X {}",
    "unsafe trait T {}",
    "#[unsafe(no_mangle)]",
    "#![allow(unsafe_code)]",
    "#[allow(unsafe_code)]",
    "#[expect(unsafe_code)]",
    "#![warn(unsafe_code)]",
    "#[allow(clippy::all, unsafe_code)]",
    "let y = 1; unsafe{ g() }",
  ]) {
    assert.equal(rustProblems([file(elsewhere, code)]).length, 1, code);
  }
});

test("the word in a comment or a string is not code", () => {
  for (const text of [
    "// the workspace forbids `unsafe`",
    "/// `unsafe` FFI, which the workspace forbids",
    "//! unsafe { } in a doc",
    "let a = 1; // unsafe { } here is a comment",
    "const CSP: &str = \"style-src 'unsafe-inline'\";",
    "let s = \"unsafe { }\";",
    "let s = r#\"unsafe { } \"quoted\" \"#;",
    "/* unsafe { } */ let b = 2;",
    "let unsafely = 3; let not_unsafe_code = 4;",
  ]) {
    assert.deepEqual(rustProblems([file(elsewhere, text)]), [], text);
  }
});

test("inside the two files, unsafe is allowed", () => {
  const text = "#![allow(unsafe_code)]\n// SAFETY: a reason\nlet v = unsafe { f() };\n";
  assert.deepEqual(rustProblems([file("app/src-tauri/src/web_clip/macos.rs", text)]), []);
  assert.deepEqual(rustProblems([file("app/src-tauri/src/web_clip/windows.rs", text)]), []);
  assert.equal(rustProblems([file("app/src-tauri/src/web_clip/mod.rs", text)]).length, 2);
});

const root = `[workspace]
members = ["crates/*", "app/src-tauri"]

[workspace.lints.rust]
# a comment
unsafe_code = "forbid"

[workspace.lints.clippy]
unwrap_used = "forbid"
expect_used = "forbid"
disallowed_methods = "forbid"
`;
const app = `[package]
name = "verso-app"

[lints.rust]
unsafe_code = "deny"

[lints.clippy]
unwrap_used = "forbid"
expect_used = "forbid"
disallowed_methods = "forbid"
undocumented_unsafe_blocks = "forbid"
multiple_unsafe_ops_per_block = "forbid"
`;
const crate = `[package]
name = "verso-fs"

[lints]
workspace = true
`;
const manifests = (r, a, c) => [file("Cargo.toml", r), file("app/src-tauri/Cargo.toml", a), file("crates/verso-fs/Cargo.toml", c)];

test("the manifests as they are pass", () => {
  assert.deepEqual(manifestProblems(manifests(root, app, crate)), []);
});

test("the workspace keeps forbid", () => {
  const loosened = root.replace('unsafe_code = "forbid"', 'unsafe_code = "deny"');
  assert.equal(manifestProblems(manifests(loosened, app, crate)).length, 1);
  const gone = root.replace('unsafe_code = "forbid"\n', "");
  assert.equal(manifestProblems(manifests(gone, app, crate)).length, 1);
});

test("the app's table is deny, and every other lint the workspace's", () => {
  const allowed = app.replace('unsafe_code = "deny"', 'unsafe_code = "allow"');
  assert.equal(manifestProblems(manifests(root, allowed, crate)).length, 1);
  const warned = app.replace('unsafe_code = "deny"', 'unsafe_code = "warn"');
  assert.equal(manifestProblems(manifests(root, warned, crate)).length, 1);
  const lost = app.replace('expect_used = "forbid"\n', "");
  assert.equal(manifestProblems(manifests(root, lost, crate)).length, 1);
  const softer = app.replace('unwrap_used = "forbid"', 'unwrap_used = "warn"');
  assert.equal(manifestProblems(manifests(root, softer, crate)).length, 1);
  const noSafety = app.replace('undocumented_unsafe_blocks = "forbid"\n', "");
  assert.equal(manifestProblems(manifests(root, noSafety, crate)).length, 1);
  const inherited = app + "\n[lints]\nworkspace = true\n";
  assert.ok(manifestProblems(manifests(root, inherited, crate)).length >= 1);
});

test("every other member inherits the workspace's lints", () => {
  const own = crate.replace("[lints]\nworkspace = true\n", '[lints.rust]\nunsafe_code = "allow"\n');
  assert.ok(manifestProblems(manifests(root, app, own)).length >= 1);
  const none = crate.replace("[lints]\nworkspace = true\n", "");
  assert.equal(manifestProblems(manifests(root, app, none)).length, 1);
});

test("a flag that turns the lint off fails wherever it is written", () => {
  for (const text of ['[build]\nrustflags = ["-A", "unsafe_code"]\n', '[target.x]\nrustflags = ["--cap-lints=allow"]\n']) {
    assert.equal(manifestProblems([...manifests(root, app, crate), file(".cargo/config.toml", text)]).length, 1, text);
  }
});

test("the repository itself passes", () => {
  assert.deepEqual(scan(), []);
});
