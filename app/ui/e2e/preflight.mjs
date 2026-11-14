// What keeps the end-to-end tests from taking a Mac's window server down
// (ADR 0069 item 8, revised on 2026-10-12). The WindowServer aborted four
// times in two days during the suites, every time out of IOSurfaces: it
// held 64,084 of the system's 65,536 when it died on 2026-10-12, each one
// left by a capture of a 1500 × 1000 window — the harness's — that
// Playwright's WebKit asks of it for every frame of a trace's screencast.
// The configs no longer record those frames on macOS; this is the guard
// around what remains:
//
// - before a run, it refuses to start while a browser, another Playwright
//   run or the Verso app is alive, or while the window server already
//   holds an unusual number of surfaces, naming what to quit;
// - during a run, it reads the system's IOSurface count every few seconds
//   and stops the run, as Ctrl-C would, long before the limit.
//
// Run as a script (`node e2e/preflight.mjs`: the npm
// scripts `e2e` and `e2e:server`) and as the two Playwright configs'
// globalSetup, so a bare `npx playwright test` is guarded too. Off macOS it
// does nothing. Dependency-free.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** The system's limit is 65,536 surfaces; the kernel warns at 65,024. A
 *  desktop at rest holds a few hundred to a few thousand. */
export const START_LIMIT = 16_000;
export const RUN_LIMIT = 24_000;
const EVERY_MS = 3_000;

/** What counts as another consumer of the window server's surfaces, by
 *  its command line. The Electron apps an editor or an assistant runs in
 *  (VS Code, Cursor, Claude) do not: the checks are started from inside
 *  them. */
const CONSUMERS = [
  { name: "a browser of Playwright's", re: /\/ms-playwright\// },
  { name: "chrome-headless-shell", re: /chrome-headless-shell/ },
  { name: "another Playwright run", re: /(?:\/\.bin\/playwright|playwright\/cli\.js)\s+test\b/ },
  { name: "Chromium", re: /\/Chromium\.app\/Contents\/MacOS\/Chromium(?:\s|$)/ },
  { name: "Google Chrome", re: /\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome(?:\s|$)/ },
  { name: "Safari", re: /\/Safari\.app\/Contents\/MacOS\/Safari(?:\s|$)/ },
  { name: "Verso Beta", re: /\/Verso Beta\.app\/Contents\/MacOS\// },
  { name: "Verso", re: /\/Verso\.app\/Contents\/MacOS\// },
  { name: "a development build of the app (verso-app)", re: /\/target\/[^ ]*\/verso-app(?:-beta)?(?:\s|$)/ },
];

/** The processes that refuse a run here, with what they matched; never
 *  this process or the ones that started it. */
export function consumers() {
  const out = execFileSync("ps", ["-axww", "-o", "pid=,ppid=,command="], { encoding: "utf8" });
  const rows = out
    .split("\n")
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter(Boolean)
    .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }));
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]));
  const mine = new Set();
  for (let p = process.pid; p > 1 && !mine.has(p); p = parent.get(p) ?? 0) mine.add(p);
  const found = [];
  for (const r of rows) {
    if (mine.has(r.pid)) continue;
    const hit = CONSUMERS.find((c) => c.re.test(r.command));
    if (hit) found.push({ ...r, name: hit.name });
  }
  return found;
}

/** The system's IOSurface count (`ioclasscount`, no privileges needed),
 *  or null when it cannot be read. */
export function surfaces() {
  try {
    const out = execFileSync("/usr/sbin/ioclasscount", ["IOSurface"], { encoding: "utf8" });
    const m = /IOSurface = (\d+)/.exec(out);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Throws, naming what to quit, when a run must not start here. */
export function preflight() {
  if (process.platform !== "darwin") return;
  const found = consumers();
  if (found.length > 0) {
    const lines = found.map((f) => `  ${f.pid}  ${f.name}: ${f.command.slice(0, 160)}`);
    const names = [...new Set(found.map((f) => f.name))].join(", ");
    throw new Error(
      [
        "end-to-end tests refused on this Mac: another consumer of the window server is alive",
        ...lines,
        `quit ${names} first (ADR 0069 item 8, revised 2026-10-12)`,
      ].join("\n"),
    );
  }
  const now = surfaces();
  if (now === null) throw new Error("end-to-end tests refused on this Mac: `ioclasscount IOSurface` could not be read");
  if (now > START_LIMIT) {
    throw new Error(
      `end-to-end tests refused on this Mac: the system holds ${now} IOSurfaces already (limit 65536; refused above ${START_LIMIT}). ` +
        "Something is leaking them: quit the apps that draw (browsers, the Verso app) or log out and in first.",
    );
  }
}

/** The watch during a run: the count read every few seconds, the run
 *  stopped (SIGINT, Playwright's own clean stop) past RUN_LIMIT. */
function watch() {
  if (process.platform !== "darwin") return () => {};
  const start = surfaces();
  console.log(`[preflight] IOSurfaces at the start: ${start}; the run stops above ${RUN_LIMIT}`);
  let peak = start ?? 0;
  const timer = setInterval(() => {
    const now = surfaces();
    if (now === null) return;
    peak = Math.max(peak, now);
    if (now > RUN_LIMIT) {
      console.error(`[preflight] the system holds ${now} IOSurfaces (started at ${start}): stopping the run before the window server runs out`);
      clearInterval(timer);
      process.kill(process.pid, "SIGINT");
    }
  }, EVERY_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    console.log(`[preflight] IOSurfaces: ${start} at the start, ${peak} at most, ${surfaces()} at the end`);
  };
}

/** As Playwright's globalSetup: the checks, then the watch, ended by the
 *  teardown Playwright calls with what this returns. */
export default async function globalSetup() {
  preflight();
  return watch();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    preflight();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
