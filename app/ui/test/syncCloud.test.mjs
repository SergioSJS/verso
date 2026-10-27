// Sync with a cloud (ADR 0104 item 16): the form sends the secret once and
// empties its field; a refused service is said with its reason and nothing
// is started; an accepted one shows the space, what the first sync does,
// that deletions are final and that a phone cannot reach it; and a folder
// that syncs with a cloud is drawn as one (no rooms, "Desconectar…", the
// cloud's own lines).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost:7340/", settings: { navigation: { disableMainFrameNavigation: true } } });
for (const name of ["window", "document", "HTMLElement", "Node", "Element", "HTMLInputElement", "HTMLTextAreaElement", "localStorage", "addEventListener", "getComputedStyle"]) {
  globalThis[name] = name === "window" ? win : typeof win[name] === "function" ? win[name].bind(win) : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
class MockIntersectionObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.IntersectionObserver = MockIntersectionObserver;
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = MockResizeObserver;
globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, "\\$&"), highlights: new Map() };

let calls = [];
let checked = { accepted: true, problem: null, message: null, label: "nuvem.exemplo.com/dav", deletions: "final", notes: [], free: 5000000000, remote_files: 3, remote_bytes: 2048 };
win.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "folder_sync_cloud_check") return checked;
    if (cmd === "folder_space") return { total: 4096, notes: 1, attachments: 0, files: 7, index: 0 };
    if (cmd === "set_device_name") return { device: { name: args.name, system: "Mac de Teste", custom: true }, unreached: [] };
    if (cmd === "device_name") return { name: "Mac de Teste", system: "Mac de Teste", custom: false };
    return null;
  },
  transformCallback: () => 0,
  metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
};
globalThis.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__;
win.localStorage.setItem("verso.settings", "{}");

for (const id of ["open", "folder", "collapse", "ribbon", "search", "search-label", "search-clear", "status", "report-bug", "words", "notes-heading", "notes", "tree-root", "spaces", "panes", "top-progress", "top-progress-fill", "index-progress", "index-progress-bar", "index-progress-label", "toggle-side", "toggle-right", "right-divider", "side-divider", "keys-commands", "right", "right-tabs", "right-body"]) {
  const e = document.createElement("div");
  e.id = id;
  document.body.append(e);
}

const stubMain = {
  name: "stub-main",
  setup(build) {
    build.onResolve({ filter: /(^|\/)main$/ }, () => ({ path: "main", namespace: "stub-main" }));
    build.onLoad({ filter: /.*/, namespace: "stub-main" }, () => ({
      contents: [
        "export const noLayout = () => {};",
        "export const updateLeavesLineNumbers = () => {};",
        "export const panel = null;",
        "export const ribbon = null;",
        "export const plan = null;",
        "export const updateController = null;",
        "export const settingsDialog = null;",
        "export const paletteDialog = null;",
        "export const replaceDialog = null;",
        "export const quick = null;",
        "export const bugDialog = null;",
        "export const armDrag = () => {};",
        "export const landIn = () => {};",
        "export const persistSoon = () => {};",
        "export const orderToggle = () => {};",
        "export const closeWhereNoTab = () => {};",
        "export const focusSwitcher = () => {};",
        "export const openConsole = () => {};",
        "export const notesHeadingReset = () => {};",
        "export const notesHeadingText = () => {};"
      ].join("\n"),
      loader: "js",
    }));
  },
};

document.documentElement.lang = "pt-BR";

await esbuild.build({
  entryPoints: ["src/dialogs/syncView.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  plugins: [stubMain],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  outfile: "test/.bundles/syncCloud.test-bundle.mjs",
  logLevel: "error",
});
const { drawSyncOn } = await import("./.bundles/syncCloud.test-bundle.mjs");
await esbuild.build({
  entryPoints: ["src/dialogs/syncCloud.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  plugins: [stubMain],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  outfile: "test/.bundles/syncCloudForm.test-bundle.mjs",
  logLevel: "error",
});
const { drawCloudForm, chooser, deviceNameRow } = await import("./.bundles/syncCloudForm.test-bundle.mjs");

const item = (title, desc, control) => {
  const row = document.createElement("div");
  row.className = "settings-item";
  row.append(title);
  if (control) row.append(control);
  return row;
};
const deps = (started = []) => ({ item, size: (n) => `${n ?? 0} B`, started: (st) => started.push(st) });
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const input = (box, label) => box.querySelector(`input[aria-label="${label}"]`);
const status = (cloud) => ({
  key: "k", on: true, server: "nuvem.exemplo.com/dav", folder: "nuvem.exemplo.com/dav", folder_name: "", role: "owner", state: "synced",
  sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], cloud_only: [], log: [], last: null, message: null, problem: null, versions: null, revoked: null, cloud,
});

describe("The form to sync with a cloud", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    calls = [];
    checked = { accepted: true, problem: null, message: null, label: "nuvem.exemplo.com/dav", deletions: "final", notes: [], free: 5000000000, remote_files: 3, remote_bytes: 2048 };
  });

  test("a WebDAV form sends the secret once and empties the field", async () => {
    const box = document.createElement("div");
    document.body.append(box);
    drawCloudForm(box, "webdav", deps());
    input(box, "Endereço da pasta").value = "https://nuvem.exemplo.com/dav";
    input(box, "Usuário").value = "ana";
    const secret = input(box, "Senha");
    assert.equal(secret.type, "password");
    secret.value = "segredo";
    box.querySelector("button.primary").click();
    // Emptied at once, before the answer.
    assert.equal(secret.value, "");
    await tick();
    const sent = calls.filter((c) => c.cmd === "folder_sync_cloud_check");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].args.secret, "segredo");
    assert.deepEqual(sent[0].args.settings, { provider: "webdav", endpoint: "https://nuvem.exemplo.com/dav", bucket: "", prefix: "", region: "", user: "ana", path_style: false, plain_http: false });
    // The answer says what is there, what the first sync does and what a deletion is.
    const ok = box.querySelector(".sync-cloud-ok");
    assert.ok(ok, "accepted: the panel is shown");
    assert.match(ok.textContent, /Destino: nuvem\.exemplo\.com\/dav/);
    assert.match(ok.textContent, /Já há 3 arquivos na nuvem/);
    assert.match(ok.textContent, /Esta pasta tem 7 arquivos/);
    assert.match(ok.textContent, /Na primeira vez, nada é apagado/);
    assert.match(ok.textContent, /é definitivo/);
    assert.match(ok.textContent, /use um UniVerso/);
    // Nothing was started by checking.
    assert.equal(calls.filter((c) => c.cmd === "folder_sync_cloud_start").length, 0);
  });

  test("starting asks the host to start, and tells the window", async () => {
    const box = document.createElement("div");
    document.body.append(box);
    const started = [];
    drawCloudForm(box, "webdav", deps(started));
    input(box, "Endereço da pasta").value = "https://nuvem.exemplo.com/dav";
    input(box, "Usuário").value = "ana";
    input(box, "Senha").value = "segredo";
    box.querySelector("button.primary").click();
    await tick();
    box.querySelector(".sync-cloud-ok button.primary").click();
    await tick();
    assert.equal(calls.filter((c) => c.cmd === "folder_sync_cloud_start").length, 1);
  });

  test("a refused service is said with its reason, and nothing can be started", async () => {
    checked = { accepted: false, problem: "service_refused", message: "the service does not honour If-Match", label: "", deletions: "unknown", notes: [], free: null, remote_files: 0, remote_bytes: 0 };
    const box = document.createElement("div");
    document.body.append(box);
    drawCloudForm(box, "webdav", deps());
    input(box, "Endereço da pasta").value = "https://nuvem.exemplo.com/dav";
    input(box, "Usuário").value = "ana";
    input(box, "Senha").value = "segredo";
    box.querySelector("button.primary").click();
    await tick();
    const failure = box.querySelector(".sync-failure");
    assert.equal(failure.hidden, false);
    assert.equal(failure.getAttribute("role"), "alert");
    assert.match(failure.textContent, /não consegue guardar as edições com segurança/);
    assert.match(failure.textContent, /If-Match/);
    assert.equal(box.querySelector(".sync-cloud-ok"), null);
  });

  test("a cloud with no conditional delete is refused with its own sentence and the reason", async () => {
    checked = { accepted: false, problem: "no_conditional_delete", message: "the service does not honour If-Match on a delete", label: "", deletions: "unknown", notes: [], free: null, remote_files: 0, remote_bytes: 0 };
    const box = document.createElement("div");
    document.body.append(box);
    drawCloudForm(box, "s3", deps());
    input(box, "Bucket").value = "cofre";
    input(box, "ID da chave de acesso").value = "AKIA123";
    input(box, "Chave secreta").value = "xyz";
    box.querySelector("button.primary").click();
    await tick();
    const failure = box.querySelector(".sync-failure");
    assert.equal(failure.hidden, false);
    assert.match(failure.textContent, /não confere a versão antes de apagar/);
    assert.match(failure.textContent, /If-Match on a delete/);
    assert.equal(box.querySelector(".sync-cloud-ok"), null);
  });

  test("an S3 form asks for the bucket, the prefix and the key, and sends the path style only with an endpoint", async () => {
    const box = document.createElement("div");
    document.body.append(box);
    drawCloudForm(box, "s3", deps());
    assert.ok(input(box, "Região") && input(box, "Bucket") && input(box, "Pasta dentro do bucket"));
    input(box, "Bucket").value = "cofre";
    input(box, "Pasta dentro do bucket").value = "Verso/Campanha";
    input(box, "ID da chave de acesso").value = "AKIA123";
    input(box, "Chave secreta").value = "xyz";
    box.querySelector("button.primary").click();
    await tick();
    const sent = calls.find((c) => c.cmd === "folder_sync_cloud_check").args;
    assert.equal(sent.settings.provider, "s3");
    assert.equal(sent.settings.endpoint, "");
    assert.equal(sent.settings.path_style, false);
    assert.equal(sent.settings.bucket, "cofre");
    assert.equal(sent.settings.prefix, "Verso/Campanha");
    assert.equal(sent.secret, "xyz");
  });

  test("the plain-HTTP confirmation appears only for an http:// address", () => {
    const box = document.createElement("div");
    document.body.append(box);
    drawCloudForm(box, "webdav", deps());
    const confirm = box.querySelector(".sync-cloud-http");
    assert.equal(confirm.hidden, true);
    const address = input(box, "Endereço da pasta");
    address.value = "http://192.168.0.2/dav";
    address.dispatchEvent(new win.Event("input"));
    assert.equal(confirm.hidden, false);
  });

  test("the chooser offers a UniVerso, WebDAV and S3, and shows the other clouds as coming soon", () => {
    const row = chooser("universo", () => {}, deps());
    const options = [...row.querySelectorAll("option")];
    assert.deepEqual(options.map((o) => o.value), ["universo", "webdav", "s3", "dropbox", "onedrive", "gdrive"]);
    assert.deepEqual(options.filter((o) => o.disabled).map((o) => o.value), ["dropbox", "onedrive", "gdrive"]);
    assert.match(options[3].textContent, /em breve/);
  });

  test("the device's name is set without a server", async () => {
    const row = deviceNameRow(item);
    document.body.append(row);
    await tick();
    const name = row.querySelector("input");
    assert.equal(name.value, "Mac de Teste");
    name.value = "Estúdio";
    name.dispatchEvent(new win.Event("change"));
    await tick();
    assert.deepEqual(calls.find((c) => c.cmd === "set_device_name").args, { name: "Estúdio" });
  });
});

describe("A folder that syncs with a cloud", () => {
  beforeEach(() => document.body.replaceChildren());

  test("is drawn as one: its own lines, no rooms, and disconnecting", () => {
    const box = document.createElement("div");
    drawSyncOn(box, status({ provider: "webdav", label: "nuvem.exemplo.com/dav", deletions: "final", notes: ["a nota"] }), async () => {}, () => null, () => {});
    assert.match(box.querySelector(".sync-meta").textContent, /WebDAV · nuvem\.exemplo\.com\/dav/);
    assert.equal(box.querySelector(".sync-together"), null, "a cloud has no rooms");
    const buttons = [...box.querySelectorAll(".sync-buttons button")].map((b) => b.textContent);
    assert.ok(buttons.includes("Desconectar…"), buttons.join("|"));
    const about = box.querySelector(".sync-cloud");
    assert.ok(about);
    assert.match(about.textContent, /é definitivo/);
    assert.match(about.textContent, /a nota/);
    assert.match(about.textContent, /celular/);
    assert.match(box.querySelector(".sync-calm").textContent, /aqui ou na nuvem/);
  });

  test("a server's folder keeps its rooms and has no cloud section", () => {
    const box = document.createElement("div");
    drawSyncOn(box, status(null), async () => {}, () => null, () => {});
    assert.ok(box.querySelector(".sync-together"));
    assert.equal(box.querySelector(".sync-cloud"), null);
    const buttons = [...box.querySelectorAll(".sync-buttons button")].map((b) => b.textContent);
    assert.ok(buttons.includes("Desligar…"));
  });

  test("a bucket that keeps versions says deletions can be recovered", () => {
    const box = document.createElement("div");
    drawSyncOn(box, status({ provider: "s3", label: "s3://cofre/Verso", deletions: "kept", notes: [] }), async () => {}, () => null, () => {});
    assert.match(box.querySelector(".sync-cloud").textContent, /guarda versões anteriores/);
  });
});
