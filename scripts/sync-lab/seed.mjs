#!/usr/bin/env node
// The sync lab's test vault (docs/reference/sync-lab.md): written into an
// empty folder, the same every time, so that every campaign starts from
// the same files. What git cannot hold well — names in both Unicode forms,
// a large binary — is made here, not committed.
//
//   node scripts/sync-lab/seed.mjs <empty folder> [--big-mb 60] [--batch 120]
//
// No dependency: Node's own modules.

import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { deflateSync, crc32 } from "node:zlib";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const BIG_MB = opt("big-mb", 60);
const BATCH = opt("batch", 120);
if (!dir) {
  console.error("usage: node scripts/sync-lab/seed.mjs <empty folder> [--big-mb 60] [--batch 120]");
  process.exit(2);
}
if (existsSync(dir) && readdirSync(dir).length > 0) {
  console.error(`${dir} is not empty: the seed writes only into an empty folder`);
  process.exit(1);
}

const put = (rel, data) => {
  const path = join(dir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

// A pseudo-random stream, the same for the same seed: the large file has
// the same bytes on every machine.
function bytes(n, seed) {
  const out = Buffer.alloc(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

// A small PNG, made by hand: a gradient.
function png(w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w * 3; x++) row[1 + x] = (x * 7 + y * 3) % 256;
    rows.push(row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

put("Bem-vindo.md", "# Bem-vindo\n\nO vault de teste da bancada de sincronização.\n\n- [[Lista]]\n- [[Ideias/Ideia]]\n");
put("Lista.md", "# Lista\n\n- um\n- dois\n- três\n");
put("Ideias/Ideia.md", "# Ideia\n\numa ideia, com um link para a [[Lista]]\n");
put("Ideias/Projeto/Plano.md", "---\nstatus: em andamento\n---\n\n# Plano\n\n1. começar\n2. terminar\n");
put("Ideias/Projeto/Notas/Ata.md", "# Ata\n\nPresentes: Sérgio, Ana, Bia.\n");
// Names every system keeps, and the two Unicode forms of one name: macOS
// writes decomposed (NFD), Linux and Windows usually composed (NFC).
put("Ação NFC.md".normalize("NFC"), "# Ação (NFC)\n");
put("Café NFD.md".normalize("NFD"), "# Café (NFD)\n");
put("Reunião 🚀 de segunda.md", "# Reunião de segunda\n\npauta\n");
put("com espaços  duplos.md", "# espaços\n");
put("vazio.md", "");
put("assets/imagem.png", png(400, 300));
put("assets/anexo.bin", bytes(1 << 20, 7));
put(`assets/grande-${BIG_MB}mb.bin`, bytes(BIG_MB << 20, 42));
for (let i = 1; i <= BATCH; i++) {
  const n = String(i).padStart(3, "0");
  put(`Lote/Nota ${n}.md`, `# Nota ${n}\n\ntexto ${n}\n`);
}
console.log(`seeded ${dir}: ${8 + 3 + 3 + BATCH} files, one of ${BIG_MB} MB`);
