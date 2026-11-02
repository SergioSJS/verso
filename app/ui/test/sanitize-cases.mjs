// The hostile-HTML suite's cases and checks, shared by the run in node
// (test/sanitize.test.mjs, happy-dom) and the run in the browsers
// (e2e/sanitize.spec.mjs, WebKit and Chromium through the harness: ADR
// 0083 item 16): a case added here runs in both. Dependency-free; the
// reading of an output (`read`) is evaluated inside the page as well, so
// it holds no reference outside its own body.

/** The policy, as test/sanitize.test.mjs prints it in its header; both
 *  runs check it against the module's own `POLICY`. */
export const POLICY = {
  elements: ("a abbr b bdi bdo blockquote br caption cite code col colgroup dd del details dfn div dl dt em figcaption figure " +
    "h1 h2 h3 h4 h5 h6 hr i iframe img input ins kbd li mark ol p pre q rp rt ruby s samp small span strong sub summary sup " +
    "table tbody td tfoot th thead time tr u ul var wbr").split(" ").sort(),
  dropped: ("script style link meta base frame frameset object embed applet param template noscript noembed noframes title " +
    "textarea select option optgroup datalist output progress meter canvas audio video source track map area portal xmp " +
    "plaintext listing slot head svg math").split(" ").sort(),
  global: "class id title lang dir style align data-target data-tag data-callout data-fold data-task-line data-oracle-line".split(" ").sort(),
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

/** What the sanitizer itself may add: a held picture's link, a relative
 *  picture's address waiting for the window, an embedded page's box. */
export const MADE = {
  classes: ["embed-web", "embed-gate", "embed-gate-origin", "embed-gate-text", "embed-gate-actions", "save", "ghost"],
  attrs: { div: ["data-embed-web", "data-embed-kind", "data-embed-url", "data-embed-origin", "data-embed-style"], button: ["type", "data-embed-action"] },
  elements: ["button"],
};

/** [name, hostile input, what must be gone (regexes over the output),
 *   what must stay (substrings of the output), options?] —
 *  `{ browserOnly: why }` for a case node's DOM cannot run. */
export const CASES = [
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
  // A link to the page where no window is configured (node), its gate box
  // where one is (the harness): the address stays either way.
  ["iframe on the web with srcdoc", `<iframe src="https://evil.example/" srcdoc="<script>alert(1)</script>" onload=alert(1)></iframe>`, [/<iframe|srcdoc|onload|script/i], ["https://evil.example/"]],
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
  // A browser's DOMParser runs with scripting off: a <noscript> at the
  // start stays in the head, and what follows lands in the body — here
  // the payload as an attribute's text (escaped, inert), below the
  // picture without its handler. Checked as markup, not as text.
  ["mXSS noscript title", `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`, [/<noscript|<img/i], []],
  // `</p>` breaks out of the svg in a browser: the <style> is HTML's,
  // and the <img> after it a real one, kept without its handler.
  ["mXSS svg style", `<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">`, [/svg|style|onerror/i], []],
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
  // What a real parser builds and a test's DOM may not (ADR 0083 item 16):
  // foreign content, raw-text and escapable raw-text elements, the
  // template's inert document, the CSSOM's own reading of a style.
  ["math mi script", `<math><mi><script>alert(1)</script></mi></math>t`, [/script|<math|<mi|alert/i], ["t"]],
  ["svg foreignObject", `<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>t`, [/svg|foreignObject|onerror|<img/i], ["t"]],
  ["math annotation-xml as HTML", `<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math>t`, [/math|annotation|onerror|<img/i], ["t"]],
  // A browser breaks out of the svg at the <img> (an HTML element in
  // foreign content); happy-dom keeps it inside: only what goes is shared.
  ["svg style holding markup", `<svg><style><img src=x onerror=alert(1)></style></svg>t`, [/svg|style|onerror/i], []],
  ["noscript holding a picture", `<noscript><img src=x onerror=alert(1)></noscript>t`, [/noscript|onerror/i], ["t"]],
  ["template holding a script", `<template><script>alert(1)</script></template>t`, [/template|script|alert/i], ["t"]],
  ["iframe srcdoc with markup", `<iframe srcdoc="&lt;img src=x onerror=alert(1)&gt;"></iframe>t`, [/iframe|srcdoc|onerror/i], ["t"]],
  ["mXSS textarea title", `<textarea><p title="</textarea><img src=x onerror=alert(1)>">`, [/textarea|onerror/i], []],
  ["mXSS textarea in textarea", `<textarea><textarea/><img src=x onerror=alert(1)></textarea>`, [/textarea|onerror/i], []],
  ["mXSS markup in an attribute", `<p title="</textarea><img src=x onerror=alert(1)>">t</p>`, [], ["t</p>"]],
  ["mXSS title", `<title><p title="</title><img src=x onerror=alert(1)>">`, [/<title|onerror/i], []],
  ["nested form, button formaction", `<form><form><button formaction="javascript:alert(1)" form=f>b</button></form></form>`, [/form|button|javascript/i], ["b"]],
  ["leading space before the scheme", `<a href=" javascript:alert(1)">x</a>`, [/href/, /javascript/i], [">x</a>"]],
  ["data: page in base64 as picture", `<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">`, [/ src=/, /data:text/], []],
  ["srcset on the web", `<img srcset="https://track.example/a.png 1x, https://track.example/b.png 2x" alt=a>`, [/srcset|track/], ['alt="a"']],
  ["style url(javascript:) on a picture", `<img src=x style="background:url(javascript:alert(1))">`, [/javascript|url\(/i], ['data-src="x"']],
  ["style behavior", `<div style="behavior: url(https://evil.example/x.htc); color: red">x</div>`, [/behavior|htc/i], ["color: red"]],
  ["style image-set in a shorthand", `<div style="background: image-set(url(https://track.example/a.png) 1x) red">x</div>`, [/image-set|track/i], []],
  ["style -webkit-image-set", `<div style="background-image: -webkit-image-set(url(https://track.example/a.png) 1x); color: red">x</div>`, [/image-set|track/i], ["color: red"]],
  ["style escape inside url()", `<div style="background-image: url(java\\73 cript:alert(1)); color: red">x</div>`, [/javascript|url\(/i], ["color: red"]],
  ["style position fixed, spaced", `<div style="position :  fixed ; top:0">x</div>`, [/position/], ["x"]],
  ["the app's classes alone", `<div class="menu quick">x</div>`, [/class=/], ["x"]],
  ["mail link with headers stays", `<a href="mailto:x@y.co?bcc=z@w.co&subject=hi">m</a>`, [], ['href="mailto:x@y.co?bcc=z@w.co']],
  ["a gate box forged by a note", `<div class="embed-gate" data-embed-kind="remote" data-embed-url="https://evil.example/" data-embed-origin="https://evil.example" data-embed-style="position:fixed"><button type="button" class="save" data-embed-action="load">load</button></div>`, [/embed-gate|data-embed|<button|evil|position/i], ["load"]],
  ["an embedded page's host forged by a note", `<div class="embed-web" data-embed-web="https://evil.example">x</div>`, [/embed-web|data-embed|evil/], ["x"]],
  ["ten thousand levels deep", "<div>".repeat(10_000) + "<img src=x onerror=alert(1)>" + "</div>".repeat(10_000), [/onerror/], ['data-src="x"'],
    { browserOnly: "happy-dom's own tree walks recurse: a stack overflow there, not in the module (its depth test below stays at 1000)" }],
];

/** Each of `htmls` cleaned by `s` (the sanitizer module) — or taken as it
 *  is, `clean` false — and read back by the DOM this runs in: every
 *  element (template contents included) with its namespace and
 *  attributes, the output parsed and written again, cleaned again, and
 *  `cleanHtml`'s nodes written as text. Self-contained: e2e/sanitize.spec
 *  evaluates its source in the page. `cleanHtml` is skipped for an output
 *  that names a picture on the web, which nodes adopted into the page
 *  would fetch. */
export function read(s, htmls, clean) {
  const body = (html) => new DOMParser().parseFromString(html, "text/html").body;
  const walk = (root, into) => {
    for (const el of Array.from(root.querySelectorAll("*"))) {
      into.push({ tag: el.localName, ns: el.namespaceURI, attrs: Array.from(el.attributes, (a) => [a.name, a.value]) });
      if (el.localName === "template" && el.content) walk(el.content, into);
    }
    return into;
  };
  return htmls.map((html) => {
    let out;
    try {
      out = clean ? s.cleanHtmlText(html) : html;
    } catch (e) {
      return { out: null, error: String(e && e.stack ? e.stack : e) };
    }
    const parsed = body(out);
    let nodes = null;
    if (clean && !/<img[^>]* src="https?:/i.test(out)) {
      const t = document.createElement("template");
      t.content.append(s.cleanHtml(html));
      nodes = t.innerHTML;
    }
    return { out, elements: walk(parsed, []), reparsed: parsed.innerHTML, recleaned: s.cleanHtmlText(out), nodes, error: null };
  });
}

const stripped = (v) => v.replace(/[\u0000- \u007f-\u00a0]/g, "").toLowerCase();

/** What in output `r` (one of `read`'s) the policy does not allow, as
 *  readable lines; none when it is safe. An embedded page's box is not
 *  asked to clean to itself: only this module makes one, and a note cannot
 *  forge one — cleaned again, it is plain text. */
export function problems(r) {
  if (r.error) return [`threw: ${r.error}`];
  const found = [];
  const say = (what) => found.push(what);
  const allowedClass = (tag, c) => POLICY.classes.includes(c) || MADE.classes.includes(c) || (tag === "code" && /^language-[\w#+.-]+$/.test(c));
  for (const { tag, ns, attrs } of r.elements) {
    if (!POLICY.elements.includes(tag) && !MADE.elements.includes(tag)) say(`element <${tag}> kept`);
    if (ns !== "http://www.w3.org/1999/xhtml") say(`foreign element <${tag}> (${ns})`);
    for (const [name, value] of attrs) {
      if (/^on/i.test(name)) say(`handler ${tag}[${name}]`);
      const allowed = POLICY.global.includes(name) || POLICY.own[tag]?.includes(name) || MADE.attrs[tag]?.includes(name);
      if (!allowed) say(`attribute ${tag}[${name}]`);
      const v = stripped(value);
      if (/(java|vb|live)script:/.test(v)) say(`script address in ${tag}[${name}]`);
      if (name === "href" && !/^(#$|#note-|https?:|mailto:)/i.test(value)) say(`href ${value}`);
      if (name === "src" && !/^(https?:|data:image\/)/i.test(value)) say(`src ${value}`);
      if ((name === "data-embed-url" || name === "data-embed-web") && !/^https?:/i.test(value)) say(`${name} ${value}`);
      if (name === "id" && !value.startsWith(POLICY.idPrefix)) say(`id ${value}`);
      if (name === "class") for (const c of value.split(/\s+/)) if (!allowedClass(tag, c)) say(`class ${c} on <${tag}>`);
      if (name === "style" || name === "data-embed-style") {
        if (/position\s*:\s*(fixed|absolute)/i.test(value)) say(`position in ${name}="${value}"`);
        if (/expression\s*\(|image-set|-moz-binding|behavior\s*:/i.test(value)) say(`${name}="${value}"`);
        for (const m of value.matchAll(/url\(\s*["']?([^"')]*)/gi)) if (!/^(https?:|data:image\/)/i.test(m[1])) say(`url(${m[1]}) in ${name}`);
      }
    }
  }
  // What is left means the same parsed again, and cleans to itself.
  if (r.reparsed !== r.out) say(`does not parse back to itself:\n  again: ${r.reparsed}`);
  if (!r.out.includes("embed-gate") && r.recleaned !== r.out) say(`cleaning twice changes it:\n  again: ${r.recleaned}`);
  if (r.nodes !== null && r.nodes !== undefined && r.nodes !== r.out) say(`cleanHtml's nodes differ from cleanHtmlText:\n  nodes: ${r.nodes}`);
  return found;
}

/** A case's own expectations over its output: what must be gone, what
 *  must stay. */
export function misses(c, out) {
  const [, , gone, kept] = c;
  const found = [];
  for (const re of gone) if (re.test(out)) found.push(`${re} still there`);
  for (const k of kept) if (!out.includes(k)) found.push(`"${k}" not kept`);
  return found;
}
