// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The fall, simulated headless (ADR 0101 item 4): cannon-es steps the dice
// until they all sleep, every step is recorded, and the face that landed is
// read from the resting orientation. Nothing here draws a number — the
// result was decided before — and nothing here touches WebGL, so it runs in
// node. The recording is what the renderer replays.

import { Body, ConvexPolyhedron, ContactMaterial, Material, Plane, Vec3, World } from "cannon-es";
import { type Quat, readUp, type Shape, solid } from "./polyhedra";
import { STEP } from "./timeline";

/** The table: half its width and depth, in world units. */
export type Arena = { halfX: number; halfZ: number };

export type Fall = {
  /** Steps recorded. */
  frames: number;
  /** Per die, `frames` poses of 7 numbers: x, y, z and the quaternion
   *  x, y, z, w. */
  poses: Float32Array[];
  /** The item (face; vertex for a d4) each die rests on, upward. */
  landed: number[];
  /** Whether every die was asleep when the recording stopped. */
  rested: boolean;
  /** The frame each die enters the table: 0 for the dice thrown first, later
   *  for the extra dice of an exploding die, thrown once the wave before
   *  them has settled. */
  born: number[];
  /** The collisions, in order, for the sound: the step, what the die hit,
   *  which die was hit, and the speed of the hit (Rolai's rule: a die on the table
   *  counts its own speed, a die on a die the other's). One a step at most
   *  of each kind, as Rolai throttles them. */
  hits: Hit[];
};

export type Hit = { frame: number; kind: "table" | "dice"; die: number; speed: number };

/** Steps after a wave has settled before the next is thrown. */
export const WAVE_GAP_STEPS = 6;
/** The latest step a wave is thrown at, however the one before is doing, so
 *  that it still has time to fall inside STEPS_MOST. */
export const WAVE_LATEST_STEP = 180;

/** About four seconds of physics at most: at the replay speed, the
 *  fall's hard maximum (MAX_ANIMATION_MS). */
export const STEPS_MOST = 240;

/** A random source in [0, 1). */
export type Rng = () => number;

/** The platform's cryptographic generator as `[0, 1)` numbers. The throw's
 *  look is not the result's source — the result is already drawn — but the
 *  same generator costs nothing and keeps one rule. */
export function cryptoRng(): Rng {
  return () => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return (a[0] as number) / 2 ** 32;
  };
}

function bodyFor(shape: Shape, material: Material): Body {
  const s = solid(shape);
  const shapeBody = new ConvexPolyhedron({
    vertices: s.verts.map((v) => new Vec3(v[0], v[1], v[2])),
    faces: s.faces.map((f) => [...f]),
  });
  return new Body({ mass: 1, material, shape: shapeBody, allowSleep: true, sleepSpeedLimit: 1, sleepTimeLimit: 0.25, linearDamping: 0.12, angularDamping: 0.12 });
}

/** Throw `shapes` onto a table of `arena` and record the fall. */
export function simulate(shapes: readonly Shape[], arena: Arena, rng: Rng = cryptoRng(), waves: readonly number[] = []): Fall {
  const waveOf = (i: number): number => waves[i] ?? 0;
  const world = new World({ gravity: new Vec3(0, -70, 0) });
  world.allowSleep = true;
  const table = new Material("table");
  const dieMaterial = new Material("die");
  world.addContactMaterial(new ContactMaterial(table, dieMaterial, { friction: 0.35, restitution: 0.35 }));
  world.addContactMaterial(new ContactMaterial(dieMaterial, dieMaterial, { friction: 0.2, restitution: 0.3 }));
  // The floor, four walls and a ceiling keep the dice on the screen.
  const planes: [Vec3, number, Vec3][] = [
    [new Vec3(1, 0, 0), -Math.PI / 2, new Vec3(0, 0, 0)],
    [new Vec3(1, 0, 0), Math.PI / 2, new Vec3(0, 14, 0)],
    [new Vec3(0, 1, 0), Math.PI / 2, new Vec3(-arena.halfX, 0, 0)],
    [new Vec3(0, 1, 0), -Math.PI / 2, new Vec3(arena.halfX, 0, 0)],
    [new Vec3(0, 1, 0), 0, new Vec3(0, 0, -arena.halfZ)],
    [new Vec3(0, 1, 0), Math.PI, new Vec3(0, 0, arena.halfZ)],
  ];
  for (const [axis, angle, at] of planes) {
    const wall = new Body({ mass: 0, material: table, shape: new Plane() });
    wall.quaternion.setFromAxisAngle(axis, angle);
    wall.position.copy(at);
    world.addBody(wall);
  }
  const bodies = shapes.map((shape, i) => {
    const b = bodyFor(shape, dieMaterial);
    // Round the table's edge, aimed at its middle, each at its own height.
    const angle = ((i + rng() * 0.6) / shapes.length) * Math.PI * 2;
    b.position.set(Math.cos(angle) * arena.halfX * 0.7, 2.6 + (i % 4) * 1.5, Math.sin(angle) * arena.halfZ * 0.7);
    const speed = 16 + rng() * 14;
    b.velocity.set(-Math.cos(angle) * speed, 2 + rng() * 6, -Math.sin(angle) * speed);
    b.angularVelocity.set((rng() - 0.5) * 40, (rng() - 0.5) * 40, (rng() - 0.5) * 40);
    b.quaternion.setFromEuler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
    if (waveOf(i) === 0) world.addBody(b);
    return b;
  });
  const born = bodies.map(() => 0);
  const hits: Hit[] = [];
  let hitFrame = -1;
  let hitKind = "";
  bodies.forEach((b, i) => {
    b.addEventListener("collide", (e: { body: Body; target: Body }) => {
      const other = e.body;
      const kind = other.mass > 0 ? "dice" : "table";
      // Rolai: in one step, one sound; a die hit does not give way to a table hit.
      if (hitFrame === frames && !(kind === "dice" && hitKind === "table")) return;
      const speed = (kind === "dice" ? other : e.target).velocity.length();
      hitFrame = frames;
      hitKind = kind;
      hits.push({ frame: frames, kind, die: i, speed });
    });
  });
  const last = Math.max(0, ...bodies.map((_, i) => waveOf(i)));
  // The wave to throw next, and the step the one before it came to rest.
  let next = 1;
  let calmAt = -1;
  const poses = bodies.map(() => new Float32Array(STEPS_MOST * 7));
  let frames = 0;
  let rested = false;
  while (frames < STEPS_MOST) {
    if (next <= last) {
      const before = bodies.filter((_, i) => waveOf(i) === next - 1);
      if (calmAt < 0 && before.every((b) => b.sleepState === Body.SLEEPING)) calmAt = frames;
      if ((calmAt >= 0 && frames >= calmAt + WAVE_GAP_STEPS) || frames >= WAVE_LATEST_STEP) {
        bodies.forEach((b, i) => {
          if (waveOf(i) === next) {
            world.addBody(b);
            born[i] = frames;
          }
        });
        next++;
        calmAt = -1;
      }
    }
    world.step(STEP);
    bodies.forEach((b, i) => {
      const p = poses[i] as Float32Array;
      p.set([b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], frames * 7);
    });
    frames++;
    if (next > last && bodies.every((b) => b.sleepState === Body.SLEEPING)) {
      rested = true;
      break;
    }
  }
  const landed = bodies.map((b, i) => readUp(shapes[i] as Shape, [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w] as Quat));
  return { frames, poses: poses.map((p) => p.slice(0, frames * 7)), landed, rested, born, hits };
}

/** Quaternion helper for callers that read the last pose of a die. */
export function lastQuat(fall: Fall, die: number): Quat {
  const p = fall.poses[die] as Float32Array;
  const o = (fall.frames - 1) * 7 + 3;
  return [p[o] as number, p[o + 1] as number, p[o + 2] as number, p[o + 3] as number];
}
