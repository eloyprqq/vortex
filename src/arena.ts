import * as THREE from "three";

export type Aabb = {
  minx: number;
  miny: number;
  minz: number;
  maxx: number;
  maxy: number;
  maxz: number;
};

export type Spawn = { x: number; y: number; z: number; yaw: number };

export const CAPTURE = { x: 0, z: 0, radius: 4.4 };
export const MATCH_SECONDS = 180;
export const CAPTURE_GOAL = 100;

export const ALLY_SPAWN: Spawn = { x: 0, y: 0, z: 15.5, yaw: Math.PI };
export const ENEMY_SPAWNS: Spawn[] = [
  { x: -3.2, y: 0, z: -15.2, yaw: 0 },
  { x: 3.2, y: 0, z: -15.2, yaw: 0 },
];

export const WIDOW_PERCH = new THREE.Vector3(0, 4.15, -16.4);

const PROPS: { x: number; y: number; z: number; w: number; h: number; d: number }[] = [
  { x: 0, y: 0.55, z: 8.2, w: 4.2, h: 1.1, d: 1.15 },
  { x: 6.2, y: 0.75, z: 3.4, w: 2.2, h: 1.5, d: 1.6 },
  { x: -6.4, y: 0.75, z: 2.6, w: 2.4, h: 1.5, d: 1.8 },
  { x: 5.1, y: 0.65, z: -4.8, w: 2.8, h: 1.3, d: 1.3 },
  { x: -5.4, y: 0.65, z: -5.2, w: 2.6, h: 1.3, d: 1.4 },
  { x: 9.5, y: 1.5, z: -1, w: 1.4, h: 3, d: 8 },
  { x: -9.5, y: 1.5, z: -1, w: 1.4, h: 3, d: 8 },
  { x: 0, y: 2.05, z: -16.6, w: 9, h: 0.35, d: 6.2 },
  { x: 0, y: 3.1, z: -19.4, w: 9, h: 2.4, d: 0.45 },
  { x: -4.6, y: 3.1, z: -16.6, w: 0.45, h: 2.4, d: 6.2 },
  { x: 4.6, y: 3.1, z: -16.6, w: 0.45, h: 2.4, d: 6.2 },
  { x: -1.6, y: 0.45, z: -12.1, w: 1.8, h: 0.9, d: 1.6 },
  { x: -1.6, y: 1.15, z: -13.3, w: 1.8, h: 0.9, d: 1.6 },
  { x: -1.6, y: 1.85, z: -14.5, w: 1.8, h: 0.9, d: 1.6 },
  { x: -1.6, y: 2.55, z: -15.6, w: 1.8, h: 0.9, d: 1.6 },
  { x: 18.2, y: 3, z: 0, w: 0.6, h: 6, d: 38 },
  { x: -18.2, y: 3, z: 0, w: 0.6, h: 6, d: 38 },
  { x: 0, y: 3, z: 18.8, w: 37, h: 6, d: 0.6 },
  { x: 0, y: 3, z: -20.6, w: 37, h: 6, d: 0.6 },
];

export function aabbFromProp(p: (typeof PROPS)[number]): Aabb {
  return {
    minx: p.x - p.w / 2,
    maxx: p.x + p.w / 2,
    miny: p.y - p.h / 2,
    maxy: p.y + p.h / 2,
    minz: p.z - p.d / 2,
    maxz: p.z + p.d / 2,
  };
}

export function buildArena(scene: THREE.Scene): { colliders: Aabb[]; meshes: THREE.Object3D[] } {
  const colliders = PROPS.map(aabbFromProp);
  const meshes: THREE.Object3D[] = [];

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(22, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a2738, roughness: 0.92 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  meshes.push(floor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(CAPTURE.radius - 0.12, CAPTURE.radius + 0.08, 64),
    new THREE.MeshBasicMaterial({ color: 0xf5c518, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);
  meshes.push(ring);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(CAPTURE.radius - 0.15, 48),
    new THREE.MeshStandardMaterial({ color: 0x24344c, roughness: 0.8, emissive: 0x1a1404, emissiveIntensity: 0.25 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  scene.add(pad);
  meshes.push(pad);

  const boxMat = new THREE.MeshStandardMaterial({ color: 0x2a3d54, roughness: 0.82 });

  for (const p of PROPS) {
    const mat = Math.abs(p.z + 16.6) < 4 && p.y > 1.8
      ? new THREE.MeshStandardMaterial({ color: 0x3a2a48, roughness: 0.78 })
      : boxMat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mat);
    mesh.position.set(p.x, p.y, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  }

  return { colliders, meshes };
}

export function onPoint(x: number, z: number): boolean {
  const dx = x - CAPTURE.x;
  const dz = z - CAPTURE.z;
  return dx * dx + dz * dz <= CAPTURE.radius * CAPTURE.radius;
}

export function resolveMove(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  radius: number,
  height: number,
  colliders: Aabb[],
  dt: number,
): boolean {
  vel.y -= 22 * dt;
  pos.x += vel.x * dt;
  pos.z += vel.z * dt;
  pos.y += vel.y * dt;

  const limit = 17.4;
  pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit);
  pos.z = THREE.MathUtils.clamp(pos.z, -19.6, 17.6);

  let grounded = false;
  if (pos.y <= 0) {
    pos.y = 0;
    vel.y = 0;
    grounded = true;
  }

  for (const b of colliders) {
    const closestX = THREE.MathUtils.clamp(pos.x, b.minx, b.maxx);
    const closestZ = THREE.MathUtils.clamp(pos.z, b.minz, b.maxz);
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;
    const feet = pos.y;
    const head = pos.y + height;
    const vert = head > b.miny + 0.02 && feet < b.maxy - 0.02;
    if (distSq >= radius * radius || !vert) continue;

    if (vel.y <= 0.4 && feet < b.maxy + 0.35 && feet > b.maxy - 0.55 && distSq < (radius - 0.02) * (radius - 0.02)) {
      pos.y = b.maxy;
      vel.y = 0;
      grounded = true;
      continue;
    }

    const dist = Math.sqrt(distSq) || 0.0001;
    const push = radius - dist;
    pos.x += (dx / dist) * push;
    pos.z += (dz / dist) * push;
  }

  return grounded;
}
