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
// Run in happy-dom, whose parser is not WebKit's: the guarantees above
// are structural (namespace and name checks, the drop list, no comment,
// no raw-text element), which hold whatever a parser builds; each case
// checks the output against the policy, and that it parses back to
// itself and cleans to itself.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

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

const POLICY = {
  elements: ("a abbr b bdi bdo blockquote br caption cite code col colgroup dd del details dfn div dl dt em figcaption figure " +
    "h1 h2 h3 h4 h5 h6 hr i iframe img input ins kbd li mark ol p pre q rp rt ruby s samp small span strong sub summary sup " +
    "table tbody td tfoot th thead time tr u ul var wbr").split(" ").sort(),
  dropped: ("script style link meta base frame frameset object embed applet param template noscript noembed noframes title " +
    "textarea select option optgroup datalist output progress meter canvas audio video source track map area portal xmp " +
    "plaintext listing slot head svg math").split(" ").sort(),
  global: "class id title lang dir style align data-target data-tag data-callout data-fold data-task-line".split(" ").sort(),
  own: {
    a: ["href"],
    iframe: ["src", "width", "height", "style", "title", "allow", "allowfullscreen", "loading", "sandbox"].sort(),
    img: ["src", "alt", "width", "height", "data-src"].sort(),
    ol: ["start", "reversed", "type"].sort(),
    li: ["value"],
    input: ["type", "checked", "disabled"].sort(),
    td: ["colspan", "rowspan"].sort(),
    th: ["colspan", "rowspan", "scope"].sort(),
    col: ["span"],
    colgroup: ["span"],
    details: ["open"],
    time: ["datetime"],
  },
  classes: ("wikilink tag embed math math-display callout callout-title footnote-reference footnote-definition " +
    "footnote-definition-label remote-image").split(" ").sort(),
  idPrefix: "note-",
};

test("the policy printed above is the module's", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(s.POLICY)), POLICY);
});

/** What the sanitizer itself may add: a held picture's link, a relative
 *  picture's address waiting for the window, an embedded page's box. */
const MADE = {
  classes: new Set(["embed-web", "embed-gate", "embed-gate-origin", "embed-gate-text", "embed-gate-actions", "save", "ghost"]),
  attrs: { div: ["data-embed-web", "data-embed-kind", "data-embed-url", "data-embed-origin"], button: ["type", "data-embed-action"] },
  elements: new Set(["button", "template"]),
};

const parse = (html) => new win.DOMParser().parseFromString(html, "text/html").body;
/** Every element, template contents included. */
function* elements(root) {
  for (const el of root.querySelectorAll("*")) {
    yield el;
    if (el.localName === "template") yield* elements(el.content);
  }
}
const stripped = (v) => v.replace(/[\u0000- \u007f- ]/g, "").toLowerCase();

/** The output holds nothing the policy does not allow. */
function assertSafe(out, input) {
  const why = `\n  in:  ${input}\n  out: ${out}`;
  for (const el of elements(parse(out))) {
    const tag = el.localName;
    assert.ok(POLICY.elements.includes(tag) || MADE.elements.has(tag), `element <${tag}> kept${why}`);
    assert.equal(el.namespaceURI, "http://www.w3.org/1999/xhtml", `foreign element${why}`);
    for (const { name, value } of Array.from(el.attributes)) {
      assert.ok(!/^on/i.test(name), `handler ${name}${why}`);
      const allowed = POLICY.global.includes(name) || POLICY.own[tag]?.includes(name) || MADE.attrs[tag]?.includes(name);
      assert.ok(allowed, `attribute ${tag}[${name}]${why}`);
      const v = stripped(value);
      assert.ok(!/(java|vb|live)script:/.test(v), `script address in ${name}${why}`);
      if (name === "href") assert.match(value, /^(#$|#note-|https?:|mailto:)/i, `href${why}`);
      if (name === "src") assert.match(value, /^(https?:|data:image\/)/i, `src${why}`);
      if (name === "id") assert.ok(value.startsWith("note-"), `id ${value}${why}`);
      if (name === "class") for (const c of value.split(/\s+/)) assert.ok(POLICY.classes.includes(c) || MADE.classes.has(c) || (tag === "code" && /^language-/.test(c)), `class ${c}${why}`);
      if (name === "style") {
        assert.ok(!/position\s*:\s*(fixed|absolute)/i.test(value), `position${why}`);
        assert.ok(!/expression\s*\(|image-set|-moz-binding|behavior\s*:/i.test(value), `style${why}`);
        for (const m of value.matchAll(/url\(\s*["']?([^"')]*)/gi)) assert.match(m[1], /^(https?:|data:image\/)/i, `style url${why}`);
      }
    }
  }
  // What is left means the same parsed again, and cleans to itself —
  // but for an embedded page's box, which only this module makes (a note
  // cannot forge one: cleaned again, it is plain text).
  assert.equal(parse(out).innerHTML, out, `does not parse back to itself${why}`);
  if (!out.includes("embed-gate")) assert.equal(s.cleanHtmlText(out), out, `cleaning twice changes it${why}`);
}

/** [name, hostile input, what must be gone (regexes over the output),
 *   what must stay (substrings of the output)]. */
const CASES = [
  // Scripts, plainly.
  ["script element", `<p>a</p><script>alert(1)</script>`, [/script/i, /alert/], ["<p>a</p>"]],
  ["script, upper case, external", `<SCRIPT SRC=//evil.example/x.js></SCRIPT>b`, [/script/i, /evil/], ["b"]],
  ["img onerror", `<img src=x onerror=alert(1)>`, [/onerror/, /alert/], ['data-src="x"']],
  ["body onload", `<body onload=alert(1)><p>t</p></body>`, [/onload/], ["<p>t</p>"]],
  ["details ontoggle", `<details open ontoggle=alert(1)><summary>s</summary></details>`, [/ontoggle/], ["<details open"]],
  ["svg onload", `<svg onload=alert(1)><circle r=1></svg>t`, [/svg/i, /onload/, /circle/], ["t"]],
  ["svg script", `<svg><script>alert(1)</script></svg>`, [/script/i, /svg/i], []],
  ["svg animate href", `<svg><a><animate attributeName=href values=javascript:alert(1) /><text y=20>x</text></a></svg>`, [/svg|animate|javascript/i], []],
  ["svg xlink:href", `<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>`, [/javascript|xlink/i], []],
  ["math href", `<math><mi xlink:href="javascript:alert(1)" href="javascript:alert(1)">x</mi></math>`, [/javascript|math/i], []],
  ["object data", `<object data="javascript:alert(1)">o</object>`, [/object|javascript/i], []],
  ["embed src", `<embed src="javascript:alert(1)">`, [/embed|javascript/i], []],
  ["applet, param", `<applet code=x><param name=a value=b></applet>`, [/applet|param/i], []],
  ["video poster, audio onerror", `<video poster=javascript:alert(1)><source src=x onerror=alert(1)></video><audio src=x onerror=alert(1)>`, [/video|audio|source|alert/i], []],
  ["frameset onload", `<frameset onload=alert(1)><frame src=javascript:alert(1)></frameset>`, [/frame|alert/i], []],
  ["portal", `<portal src=https://evil.example/></portal>`, [/portal|evil/i], []],
  // Links and pictures with script addresses.
  ["javascript: link", `<a href="javascript:alert(1)">x</a>`, [/href/, /javascript/i], [">x</a>"]],
  ["mixed-case scheme", `<a href="JaVaScRiPt:alert(1)">x</a>`, [/href/], []],
  ["tab inside the scheme", `<a href="java&#x09;script:alert(1)">x</a>`, [/href/], []],
  ["newline inside the scheme", `<a href="java\nscript:alert(1)">x</a>`, [/href/], []],
  ["decimal entities", `<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>`, [/href/], []],
  ["hex entities without semicolons", `<a href="&#x6A&#x61&#x76&#x61&#x73&#x63&#x72&#x69&#x70&#x74&#x3A;alert(1)">x</a>`, [/href/], []],
  ["leading control characters", `<a href=" &#14;  javascript:alert(1)">x</a>`, [/href/], []],
  ["fullwidth scheme", `<a href="ｊａｖａｓｃｒｉｐｔ：alert(1)">x</a>`, [/href/], []],
  ["vbscript:", `<a href="vbscript:msgbox(1)">x</a>`, [/href/], []],
  ["data: page link", `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`, [/href/, /data:/], []],
  ["protocol-relative link", `<a href="//evil.example/">x</a>`, [/href/, /evil/], []],
  ["relative link", `<a href="/api/me/sessions/others">x</a>`, [/href/], []],
  ["javascript: picture", `<img src="javascript:alert(1)">`, [/src=/, /javascript/i], ["<img"]],
  ["data: page as picture", `<img src="data:text/html,<script>alert(1)</script>">`, [/src=/, /script/i], []],
  ["protocol-relative picture", `<img src="//evil.example/x.png">`, [/ src=/, /evil/], []],
  ["backslashed host as picture", `<img src="\\\\evil.example\\x.png">`, [/ src=/], ["data-src"]],
  ["srcset", `<img src="https://ok.example/a.png" srcset="javascript:alert(1) 1x">`, [/srcset/, /javascript/i], ['src="https://ok.example/a.png"']],
  ["svg picture in data stays a picture", `<img src="data:image/svg+xml;base64,PHN2Zy8+">`, [], ['src="data:image/svg+xml;base64,PHN2Zy8+"']],
  ["link attributes", `<a href="https://ok.example/" target="_blank" rel="opener" ping="https://track.example/">x</a>`, [/target|rel=|ping/], ['href="https://ok.example/"']],
  ["mail link", `<a href="mailto:a@b.co">m</a>`, [], ['href="mailto:a@b.co"']],
  // Embedded pages.
  ["iframe javascript:", `<iframe src="javascript:alert(1)"></iframe>`, [/iframe|javascript/i], []],
  ["iframe srcdoc", `<iframe srcdoc="<script>alert(1)</script>"></iframe>`, [/iframe|srcdoc|script/i], []],
  ["iframe on the web with srcdoc", `<iframe src="https://evil.example/" srcdoc="<script>alert(1)</script>" onload=alert(1)></iframe>`, [/<iframe|srcdoc|onload|script/i], ['class="remote-image"']],
  ["iframe content as markup", `<iframe src="https://evil.example/"><img src=x onerror=alert(1)></iframe>`, [/<iframe|onerror|<img/i], []],
  // What takes the page elsewhere or changes its rules.
  ["base", `<base href="javascript:alert(1)//"><a href="/x">x</a>`, [/base|javascript/i], []],
  ["meta refresh", `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`, [/meta|refresh/i], []],
  ["form action", `<form action="javascript:alert(1)"><input type=submit value=go><button formaction="javascript:alert(1)">b</button></form>`, [/form|input|javascript/i], ["b"]],
  ["input image", `<input type=image src=x onerror=alert(1)>`, [/input|onerror/i], []],
  ["isindex", `<isindex action=javascript:alert(1) type=image>`, [/isindex|javascript|action/i], []],
  ["text input", `<input type=text value=x autofocus onfocus=alert(1)>`, [/input|onfocus/i], []],
  ["checkbox kept, disabled, without handlers", `<input type=checkbox checked onclick=alert(1) autofocus onfocus=alert(1)>`, [/onclick|onfocus|autofocus/], ["checkbox", "disabled"]],
  ["textarea, select", `<textarea><img src=x onerror=alert(1)></textarea><select><option>o</select>`, [/textarea|select|option|onerror/i], []],
  ["link stylesheet", `<link rel=stylesheet href=//evil.example/x.css>`, [/link|evil/i], []],
  ["style element", `<style>body{display:none}</style>t`, [/style|display/i], ["t"]],
  // Styles.
  ["position fixed over the window", `<div style="position:fixed;inset:0;z-index:9999">x</div>`, [/position/], ["x"]],
  ["position absolute !important", `<p style="position: ABSOLUTE !important; color: red">x</p>`, [/position/], ["color: red"]],
  ["url(javascript:)", `<div style="background-image: url(javascript:alert(1)); color: red">x</div>`, [/javascript|url/i], ["color: red"]],
  ["url() to this page's API", `<div style="background-image: url('/api/me/sessions')">x</div>`, [/url|api/i], []],
  ["image-set", `<div style="background-image: image-set('https://track.example/a.png' 1x)">x</div>`, [/image-set|track/i], []],
  ["expression", `<div style="width: expression(alert(1))">x</div>`, [/expression/i], []],
  // Mutation XSS: markup that changes meaning on the way through a
  // serialization and a parse.
  ["mXSS noscript title", `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`, [/noscript|onerror|<img/i], []],
  ["mXSS svg style", `<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">`, [/svg|style|onerror|<img/i], []],
  ["mXSS math mglyph", `<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">`, [/math|mglyph|style|<img/i], []],
  ["mXSS nested forms", `<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>`, [/form|math|style|onerror/i], []],
  ["mXSS comment", `<!--<img src=x onerror=alert(1)>-->t`, [/<!--|onerror|<img/i], ["t"]],
  ["mXSS comment closing early", `<!--><img src=x onerror=alert(1)>-->`, [/<!--|onerror/i], []],
  ["CDATA in HTML", `<![CDATA[<img src=x onerror=alert(1)>]]>t`, [/onerror|CDATA/i], []],
  ["template", `<template><img src=x onerror=alert(1)></template>t`, [/template|<img/i], ["t"]],
  ["declarative shadow root", `<div><template shadowrootmode="open"><img src=x onerror=alert(1)></template></div>`, [/template|<img|onerror/i], []],
  ["xmp", `<xmp><img src=x onerror=alert(1)></xmp>`, [/xmp|<img|onerror/i], []],
  ["plaintext, listing", `<listing><img src=x onerror=alert(1)></listing><plaintext><img src=x onerror=alert(1)>`, [/listing|plaintext|<img|onerror/i], []],
  ["title, noembed, noframes", `<title><img src=x onerror=alert(1)></title><noembed><img src=x onerror=alert(1)></noembed><noframes><img src=x onerror=alert(1)></noframes>`, [/title|noembed|noframes|onerror|<img/i], []],
  ["NUL inside a tag name", `<scr\u0000ipt>alert(1)</scr\u0000ipt>`, [/<script/i], []],
  ["custom element with is", `<x-foo is="script" onclick=alert(1)>t</x-foo>`, [/x-foo|is=|onclick/], ["t"]],
  // The window's own names.
  ["id clobbering a global", `<img id="isTauri"><a id="__TAURI_INTERNALS__">x</a>`, [/id="isTauri"|id="__TAURI/], ['id="note-isTauri"', 'id="note-__TAURI_INTERNALS__"']],
  ["id taken from the window", `<span id="sync-state">s</span><p id="tree-root">p</p>`, [/id="sync-state"|id="tree-root"/], ['id="note-sync-state"']],
  ["footnote link and target move together", `<sup class="footnote-reference"><a href="#1">1</a></sup><div class="footnote-definition" id="1">n</div>`, [/href="#1"|id="1"/], ['href="#note-1"', 'id="note-1"']],
  ["the app's classes", `<div class="quick menu callout">x</div>`, [/quick|menu/], ['class="callout"']],
  ["the window's own attributes", `<div class="embed-web" data-embed-web="https://evil.example/">x</div><span data-embed-action="approve">y</span><img src="x" data-src="https://evil.example/">`, [/embed-web|data-embed|evil/], []],
  ["the renderer's attributes stay", `<a class="wikilink" data-target="Nota">n</a><span class="embed" data-target="Mapa.png"></span><div class="callout" data-callout="note" data-fold="-">c</div>`, [], ['data-target="Nota"', 'data-callout="note"']],
];

describe("hostile notes", () => {
  for (const [name, input, gone, kept] of CASES) {
    test(name, () => {
      const out = s.cleanHtmlText(input);
      assertSafe(out, input);
      for (const re of gone) assert.doesNotMatch(out, re, `\n  in:  ${input}\n  out: ${out}`);
      for (const k of kept) assert.ok(out.includes(k), `"${k}" kept\n  in:  ${input}\n  out: ${out}`);
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
    const held = box.querySelector("template").content.querySelector(".embed-web");
    assert.equal(held.getAttribute("data-embed-web"), null, "not loaded before the approval");
    assert.doesNotMatch(out, /position|onload/);
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
