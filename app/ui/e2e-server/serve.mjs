// The real server for the server's end-to-end tests (ADR 0073): `verso
// serve` from the workspace's build (`cargo build -p verso-cli` first),
// on loopback, with a data directory and a folders root of its own in the
// system's temporary directory — the demo vault copied in as the folder
// "Demo" — and the window's build (`dist/`, with web.html). The first
// admin comes from the environment, as an image's would.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ui = fileURLToPath(new URL("..", import.meta.url));
const repo = join(ui, "..", "..");
const base = mkdtempSync(join(tmpdir(), "verso-e2e-server-"));
const folders = join(base, "folders");
cpSync(join(repo, "demo-vault"), join(folders, "Demo"), { recursive: true });
// The tests that age a session's proof reach the server's database through this path.
writeFileSync(join(tmpdir(), "verso-e2e-server-base"), base);
const port = process.env.PORT ?? "4174";
const bin = join(process.env.CARGO_TARGET_DIR ?? join(repo, "target"), "debug", process.platform === "win32" ? "verso.exe" : "verso");
const server = spawn(bin, ["serve", "--web"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VERSO_LISTEN: `127.0.0.1:${port}`,
    VERSO_DATA_DIR: join(base, "data"),
    VERSO_FOLDERS_DIR: folders,
    VERSO_UI_DIR: join(ui, "dist"),
    VERSO_ADMIN_EMAIL: "admin@verso.test",
    VERSO_ADMIN_PASSWORD: "uma senha bem longa",
    VERSO_UPDATE_CHECK: "off",
  },
});
const stop = () => {
  server.kill("SIGTERM");
  rmSync(base, { recursive: true, force: true });
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => {
  rmSync(base, { recursive: true, force: true });
  process.exit(code ?? 0);
});
