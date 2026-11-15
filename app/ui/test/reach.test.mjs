// A server that cannot be reached is said where the person acted (the
// maintainer, 2026-10-14: "Sincronizar esta pasta" with the server down
// showed nothing): the panel says which server and why it may be, in the
// window's language, offers to try again, and writes one line to the
// console (a warning: test/errorKinds.test.mjs).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;

await esbuild.build({
  entryPoints: ["src/reach.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/reach.test-bundle.mjs",
  logLevel: "error",
});
const { addressOf, attempt, failureText, isPairedUrl, reachSentence, sayFailure, unreachableAt } = await import("./.bundles/reach.test-bundle.mjs");

await esbuild.build({
  entryPoints: ["src/errorKinds.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/errorKindsReach.test-bundle.mjs",
  logLevel: "error",
});
const { dueToSay, levelOf } = await import("./.bundles/errorKindsReach.test-bundle.mjs");

const DOWN = { kind: "unreachable", message: "localhost:7351" };

/** What the console was told while `run` ran, by level. */
async function heard(run) {
  const lines = [];
  const kept = { info: console.info, warn: console.warn, error: console.error };
  for (const level of Object.keys(kept)) console[level] = (...a) => lines.push([level, a.join(" ")]);
  try {
    await run();
  } finally {
    Object.assign(console, kept);
  }
  return lines;
}

beforeEach(() => {
  document.documentElement.lang = "pt-BR";
  document.body.replaceChildren();
});

describe("A server out of reach, said in the panel", () => {
  test("names the server, in Portuguese, as an alert with a way to try again", async () => {
    const where = document.createElement("div");
    document.body.append(where);
    let tries = 0;
    await heard(() => sayFailure(where, DOWN, () => tries++));
    const alert = where.querySelector('[role="alert"]');
    assert.ok(alert, "no alert in the panel");
    assert.equal(alert.querySelector("p").textContent, "Não foi possível alcançar o servidor localhost:7351 — ele está fora do ar ou sem rede.");
    const again = alert.querySelector("button");
    assert.equal(again.textContent, "Tentar de novo");
    again.click();
    assert.equal(tries, 1);
  });

  test("in English when the window speaks it", () => {
    document.documentElement.lang = "en";
    assert.equal(failureText(DOWN), "Couldn't reach the server localhost:7351 — it is down or the network is off.");
  });

  // ADR 0097: the name resolved to addresses and none answered; the message
  // carries them, one a line after the address, and the sentence names each
  // so a bad DNS reads as one.
  test("a name that resolved to an address where nothing answered says which, in both languages", () => {
    const e = { kind: "unreachable", message: "universo.casa.exemplo.com\n10.0.0.1\n192.168.0.5" };
    assert.equal(
      failureText(e),
      "Não foi possível alcançar o servidor universo.casa.exemplo.com — ele está fora do ar ou sem rede. universo.casa.exemplo.com → 10.0.0.1: sem resposta; universo.casa.exemplo.com → 192.168.0.5: sem resposta. Confira o DNS desta rede: o nome pode estar apontando para o endereço errado.",
    );
    document.documentElement.lang = "en";
    assert.match(failureText(e), /^Couldn't reach the server universo\.casa\.exemplo\.com — .* universo\.casa\.exemplo\.com → 10\.0\.0\.1: no answer; .*→ 192\.168\.0\.5: no answer\. Check this network's DNS/);
    // The port is not part of the name; one address tried is no DNS hint.
    const withPort = { kind: "unreachable", message: "nas.casa:7340\n10.0.0.1" };
    assert.match(failureText(withPort), /nas\.casa → 10\.0\.0\.1: no answer\.$/);
    assert.doesNotMatch(failureText(withPort), /DNS/);
    assert.equal(unreachableAt(e), "universo.casa.exemplo.com");
  });

  test("another failure keeps the window's own sentence", () => {
    assert.equal(failureText({ kind: "refused", message: "x" }, () => "Erro: recusado"), "Erro: recusado");
  });

  test("the button is busy while it tries, the failure said after, and gone once a try succeeds", async () => {
    const where = document.createElement("div");
    const button = document.createElement("button");
    document.body.append(where, button);
    let answer = { status: "error", error: DOWN };
    let during = null;
    const call = async () => {
      during = { disabled: button.disabled, busy: button.getAttribute("aria-busy") };
      return answer;
    };
    const lines = await heard(() => attempt(where, call, { button }));
    assert.deepEqual(during, { disabled: true, busy: "true" });
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-busy"), null);
    assert.match(where.textContent, /localhost:7351/);
    // One line in the console, a warning — the e2e suite fails a test on
    // `console.error`, and the window's own `console.error` is an accident.
    assert.deepEqual(lines, [["warn", "Verso: unreachable: localhost:7351"]]);
    // The server is back: "Tentar de novo" tries the same call, and the
    // failure goes.
    answer = { status: "ok", data: [] };
    await heard(async () => {
      where.querySelector("button").click();
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.equal(where.textContent, "");
    assert.equal(where.hidden, true);
  });
});

describe("What the log and the console get", () => {
  test("an unreachable server is a warning, not an error", () => {
    assert.equal(levelOf("unreachable"), "WARN");
    assert.equal(levelOf("failed"), "ERROR");
  });
  test("once a minute per server", () => {
    const said = new Map();
    assert.equal(dueToSay(said, "localhost:7351", 0), true);
    assert.equal(dueToSay(said, "localhost:7351", 30_000), false);
    assert.equal(dueToSay(said, "notas.casa", 30_000), true);
    assert.equal(dueToSay(said, "localhost:7351", 60_000), true);
  });
});

// A computer at home paired with this app (ADR 0117, "The Verso app
// paired") is named for what it is, never by the name the app reaches it
// by, and its absence is the copy's ordinary day, not a server down.
test("a paired computer is named for what it is, and away is said calmly", () => {
  document.documentElement.lang = "pt-BR";
  const url = "https://verso-0123456789abcdef0123.home.arpa:51234";
  assert.equal(isPairedUrl(url), true);
  assert.equal(addressOf(url), "o computador de casa");
  assert.match(reachSentence("verso-0123456789abcdef0123.home.arpa:51234\n192.168.1.20"), /^O computador de casa não respondeu/);
  for (const other of ["https://notas.casa.lan", "https://verso-0123.home.arpa:1", "https://verso-0123456789abcdef0123.home.arpa.evil.com"]) {
    assert.equal(isPairedUrl(other), false, other);
  }
  assert.equal(addressOf("https://notas.casa.lan:7340/x"), "notas.casa.lan:7340");
  document.documentElement.lang = "en";
  assert.equal(addressOf(url), "the computer at home");
});
