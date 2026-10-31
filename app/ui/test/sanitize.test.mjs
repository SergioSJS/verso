// The note HTML sanitizer (`src/sanitize.ts`) against hostile notes
// (threat-model.md, gap 1). Hand-written, no library: an allowlist,
// applied to the core's HTML parsed in an inert document. The policy it
// enforces, printed here and checked against the module's own below so
// that this header cannot drift from the code:
//
//   Elements kept (with the attributes below; any other element is
//   unwrapped — its text and kept children stay):
//     a abbr b bdi bdo blockquote br caption cite code col colgroup dd del
//     details dfn div dl dt em figcaption figure h1-h6 hr i iframe* img
//     input** ins kbd li mark ol p pre q rp rt ruby s samp small span strong
//     sub summary sup table tbody td tfoot th thead time tr u ul var wbr
//       * an iframe on the web becomes the gated box of an embedded page
//         (the page loads in a child view after the reader's approval of
//         its origin); any other iframe goes.
//       ** a checkbox only, always disabled; any other input goes.
//   Gone with all they hold: script style link meta base frame frameset
//     object embed applet param template noscript noembed noframes title
//     textarea select option optgroup datalist output progress meter canvas
//     audio video source track map area portal xmp plaintext listing slot
//     head svg math — and any element outside the HTML namespace.
//   Attributes on any kept element: class id title lang dir style align
//     data-target data-tag data-callout data-fold data-task-line
//     data-oracle-line
//   Attributes of their own: a[href] img[src alt width height data-src]
//     iframe[src width height style title allow allowfullscreen loading
//     sandbox] ol[start reversed type] li[value] input[type checked disabled]
//     td,th[colspan rowspan] th[scope] col,colgroup[span] details[open]
//     time[datetime]. Every other attribute goes, every `on*` with them.
//   Classes: only the renderer's (wikilink tag embed math math-display
//     callout callout-title footnote-reference footnote-definition
//     footnote-definition-label), the held picture's `remote-image`, and
//     `language-*` on code.
//   Addresses: a link to http(s), mailto, or `#` in the page; a picture
//     from http(s) (a link to it instead while remote content is off), a
//     picture in data (`data:image/…`), or a file beside the note (moved
//     to `data-src`, resolved by the window through the core; a
//     `data-src` written by the note obeys the same rule). Each
//     address is the URL parser's own reading of it, so `java&#9;script:`
//     is read as the page would read it.
//   Ids: every id, and every `#` link, under the prefix `note-`, where no
//     id of the window and no global name can be met (clobbering).
//   Inline style: kept as the CSSOM reads it (what it cannot read goes),
//     but never `position: fixed` or `absolute`; a `url()` only to the
//     web (remote content on) or a picture in data; `image-set()` and
//     `src()` go.
//   Comments go.
//
// Run twice. Here, in node over happy-dom, whose parser is not a
// browser's: the guarantees above are structural (namespace and name
// checks, the drop list, no comment, no raw-text element), which hold
// whatever a parser builds. And in WebKit and Chromium through the
// browser harness, `e2e/sanitize.spec.mjs` in `npm run e2e` (ADR 0083
// item 16), where a real parser's quirks — mutation XSS, foreign content,
// raw-text elements, the CSSOM's reading of a style — are met. Both runs
// take the cases, the policy and the checks from test/sanitize-cases.mjs,
// so a case added there runs in both; a case this DOM cannot run says so
// and runs in the browsers only. Each case checks the output against the
// policy, and that it parses back to itself, cleans to itself, and is
// what `cleanHtml`'s nodes write.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";
import { CASES, POLICY, misses, problems, read } from "./sanitize-cases.mjs";

const win = new Window({ url: "http://localhost" });
for (const name of ["window", "document", "DOMParser", "NodeFilter", "Node", "HTMLElement", "Element", "CSSStyleDeclaration"]) {
  globalThis[name] = name === "window" ? win : win[name];
}

await esbuild.build({
  entryPoints: [process.env.SANITIZE_SOURCE ?? "src/sanitize.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/sanitize.test-bundle.mjs",
  logLevel: "error",
});
const s = await import("./.bundles/sanitize.test-bundle.mjs");

test("the policy printed above is the module's", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(s.POLICY)), POLICY);
});

const parse = (html) => new win.DOMParser().parseFromString(html, "text/html").body;

/** The output holds nothing the policy does not allow, parses back to
 *  itself and cleans to itself (test/sanitize-cases.mjs). */
function assertSafe(out, input) {
  const found = problems(read(s, [out], false)[0]);
  assert.deepEqual(found, [], `\n  in:  ${input}\n  out: ${out}`);
}

describe("hostile notes", () => {
  for (const c of CASES) {
    const [name, input, , , options] = c;
    test(name, { skip: options?.browserOnly ? `browsers only (e2e/sanitize.spec.mjs): ${options.browserOnly}` : false }, () => {
      const r = read(s, [input], true)[0];
      assert.deepEqual([...problems(r), ...misses(c, r.out ?? "")], [], `\n  in:  ${input}\n  out: ${r.out}`);
    });
  }
  test("at least forty cases", () => assert.ok(CASES.length >= 40));
});

describe("remote content off", () => {
  test("a picture on the web becomes a link to it; a style loses what it would fetch", () => {
    s.allowRemoteContent(false);
    try {
      const input = `<img src="https://track.example/p.png" alt="p"><div style="background: url(https://track.example/b.png); color: red">x</div>`;
      const out = s.cleanHtmlText(input);
      assertSafe(out, input);
      assert.doesNotMatch(out, /<img|url\(/);
      assert.ok(out.includes('<a href="https://track.example/p.png" class="remote-image">p</a>'), out);
      assert.ok(out.includes("color: red"), out);
    } finally {
      s.allowRemoteContent(true);
    }
  });
});

describe("embedded pages", () => {
  test("a page not on the web gets no box, whoever approved what", () => {
    s.allowEmbedOrigins(["*"]);
    try {
      for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,<script>alert(1)</script>"]) {
        const el = s.webFrame(url, "", "", "");
        assert.equal(el.hasAttribute("data-embed-web") || el.querySelector("[data-embed-web]") !== null, false, url);
        assert.equal(el.localName, "span", url);
      }
    } finally {
      s.allowEmbedOrigins([]);
    }
  });
  test("the gate holds the page inert until the reader approves its origin", () => {
    s.configureEmbeds({ strings: { remoteOff: "off", load: "load", local: "local", publicSite: "public", approve: "ok", cancel: "no" }, approve: async () => false });
    const input = `<iframe src="https://evil.example/" style="position:fixed;height:10px" onload=alert(1)></iframe>`;
    const out = s.cleanHtmlText(input);
    assertSafe(out, input);
    const box = parse(out).querySelector(".embed-gate");
    assert.ok(box, out);
    assert.equal(box.getAttribute("data-embed-origin"), "https://evil.example");
    assert.ok(parse(out).querySelector("[data-embed-web]") === null, "not loaded before the approval");
    assert.doesNotMatch(out, /position|onload/);
  });
});

describe("a gate box stands on its own", () => {
  const strings = { remoteOff: "off", load: "load", local: "local", publicSite: "public", approve: "ok", cancel: "no" };
  /** The box as a view puts it into the page: its text parsed again
   *  (`innerHTML`, Live Preview's widget, a template of images.ts). */
  const mounted = (out) => {
    const mount = document.createElement("div");
    mount.innerHTML = out;
    document.body.append(mount);
    return mount;
  };
  test("what its button needs is on the box: no template, nothing loaded before the click", () => {
    s.configureEmbeds({ strings, approve: async () => true });
    s.allowEmbedOrigins(["https://ok.example"]);
    s.allowRemoteContent(false);
    const input = `<iframe src="https://ok.example/p" width="300" style="border: 1px solid red; position: fixed; background: url(javascript:alert(1))"></iframe>`;
    const out = s.cleanHtmlText(input);
    const mount = mounted(out);
    try {
      assertSafe(out, input);
      assert.doesNotMatch(out, /<template/, out);
      assert.ok(mount.querySelector("[data-embed-web], .embed-web") === null, "nothing to load before the click");
      mount.querySelector('[data-embed-action="load"]').click();
      const host = mount.querySelector("div.embed-web");
      assert.ok(host, `the load button built no frame\n  out: ${out}`);
      assert.equal(host.getAttribute("data-embed-web"), "https://ok.example/p");
      assert.equal(host.style.width, "300px");
      assert.equal(host.style.height, "800px");
      assert.match(host.getAttribute("style"), /border/);
      assert.doesNotMatch(host.getAttribute("style"), /position|javascript|url/);
      assert.ok(mount.querySelector(".embed-gate") === null);
    } finally {
      mount.remove();
      s.allowRemoteContent(true);
      s.allowEmbedOrigins([]);
    }
  });
  test("a site that forbids framing is said so before the approval, and approving waits for a second click", async () => {
    const approvals = [];
    const checks = [];
    const warnStrings = { ...strings, unframed: "forbids", approveAnyway: "anyway" };
    s.configureEmbeds({ strings: warnStrings, approve: async (o) => (approvals.push(o), true), frameable: async (u) => (checks.push(u), false) });
    const mount = mounted(s.cleanHtmlText(`<iframe src="https://no.example/p"></iframe>`));
    try {
      assert.deepEqual(checks, [], "nothing is asked of the network before the click");
      mount.querySelector('[data-embed-action="approve"]').click();
      await new Promise((r) => setTimeout(r, 0));
      assert.deepEqual(checks, ["https://no.example/p"]);
      assert.deepEqual(approvals, [], "not approved by the first click");
      assert.equal(mount.querySelector(".embed-gate-warn").textContent, "forbids");
      assert.equal(mount.querySelector(".embed-gate-warn").getAttribute("role"), "alert");
      assert.ok(mount.querySelector("div.embed-web") === null);
      mount.querySelector('[data-embed-action="approve-anyway"]').click();
      await new Promise((r) => setTimeout(r, 0));
      assert.deepEqual(approvals, ["https://no.example"]);
      assert.equal(mount.querySelector("div.embed-web").getAttribute("data-embed-web"), "https://no.example/p");
    } finally {
      mount.remove();
      s.allowEmbedOrigins([]);
    }
  });
  test("review M9: when the host refuses the approval the reader is told, and the button comes back", async () => {
    s.configureEmbeds({ strings: { ...strings, approveFailed: "could not save" }, approve: async () => false, frameable: async () => true });
    const mount = mounted(s.cleanHtmlText(`<iframe src="https://refused.example/p"></iframe>`));
    try {
      const button = mount.querySelector('[data-embed-action="approve"]');
      button.click();
      await new Promise((r) => setTimeout(r, 0));
      const note = mount.querySelector(".embed-gate-warn");
      assert.ok(note, "a visible message");
      assert.equal(note.textContent, "could not save");
      assert.equal(note.getAttribute("role"), "alert");
      assert.equal(button.disabled, false, "the button is usable again");
      assert.ok(mount.querySelector("div.embed-web") === null);
    } finally {
      mount.remove();
      s.allowEmbedOrigins([]);
    }
  });
  test("a site that may be framed is approved by the one click; cancel leaves a link", async () => {
    const approvals = [];
    s.configureEmbeds({ strings: { ...strings, unframed: "forbids" }, approve: async (o) => (approvals.push(o), true), frameable: async () => true });
    const mount = mounted(s.cleanHtmlText(`<iframe src="https://yes.example/p"></iframe>`));
    try {
      mount.querySelector('[data-embed-action="approve"]').click();
      await new Promise((r) => setTimeout(r, 0));
      assert.deepEqual(approvals, ["https://yes.example"]);
      assert.ok(mount.querySelector(".embed-gate-warn") === null);
    } finally {
      mount.remove();
      s.allowEmbedOrigins([]);
    }
  });
  test("remote content off: no check is made, so no request waits for consent", async () => {
    const checks = [];
    s.configureEmbeds({ strings: { ...strings, unframed: "forbids" }, approve: async () => true, frameable: async (u) => (checks.push(u), false) });
    s.allowRemoteContent(false);
    try {
      assert.equal(await s.frameWarning("https://no.example/p"), null);
      assert.deepEqual(checks, []);
    } finally {
      s.allowRemoteContent(true);
    }
    assert.equal(await s.frameWarning("https://no.example/p"), "forbids");
    assert.equal(await s.frameWarning("https://no.example/p", true), null, "no board wording wired: nothing to say");
  });
  test("approved, the box builds its frame from its own address", async () => {
    let asked = "";
    s.configureEmbeds({ strings, approve: async (origin) => ((asked = origin), true) });
    const out = s.cleanHtmlText(`<iframe src="https://new.example/a?b=1" height="120"></iframe>`);
    const mount = mounted(out);
    try {
      mount.querySelector('[data-embed-action="approve"]').click();
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(asked, "https://new.example");
      const host = mount.querySelector("div.embed-web");
      assert.ok(host, `the approve button built no frame\n  out: ${out}`);
      assert.equal(host.getAttribute("data-embed-web"), "https://new.example/a?b=1");
      assert.equal(host.style.height, "120px");
    } finally {
      mount.remove();
      s.allowEmbedOrigins([]);
    }
  });
  test("a box written by hand loads nothing from an origin not approved", () => {
    s.configureEmbeds({ strings, approve: async () => false });
    s.allowRemoteContent(false);
    const mount = mounted(
      `<div class="embed-gate" data-embed-kind="remote" data-embed-url="https://evil.example/" data-embed-origin="https://ok.example" data-embed-style="position: fixed; inset: 0">` +
        `<button type="button" data-embed-action="load">load</button></div>`,
    );
    try {
      mount.querySelector('[data-embed-action="load"]').click();
      assert.ok(mount.querySelector("[data-embed-web]") === null, mount.innerHTML);
    } finally {
      mount.remove();
      s.allowRemoteContent(true);
    }
  });
});

test("a note nested deeper than a stack is cleaned", () => {
  // Deeper than WebKit's parser nests (512); happy-dom's own walks
  // recurse, so not much deeper here.
  const depth = 1000;
  const input = "<div>".repeat(depth) + "<img src=x onerror=alert(1)>" + "</div>".repeat(depth);
  const out = s.cleanHtmlText(input);
  assert.doesNotMatch(out, /onerror/);
});
