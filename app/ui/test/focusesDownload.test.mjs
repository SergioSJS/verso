// Focos: o arquivo .space/waypoints.json só na nuvem (ADR 0043). O botão
// "Baixar agora" é o que baixa; depois os focos são lidos de novo; a falha
// é dita; sem clique, nada é baixado.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const out = await esbuild.build({ entryPoints: ["src/focusesDownload.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { downloadFocusesFile } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

const words = { fetching: "baixando", done: "baixado", nothing: "ja estava", failed: "falhou" };
function deps(fetchFile, cloud = true, still = false) {
  const log = [];
  return {
    log,
    d: {
      fetchFile: async () => (log.push(["fetch"]), fetchFile()),
      reload: async () => (log.push(["reload"]), still),
      say: (t) => void log.push(["say", t]),
      fail: (e) => void log.push(["fail", e]),
      isCloudFailure: () => cloud,
      words,
    },
  };
}

describe("downloadFocusesFile", () => {
  test("downloads the focuses file, reads the focuses again and says so", async () => {
    const { d, log } = deps(async () => ({ status: "ok", data: true }));
    assert.equal(await downloadFocusesFile(d), "downloaded");
    assert.deepEqual(log, [["say", "baixando"], ["fetch"], ["reload"], ["say", "baixado"]]);
  });
  test("a file that was no longer a placeholder: focuses re-read, said", async () => {
    const { d, log } = deps(async () => ({ status: "ok", data: false }));
    assert.equal(await downloadFocusesFile(d), "nothing");
    assert.deepEqual(log.at(-1), ["say", "ja estava"]);
    assert.ok(log.some((l) => l[0] === "reload"));
  });
  test("a reload that still reports the cloud placeholder is a failure, not 'already here'", async () => {
    const { d, log } = deps(async () => ({ status: "ok", data: false }), true, true);
    assert.equal(await downloadFocusesFile(d), "failed");
    assert.deepEqual(log.at(-1), ["say", "falhou"]);
  });
  test("the cloud not giving the file is said visibly and nothing is re-read", async () => {
    const { d, log } = deps(async () => ({ status: "error", error: { kind: "unavailable" } }));
    assert.equal(await downloadFocusesFile(d), "failed");
    assert.deepEqual(log.at(-1), ["say", "falhou"]);
    assert.ok(!log.some((l) => l[0] === "reload"));
  });
  test("another error goes through the window's own way of saying errors", async () => {
    const { d, log } = deps(async () => ({ status: "error", error: { kind: "failed" } }), false);
    assert.equal(await downloadFocusesFile(d), "failed");
    assert.deepEqual(log.at(-1), ["fail", { kind: "failed" }]);
  });
  test("a command that throws is said too", async () => {
    const { d, log } = deps(async () => { throw new Error("link"); });
    assert.equal(await downloadFocusesFile(d), "failed");
    assert.equal(log.at(-2)[1], "falhou");
    assert.equal(log.at(-1)[0], "fail");
  });
  test("nothing is fetched until it is called", () => {
    const { log } = deps(async () => ({ status: "ok", data: true }));
    assert.deepEqual(log, []);
  });
});

describe("askSyncAfterDownload", async () => {
  const { askSyncAfterDownload } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
  const base = { outcome: "downloaded", hasFile: true, formatKnown: true, syncOn: false, asked: false };
  test("asks once when the file came down in the known format and the folder was never asked", () => {
    assert.equal(askSyncAfterDownload(base), true);
  });
  test("never asks again after an answer, yes or no", () => {
    assert.equal(askSyncAfterDownload({ ...base, asked: true }), false);
    assert.equal(askSyncAfterDownload({ ...base, asked: true, syncOn: true }), false);
  });
  test("does not ask when nothing came down, the format is unknown or it failed", () => {
    assert.equal(askSyncAfterDownload({ ...base, outcome: "failed" }), false);
    assert.equal(askSyncAfterDownload({ ...base, outcome: "nothing" }), false);
    assert.equal(askSyncAfterDownload({ ...base, formatKnown: false }), false);
    assert.equal(askSyncAfterDownload({ ...base, hasFile: false }), false);
  });
});

describe("folderFlag", () => {
  test("a failed download is remembered for its folder only", async () => {
    const out2 = await esbuild.build({ entryPoints: ["src/focusesDownload.ts"], bundle: true, write: false, format: "esm", platform: "node" });
    const { folderFlag } = await import(`data:text/javascript;base64,${Buffer.from(out2.outputFiles[0].text).toString("base64")}`);
    const f = folderFlag();
    assert.equal(f.get("/a"), false);
    f.set("/a", true);
    assert.equal(f.get("/a"), true);
    assert.equal(f.get("/b"), false);
    f.set("/a", false);
    assert.equal(f.get("/a"), false);
  });
});
