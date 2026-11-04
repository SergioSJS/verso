// The words of the internet link (ADR 0117 D3, D10; src/dialogs/
// localServerLinkStrings.ts): every refusal of the host a person meets on
// the link's path is said in the interface's language — and each phrase
// matched is still the host's own (read from the Rust sources here, so a
// host's message that changes fails this test instead of falling back to
// English unseen); the time left of the twelve hours; both languages whole.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

globalThis.document = { documentElement: { lang: "pt-BR" } };

await esbuild.build({
  entryPoints: ["src/dialogs/localServerLinkStrings.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/localServerLink.test-bundle.mjs",
  logLevel: "error",
});
const L = await import("./.bundles/localServerLink.test-bundle.mjs");

/** The host's words: the link's module, the commands, the local server. */
function hostSources() {
  const dirs = ["../src-tauri/src/tunnel", "../src-tauri/src/local_server", "../../crates/verso-server/src/local"];
  return dirs
    .flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".rs") && !f.startsWith("tests")).map((f) => readFileSync(join(d, f), "utf8")))
    .join("\n");
}

const CASES = [
  ["is not the one Verso pins", "checksum"],
  ["the download of cloudflared", "download"],
  ["no cloudflared is published", "system"],
  ["reached no Cloudflare server", "blocked"],
  ["gave no quick link in time", "noLink"],
  ["ended before the link was up", "ended"],
  ["the link was stopped", "stopped"],
  ["tick at least one folder", "noFolder"],
  ["set up your own address first", "needOwn"],
  ["already has another DNS record", "taken"],
  ["tunnel of that name already exists", "tunnelTaken"],
  ["sign in to Cloudflare first", "signIn"],
  ["like mesa.example.com", "hostname"],
  ["turn serving on first", "needOn"],
  ["that app is not signed in here", "appGone"],
  ["that person has no account here", "personGone"],
];

test("each refusal of the link's path is the host's own phrase and is said in words", () => {
  const rust = hostSources();
  const w = L.linkStrings();
  for (const [phrase, key] of CASES) {
    assert.ok(rust.includes(phrase), `the host no longer says “${phrase}”`);
    assert.equal(L.linkWhy(`something: ${phrase} (detail)`, w), w.why[key], phrase);
  }
  // A folder that also syncs with a server, as the start and the tick say it.
  assert.ok(rust.includes("also syncs with {}: open that address on the phone instead"), "the host no longer refuses a synced folder that way");
  assert.equal(L.linkWhy("verso-vault-test also syncs with 192.168.3.150:7340: open that address on the phone instead, or untick it", w), w.synced("verso-vault-test", "192.168.3.150:7340"));
  assert.match(L.linkWhy("this folder also syncs with 192.168.3.150:7340: open that address on the phone instead", w), /192\.168\.3\.150:7340/);
  assert.ok(rust.includes("turn serving off to change which folders are served"));
  assert.equal(L.linkWhy("turn serving off to change which folders are served", w), w.why.servingLocks);
  // Anything else is errorSentence's.
  assert.equal(L.linkWhy("a refusal of another kind", w), null);
});

test("the twelve hours: hours and minutes left, never below zero", () => {
  const now = Date.UTC(2026, 10, 4, 12, 0, 0);
  const until = now / 1000 + 12 * 3600;
  assert.deepEqual(L.timeLeft(until, now), { h: 12, m: 0 });
  assert.deepEqual(L.timeLeft(until, now + 61 * 60_000 + 30_000), { h: 10, m: 58 });
  assert.deepEqual(L.timeLeft(until, now + 13 * 3600_000), { h: 0, m: 0 });
  assert.match(L.clockAt(until, "pt-BR"), /^\d\d:\d\d$/);
});

test("both languages have every word, none empty", () => {
  globalThis.document.documentElement.lang = "pt-BR";
  const pt = L.linkStrings();
  globalThis.document.documentElement.lang = "en";
  const en = L.linkStrings();
  assert.notEqual(pt, en);
  const walk = (a, b, at) => {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), at);
    for (const k of Object.keys(a)) {
      if (typeof a[k] === "string") assert.ok(a[k].length > 0 && b[k].length > 0, `${at}.${k}`);
      else if (typeof a[k] === "object") walk(a[k], b[k], `${at}.${k}`);
      else assert.equal(typeof b[k], "function", `${at}.${k}`);
    }
  };
  walk(pt, en, "words");
  // The section's name stays the feature's; the box says testing mode.
  assert.match(pt.linkBox, /modo de teste/);
  assert.match(en.linkBox, /testing mode/);
  assert.match(en.left(3, 5, "23:15"), /3 h 05 min/);
  globalThis.document.documentElement.lang = "pt-BR";
});

test("the download is said only while it downloads, in megabytes of the whole", () => {
  globalThis.document.documentElement.lang = "pt-BR";
  const w = L.linkStrings();
  // Every start says "turning on"; the download's words are its own.
  assert.doesNotMatch(w.starting, /cloudflared|baix/i);
  assert.equal(L.megabytes(12 * 1_048_576 + 300_000), 12);
  assert.match(w.downloading(12, 40), /12 de 40 MB/);
  assert.match(w.downloading(12, null), /12 MB/);
  assert.match(w.markLinkStarting, /ligando o link/);
  globalThis.document.documentElement.lang = "en";
  assert.match(L.linkStrings().downloading(3, 40), /3 of 40 MB/);
  globalThis.document.documentElement.lang = "pt-BR";
});

test("a new quick link's wait is said in both languages", () => {
  globalThis.document.documentElement.lang = "pt-BR";
  assert.equal(L.linkStrings().freshLink, "Um link novo pode levar até um minuto para abrir.");
  globalThis.document.documentElement.lang = "en";
  assert.match(L.linkStrings().freshLink, /up to a minute/);
  globalThis.document.documentElement.lang = "pt-BR";
});
