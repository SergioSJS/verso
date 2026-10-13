#!/usr/bin/env node
// The sync lab's server, made ready (docs/reference/sync-lab.md): on a
// running UniVerso whose first admin came from the environment, three
// people — the admin, Ana and Bia, both editors — and two folders: the
// seeded vault "Caderno" and an empty "Carga" for the load test. Writes
// what a device or a test needs to <lab>/lab.json.
//
//   node scripts/sync-lab/setup.mjs <url> <lab dir> <admin e-mail> <admin password>
//
// No dependency: Node's own fetch.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const [URL_, LAB, ADMIN, ADMIN_PW] = process.argv.slice(2);
if (!ADMIN_PW) {
  console.error("usage: node scripts/sync-lab/setup.mjs <url> <lab dir> <admin e-mail> <admin password>");
  process.exit(2);
}

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

const must = (r, what) => {
  if (r.status !== 200) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};

const admin = await signIn(ADMIN, ADMIN_PW);
const folders = must(await http("GET", "/api/folders", undefined, admin), "folders").folders;
let caderno = folders.find((f) => f.name === "Caderno");
if (!caderno) caderno = must(await http("POST", "/api/admin/folders/adopt", { name: "Caderno", owner: ADMIN }, admin), "adopt Caderno");
let carga = folders.find((f) => f.name === "Carga");
if (!carga) carga = must(await http("POST", "/api/folders", { name: "Carga" }, admin), "create Carga");

// An earlier run's lab.json keeps the passwords of the people it made.
const earlier = existsSync(join(LAB, "lab.json")) ? JSON.parse(readFileSync(join(LAB, "lab.json"), "utf8")) : null;
const people = [];
for (const name of ["Ana", "Bia"]) {
  const email = `${name.toLowerCase()}@lab.test`;
  const password = `${name.toLowerCase()}-${randomBytes(6).toString("hex")}`;
  const invited = await http("POST", "/api/admin/invitations", { email, folder: caderno.id, role: "editor" }, admin);
  if (invited.status === 200) {
    const token = invited.json.link.split("/").at(-1);
    must(await http("POST", `/api/invite/${token}`, { email, name, password, lang: "pt" }), `accept ${email}`);
    people.push({ name, email, password });
  } else {
    // Already there from an earlier run: its password is in lab.json.
    const known = earlier?.accounts.find((a) => a.email === email);
    people.push({ name, email, password: known?.password ?? null });
  }
  for (const f of [caderno, carga]) {
    must(await http("PUT", `/api/folders/${f.id}/members/${email}`, { role: "editor" }, admin), `grant ${email}`);
  }
}

const lab = {
  url: URL_,
  folders: { Caderno: caderno.id, Carga: carga.id },
  disk: { Caderno: join(LAB, "folders", "Caderno"), Carga: join(LAB, "folders", "Carga") },
  accounts: [{ name: "admin", email: ADMIN, password: ADMIN_PW }, ...people],
};
writeFileSync(join(LAB, "lab.json"), JSON.stringify(lab, null, 2) + "\n", { mode: 0o600 });
console.log(`lab ready: ${join(LAB, "lab.json")}`);
