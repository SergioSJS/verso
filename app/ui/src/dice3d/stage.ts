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
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { type Die3, forceLabels, baseValues, labelText } from "./force";
import { solid, type Shape, type Vec } from "./polyhedra";
import { type Arena, simulate } from "./sim";
import { playhead, timeline } from "./timeline";

/** What the stage reports to the caller. */
export type Stage = {
  /** Ends when the animation is over, for whatever reason; never rejects. */
  done: Promise<void>;
  /** Ends it now. */
  skip: () => void;
};

const FOV = 40;
const CELL = 128;

type Palette = { body: string; ink: string; edge: string };

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

/** The colours of the three roles, from the theme at roll time. */
function palettes(): Record<Die3["role"], Palette> {
  const edge = token("--ink", "#222");
  return {
    kept: { body: token("--seal", "#8c2f2a"), ink: token("--seal-ink", "#fff"), edge },
    negative: { body: token("--ink", "#222"), ink: token("--paper", "#fff"), edge },
    dropped: { body: token("--paper-3", "#bbb"), ink: token("--ink-3", "#555"), edge },
  };
}

type Cell = { u: number[]; v: number[]; points: [number, number][] };

/** The atlas cells of a solid: for each face, its polygon in the cell's
 *  own plane (upright toward the face's first vertex), and the UVs. */
function cellsOf(shape: Shape, cols: number, rows: number): Cell[] {
  const s = solid(shape);
  return s.faces.map((face, f) => {
    const pts = face.map((i) => s.verts[i] as Vec);
    const n = s.normals[f] as Vec;
    const c: Vec = [0, 1, 2].map((k) => pts.reduce((a, p) => a + (p[k] as number), 0) / pts.length) as Vec;
    const first: Vec = [(pts[0] as Vec)[0] - c[0], (pts[0] as Vec)[1] - c[1], (pts[0] as Vec)[2] - c[2]];
    const dn = first[0] * n[0] + first[1] * n[1] + first[2] * n[2];
    const e1raw: Vec = [first[0] - n[0] * dn, first[1] - n[1] * dn, first[2] - n[2] * dn];
    const l = Math.hypot(...e1raw);
    const e1: Vec = [e1raw[0] / l, e1raw[1] / l, e1raw[2] / l];
    // e2 = n x e1: up in the cell, so the text reads right from outside.
    const e2: Vec = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const flat = pts.map((p) => {
      const d: Vec = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      return [d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2], d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2]] as [number, number];
    });
    const reach = Math.max(...flat.map((p) => Math.hypot(p[0], p[1])));
    const col = f % cols;
    const row = Math.floor(f / cols);
    // Cell coordinates in 0..1, up positive, with a margin against bleed.
    const cell = flat.map(([x, y]) => [0.5 + (0.9 * x) / (2 * reach), 0.5 + (0.9 * y) / (2 * reach)] as [number, number]);
    const u = cell.map(([a]) => (col * CELL + a * CELL) / (cols * CELL));
    const v = cell.map(([, b]) => 1 - (row * CELL + (1 - b) * CELL) / (rows * CELL));
    return { u, v, points: cell };
  });
}

/** The distance from a polygon's middle to its nearest edge. */
function inradius(points: [number, number][]): number {
  let least = Infinity;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length] as [number, number];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const d = Math.abs(dx * (p[1] - 0.5) - dy * (p[0] - 0.5)) / Math.hypot(dx, dy);
    least = Math.min(least, d);
  });
  return least;
}

/** The die's atlas: every face's number in its own cell. */
function atlas(die: Die3, values: readonly number[], pal: Palette, cells: Cell[], cols: number, rows: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = pal.body;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
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
    const r = inradius(cell.points) * CELL;
    if (d4) {
      // The numbers sit at the corners, each the number of its vertex.
      const face = solid(die.shape).faces[f] as number[];
      cell.points.forEach(([a, b], i) => {
        const text = labelText(die.set, die.sides, values[face[i] as number] as number);
        ctx.font = `700 ${Math.round(r * 0.8)}px sans-serif`;
        ctx.fillText(text, px(0.5 + (a - 0.5) * 0.62), py(0.5 + (b - 0.5) * 0.62));
      });
      return;
    }
    const text = labelText(die.set, die.sides, values[f] as number);
    const size = r * (text.length > 2 ? 0.85 : text.length > 1 ? 1.1 : 1.45);
    ctx.font = `700 ${Math.round(size)}px sans-serif`;
    ctx.fillText(text, px(0.5), py(0.5) + size * 0.04);
  });
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

/** Throw `dice` and play the fall over the window. Null when it cannot (no
 *  WebGL): the caller shows the 2D card at once. */
export function throwDice(dice: readonly Die3[]): Stage | null {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 2 || h < 2) return null;
  const aspect = w / h;
  // Camera high above the table looking straight down; high enough that
  // the dice and a table of their number fit the screen's shape.
  const halfSee = Math.tan((FOV / 2) * (Math.PI / 180));
  const height = Math.max(11 + 2.2 * Math.sqrt(dice.length), 4 / (halfSee * aspect * 0.85));
  const arena: Arena = { halfX: height * halfSee * aspect * 0.85, halfZ: height * halfSee * 0.85 };

  const canvas = document.createElement("canvas");
  canvas.className = "dice3d-canvas";
  canvas.setAttribute("aria-hidden", "true");
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
  const pals = palettes();
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
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);

  const owned: { dispose: () => void }[] = [];
  const meshes = dice.map((die, i) => {
    const s = solid(die.shape);
    const cols = Math.ceil(Math.sqrt(s.faces.length));
    const rows = Math.ceil(s.faces.length / cols);
    const cells = cellsOf(die.shape, cols, rows);
    // The landed face is made to show the value the roll holds.
    const values = forceLabels(baseValues(die.shape, die.set, die.sides), fall.landed[i] as number, die.value);
    const texture = new CanvasTexture(atlas(die, values, pals[die.role], cells, cols, rows));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new MeshStandardMaterial({ map: texture, roughness: 0.42, metalness: 0.05 });
    const geometry = geometryOf(die.shape, cells);
    owned.push(texture, material, geometry);
    const mesh = new Mesh(geometry, material);
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

  const started = performance.now();
  const frame = () => {
    if (ended) return;
    const head = playhead(tl, performance.now() - started, skipped);
    place(head.at);
    renderer.render(scene, camera);
    if (head.done) end();
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { done, skip };
}
