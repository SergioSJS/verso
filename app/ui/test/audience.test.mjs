// Who sees a note of a table (ADR 0110, 2026-10-23), the logic that needs no
// page: toggling a player in an audience, who has what access, the words
// that name it. The menu and the note's access indicator are made of it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/audience.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/audience.test-bundle.mjs", logLevel: "error" });
const a = await import("./.bundles/audience.test-bundle.mjs");

const ALL = ["bia", "caio", "dora"];
const players = (...ids) => ({ kind: "players", accounts: ids });

describe("Toggling a player in an audience", () => {
  test("from the whole table it becomes every other player", () => {
    assert.deepEqual(a.togglePlayer(a.TABLE, "caio", ALL), players("bia", "dora"));
  });
  test("adds a player to a set, and takes one out", () => {
    assert.deepEqual(a.togglePlayer(players("bia"), "dora", ALL), players("bia", "dora"));
    assert.deepEqual(a.togglePlayer(players("bia", "dora"), "bia", ALL), players("dora"));
  });
  test("a set never turns into the whole table by itself", () => {
    assert.deepEqual(a.togglePlayer(players("bia", "caio"), "dora", ALL), players("bia", "caio", "dora"));
  });
  test("an empty set is hidden", () => {
    assert.deepEqual(a.togglePlayer(players("bia"), "bia", ALL), a.HIDDEN);
    assert.deepEqual(a.togglePlayer(a.HIDDEN, "bia", ALL), players("bia"));
  });
  test("a player who left the table is not counted", () => {
    assert.deepEqual(a.audienceIds(players("bia", "gone"), ALL), ["bia"]);
  });
});

describe("Access", () => {
  const none = { kind: "none" };
  test("a grant to the group or to the player is an edit, whatever the audience", () => {
    assert.equal(a.accessOf(a.HIDDEN, { kind: "group" }, "bia", ALL), "edits");
    assert.equal(a.accessOf(players("caio"), { kind: "player", account: "bia" }, "bia", ALL), "edits");
  });
  test("an audience that holds the player sees it; the others do not", () => {
    assert.equal(a.accessOf(a.TABLE, none, "dora", ALL), "sees");
    assert.equal(a.accessOf(players("bia"), none, "dora", ALL), "none");
    assert.equal(a.accessOf(a.HIDDEN, { kind: "player", account: "bia" }, "caio", ALL), "none");
  });
  test("peopleOf lists every player and tallies them", () => {
    const people = a.peopleOf(players("bia", "caio"), { kind: "player", account: "caio" }, [
      { id: "bia", name: "Bia" },
      { id: "caio", name: "Caio" },
      { id: "dora", name: "Dora" },
    ]);
    assert.deepEqual(people.map((p) => p.access), ["sees", "edits", "none"]);
    assert.deepEqual(a.tally(people), { total: 3, seeing: 2, editing: 1 });
  });
});

describe("What a change gained", () => {
  test("names only the players who did not see it before", () => {
    assert.deepEqual(a.gained(a.HIDDEN, players("bia"), ALL), ["bia"]);
    assert.deepEqual(a.gained(players("bia"), players("bia", "dora"), ALL), ["dora"]);
    assert.deepEqual(a.gained(a.TABLE, a.TABLE, ALL), []);
    assert.deepEqual(a.gained(players("bia", "dora"), players("bia"), ALL), []);
  });
  test("sameAudience compares sets, not order", () => {
    assert.ok(a.sameAudience(players("bia", "caio"), players("caio", "bia")));
    assert.ok(!a.sameAudience(players("bia"), a.TABLE));
    assert.ok(a.sameAudience(a.HIDDEN, a.HIDDEN));
  });
});

describe("The indicator's words", () => {
  const w = {
    ownerName: (n, t) => `${n} of ${t} players`,
    playerTable: "the whole table",
    playerOnlyYou: "only you",
    playerNames: (list) => list,
    you: "you",
  };
  const person = (name, you = false) => ({ id: name, name, access: "sees", you });
  test("the game master's name counts who sees it among the players", () => {
    assert.equal(a.ownerLabel({ total: 3, seeing: 2, editing: 0 }, w), "2 of 3 players");
  });
  test("a player is told the table, only itself, or the names with the game master", () => {
    assert.equal(a.playerLabel(a.TABLE, [], "the master", w, "en"), "the whole table");
    assert.equal(a.playerLabel(players("x"), [person("Ana", true)], "the master", w, "en"), "only you");
    assert.equal(a.playerLabel(players("x", "y"), [person("Ana"), person("Bruno", true)], "the master", w, "en"), "you, Ana, and the master");
  });
  test("the one asking comes first in a list of names, worded as you", () => {
    assert.deepEqual(a.yourFirst([person("Ana"), person("Bruno", true), person("Caio")]).map((p) => p.name), ["Bruno", "Ana", "Caio"]);
  });
  test("the count: seeing/total for the game master, people for a player", () => {
    assert.equal(a.countText("owner", { total: 3, seeing: 2, editing: 0 }, a.HIDDEN, [], "Table"), "2/3");
    assert.equal(a.countText("player", { total: 2, seeing: 2, editing: 0 }, players("x", "y"), [person("A"), person("B")], "Table"), "3");
    assert.equal(a.countText("player", { total: 0, seeing: 0, editing: 0 }, a.TABLE, [], "Table"), "Table");
  });
  test("a player's name never carries someone who is not in the list it was given", () => {
    const label = a.playerLabel(players("x", "y"), [person("Ana"), person("Bruno")], "M", w, "en");
    assert.ok(!label.includes("Caio"));
  });
});
