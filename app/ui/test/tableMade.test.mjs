// A table made in a folder whose boards a share's windows are live on
// (ADR 0081 item 11): the words the share's window and the owner are told.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/tableMade.ts"], bundle: true, format: "esm", platform: "node", outdir: "test/.bundles/tableMade", outExtension: { ".js": ".mjs" }, logLevel: "error" });
const { tableMadeText, rejoinedText } = await import("./.bundles/tableMade/tableMade.mjs");

test("the share's window is told the table was made and it is a player now, in both languages", () => {
  assert.equal(tableMadeText(true), "A mesa foi criada nesta pasta: você agora está no board como jogador.");
  assert.equal(tableMadeText(false), "A table was made in this folder: you are now on the board as a player.");
});

test("the owner is told how many rejoin as players, singular and plural", () => {
  assert.match(rejoinedText(false, 1), /^1 person was on a board/);
  assert.match(rejoinedText(false, 3), /^3 people were on boards/);
  assert.match(rejoinedText(true, 1), /^1 pessoa estava/);
  assert.match(rejoinedText(true, 2), /^2 pessoas estavam/);
});
