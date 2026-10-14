// The bug report's times are the computer's, with the offset (the
// maintainer, 2026-10-14: the report showed the time in another zone —
// the log's lines are in UTC, and nothing said so). Checked in fixed zones:
// `TZ` set before any date is made.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/clock.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/clock.test-bundle.mjs",
  logLevel: "error",
});
const { localStamp, localTime } = await import("./.bundles/clock.test-bundle.mjs");

/** `run` with the process in the zone `tz`. */
function inZone(tz, run) {
  const was = process.env.TZ;
  process.env.TZ = tz;
  try {
    return run();
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
}

const AT = new Date("2026-10-14T13:25:24Z");

describe("The report's clock", () => {
  test("is the computer's, west of UTC, with its offset", () => {
    assert.equal(inZone("America/Sao_Paulo", () => localStamp(AT)), "2026-10-14 10:25:24 (UTC−03:00)");
    assert.equal(inZone("America/Sao_Paulo", () => localTime(AT)), "10:25:24");
  });
  test("east of UTC, by half hours too", () => {
    assert.equal(inZone("Asia/Kolkata", () => localStamp(AT)), "2026-10-14 18:55:24 (UTC+05:30)");
  });
  test("on UTC itself", () => {
    assert.equal(inZone("UTC", () => localStamp(AT)), "2026-10-14 13:25:24 (UTC+00:00)");
  });
  test("a date the zone moves across midnight", () => {
    assert.equal(inZone("America/Sao_Paulo", () => localStamp(new Date("2026-10-15T01:00:00Z"))), "2026-10-14 22:00:00 (UTC−03:00)");
  });
});
