#!/usr/bin/env node
// Live board-element veil (ADR 0083 item 19; ADR 0113 section H, ADR 0090
// item 5): over the network, against a running server, a player who edits a
// table's board is shown only the elements she sees — a hidden file's card
// as a locked marker with the same id, no secret pin, no edge or drawing of
// it — and every edit that touches what she does not see is refused whole.
// A player who only sees the board joins it read-only and hears none of it.
//
// The live twin of crates/verso-server/src/tests_board_players.rs: the same
// board, the same canaries, the same refused edits, but through TLS, the
// sign-in cookie and /api/ws of the lab container, with yjs as the window
// uses it. Every frame a player hears is searched for the canaries, with any
// base64 string in it decoded first. Lab only, never shipped.
//
// Usage (Node 24, from the repo root):
//   node lab/hostile/ws_board.mjs https://localhost:18443
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The lab's server uses a throwaway self-signed certificate on 127.0.0.1.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../app/ui/package.json"));
const Y = require("yjs");
const WebSocket = require("ws");

const BASE = (process.argv[2] || "https://localhost:18443").replace(/\/$/, "");
const WS_URL = BASE.replace(/^http/, "ws") + "/api/ws";
const ADMIN_PW = "uma senha bem longa de teste";
const PW = "outra senha bem longa aqui";
const TAG = String(Date.now());
const BOARD = "Quadro.canvas";

// What only the hidden things of the board hold. The marker keeps its id,
// so `c-hid` is not here.
const LEAKS = ["zqpin", "zqedge", "zqdraw", "zqlabel", "Barão Zq", "zqbody", "zqhidcolor"];
// A text card's secret block is the editor's (ADR 0087 item 5), so it is
// a leak only for the player who only sees the board.
const EDITOR_SEES = "zqblock";

const findings = [];
function finding(level, title, detail = "") {
  findings.push({ level, title, detail });
  console.log(`  [${level}] ${title}${detail ? " — " + detail : ""}`);
}
const held = (msg) => console.log(`  held: ${msg}`);

// ---- HTTP -------------------------------------------------------------
class Http {
  constructor() {
    this.jar = new Map();
    this.csrf = null;
  }
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async call(method, p, body) {
    const headers = { Origin: BASE };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.csrf && method !== "GET") headers["x-verso-csrf"] = this.csrf;
    if (this.jar.size) headers.cookie = this.cookie();
    const r = await fetch(BASE + p, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      this.jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: r.status, text, json };
  }
  async signin(email, password) {
    const r = await this.call("POST", "/api/signin", { email, password });
    if (r.json?.csrf) this.csrf = r.json.csrf;
    return r;
  }
}

// ---- WebSocket --------------------------------------------------------
function decoded(text) {
  // The frame, plus every base64 string inside it decoded (updates, data).
  let all = text;
  const walk = (v) => {
    if (typeof v === "string") {
      if (v.length >= 8 && /^[A-Za-z0-9+/]+={0,2}$/.test(v)) {
        all += "\n" + Buffer.from(v, "base64").toString("utf8");
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  try {
    walk(JSON.parse(text));
  } catch {}
  return all;
}

class Win {
  constructor(name, http, canaries) {
    this.name = name;
    this.http = http;
    this.canaries = canaries;
    this.queue = [];
    this.waiters = [];
    this.n = 0;
    this.leaked = new Set();
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL, {
        headers: { Origin: BASE, Cookie: this.http.cookie() },
        rejectUnauthorized: false,
      });
      this.ws.on("open", () => resolve(this));
      this.ws.on("error", reject);
      this.ws.on("message", (data) => {
        const text = data.toString();
        const all = decoded(text);
        for (const c of this.canaries) {
          if (all.includes(c) && !this.leaked.has(c)) {
            this.leaked.add(c);
            finding("BLOCKING", `${this.name} heard the hidden "${c}"`, text.slice(0, 160));
          }
        }
        let m = null;
        try {
          m = JSON.parse(text);
        } catch {}
        this.queue.push(m);
        this.waiters.splice(0).forEach((w) => w());
      });
    });
  }
  next(ms) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(t);
        resolve(this.queue.shift());
      };
      // A wait that times out leaves the list, or it would eat the next frame.
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== wake);
        resolve(undefined);
      }, ms);
      this.waiters.push(wake);
    });
  }
  // The answer to a command, and every other frame heard meanwhile.
  async call(cmd, args, ms = 15000) {
    const id = ++this.n;
    this.ws.send(JSON.stringify({ id, cmd, args }));
    const events = [];
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const m = await this.next(until - Date.now());
      if (m === undefined) break;
      if (m && m.id === id) return { reply: m, events };
      events.push(m);
    }
    return { reply: null, events };
  }
  async hear(ms) {
    const out = [];
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const m = await this.next(until - Date.now());
      if (m === undefined) break;
      out.push(m);
    }
    return out;
  }
  close() {
    this.ws?.close();
  }
}

// ---- the board room, as the window keeps it ----------------------------
const b64 = (u8) => Buffer.from(u8).toString("base64");
const bytes = (s) => new Uint8Array(Buffer.from(s, "base64"));

function elements(doc) {
  const out = {};
  const best = {};
  doc.getMap("elements").forEach((v, k) => {
    const [id, ver, nonce] = k.split("\n");
    const rank = [Number(ver), -Number(nonce)];
    const b = best[id];
    if (!b || rank[0] > b[0] || (rank[0] === b[0] && rank[1] > b[1])) {
      best[id] = rank;
      try {
        out[id] = JSON.parse(v);
      } catch {}
    }
  });
  return out;
}

// A window's write of `element` at `version`/`nonce`, as an update.
function put(doc, id, version, nonce, element) {
  const before = Y.encodeStateVector(doc);
  const map = doc.getMap("elements");
  doc.transact(() => {
    for (const k of [...map.keys()]) {
      const [i, v, n] = k.split("\n");
      if (i === id && (Number(v) < version || (Number(v) === version && -Number(n) < -nonce))) {
        map.delete(k);
      }
    }
    map.set(`${id}\n${version}\n${nonce}`, JSON.stringify({ ...element, id, version, versionNonce: nonce }));
  });
  return Y.encodeStateAsUpdate(doc, before);
}

// A throwaway copy of a window's room, as the same client: an attempt the
// server refuses must not stay in the window's own copy.
function scratch(doc) {
  const d = new Y.Doc();
  d.clientID = doc.clientID;
  Y.applyUpdate(d, Y.encodeStateAsUpdate(doc));
  return d;
}

function meta(doc, key, value) {
  const before = Y.encodeStateVector(doc);
  doc.getMap("meta").set(key, value);
  return Y.encodeStateAsUpdate(doc, before);
}

function take(doc, events) {
  let n = 0;
  for (const e of events) {
    if (e?.event === "collab-update" && e.payload?.path === BOARD) {
      Y.applyUpdate(doc, bytes(e.payload.update));
      n++;
    }
  }
  return n;
}

async function join(win) {
  const { reply, events } = await win.call("collab_join", { path: BOARD });
  const doc = new Y.Doc();
  if (reply?.ok?.update) Y.applyUpdate(doc, bytes(reply.ok.update));
  return { reply, doc, events };
}

// The board file: a card of a file the players see, a card of a hidden
// file, a text card with a secret block, a secret pin, an edge to the pin,
// and a drawn arrow bound to the pin with its label.
const FILE = {
  nodes: [
    { id: "c-open", type: "file", file: "Livre.md", x: 0, y: 0, width: 200, height: 100 },
    { id: "c-hid", type: "file", file: "Barão Zq.md", x: 300, y: 0, width: 200, height: 100, color: "zqhidcolor" },
    { id: "note", type: "text", text: "palavra\n> [!secret] zqblock\n> do mestre", x: 0, y: 200, width: 200, height: 100 },
    { id: "zqpin", type: "text", text: "zqpinboard", verso: { secret: true }, x: 600, y: 0, width: 40, height: 40 },
  ],
  edges: [{ id: "zqedge", fromNode: "c-open", toNode: "zqpin" }],
  verso: {
    version: 1,
    drawing: [
      { id: "zqdraw", type: "arrow", startBinding: { elementId: "zqpin" }, x: 1, y: 1 },
      { id: "zqlabel", type: "text", text: "zqlabeltext", containerId: "zqdraw" },
      { id: "free", type: "rectangle", x: 9, y: 9 },
    ],
  },
};

function drawn() {
  const card = (n, i) => ({
    type: "embeddable",
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    index: `a${i}`,
    link: "https://verso.invalid/board-node",
    customData: { canvas: n },
    ...(n.id === "c-open" ? { boundElements: [{ id: "zqedge", type: "arrow" }] } : {}),
  });
  const out = FILE.nodes.map((n, i) => [n.id, card(n, i)]);
  out.push(["zqedge", { type: "arrow", x: 0, y: 0, width: 5, height: 5, index: "a8",
    startBinding: { elementId: "c-open" }, endBinding: { elementId: "zqpin" },
    customData: { canvas: { id: "zqedge", fromNode: "c-open", toNode: "zqpin" } } }]);
  out.push(["zqdraw", { type: "arrow", index: "a9", startBinding: { elementId: "zqpin" } }]);
  out.push(["zqlabel", { type: "text", index: "aa", text: "zqlabeltext", containerId: "zqdraw" }]);
  out.push(["free", { type: "rectangle", index: "ab", x: 9, y: 9 }]);
  return out;
}

const short = (v) => JSON.stringify(v ?? null).slice(0, 140);
const refused = (r) => r?.err?.kind === "refused";
const done = (r) => !!r && "ok" in r;

// ---- seed -------------------------------------------------------------
async function account(admin, who) {
  const email = `${who}-board-${TAG}@verso.test`;
  const made = await admin.call("POST", "/api/admin/accounts", { email, name: who, lang: "pt" });
  const tok = (made.json?.link || "").replace(/\/$/, "").split("/reset/").pop();
  const h = new Http();
  await h.call("POST", `/api/reset/${tok}`, { password: PW });
  h.csrf = null;
  h.jar.clear();
  const s = await h.signin(email, PW);
  if (s.status !== 200) throw new Error(`${who} sign-in: ${s.status} ${s.text.slice(0, 120)}`);
  return { email, http: h };
}

async function main() {
  console.log(`== target ${BASE}\n== seeding`);
  const admin = new Http();
  const s = await admin.signin("admin@verso.test", ADMIN_PW);
  if (s.json?.account?.admin !== true) throw new Error(`admin sign-in: ${s.status} ${s.text.slice(0, 120)}`);
  await admin.call("POST", "/api/me/prove", { password: ADMIN_PW });
  const folder = (await admin.call("POST", "/api/folders", { name: `Quadro-${TAG}` })).json?.id;

  const gm = await new Win("the game master", admin, []).open();
  await gm.hear(300);
  let r = (await gm.call("open_server_folder", { id: folder })).reply;
  console.log(`  GM opened the folder: ${short(r).slice(0, 70)}`);
  for (const [name, text] of [["Livre", "# Livre\naberta\n"], ["Barão Zq", "# Barão Zq\nzqbody\n"]]) {
    r = (await gm.call("create_note", { name, text })).reply;
    if (!done(r)) throw new Error(`create_note ${name}: ${short(r)}`);
  }
  r = (await gm.call("create_file", { path: BOARD, base64: b64(Buffer.from(JSON.stringify(FILE))) })).reply;
  if (!done(r)) throw new Error(`create_file: ${short(r)}`);
  await gm.call("reindex", {});
  r = (await gm.call("campaign_make", { root: "" })).reply;
  console.log(`  campaign_make: ${short(r).slice(0, 70)}`);
  r = (await gm.call("campaign_release", { paths: ["Livre.md"], released: true })).reply;
  console.log(`  Livre.md released to the table: ${r?.ok ? "ok" : short(r)}`);

  // The players come after the table is made.
  const bea = await account(admin, "bea");
  const cadu = await account(admin, "cadu");
  await admin.call("POST", "/api/me/prove", { password: ADMIN_PW });
  for (const p of [bea, cadu]) {
    const sh = await admin.call("PUT", `/api/folders/${folder}/shares`, { path: "", email: p.email, role: "reader" });
    console.log(`  share -> ${p.email.split("-")[0]} (reader, a player): ${sh.status}`);
  }
  const got = (await gm.call("access_get", { paths: [BOARD] })).reply;
  const players = (Array.isArray(got?.ok) ? got.ok[0]?.players : got?.ok?.players) || [];
  const beaId = players.find((p) => p.name === "bea")?.id;
  if (!beaId) throw new Error(`access_get players: ${short(got)}`);
  r = (await gm.call("access_set", {
    paths: [BOARD],
    change: { kind: "set", set: { whole: "see", rows: [{ account: beaId, level: "edit" }] }, secret_name: null },
  })).reply;
  console.log(`  board: the table sees it, Bea edits it: ${short(r).slice(0, 60)}`);

  // The game master's window draws the file into the room.
  const room = await join(gm);
  if (!room.reply?.ok) throw new Error(`GM collab_join: ${short(room.reply)}`);
  const seed = [...drawn().map(([id, e]) => put(room.doc, id, 1, 5, e)), meta(room.doc, "seeded", true)];
  r = (await gm.call("collab_update", { path: BOARD, update: b64(Y.mergeUpdates(seed)) })).reply;
  if (!done(r)) throw new Error(`GM seed: ${short(r)}`);
  const gmAll = () => elements(room.doc);
  console.log(`  GM room seeded: ${Object.keys(gmAll()).sort().join(", ")}`);

  // ---- Bea, who edits the board ----------------------------------------
  console.log("\n== Bea (a player who edits the board) joins it");
  const wb = await new Win("Bea", bea.http, LEAKS).open();
  await wb.hear(300);
  r = (await wb.call("open_server_folder", { id: folder })).reply;
  if (!done(r)) throw new Error(`Bea open: ${short(r)}`);
  const ana = await join(wb);
  console.log(`  join: kind=${ana.reply?.ok?.kind} read_only=${ana.reply?.ok?.read_only}`);
  if (ana.reply?.ok?.kind !== "board" || ana.reply?.ok?.read_only !== false) {
    finding("IMPORTANT", "an editing player did not join the board as an editor", short(ana.reply));
  }
  const mine = elements(ana.doc);
  const ids = Object.keys(mine).sort();
  console.log(`  elements she has: ${ids.join(", ")}`);
  for (const id of ["zqpin", "zqedge", "zqdraw", "zqlabel"]) {
    if (id in mine) finding("BLOCKING", `the hidden element ${id} reached Bea's board`, short(mine[id]));
  }
  if (!("zqpin" in mine)) held("no secret pin, no edge to it, no drawing bound to it in her room");
  const hid = mine["c-hid"];
  if (!hid) finding("IMPORTANT", "the hidden file's card is missing instead of a locked marker");
  else if (hid.locked === true && !hid.customData?.canvas?.file) held("the hidden file's card is a locked marker with the same id, no file");
  else finding("BLOCKING", "the hidden file's card reached Bea as it is", short(hid));
  if (mine["c-open"]?.customData?.canvas?.file === "Livre.md") console.log("  control OK: her own card is whole (Livre.md)");
  else finding("IMPORTANT", "the card of a file she sees did not reach her", short(mine["c-open"]));
  if (JSON.stringify(mine).includes(EDITOR_SEES)) console.log("  control OK: the text card's secret block is hers (she edits)");

  // Her edit of what she sees reaches the game master.
  console.log("\n== Bea edits what she sees (control)");
  await gm.hear(300);
  const open = { ...mine["c-open"], x: 77 };
  const mineUpdate = Y.mergeUpdates([
    put(ana.doc, "c-open", 2, 21, open),
    put(ana.doc, "hers", 1, 22, { type: "rectangle", index: "c0", x: 5 }),
    meta(ana.doc, `edit:${ana.doc.clientID}`, 1),
  ]);
  r = (await wb.call("collab_update", { path: BOARD, update: b64(mineUpdate) })).reply;
  const told = await gm.hear(800);
  take(room.doc, told);
  if (done(r) && gmAll()["c-open"]?.x === 77 && gmAll().hers?.x === 5) console.log("  control OK: accepted, and the GM's window got both");
  else finding("IMPORTANT", "an allowed edit did not reach the game master", `${short(r)} gm c-open.x=${gmAll()["c-open"]?.x}`);

  // What she is refused, each whole.
  console.log("\n== Bea attacks what she does not see");
  const before = JSON.stringify(["zqpin", "zqedge", "zqdraw", "zqlabel", "c-hid"].map((i) => gmAll()[i]));
  const attempts = [
    ["move the locked marker", put(scratch(ana.doc), "c-hid", 5, 31, { ...hid, x: 0 })],
    ["write the pin by its id", put(scratch(ana.doc), "zqpin", 5, 32, { type: "embeddable", x: 0 })],
    ["make a secret pin of her own", put(scratch(ana.doc), "n1", 1, 33, { type: "embeddable", index: "d0", x: 1,
      customData: { canvas: { id: "n1", type: "text", text: "x", verso: { secret: true } } } })],
    ["make a card of the hidden file", put(scratch(ana.doc), "n2", 1, 34, { type: "embeddable", index: "d1",
      customData: { canvas: { id: "n2", type: "file", file: "Barão Zq.md" } } })],
    ["make a card of a file that is not there", put(scratch(ana.doc), "n3", 1, 35, { type: "embeddable", index: "d2",
      customData: { canvas: { id: "n3", type: "file", file: "Nada.md" } } })],
    ["draw an arrow to the pin", put(scratch(ana.doc), "n4", 1, 36, { type: "arrow", index: "d3", endBinding: { elementId: "zqpin" } })],
    ["delete the pin's edge by its key", (() => {
      const d = new Y.Doc();
      Y.applyUpdate(d, Y.encodeStateAsUpdate(ana.doc));
      const sv = Y.encodeStateVector(d);
      d.getMap("elements").set("zqedge\n1\n5", JSON.stringify({ id: "zqedge", isDeleted: true, version: 1, versionNonce: 5 }));
      return Y.encodeStateAsUpdate(d, sv);
    })()],
  ];
  for (const [what, u] of attempts) {
    r = (await wb.call("collab_update", { path: BOARD, update: b64(u) })).reply;
    if (refused(r)) held(`${what} → refused (${r.err.message})`);
    else finding("BLOCKING", `Bea could ${what}`, short(r));
  }
  const after = await gm.hear(800);
  const leakedToGm = after.filter((e) => e?.event === "collab-update").length;
  take(room.doc, after);
  if (leakedToGm === 0 && JSON.stringify(["zqpin", "zqedge", "zqdraw", "zqlabel", "c-hid"].map((i) => gmAll()[i])) === before) {
    held("nothing of the refused edits reached the game master; the hidden elements are untouched");
  } else {
    finding("BLOCKING", "a refused edit changed the game master's board", `${leakedToGm} collab-update(s)`);
  }
  // Control for the attempts: an allowed edit made the same way (a copy of
  // her room) is accepted, so the refusals above are the veil's, not the
  // copy's.
  const freeNow = elements(ana.doc).free;
  r = (await wb.call("collab_update", { path: BOARD,
    update: b64(put(scratch(ana.doc), "free", 3, 41, { ...freeNow, x: 42 })) })).reply;
  if (done(r)) console.log("  control OK: an allowed edit built the same way is accepted");
  else finding("IMPORTANT", "the attempts' control was refused: the refusals may not be the veil's", short(r));
  take(room.doc, await gm.hear(600));

  // The game master moves the pin and adds another: nothing reaches her.
  console.log("\n== the game master moves the pin and adds a second one");
  const gmMoves = [
    put(room.doc, "zqpin", 2, 8, { ...gmAll().zqpin, x: 650 }),
    put(room.doc, "zqpin2", 1, 1, { type: "embeddable", index: "b0",
      customData: { canvas: { id: "zqpin2", type: "text", text: "zqpin outro", verso: { secret: true } } } }),
    put(room.doc, "c-hid", 2, 8, { ...gmAll()["c-hid"], x: 350 }),
  ];
  for (const u of gmMoves) await gm.call("collab_update", { path: BOARD, update: b64(u) });
  const heard = await wb.hear(1000);
  take(ana.doc, heard);
  const now = elements(ana.doc);
  if (!("zqpin" in now) && !("zqpin2" in now) && now["c-hid"]?.locked === true) {
    held(`the moved pin and the new pin never reached her; the marker moved to x=${now["c-hid"]?.x}, still locked`);
  } else {
    finding("BLOCKING", "a secret pin reached Bea after the game master moved it", short(now.zqpin || now.zqpin2));
  }

  // ---- Cadu, who only sees the board -------------------------------------
  console.log("\n== Cadu (a player who only sees the board)");
  const wc = await new Win("Cadu", cadu.http, [...LEAKS, EDITOR_SEES]).open();
  await wc.hear(300);
  r = (await wc.call("open_server_folder", { id: folder })).reply;
  if (!done(r)) throw new Error(`Cadu open: ${short(r)}`);
  const cj = await join(wc);
  console.log(`  join: ${short(cj.reply?.ok ? { kind: cj.reply.ok.kind, read_only: cj.reply.ok.read_only } : cj.reply)}`);
  // The room is refused to a reader (ADR 0087, revised 2026-10-15): she
  // follows the board's file, projected.
  if (refused(cj.reply)) held("the board's room is refused to a see-only player");
  else if (cj.reply?.ok && cj.reply.ok.read_only !== true) {
    finding("BLOCKING", "a see-only player joined the board as an editor", short(cj.reply));
  } else finding("IMPORTANT", "a see-only player joined the board's room (expected: refused)", short(cj.reply));
  const cu = put(cj.doc, "free", 9, 99, { type: "rectangle", index: "ab", x: 999 });
  r = (await wc.call("collab_update", { path: BOARD, update: b64(cu) })).reply;
  if (done(r)) finding("BLOCKING", "a see-only player wrote to the board", short(r));
  else held(`Cadu's edit → ${short(r?.err).slice(0, 60)}`);
  r = (await wc.call("read_text", { path: BOARD })).reply;
  const text = r?.ok?.text || "";
  if (text.includes("c-hid") && text.includes("c-open")) {
    console.log("  control OK: Cadu reads the board's file (both cards there), every byte checked for canaries");
  } else finding("IMPORTANT", "a see-only player could not read the board's file", short(r));
  await wc.hear(600);
  if (!wb.leaked.size) held("no canary in any frame Bea heard (decoded)");
  if (!wc.leaked.size) held("no canary in any frame Cadu heard (decoded)");

  [gm, wb, wc].forEach((w) => w.close());
  console.log("\n== summary");
  if (!findings.length) console.log("  no finding from the live board-veil attack");
  for (const f of findings) console.log(`  ${f.level}: ${f.title}${f.detail ? " — " + f.detail : ""}`);
  console.log(JSON.stringify({ findings }));
}

main().catch((e) => {
  console.error("lab error (not a finding):", e.message);
  process.exit(2);
});
