// The theme catalogue into the build (ADR 0109 item 8): every
// `themes/catalogue/*.verso-theme` copied to `dist/themes/catalogue/`, with
// an `index.json` that lists their names, in order, so the window reads them
// like a theme a person imports (src/theme/catalogue.ts). An empty or absent
// folder gives an empty list.
//   node build-catalogue.mjs

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ui = fileURLToPath(new URL(".", import.meta.url));
const from = join(ui, "themes", "catalogue");
const to = join(ui, "dist", "themes", "catalogue");
rmSync(join(ui, "dist", "themes"), { recursive: true, force: true });
mkdirSync(to, { recursive: true });
const files = existsSync(from) ? readdirSync(from).filter((f) => f.endsWith(".verso-theme")).sort() : [];
for (const f of files) cpSync(join(from, f), join(to, f));
writeFileSync(join(to, "index.json"), `${JSON.stringify(files)}\n`);
console.log(`theme catalogue: ${files.length} themes`);
