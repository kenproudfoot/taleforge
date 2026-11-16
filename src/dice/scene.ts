import * as THREE from 'three';
import { dieShape, labelsFor } from './geometry';
import type { DieShape, Vec3 } from './geometry';
import { faceText } from './plan';
import type { PlannedDie } from './plan';
import { HAND, TRAY, clampToTray } from './sim';
import type { Simulation } from './sim';

export interface DiceColors {
  body: string;
  ink: string;
  felt: string;
  rim: string;
}

const textures = new Map<string, THREE.CanvasTexture>();

function labelTexture(text: string, ink: string): THREE.CanvasTexture {
  const key = `${text}|${ink}`;
  const hit = textures.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${text.length > 2 ? 58 : text.length > 1 ? 72 : 88}px Inter, system-ui, sans-serif`;
  ctx.fillText(text, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textures.set(key, texture);
  return texture;
}

function bodyGeometry(shape: DieShape): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const face of shape.faces) {
    const [first, ...rest] = face.vertices;
    for (let i = 0; i < rest.length - 1; i++) {
      for (const index of [first!, rest[i]!, rest[i + 1]!]) {
        positions.push(...shape.vertices[index]!);
        normals.push(...face.normal);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

const v3 = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);

function labelPlane(text: string, ink: string, position: THREE.Vector3, normal: THREE.Vector3, up: THREE.Vector3, size: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ map: labelTexture(text, ink), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  const y = up.clone().sub(normal.clone().multiplyScalar(up.dot(normal))).normalize();
  const x = new THREE.Vector3().crossVectors(y, normal).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, normal));
  mesh.position.copy(position).add(normal.clone().multiplyScalar(0.012));
  return mesh;
}

/** Builds one die: a flat-shaded body plus a number on every face (three per face on a d4). */
function buildDie(die: PlannedDie, labels: number[], colors: DiceColors): THREE.Group {
  const shape = dieShape(die.type);
  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry(shape), new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.38, metalness: 0.18, flatShading: true }));
  body.castShadow = true;
  group.add(body);
  shape.faces.forEach((face, faceIndex) => {
    const centroid = v3(face.centroid);
    const normal = v3(face.normal);
    const corners = face.vertices.map((i) => v3(shape.vertices[i]!));
    if (die.type === 4) {
      for (const [i, corner] of corners.entries()) {
        const toward = corner.clone().sub(centroid);
        group.add(labelPlane(faceText(die, labels[face.vertices[i]!]!), colors.ink, centroid.clone().add(toward.clone().multiplyScalar(0.5)), normal, toward, 0.62));
      }
      return;
    }
    const reach = Math.min(...corners.map((c) => c.distanceTo(centroid)));
    // Point the top of the number at the corner farthest from the centre (the apex on a d10 kite).
    const far = corners.reduce((a, b) => (b.distanceTo(centroid) > a.distanceTo(centroid) + 1e-6 ? b : a));
    const size = reach * (die.type === 6 ? 1.15 : die.type === 12 ? 1.05 : die.type === 10 ? 1.5 : 0.92);
    group.add(labelPlane(faceText(die, labels[faceIndex]!), colors.ink, centroid, normal, far.clone().sub(centroid), size));
  });
  return group;
}

/** The three.js view of the dice tray: draws dice in the hand, then plays back a recorded throw. */
export class DiceScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  private dice: THREE.Group[] = [];
  private raf = 0;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private colors: DiceColors,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1c24, 1.15));
    const key = new THREE.DirectionalLight(0xfff2dd, 2.6);
    key.position.set(-5, 14, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 40 });
    this.scene.add(key);

    const felt = new THREE.Mesh(new THREE.PlaneGeometry(TRAY.halfWidth * 2, TRAY.halfDepth * 2), new THREE.MeshStandardMaterial({ color: colors.felt, roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.scene.add(felt);
    const rimMaterial = new THREE.MeshStandardMaterial({ color: colors.rim, roughness: 0.5, metalness: 0.35 });
    const rim = (w: number, d: number, x: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), rimMaterial);
      mesh.position.set(x, 0.27, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    rim(TRAY.halfWidth * 2 + 0.7, 0.35, 0, -TRAY.halfDepth - 0.17);
    rim(TRAY.halfWidth * 2 + 0.7, 0.35, 0, TRAY.halfDepth + 0.17);
    rim(0.35, TRAY.halfDepth * 2, -TRAY.halfWidth - 0.17, 0);
    rim(0.35, TRAY.halfDepth * 2, TRAY.halfWidth + 0.17, 0);

    this.resize();
    this.loop();
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull the camera back on narrow screens so the whole tray stays in view.
    const fit = Math.max(1, 1.75 / this.camera.aspect);
    this.camera.position.set(0, 13.5 * fit, 7.2 * fit);
    this.camera.lookAt(0, 0, 0.35);
    this.camera.updateProjectionMatrix();
  }

  private clear(): void {
    for (const die of this.dice) {
      this.scene.remove(die);
      die.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.dice = [];
  }

  /** The hand holding the dice: eases toward `target`; `held` while the pointer is down. */
  private hand = { x: HAND.x, z: HAND.z, targetX: HAND.x, targetZ: HAND.z, held: false };
  private raycaster = new THREE.Raycaster();

  /** Shows the dice resting in the player's hand at the near edge, turning slowly. */
  showInHand(plan: PlannedDie[]): void {
    this.clear();
    this.dice = plan.map((die, i) => {
      const group = buildDie(die, labelsFor(die.type, 0, die.type === 10 ? 0 : 1), this.colors);
      group.userData.spin = 0.5 + i * 0.13;
      group.userData.offset = (i - (plan.length - 1) / 2) * 1.5;
      group.position.set(this.hand.x + group.userData.offset, HAND.y, this.hand.z);
      this.scene.add(group);
      return group;
    });
    this.playback = null;
  }

  /** Where a pointer at (clientX, clientY) is over the tray, at hand height, kept clear of the walls. */
  pointerToTray(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HAND.y);
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return [this.hand.targetX, this.hand.targetZ];
    return clampToTray(hit.x, hit.z);
  }

  /** Picks the dice up (or moves them) to a point over the tray. */
  hold(x: number, z: number): void {
    this.hand.targetX = x;
    this.hand.targetZ = z;
    this.hand.held = true;
  }

  /** Where the dice are now, for the throw to start from. */
  handPosition(): [number, number] {
    return [this.hand.x, this.hand.z];
  }

  private playback: { sim: Simulation; start: number; onImpact?: (loudness: number) => void; nextImpact: number; done: () => void } | null = null;

  /** Plays a recorded throw. The faces are numbered so that each die lands showing its planned value. */
  play(plan: PlannedDie[], sim: Simulation, onImpact?: (loudness: number) => void): Promise<void> {
    this.clear();
    this.dice = plan.map((die, i) => {
      const group = buildDie(die, labelsFor(die.type, sim.top[i]!, die.face), this.colors);
      this.scene.add(group);
      return group;
    });
    return new Promise((resolve) => {
      this.playback = { sim, start: performance.now(), onImpact, nextImpact: 0, done: resolve };
    });
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const pb = this.playback;
    if (pb) {
      const step = Math.min(pb.sim.frames.length - 1, Math.floor(((now - pb.start) / 1000) * 60));
      const frame = pb.sim.frames[step]!;
      this.dice.forEach((die, i) => {
        const f = frame[i]!;
        die.position.set(f.p[0], f.p[1], f.p[2]);
        die.quaternion.set(f.q[0], f.q[1], f.q[2], f.q[3]);
      });
      while (pb.nextImpact < pb.sim.impacts.length && pb.sim.impacts[pb.nextImpact]!.step <= step) {
        pb.onImpact?.(pb.sim.impacts[pb.nextImpact]!.loudness);
        pb.nextImpact++;
      }
      if (step >= pb.sim.frames.length - 1) {
        this.playback = null;
        pb.done();
      }
    } else {
      // Follow the pointer quickly so the dice feel held, not dragged behind.
      const h = this.hand;
      h.x += (h.targetX - h.x) * 0.45;
      h.z += (h.targetZ - h.z) * 0.45;
      const rate = h.held ? 2.6 : 1;
      for (const die of this.dice) {
        if (typeof die.userData.spin === 'number') {
          die.rotation.x = now * 0.0006 * die.userData.spin * rate;
          die.rotation.y = now * 0.0009 * die.userData.spin * rate;
          die.position.x = h.x + (die.userData.offset ?? 0);
          die.position.z = h.z;
          die.position.y = HAND.y + (h.held ? 0.5 : 0) + Math.sin(now * 0.002 * rate + die.userData.spin * 9) * 0.12;
        }
      }
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.playback?.done();
    this.clear();
    this.renderer.dispose();
  }
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
