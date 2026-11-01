// Headless Chromium (Docker) draws WebGL with SwiftShader, a CPU renderer,
// and the window's own probe (src/dice3d/gl.ts, 2026-10-26) sends such a
// computer to the 2D card, as it must: the 3D stage never loads. The specs
// that wait for the stage give the renderer a GPU's name before the window
// loads, as the harness's fixtures do (e2e/fixtures.mjs); the probe's
// judgement of software names stays covered by test/dice3d.test.mjs.

/** Make the renderer's name the probe reads a GPU's, in every page of `context`. */
export async function nameAGpu(context) {
  await context.addInitScript(() => {
    for (const proto of [globalThis.WebGLRenderingContext?.prototype, globalThis.WebGL2RenderingContext?.prototype]) {
      if (!proto) continue;
      const get = proto.getParameter;
      proto.getParameter = function (p) {
        const v = get.call(this, p);
        return typeof v === "string" ? v.replace(/swiftshader|llvmpipe/gi, "Test GPU") : v;
      };
    }
  });
}
