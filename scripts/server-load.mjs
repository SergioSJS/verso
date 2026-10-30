#!/usr/bin/env node
// Load test of a UniVerso's sync (ADR 0079; docs/reference/sync-lab.md):
// many devices at once against a running server, and the files checked
// byte for byte at the end.
//
//   node scripts/server-load.mjs --folder <id> --disk <the folder's directory on the server>
//        --accounts email:password[,email:password…] [--devices 40] [--seconds 60]
//        [--url http://localhost:7341] [--label "what this run is"] [--no-record]
//        [--sync 2]
//
// Every simulated device is a connection of its own over a real device
// session (one per account: starting a device's sign-in is limited per
// address), opens the folder and, for the duration, at random: reads the
// changes after its cursor, sends a new file, edits one of its files with
// the base it holds, edits the shared hot note with the base it last saw
// (refused as `changed` when another device was first), reads one of its
// files back and checks the hash, deletes one of its files. At the end:
// latency per operation (p50, p90, p95, p99, max), errors by kind, and
// integrity — every device's files on the server's disk hold exactly the
// bytes last accepted, deleted ones are gone, the hot note holds the last
// accepted version. Each run is appended to scripts/sync-lab/results.jsonl
// (commit, machine, settings, numbers), the history to follow.
//
// No dependency: Node 22's own fetch and WebSocket.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = arg("url", "http://localhost:7341");
const FOLDER = arg("folder");
const DISK = arg("disk");
const DEVICES = Number(arg("devices", "40"));
const SECONDS = Number(arg("seconds", "60"));
const LABEL = arg("label", "");
const RECORD = !argv.includes("--no-record");
// The sync the devices speak (ADR 0079 item 5): 2, as the app since
// 2026-10-12, sends and takes a piece of a file as a binary message (its
// JSON header's length in four bytes, the header, the bytes); 1, as
// base64 inside the JSON.
const SYNC = Number(arg("sync", "2"));
// Night-round options (ADR 0079 stress of a small server): the accounts from a
// JSON file ({accounts:[{email,password}]}) so no password is in a command line;
// `--pull user@host:/dir` copies the folder's directory from the server before
// the byte-for-byte check (the script runs on another machine than the server);
// `--big-mb`/`--big-pct` set the big files' size and share; `--burst` makes most
// steps new small files.
const PULL = arg("pull", "");
const BIG_BYTES = Number(arg("big-mb", "2")) * 1_000_000;
const BIG_PCT = Number(arg("big-pct", "5")) / 100;
const BIG_EXT = arg("big-ext", "md");
const BURST = argv.includes("--burst");
const ACCOUNTS_FILE = arg("accounts-file", "");
const ACCOUNTS = (ACCOUNTS_FILE
  ? JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8")).accounts.map((a) => `${a.email}:${a.password}`).join(",")
  : arg("accounts", "") || "").split(",").filter(Boolean).map((s) => {
  const at = s.indexOf(":");
  return [s.slice(0, at), s.slice(at + 1)];
});
const PREFIX = `carga-${Date.now()}-${process.pid}`;
if (!FOLDER || !(DISK || PULL) || ACCOUNTS.length === 0) {
  console.error("usage: node scripts/server-load.mjs --folder <id> --disk <dir> --accounts email:pw[,…] [--devices 40] [--seconds 60]");
  process.exit(2);
}

const sha = (b) => createHash("sha256").update(b).digest("hex");

async function http(method, path, body, browser) {
  const headers = { "content-type": "application/json", origin: URL_ };
  if (browser) {
    headers.cookie = browser.cookie;
    headers["x-verso-csrf"] = browser.csrf;
  }
  const r = await fetch(URL_ + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, headers: r.headers };
}

async function signIn(email, password) {
  const r = await http("POST", "/api/signin", { email, password });
  if (r.status !== 200) throw new Error(`signin ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return { cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "), csrf: r.json.csrf };
}

async function deviceToken(browser, name) {
  let start;
  for (;;) {
    const r = await http("POST", "/api/device/start", { device: name });
    if (r.status === 200) {
      start = r.json;
      break;
    }
    const wait = Number(r.json?.retry ?? 5);
    console.log(`starting a device's sign-in is limited: waiting ${wait}s`);
    await new Promise((res) => setTimeout(res, wait * 1000));
  }
  const ok = await http("POST", "/api/device/approve", { code: start.code }, browser);
  if (ok.status !== 200) throw new Error(`approving ${name}: ${ok.status} ${JSON.stringify(ok.json)}`);
  return (await http("POST", "/api/device/poll", { code: start.code, poll: start.poll })).json.token;
}

const lat = {};
const errors = {};
const count = {};
const noted = (op, ms) => {
  (lat[op] ??= []).push(ms);
  count[op] = (count[op] ?? 0) + 1;
};
const failed = (op, kind) => (errors[`${op}:${kind}`] = (errors[`${op}:${kind}`] ?? 0) + 1);
const hot = [];

class Device {
  constructor(i, token) {
    this.i = i;
    this.token = token;
    this.id = 1;
    this.seq = 0;
    this.waiting = new Map();
    this.own = new Map(); // path → hash last accepted, null once deleted
    this.cursor = 0;
    this.hotBase = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(URL_.replace(/^http/, "ws") + "/api/ws", {
        headers: { authorization: `Bearer ${this.token}`, "x-verso-sync": String(SYNC) },
      });
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      ws.onmessage = (e) => {
        let m;
        if (typeof e.data === "string") m = JSON.parse(e.data);
        else {
          // A piece of a file in a binary message: its header, then it.
          const b = Buffer.from(e.data);
          const len = b.readUInt32BE(0);
          m = JSON.parse(b.subarray(4, 4 + len).toString());
          if (m.ok) m.ok.piece = b.subarray(4 + len);
        }
        if (m.hello) return resolve();
        const w = m.id && this.waiting.get(m.id);
        if (w) {
          this.waiting.delete(m.id);
          w(m);
        }
      };
      ws.onerror = (e) => reject(new Error(e.message ?? "websocket error"));
    });
  }
  call(cmd, args, piece) {
    const id = this.id++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      if (piece && SYNC >= 2) {
        const header = Buffer.from(JSON.stringify({ id, cmd, args }));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(header.length);
        this.ws.send(Buffer.concat([len, header, piece]));
      } else {
        if (piece) args = { ...args, data: piece.toString("base64") };
        this.ws.send(JSON.stringify({ id, cmd, args }));
      }
    });
  }
  async timed(op, cmd, args, piece) {
    const t = performance.now();
    const m = await this.call(cmd, args, piece);
    noted(op, performance.now() - t);
    if (m.err) failed(op, m.err.kind);
    return m;
  }
  async put(op, path, data, base) {
    const hash = sha(data);
    const PIECE = 1 << 20;
    for (let off = 0; ; ) {
      const end = Math.min(off + PIECE, data.length);
      const m = await this.timed(op, "sync_put", { path, offset: off, size: data.length, hash, base }, data.subarray(off, end));
      if (m.err) return { err: m.err, hash };
      if (m.ok.done) return { ok: true, hash };
      off = end;
    }
  }
  async step() {
    const r = Math.random();
    const mine = [...this.own.entries()].filter(([, h]) => h !== null);
    const pick = () => mine[Math.floor(Math.random() * mine.length)];
    if (BURST && r < 0.85 && !(r < 0.1)) {
      const path = `${PREFIX}/dev-${this.i}/b-${++this.seq}.md`;
      const res = await this.put("put_burst", path, Buffer.from(`# rajada ${this.seq} do aparelho ${this.i}\n${randomBytes(40).toString("hex")}\n`), null);
      if (res.ok) this.own.set(path, res.hash);
    } else if (r < 0.25) {
      const m = await this.timed("changes", "sync_changes", { since: this.cursor });
      if (m.ok) this.cursor = m.ok.head;
    } else if (r < 0.45 || mine.length === 0) {
      const big = Math.random() < BIG_PCT;
      const path = `${PREFIX}/dev-${this.i}/n-${++this.seq}.${big ? BIG_EXT : "md"}`;
      const size = big ? BIG_BYTES : 200 + Math.floor(Math.random() * 4000);
      const data = Buffer.concat([Buffer.from(`# Nota ${this.seq} do aparelho ${this.i}\n\n`), randomBytes(size)]);
      const res = await this.put("put_new", path, data, null);
      if (res.ok) this.own.set(path, res.hash);
    } else if (r < 0.65) {
      const [path, base] = pick();
      const data = Buffer.concat([Buffer.from(`# editada pelo aparelho ${this.i}\n\n`), randomBytes(500)]);
      const res = await this.put("put_edit", path, data, base);
      if (res.ok) this.own.set(path, res.hash);
    } else if (r < 0.8) {
      const data = Buffer.from(`# Nota quente\n\núltima edição: aparelho ${this.i}, ${Date.now()}\n`);
      const res = await this.put("put_hot", `${PREFIX}/quente.md`, data, this.hotBase);
      if (res.ok) {
        this.hotBase = res.hash;
        hot.push({ hash: res.hash, at: performance.now() });
      } else if (res.err?.kind === "changed") {
        // The refusal names the hash now: the next try is based on it.
        this.hotBase = res.err.message || null;
      }
    } else if (r < 0.92) {
      const [path, expect] = pick();
      const t = performance.now();
      const pieces = [];
      let hash = null;
      for (let off = 0; ; ) {
        const m = await this.call("sync_read", { path, offset: off });
        if (m.err) {
          failed("read", m.err.kind);
          break;
        }
        if (m.ok.hash) hash = m.ok.hash;
        const piece = m.ok.piece ?? Buffer.from(m.ok.data, "base64");
        pieces.push(piece);
        off += piece.length;
        if (m.ok.done) break;
      }
      noted("read", performance.now() - t);
      if (sha(Buffer.concat(pieces)) !== expect || hash !== expect) failed("read", "hash_mismatch");
    } else {
      const [path, base] = pick();
      const m = await this.timed("delete", "sync_delete", { path, base });
      if (m.ok) this.own.set(path, null);
    }
  }
}

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);
const round = (x) => Math.round(x * 10) / 10;

async function main() {
  const browsers = [];
  for (const [email, pw] of ACCOUNTS) browsers.push(await signIn(email, pw));
  const tokens = [];
  for (let k = 0; k < browsers.length; k++) tokens.push(await deviceToken(browsers[k], `Carga ${k}`));
  const devices = Array.from({ length: DEVICES }, (_, i) => new Device(i, tokens[i % tokens.length]));
  await Promise.all(devices.map((d) => d.connect()));
  const opened = await Promise.all(devices.map((d) => d.call("open_server_folder", { id: FOLDER })));
  const refused = opened.filter((m) => m.err).map((m) => `${m.err.kind}: ${m.err.message}`);
  if (refused.length) {
    console.error(`${refused.length} of ${DEVICES} devices could not open the folder: ${[...new Set(refused)].join("; ")}`);
    process.exit(2);
  }
  console.log(`${DEVICES} devices in the folder; ${SECONDS} s`);
  const started = performance.now();
  const until = started + SECONDS * 1000;
  await Promise.all(
    devices.map(async (d) => {
      while (performance.now() < until) await d.step();
    }),
  );
  const elapsed = (performance.now() - started) / 1000;
  await new Promise((r) => setTimeout(r, 1500));

  const latency = {};
  let total = 0;
  for (const [op, a] of Object.entries(lat)) {
    a.sort((x, y) => x - y);
    total += a.length;
    latency[op] = { n: a.length, p50: round(pct(a, 50)), p90: round(pct(a, 90)), p95: round(pct(a, 95)), p99: round(pct(a, 99)), max: round(a.at(-1)) };
  }
  const problems = [];
  let DISKDIR = DISK;
  if (PULL) {
    DISKDIR = join(os.tmpdir(), `server-load-pull-${process.pid}`);
    execSync(`mkdir -p ${DISKDIR} && rsync -a -e "ssh -o StrictHostKeyChecking=no" ${PULL}/${PREFIX}/ ${DISKDIR}/${PREFIX}/`, { stdio: "inherit" });
  }
  let files = 0;
  let deletions = 0;
  for (const d of devices) {
    for (const [path, hash] of d.own) {
      const file = join(DISKDIR, path);
      if (hash === null) {
        if (existsSync(file)) problems.push(`${path}: deleted, still there`);
        else deletions++;
      } else if (!existsSync(file)) problems.push(`${path}: missing`);
      else if (sha(readFileSync(file)) !== hash) problems.push(`${path}: other bytes`);
      else files++;
    }
  }
  const hotFile = join(DISKDIR, PREFIX, "quente.md");
  const hotNow = existsSync(hotFile) ? sha(readFileSync(hotFile)) : null;
  const hotLast = hot.sort((a, b) => a.at - b.at).at(-1)?.hash ?? null;
  if (hot.length && hotNow !== hotLast) problems.push("quente.md: not the last version accepted");

  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: here }).toString().trim();
  } catch {}
  const result = {
    at: new Date().toISOString(),
    commit,
    label: LABEL,
    machine: `${os.type()} ${os.arch()}, ${os.cpus().length} CPUs, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    server: URL_,
    devices: DEVICES,
    sync: SYNC,
    accounts: ACCOUNTS.length,
    seconds: round(elapsed),
    operations: total,
    per_second: round(total / elapsed),
    latency_ms: latency,
    errors,
    integrity: { files, deletions, hot_writes: hot.length, problems: problems.length, first_problems: problems.slice(0, 10) },
  };
  console.log(JSON.stringify(result, null, 2));
  if (RECORD) appendFileSync(join(here, "sync-lab", "results.jsonl"), JSON.stringify(result) + "\n");
  for (const d of devices) d.ws.close();
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
