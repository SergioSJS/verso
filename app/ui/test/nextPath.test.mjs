// Where the sign-in page goes once the person is in: the `next` of its
// address, only when it is a path of this server. A path the browser
// would read as another host — `//host`, `/\host`, however it is
// spelled before the URL parser folds it — goes to `/` instead: an open
// redirect would let a link to this server's sign-in land the person,
// signed in, on a page of someone else's.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/nextPath.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/nextPath.test-bundle.mjs",
  logLevel: "error",
});
const { nextPath } = await import("./.bundles/nextPath.test-bundle.mjs");

const origin = "https://verso.casa.example";

describe("The address after sign-in", () => {
  test("is never another host's", () => {
    for (const raw of [
      "/.//evil.example/",
      "/a/..//evil.example",
      `${origin}//evil.example`,
      `${origin}/\\evil.example`,
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "https://evil.example",
      "https://evil.example/notes/x",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(document.domain)",
      "data:text/html,<script>alert(1)</script>",
    ]) {
      const went = nextPath(raw, origin);
      assert.equal(went, "/", `${raw} went to ${went}`);
      assert.equal(new URL(went, origin).origin, origin, raw);
    }
  });
  test("keeps a path of this server, with its query and its fragment", () => {
    assert.equal(nextPath("/notes/x", origin), "/notes/x");
    assert.equal(nextPath("/admin/accounts?q=bia#top", origin), "/admin/accounts?q=bia#top");
    assert.equal(nextPath(`${origin}/account`, origin), "/account");
  });
  test("is / when there is none", () => {
    assert.equal(nextPath(null, origin), "/");
    assert.equal(nextPath("", origin), "/");
  });
});
