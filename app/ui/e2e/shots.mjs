// Where a test of 2026-10-23 leaves its screenshots (docs/media/test-runs).
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../../docs/media/test-runs/2026-10-23-mesa/", import.meta.url));
mkdirSync(DIR, { recursive: true });

/** The path of a screenshot of this round, named by the number it takes in the run. */
export const shot = (name) => `${DIR}${name}.png`;

/** "antes" when the run is of the code before a fix (SHOT_PHASE=antes), else "depois". */
export const phase = process.env.SHOT_PHASE === "antes" ? "antes" : "depois";
