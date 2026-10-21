// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The 3D stage (ADR 0101): the lazy chunk. It throws the dice headless,
// then replays the recorded fall in three.js on a transparent canvas laid
// over the window, and takes the canvas away when the dice have rested, when
// the person clicks or presses Esc, at the maximum time, or if the graphics
// context is lost. It never decides a number: each die is made to show the
// value the roll already holds (force.ts). Nothing is left running when it
// ends: no canvas, no animation frame, no GPU resource.

import {
  AmbientLight,
  CanvasTexture,
  DirectionalLight,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
  ShadowMaterial,
  SRGBColorSpace,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mix, parseColor, toHex, type RGB } from "../theme/color";
import { paintTexture } from "./textures";
import { type Die3, forceLabels, baseValues, labelText } from "./force";
import { CELL, type Cell, cellsOf, centred, fitSize, inkOf, inradius, type Measure } from "./labels";
import { solid, type Shape, type Vec } from "./polyhedra";
import { type Arena, simulate } from "./sim";
import { type DiceStyles, type DiceStyle, edgeFor, FINISHES, materialOf, NUMBER_FONT, diePixels, throwRegion, type SlotId, type TextureId } from "./look";
import { playhead, timeline } from "./timeline";

/** What the stage reports to the caller. */
export type Stage = {
  /** Ends when the animation is over, for whatever reason; never rejects. */
  done: Promise<void>;
  /** Ends it now. */
  skip: () => void;
};

// A narrow field of view: the camera stands far above the table, so a die
// that bounces up does not swell on the screen.
const FOV = 20;
/** The widest the table is, each side of its middle, in world units. */
const TABLE_HALF_MOST = 16;
/** A die's width across, in world units, on average. */
const DIE_UNITS = 2.3;
/** How far inside the face, as a share of its inscribed radius, a number stays. */
const LABEL_INSET = 0.22;
/** The most a number may span, as a share of the inscribed radius. */
const LABEL_CAP = 1.3;
/** The dot of a 6 or a 9: its gap below the digits and its radius, per pixel of size. */
const DOT_GAP = 0.1;
const DOT_RADIUS = 0.055;

type Palette = { body: string; ink: string; edge: string; outline: string };

/** A CSS token as a colour the canvas understands: a probe element takes
 *  the token through `color`, so `light-dark()` and the theme resolve. */
function token(name: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${name}, ${fallback})`;
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c || fallback;
}

const rgb = (c: string, fallback: RGB): RGB => parseColor(c) ?? fallback;
const GREY: RGB = { r: 0.55, g: 0.55, b: 0.55 };

/** The colours of the three roles of one slot's style. With `app` they
 *  come from the theme at roll time; otherwise from the style: a negative
 *  die swaps the body and number colours, a dropped one is washed out. */
function palettes(style: DiceStyle): Record<Die3["role"], Palette> {
  if (style.app) {
    const edge = token("--ink", "#222");
    const mk = (body: string, ink: string): Palette => ({ body, ink, edge, outline: edgeFor(body) });
    return {
      kept: mk(token("--seal", "#8c2f2a"), token("--seal-ink", "#fff")),
      negative: mk(token("--ink", "#222"), token("--paper", "#fff")),
      dropped: mk(token("--paper-3", "#bbb"), token("--ink-3", "#555")),
    };
  }
  const body = rgb(style.body, GREY);
  const ink = rgb(style.number, { r: 0, g: 0, b: 0 });
  const edge = edgeFor(style.body);
  return {
    kept: { body: style.body, ink: style.number, edge, outline: style.outline },
    negative: { body: style.number, ink: style.body, edge, outline: style.outline },
    dropped: { body: toHex(mix(body, GREY, 0.6)), ink: toHex(mix(ink, GREY, 0.5)), edge, outline: toHex(mix(rgb(style.outline, GREY), GREY, 0.5)) },
  };
}

/** The die's atlas: every face's number in its own cell, centred by its
 *  ink and sized to fit inside the face (labels.ts). */
function atlas(die: Die3, values: readonly number[], pal: Palette, cells: Cell[], cols: number, rows: number, base: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(base, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const measure: Measure = (t) => {
    ctx.font = `700 100px ${NUMBER_FONT}`;
    return ctx.measureText(t);
  };
  const d4 = die.shape === "d4";
  cells.forEach((cell, f) => {
    const x0 = (f % cols) * CELL;
    const y0 = Math.floor(f / cols) * CELL;
    const px = (a: number) => x0 + a * CELL;
    const py = (b: number) => y0 + (1 - b) * CELL;
    // The face's outline, so the edges read.
    ctx.beginPath();
    cell.points.forEach(([a, b], i) => (i === 0 ? ctx.moveTo(px(a), py(b)) : ctx.lineTo(px(a), py(b))));
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = pal.edge;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.ink;
    ctx.strokeStyle = pal.outline;
    const r = inradius(cell.points) * CELL;
    // A number of `size` px centred by its ink on (cx, cy), turned by `turn`;
    // the dot of a 6 or a 9 goes below the digits without moving them.
    const draw = (full: string, cx: number, cy: number, size: number, turn: number) => {
      const marked = full.endsWith(".");
      const text = marked ? full.slice(0, -1) : full;
      const ink = inkOf(measure, text);
      const at = centred(ink, size, 0, 0);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(turn);
      ctx.font = `700 ${size}px ${NUMBER_FONT}`;
      ctx.lineWidth = Math.max(1.5, size * 0.1);
      ctx.strokeText(text, at.x, at.y);
      ctx.fillText(text, at.x, at.y);
      if (marked) {
        ctx.beginPath();
        ctx.arc(0, ((ink.a + ink.d) / 2) * size + size * DOT_GAP, size * DOT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    };
    /** The font size at which `full` fits the face, around the cell's middle. */
    const fit = (full: string) => {
      const marked = full.endsWith(".");
      const ink = inkOf(measure, marked ? full.slice(0, -1) : full);
      const h = ink.a + ink.d + (marked ? 2 * (DOT_GAP + DOT_RADIUS) : 0);
      return fitSize(cell.points, ink.l + ink.r, h, CELL, r * LABEL_INSET, r * LABEL_CAP);
    };
    if (d4) {
      // The numbers sit at the corners, each the number of its vertex and
      // standing toward it.
      const face = solid(die.shape).faces[f] as number[];
      cell.points.forEach(([a, b], i) => {
        const text = labelText(die.set, die.sides, values[face[i] as number] as number);
        const size = Math.round(r * 0.8);
        draw(text, px(0.5 + (a - 0.5) * 0.6), py(0.5 + (b - 0.5) * 0.6), size, Math.atan2(a - 0.5, b - 0.5));
      });
      return;
    }
    const text = labelText(die.set, die.sides, values[f] as number);
    draw(text, px(0.5), py(0.5), fit(text), 0);
  });
  return canvas;
}

/** A slot's body for an atlas of `w` x `h`: the body colour with the
 *  texture painted over it. Drawn once for each kind of die in a roll. */
function bodyOf(pal: Palette, texture: DiceStyle["texture"], w: number, h: number, image?: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = pal.body;
    ctx.fillRect(0, 0, w, h);
    paintTexture(ctx, w, h, texture, 7, image);
  }
  return canvas;
}

/** The die's geometry: flat-shaded faces fanned from their first vertex,
 *  each with the UVs of its cell. */
function geometryOf(shape: Shape, cells: Cell[]): BufferGeometry {
  const s = solid(shape);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  s.faces.forEach((face, f) => {
    const n = s.normals[f] as Vec;
    const cell = cells[f] as Cell;
    for (let k = 1; k < face.length - 1; k++) {
      for (const j of [0, k, k + 1]) {
        const p = s.verts[face[j] as number] as Vec;
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
        uv.push(cell.u[j] as number, cell.v[j] as number);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return g;
}

/** Throw `dice` and play the fall over the lower part of `area` (the
 *  active pane, or the window), drawn in `styles` — whoever's they are —
 *  at the viewer's `size` (percent). Null when it cannot
 *  (no WebGL): the caller shows the 2D card at once. */
export function throwDice(dice: readonly Die3[], styles: DiceStyles, size: number, images: ReadonlyMap<TextureId, HTMLImageElement>, area: { left: number; top: number; width: number; height: number } = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }): Stage | null {
  if (area.width < 2 || area.height < 2) return null;
  const region = throwRegion(area, dice.length);
  const aspect = region.width / region.height;
  // The camera stands so that a die is `diePixels` wide on screen: the
  // table's depth in world units follows from the strip's height.
  const halfSee = Math.tan((FOV / 2) * (Math.PI / 180));
  const px = diePixels(size, window.innerWidth, window.innerHeight);
  const unitPx = px / DIE_UNITS;
  const height = region.height / (2 * halfSee * unitPx);
  const arena: Arena = { halfX: Math.min(TABLE_HALF_MOST, height * halfSee * aspect * 0.94), halfZ: height * halfSee * 0.9 };
  const slotOf = (d: Die3): SlotId => String(d.slot ?? 1) as SlotId;
  const styleFor = (d: Die3): DiceStyle => styles[slotOf(d)] ?? styles["1"];
  const finishes = dice.map((d) => FINISHES[materialOf(styleFor(d))]);

  const canvas = document.createElement("canvas");
  canvas.className = "dice3d-canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { left: `${region.left}px`, top: `${region.top}px`, width: `${region.width}px`, height: `${region.height}px` });
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  const gl = renderer.getContext();
  if (!gl || gl.isContextLost()) {
    renderer.dispose();
    return null;
  }

  const fall = simulate(
    dice.map((d) => d.shape),
    arena,
  );
  const pals = new Map<SlotId, Record<Die3["role"], Palette>>();
  for (const d of dice) if (!pals.has(slotOf(d))) pals.set(slotOf(d), palettes(styleFor(d)));
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, aspect, 0.1, 200);
  camera.position.set(0, height, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  scene.add(new AmbientLight(0xffffff, 1.35));
  const sun = new DirectionalLight(0xffffff, 2.4);
  sun.position.set(arena.halfX * 0.5, height * 0.9, arena.halfZ * 0.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const reach = Math.max(arena.halfX, arena.halfZ) * 1.3;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: height * 3 });
  scene.add(sun);
  const floor = new Mesh(new PlaneGeometry(arena.halfX * 4, arena.halfZ * 4), new ShadowMaterial({ opacity: 0.28 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(region.width, region.height, false);
  renderer.setClearColor(0x000000, 0);

  const owned: { dispose: () => void }[] = [];
  const bodies = new Map<string, HTMLCanvasElement>();
  // Shiny and metal surfaces need something to reflect: a small studio.
  let env: WebGLRenderTarget | null = null;
  // A CPU renderer (SwiftShader, llvmpipe) takes seconds over the studio
  // and would freeze the window: there the dice have no reflections.
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const software = info ? /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) : false;
  if (!software && finishes.some((f) => f.env > 0)) {
    // A graphics stack that cannot render it (no float targets) shows the
    // material without reflections instead of no dice at all.
    try {
      const pmrem = new PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      env = pmrem.fromScene(room, 0.04);
      room.dispose();
      pmrem.dispose();
      owned.push(env);
    } catch {
      env = null;
    }
  }
  const meshes = dice.map((die, i) => {
    const s = solid(die.shape);
    const cols = Math.ceil(Math.sqrt(s.faces.length));
    const rows = Math.ceil(s.faces.length / cols);
    const cells = cellsOf(die.shape, cols, rows);
    // The landed face is made to show the value the roll holds.
    const values = forceLabels(baseValues(die.shape, die.set, die.sides), fall.landed[i] as number, die.value);
    const slot = slotOf(die);
    const pal = (pals.get(slot) as Record<Die3["role"], Palette>)[die.role];
    const key = `${slot}|${die.role}|${cols}x${rows}`;
    let base = bodies.get(key);
    if (!base) {
      base = bodyOf(pal, styleFor(die).texture, cols * CELL, rows * CELL, images.get(styleFor(die).texture));
      bodies.set(key, base);
    }
    const material = finishes[i] as (typeof finishes)[number];
    const texture = new CanvasTexture(atlas(die, values, pal, cells, cols, rows, base));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const surfaceMaterial = new MeshPhysicalMaterial({
      map: texture,
      roughness: material.roughness,
      // Without reflections a metal die would be black: it keeps some of the look.
      metalness: env ? material.metalness : material.metalness * 0.35,
      clearcoat: material.clearcoat,
      clearcoatRoughness: 0.12,
      transparent: material.opacity < 1,
      opacity: material.opacity,
      envMap: env ? env.texture : null,
      envMapIntensity: material.env,
    });
    const geometry = geometryOf(die.shape, cells);
    owned.push(texture, surfaceMaterial, geometry);
    const mesh = new Mesh(geometry, surfaceMaterial);
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  });
  owned.push(floor.geometry, floor.material as ShadowMaterial);

  const q = new Quaternion();
  const place = (at: number) => {
    const a = Math.floor(at);
    const b = Math.min(a + 1, fall.frames - 1);
    const t = at - a;
    meshes.forEach((mesh, i) => {
      const p = fall.poses[i] as Float32Array;
      const lerp = (k: number) => (p[a * 7 + k] as number) * (1 - t) + (p[b * 7 + k] as number) * t;
      mesh.position.set(lerp(0), lerp(1), lerp(2));
      const qa = new Quaternion(p[a * 7 + 3], p[a * 7 + 4], p[a * 7 + 5], p[a * 7 + 6]);
      const qb = new Quaternion(p[b * 7 + 3], p[b * 7 + 4], p[b * 7 + 5], p[b * 7 + 6]);
      mesh.quaternion.copy(q.copy(qa).slerp(qb, t));
    });
  };
  place(0);

  const tl = timeline(fall.frames);
  let skipped = false;
  let raf = 0;
  let ended = false;
  let resolve: () => void = () => undefined;
  const done = new Promise<void>((r) => (resolve = r));
  const end = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", skip);
    canvas.removeEventListener("webglcontextlost", lost);
    document.removeEventListener("keydown", key, true);
    window.removeEventListener("resize", skip);
    for (const o of owned) o.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    resolve();
  };
  function skip(): void {
    skipped = true;
    end();
  }
  function lost(e: Event): void {
    e.preventDefault();
    end();
  }
  function key(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    skip();
  }
  canvas.addEventListener("pointerdown", skip);
  canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("keydown", key, true);
  window.addEventListener("resize", skip);
  document.body.append(canvas);

  // For a test to read: what the dice came out as on the screen, once they
  // have rested (the width of each die's outline in pixels) and the style.
  const first = dice[0] as Die3;
  canvas.dataset["material"] = materialOf(styleFor(first));
  canvas.dataset["texture"] = styleFor(first).texture;
  canvas.dataset["slots"] = JSON.stringify(dice.map((d) => [slotOf(d), (pals.get(slotOf(d)) as Record<Die3["role"], Palette>)[d.role].body, materialOf(styleFor(d)), styleFor(d).texture]));
  canvas.dataset["body"] = (pals.get(slotOf(first)) as Record<Die3["role"], Palette>)[first.role].body;
  let measured = false;
  const measure = () => {
    measured = true;
    camera.updateMatrixWorld();
    const widths = meshes.map((mesh) => {
      mesh.updateMatrixWorld();
      const pos = mesh.geometry.getAttribute("position");
      const v = new Vector3();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(camera);
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y);
        y1 = Math.max(y1, v.y);
      }
      return Math.round(Math.max(((x1 - x0) / 2) * region.width, ((y1 - y0) / 2) * region.height));
    });
    canvas.dataset["dieWidths"] = JSON.stringify(widths);
  };

  // The first render compiles the shaders, which a slow graphics stack (a
  // software one) takes a while over: it is made before the clock starts,
  // or the maximum time could be spent before the dice were seen.
  renderer.render(scene, camera);
  const started = performance.now();
  const frame = () => {
    if (ended) return;
    const head = playhead(tl, performance.now() - started, skipped);
    place(head.at);
    renderer.render(scene, camera);
    if (!measured && head.at >= fall.frames - 1) measure();
    if (head.done) end();
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { done, skip };
}
