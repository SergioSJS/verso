// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Whether this computer can draw the 3D dice, asked once and cheaply before
// the real renderer exists. On a Linux desktop with no graphics acceleration
// WebKitGTK can take the whole web process down inside the real WebGL setup,
// where no `try` reaches; so a tiny offscreen canvas asks first, and a
// context that is missing, that the browser calls a "major performance
// caveat", or whose renderer is a software one ends in the 2D card instead.
// Pure: the canvas comes in as an argument.

/** Why the 3D dice cannot play on this computer. */
export type GlWhy = "none" | "software";

export type GlVerdict = { ok: true } | { ok: false; why: GlWhy };

/** The renderer names of software rasterisers. */
const SOFTWARE = /llvmpipe|swiftshader|softpipe|software|basic render|microsoft basic/i;

/** The part of a WebGL context the probe reads. */
export type GlLike = {
  getExtension(name: string): unknown;
  getParameter(p: number): unknown;
  RENDERER?: number;
};

/** The verdict for a context (null when none could be made) and its renderer string. */
export function judgeGl(gl: unknown, renderer: string | null | undefined): GlVerdict {
  if (!gl) return { ok: false, why: "none" };
  if (renderer && SOFTWARE.test(renderer)) return { ok: false, why: "software" };
  return { ok: true };
}

/** Ask a canvas-like object for a context and judge it. Never throws. */
export function probeGl(make: () => { getContext(kind: string, opts?: unknown): unknown }): GlVerdict {
  try {
    const canvas = make();
    const opts = { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext("webgl2", opts) ?? canvas.getContext("webgl", opts)) as GlLike | null;
    if (!gl) return { ok: false, why: "none" };
    let renderer: string | null = null;
    try {
      const info = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
      const name = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : (gl.RENDERER ?? 0x1f01));
      renderer = typeof name === "string" ? name : null;
    } catch {
      renderer = null;
    }
    try {
      (gl.getExtension("WEBGL_lose_context") as { loseContext(): void } | null)?.loseContext();
    } catch {
      /* the probe is over either way */
    }
    return judgeGl(gl, renderer);
  } catch {
    return { ok: false, why: "none" };
  }
}

let verdict: GlVerdict | null = null;
let told = false;

/** The session's verdict: probed on the first ask, then remembered. */
export function glVerdict(make: () => { getContext(kind: string, opts?: unknown): unknown }): GlVerdict {
  verdict ??= probeGl(make);
  return verdict;
}

/** A 3D roll failed at run time: no more 3D this session. */
export function failGl(): void {
  verdict = { ok: false, why: "none" };
}

/** True the first time it is asked after the verdict went bad: the caller says why once. */
export function shouldTell(): boolean {
  if (told || !verdict || verdict.ok) return false;
  told = true;
  return true;
}

/** For tests. */
export function resetGl(): void {
  verdict = null;
  told = false;
}
