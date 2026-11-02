// The window's own sounds have one way out (ADR 0116, the 2026-11-02 note on A2): every sound of Verso's own connects
// to `ownOutput(ctx)`; normally that is the destination, and while a Mac shares it is the host, through a worklet. The
// unit tests drive the switch with a fake context, and read the five places that make a sound to see that none goes
// straight to `ctx.destination`.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/dice3d/ownOutput";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/ownOutput.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/ownOutput.test-bundle.mjs");

class FakeNode {
  constructor(name) {
    this.name = name;
    this.to = new Set();
    this.gain = { value: 1 };
  }
  connect(n) {
    this.to.add(n);
    return n;
  }
  disconnect() {
    this.to.clear();
  }
}
class FakeWorklet extends FakeNode {
  constructor(ctx, name, opts) {
    super("worklet");
    this.processor = name;
    this.opts = opts;
    this.port = { onmessage: null };
    made.push(this);
  }
}
let made = [];
globalThis.AudioWorkletNode = FakeWorklet;
const fakeCtx = () => {
  const ctx = { destination: new FakeNode("destination"), createGain: () => new FakeNode("gain") };
  return ctx;
};

describe("the window's own output", () => {
  beforeEach(() => {
    m.resetOwnOutputForTests();
    made = [];
  });

  test("normally it is the destination's input, one node per context", () => {
    const ctx = fakeCtx();
    const out = m.ownOutput(ctx);
    assert.equal(m.ownOutput(ctx), out);
    assert.ok(out.to.has(ctx.destination));
    assert.equal(m.ownRouted(), false);
  });

  test("while routed to the host it leaves the destination and feeds the worklet, which posts to the host", async () => {
    const ctx = fakeCtx();
    const out = m.ownOutput(ctx);
    const sent = [];
    await m.routeOwn({ load: async () => undefined, send: (b) => sent.push(b) }, [ctx]);
    assert.equal(m.ownRouted(), true);
    assert.equal(out.to.has(ctx.destination), false, "the sounds do not reach the destination");
    assert.equal(made.length, 1);
    assert.equal(made[0].processor, "verso-own-out");
    assert.ok(out.to.has(made[0]), "they reach the worklet");
    // The worklet's tail is muted: it is pulled, and nothing it outputs is heard.
    const [tail] = [...made[0].to];
    assert.equal(tail.gain.value, 0);
    // A block the worklet posts goes to the host.
    const block = new ArrayBuffer(8);
    made[0].port.onmessage({ data: block });
    assert.deepEqual(sent, [block]);
    // Anything but a block is ignored.
    made[0].port.onmessage({ data: "x" });
    assert.equal(sent.length, 1);
  });

  test("back to the window's own output when the share ends", async () => {
    const ctx = fakeCtx();
    const out = m.ownOutput(ctx);
    await m.routeOwn({ load: async () => undefined, send: () => undefined }, [ctx]);
    await m.routeOwn(null);
    assert.equal(m.ownRouted(), false);
    assert.ok(out.to.has(ctx.destination));
    assert.equal(out.to.size, 1);
    assert.equal(made[0].port.onmessage, null);
  });

  test("a context made while a share runs is routed from the start, never heard on the destination", async () => {
    await m.routeOwn({ load: async () => undefined, send: () => undefined }, []);
    const ctx = fakeCtx();
    const out = m.ownOutput(ctx);
    assert.equal(out.to.has(ctx.destination), false);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(made.length, 1);
    assert.ok(out.to.has(made[0]));
  });

  test("a worklet that cannot load leaves the sounds on the window's output and says so", async () => {
    const ctx = fakeCtx();
    const out = m.ownOutput(ctx);
    await assert.rejects(m.routeOwn({ load: async () => Promise.reject(new Error("no module")), send: () => undefined }, [ctx]), /no module/);
    assert.equal(m.ownRouted(), false);
    assert.ok(out.to.has(ctx.destination));
  });

  test("the route ending while the module loads leaves no worklet behind", async () => {
    const ctx = fakeCtx();
    const out = m.ownOutput(ctx);
    let release;
    const slow = new Promise((r) => (release = r));
    const routing = m.routeOwn({ load: () => slow, send: () => undefined }, [ctx]);
    await m.routeOwn(null);
    release();
    await routing;
    assert.equal(made.length, 0);
    assert.ok(out.to.has(ctx.destination));
  });
});

describe("no sound of Verso's own goes straight to the destination", () => {
  const files = ["src/table/chime.ts", "src/table/sound/player.ts", "src/table/sound/listener.ts", "src/dice3d/audio.ts", "src/dice3d/sound.ts"];
  for (const f of files) {
    test(f, () => {
      const code = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(code, /\.connect\([^)]*destination\)/, "connects to the destination");
      assert.match(code, /ownOutput\(|routeMedia\(/);
    });
  }
});

describe("an <audio> element joins the same output", () => {
  globalThis.location = { href: "https://app.test/", origin: "https://app.test" };
  const el = (src) => {
    const attrs = new Map();
    return {
      src,
      currentSrc: "",
      get crossOrigin() {
        return attrs.get("crossorigin") ?? null;
      },
      set crossOrigin(v) {
        attrs.set("crossorigin", v);
      },
      getAttribute: (n) => attrs.get(n) ?? null,
      removeAttribute: (n) => attrs.delete(n),
    };
  };
  const ctxOf = (state) => {
    const ctx = fakeCtx();
    ctx.state = state;
    ctx.createMediaElementSource = (e) => new FakeNode("source:" + e.src);
    return ctx;
  };
  beforeEach(() => m.resetOwnOutputForTests());

  test("a verso:// file is asked for with crossorigin, before its src; a file of the page's own origin is not", () => {
    for (const url of ["verso://localhost/a.mp3", "http://verso.localhost/a.mp3"]) {
      const a = el("");
      m.prepareMedia(a, url);
      assert.equal(a.crossOrigin, "anonymous", url);
    }
    const own = el("");
    m.prepareMedia(own, "https://app.test/f/a.mp3");
    assert.equal(own.crossOrigin, null);
    const web = el("");
    m.prepareMedia(web, "https://example.com/a.mp3");
    assert.equal(web.crossOrigin, null, "an external address is left as it is");
  });

  test("it is routed to the own output once, only on a running context, and only if its bytes are readable", () => {
    const a = el("verso://localhost/a.mp3");
    m.prepareMedia(a, a.src);
    assert.equal(m.routeMedia(a, ctxOf("suspended")), null, "never joined to a context that does not run");
    const ctx = ctxOf("running");
    const node = m.routeMedia(a, ctx);
    assert.ok(node);
    assert.equal(m.routeMedia(a, ctx), node, "once");
    assert.equal(m.mediaNode(a), node);
    assert.ok([...node.to].includes(m.ownOutput(ctx)), "its gain leads to the own output");
    // Without crossorigin (or an external file) it is not routed: it would play silence.
    const b = el("verso://localhost/b.mp3");
    assert.equal(m.routeMedia(b, ctx), null);
    const c = el("https://example.com/c.mp3");
    assert.equal(m.routeMedia(c, ctx), null);
    const w = el("https://app.test/f/w.mp3");
    assert.ok(m.routeMedia(w, ctx));
  });

  test("a file that fails with crossorigin is asked for again without it, once, and then plays plainly", () => {
    const a = el("verso://localhost/a.mp3");
    m.prepareMedia(a, a.src);
    assert.equal(m.retryPlain(a), true);
    assert.equal(a.crossOrigin, null);
    assert.equal(m.retryPlain(a), false, "a second failure is a failure");
    m.prepareMedia(a, "verso://localhost/other.mp3");
    assert.equal(a.crossOrigin, null, "it stays plain");
    assert.equal(m.routeMedia(a, ctxOf("running")), null);
  });
});
