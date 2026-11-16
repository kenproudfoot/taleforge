import * as CANNON from 'cannon-es';
import { dieShape, readTop } from './geometry';
import type { DieType } from './geometry';

export interface ThrowParams {
  /** 0.4 (gentle) to 1.6 (hard). From the speed of the mouse drag. */
  strength: number;
  /** Throw direction on the table plane in radians (0 = away from the player). */
  direction: number;
  /** Where the hand is when it lets go (x, z on the tray). Default: the near edge, centred. */
  origin?: [number, number];
}

/** The point the hand can reach: inside the tray, clear of the walls. */
export function clampToTray(x: number, z: number): [number, number] {
  return [Math.max(-TRAY_HALF_WIDTH + 1.2, Math.min(TRAY_HALF_WIDTH - 1.2, x)), Math.max(-TRAY_HALF_DEPTH + 1.2, Math.min(TRAY_HALF_DEPTH - 1, z))];
}

export interface BodyFrame {
  p: [number, number, number];
  q: [number, number, number, number];
}

export interface Simulation {
  /** frames[step][die] at 60 steps per second. */
  frames: BodyFrame[][];
  /** For each die, the face (or d4 vertex) that ends on top. */
  top: number[];
  /** Steps at which a die hit something, with a 0..1 loudness, for sound. */
  impacts: Array<{ step: number; loudness: number }>;
  settled: boolean;
}

const TRAY_HALF_WIDTH = 5.2;
const TRAY_HALF_DEPTH = 3.4;
export const TRAY = { halfWidth: TRAY_HALF_WIDTH, halfDepth: TRAY_HALF_DEPTH };
/** Where the dice wait in the hand before a throw. */
export const HAND = { x: 0, y: 1.6, z: TRAY_HALF_DEPTH - 1.4 };
const STEP = 1 / 60;
const MAX_STEPS = 60 * 7;
const FLAT_ENOUGH = 0.985;

function body(type: DieType, material: CANNON.Material): CANNON.Body {
  const shape = dieShape(type);
  const convex = new CANNON.ConvexPolyhedron({
    vertices: shape.vertices.map((v) => new CANNON.Vec3(v[0], v[1], v[2])),
    faces: shape.faces.map((f) => f.vertices),
  });
  const b = new CANNON.Body({ mass: 1, shape: convex, material, angularDamping: 0.12, linearDamping: 0.08 });
  b.allowSleep = true;
  b.sleepSpeedLimit = 0.12;
  b.sleepTimeLimit = 0.35;
  return b;
}

function wall(world: CANNON.World, material: CANNON.Material, position: [number, number, number], axis: [number, number, number], angle: number): void {
  const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material });
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(...axis), angle);
  b.position.set(...position);
  world.addBody(b);
}

/**
 * Simulates a throw to rest and records every frame. `random` supplies numbers in [0, 1) and is the only
 * source of variation, so a throw can be reproduced. The simulation only decides how the dice move:
 * the value shown on the top face is chosen separately by a fair RNG (see labelsFor).
 */
export function simulateThrow(types: DieType[], params: ThrowParams, random: () => number): Simulation {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
  world.allowSleep = true;
  const diceMaterial = new CANNON.Material('dice');
  const trayMaterial = new CANNON.Material('tray');
  world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, trayMaterial, { friction: 0.32, restitution: 0.42 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, { friction: 0.2, restitution: 0.4 }));

  wall(world, trayMaterial, [0, 0, 0], [1, 0, 0], -Math.PI / 2); // floor
  wall(world, trayMaterial, [0, 0, -TRAY.halfDepth], [0, 1, 0], 0); // far
  wall(world, trayMaterial, [0, 0, TRAY.halfDepth], [0, 1, 0], Math.PI); // near
  wall(world, trayMaterial, [-TRAY.halfWidth, 0, 0], [0, 1, 0], Math.PI / 2); // left
  wall(world, trayMaterial, [TRAY.halfWidth, 0, 0], [0, 1, 0], -Math.PI / 2); // right

  const impacts: Simulation['impacts'] = [];
  let step = 0;
  const strength = Math.max(0.4, Math.min(1.6, params.strength));
  const [ox, oz] = clampToTray(...(params.origin ?? [HAND.x, HAND.z]));
  const bodies = types.map((type, i) => {
    const b = body(type, diceMaterial);
    const spread = (i - (types.length - 1) / 2) * 1.5;
    const [x, z] = clampToTray(ox + spread + (random() - 0.5) * 0.4, oz + (random() - 0.5) * 0.4);
    b.position.set(x, 2.2 + random() * 0.8, z);
    // A uniformly random starting orientation.
    const u1 = random();
    const u2 = random() * Math.PI * 2;
    const u3 = random() * Math.PI * 2;
    b.quaternion.set(Math.sqrt(1 - u1) * Math.sin(u2), Math.sqrt(1 - u1) * Math.cos(u2), Math.sqrt(u1) * Math.sin(u3), Math.sqrt(u1) * Math.cos(u3));
    const angle = params.direction + (random() - 0.5) * 0.5;
    const speed = (7 + random() * 2.5) * strength;
    b.velocity.set(Math.sin(angle) * speed, 2.5 + random() * 2.5, -Math.cos(angle) * speed);
    const spin = (14 + random() * 14) * strength;
    b.angularVelocity.set((random() - 0.5) * spin, (random() - 0.5) * spin, (random() - 0.5) * spin);
    b.addEventListener('collide', (event: { contact: CANNON.ContactEquation }) => {
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact > 1.2) impacts.push({ step, loudness: Math.min(1, impact / 14) });
    });
    world.addBody(b);
    return b;
  });

  const frames: BodyFrame[][] = [];
  const snapshot = () =>
    frames.push(bodies.map((b) => ({ p: [b.position.x, b.position.y, b.position.z], q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w] })));
  snapshot();
  let settled = false;
  let calm = 0;
  for (step = 1; step <= MAX_STEPS; step++) {
    world.step(STEP);
    snapshot();
    // At rest when every die is asleep, or has been nearly motionless for a third of a second
    // (many-sided dice can jitter just above the solver's own sleep threshold).
    const still = bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING || (b.velocity.length() < 0.35 && b.angularVelocity.length() < 0.6));
    calm = still ? calm + 1 : 0;
    if (step > 30 && calm >= 20) {
      settled = true;
      break;
    }
  }
  const last = frames[frames.length - 1]!;
  const readings = types.map((type, i) => readTop(dieShape(type), last[i]!.q));
  return { frames, top: readings.map((r) => r.index), impacts, settled: settled && readings.every((r) => r.alignment >= FLAT_ENOUGH) };
}

/** Runs the simulation until every die comes to rest flat (a die leaning on a wall is thrown again). */
export function simulateUntilFlat(types: DieType[], params: ThrowParams, random: () => number, attempts = 8): Simulation {
  let sim = simulateThrow(types, params, random);
  for (let i = 1; i < attempts && !sim.settled; i++) sim = simulateThrow(types, params, random);
  return sim;
}
