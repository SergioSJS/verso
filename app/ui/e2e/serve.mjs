// The browser harness's server (ADR 0058): app/ui/dist as the app's window
// loads it, and `/__vault/<path>` — the `verso:` protocol of the harness —
// from the demo vault on disk; a test answers that from the folder in memory
// instead (fixtures.mjs). Started by Playwright (playwright.config.mjs);
// `node e2e/serve.mjs` serves it by hand, at
// http://127.0.0.1:4173/harness.html, after `npm run build`.
// Dependency-free.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = join(here, "..", "dist");
const vault = join(here, "..", "..", "..", "demo-vault");
const port = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".canvas": "application/json",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  let path = decodeURIComponent(url.pathname);
  let root = dist;
  if (path === "/") path = "/harness.html";
  if (path.startsWith("/__vault/")) {
    root = vault;
    path = path.slice("/__vault".length);
  }
  const file = normalize(join(root, path));
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => console.log(`harness: http://127.0.0.1:${port}/harness.html`));
