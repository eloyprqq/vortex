import * as THREE from "three";
import type { MapDef, Prop } from "./maps";

export type { Spawn } from "./maps";

export type Aabb = {
  minx: number;
  miny: number;
  minz: number;
  maxx: number;
  maxy: number;
  maxz: number;
};

export const MATCH_SECONDS = 180;
export const CAPTURE_GOAL = 100;

export function aabbFromProp(p: Prop): Aabb {
  return {
    minx: p.x - p.w / 2,
    maxx: p.x + p.w / 2,
    miny: p.y - p.h / 2,
    maxy: p.y + p.h / 2,
    minz: p.z - p.d / 2,
    maxz: p.z + p.d / 2,
  };
}

export function buildArena(
  scene: THREE.Scene,
  map: MapDef,
): { colliders: Aabb[]; meshes: THREE.Object3D[] } {
  const colliders = map.props.map(aabbFromProp);
  const meshes: THREE.Object3D[] = [];

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(map.floorR, 72),
    new THREE.MeshStandardMaterial({ color: map.floor, roughness: 0.92 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  meshes.push(floor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(map.captureR - 0.14, map.captureR + 0.1, 64),
    new THREE.MeshBasicMaterial({ color: 0xf5c518, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);
  meshes.push(ring);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(map.captureR - 0.18, 48),
    new THREE.MeshStandardMaterial({
      color: 0x24344c,
      roughness: 0.8,
      emissive: 0x1a1404,
      emissiveIntensity: 0.25,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  scene.add(pad);
  meshes.push(pad);

  const boxMat = new THREE.MeshStandardMaterial({ color: map.block, roughness: 0.82 });
  const nestMat = new THREE.MeshStandardMaterial({ color: map.nest, roughness: 0.78 });

  for (const p of map.props) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(p.w, p.h, p.d),
      p.nest ? nestMat : boxMat,
    );
    mesh.position.set(p.x, p.y, p.z);
    scene.add(mesh);
    meshes.push(mesh);
  }

  return { colliders, meshes };
}

export function onPoint(x: number, z: number, radius: number): boolean {
  return x * x + z * z <= radius * radius;
}

export function resolveMove(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  radius: number,
  height: number,
  colliders: Aabb[],
  dt: number,
  bound: number,
): boolean {
  vel.y -= 22 * dt;
  pos.x += vel.x * dt;
  pos.z += vel.z * dt;
  pos.y += vel.y * dt;

  pos.x = THREE.MathUtils.clamp(pos.x, -bound, bound);
  pos.z = THREE.MathUtils.clamp(pos.z, -bound, bound);

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
