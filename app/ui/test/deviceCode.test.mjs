// The code a person types on the device page (ADR 0083 item 17) is read
// as the device shows it — eight letters, `XXXX-XXXX` — whatever the case,
// the spaces or the dash; anything else is said on the page before it is
// sent, so a typo does not cost a try of the address's delay.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/deviceCode.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/deviceCode.test-bundle.mjs",
  logLevel: "error",
});
const { readCode } = await import("./.bundles/deviceCode.test-bundle.mjs");

describe("A typed device code", () => {
  test("is read whatever the case, the spaces or the dash", () => {
    for (const typed of ["BCDF-GHJK", "bcdf-ghjk", "bcdfghjk", " BCDF GHJK ", "Bc-Df-Gh-Jk"]) {
      assert.equal(readCode(typed), "BCDF-GHJK", typed);
    }
  });
  test("is no code when it is not eight letters", () => {
    for (const typed of ["", "BCDF-GHJ", "BCDF-GHJKL", "BCDF-GHJ1", "BCDF_GHJK", "ÇCDF-GHJK", "x".repeat(500)]) {
      assert.equal(readCode(typed), null, typed);
    }
  });
});
