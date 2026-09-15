import * as THREE from "three";

export type Spawn = { x: number; y: number; z: number; yaw: number };

export type MapId = "horizon" | "streets" | "ruins";

export type Prop = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  nest?: boolean;
};

export type MapDef = {
  id: MapId;
  name: string;
  nameEn: string;
  mode: string;
  kind: "control" | "push";
  place: string;
  blurb: string;
  art: string;
  captureR: number;
  floorR: number;
  bound: number;
  fogNear: number;
  fogFar: number;
  floor: number;
  block: number;
  nest: number;
  skyTop: number;
  skyLow: number;
  allySpawns: Spawn[];
  enemySpawns: Spawn[];
  allyPerch: THREE.Vector3;
  enemyPerch: THREE.Vector3;
  props: Prop[];
};

function line(z: number, yaw: number, xs: number[]): Spawn[] {
  return xs.map((x) => ({ x, y: 0, z, yaw }));
}

const XS = [-10, -5, 0, 5, 10];

function nest(zSign: number): Prop[] {
  const stairZ = (s: number) => -12 * zSign - 1.2 * s * zSign;
  return [
    { x: 0, y: 2.4, z: -18 * zSign, w: 12, h: 0.4, d: 8, nest: true },
    { x: 0, y: 3.6, z: -22 * zSign, w: 12, h: 2.8, d: 0.5, nest: true },
    { x: -6, y: 3.6, z: -18 * zSign, w: 0.5, h: 2.8, d: 8, nest: true },
    { x: 6, y: 3.6, z: -18 * zSign, w: 0.5, h: 2.8, d: 8, nest: true },
    { x: -2.2 * zSign, y: 0.5, z: stairZ(0), w: 2.2, h: 1, d: 2 },
    { x: -2.2 * zSign, y: 1.3, z: stairZ(1), w: 2.2, h: 1, d: 2 },
    { x: -2.2 * zSign, y: 2.1, z: stairZ(2), w: 2.2, h: 1, d: 2 },
    { x: -2.2 * zSign, y: 2.9, z: stairZ(3), w: 2.2, h: 1, d: 2 },
  ];
}

export const MAPS: MapDef[] = [
  {
    id: "horizon",
    name: "궤도 관측소",
    nameEn: "ORBITAL LOOKOUT",
    mode: "쟁탈",
    kind: "control",
    place: "저궤도 · 제1 거점",
    blurb: "중앙 원형 거점. 양쪽 고지에서 저격이 열린다.",
    art: "horizon",
    captureR: 6.4,
    floorR: 52,
    bound: 44,
    fogNear: 40,
    fogFar: 130,
    floor: 0x38506e,
    block: 0x53749d,
    nest: 0x6b5288,
    skyTop: 0x16224a,
    skyLow: 0x6f86b8,
    allySpawns: line(36, 0, XS),
    enemySpawns: line(-36, Math.PI, XS),
    allyPerch: new THREE.Vector3(0, 4.6, 18),
    enemyPerch: new THREE.Vector3(0, 4.6, -18),
    props: [
      { x: 0, y: 0.65, z: 16, w: 6, h: 1.3, d: 1.4 },
      { x: 0, y: 0.65, z: -16, w: 6, h: 1.3, d: 1.4 },
      { x: 12, y: 0.9, z: 8, w: 3.2, h: 1.8, d: 2.4 },
      { x: -12, y: 0.9, z: 8, w: 3.2, h: 1.8, d: 2.4 },
      { x: 12, y: 0.9, z: -8, w: 3.2, h: 1.8, d: 2.4 },
      { x: -12, y: 0.9, z: -8, w: 3.2, h: 1.8, d: 2.4 },
      { x: 20, y: 1.8, z: 0, w: 2, h: 3.6, d: 14 },
      { x: -20, y: 1.8, z: 0, w: 2, h: 3.6, d: 14 },
      { x: 8, y: 0.7, z: 0, w: 3.4, h: 1.4, d: 2 },
      { x: -8, y: 0.7, z: 0, w: 3.4, h: 1.4, d: 2 },
      { x: 28, y: 2.2, z: 12, w: 4, h: 4.4, d: 4 },
      { x: -28, y: 2.2, z: -12, w: 4, h: 4.4, d: 4 },
      ...nest(1),
      ...nest(-1),
      { x: 45, y: 4, z: 0, w: 0.8, h: 8, d: 90 },
      { x: -45, y: 4, z: 0, w: 0.8, h: 8, d: 90 },
      { x: 0, y: 4, z: 45, w: 90, h: 8, d: 0.8 },
      { x: 0, y: 4, z: -45, w: 90, h: 8, d: 0.8 },
    ],
  },
  {
    id: "streets",
    name: "항구 골목",
    nameEn: "HARBOR LANES",
    mode: "밀기",
    kind: "push",
    place: "해안 도시 · 시장",
    blurb: "로봇을 상대 스폰 쪽으로 민다. 근처에 서야 움직인다.",
    art: "streets",
    captureR: 6.2,
    floorR: 52,
    bound: 44,
    fogNear: 36,
    fogFar: 124,
    floor: 0x3e4654,
    block: 0x6d7d94,
    nest: 0x8a6a52,
    skyTop: 0x1d2a44,
    skyLow: 0x9b8a92,
    allySpawns: line(36, 0, XS),
    enemySpawns: line(-36, Math.PI, XS),
    allyPerch: new THREE.Vector3(16, 3.2, 14),
    enemyPerch: new THREE.Vector3(-16, 3.2, -14),
    props: [
      { x: 0, y: 0.7, z: 10, w: 8, h: 1.4, d: 1.6 },
      { x: 0, y: 0.7, z: -10, w: 8, h: 1.4, d: 1.6 },
      { x: 7, y: 2.2, z: 4, w: 2.4, h: 4.4, d: 6 },
      { x: -7, y: 2.2, z: 4, w: 2.4, h: 4.4, d: 6 },
      { x: 7, y: 2.2, z: -4, w: 2.4, h: 4.4, d: 6 },
      { x: -7, y: 2.2, z: -4, w: 2.4, h: 4.4, d: 6 },
      { x: 16, y: 1.4, z: 14, w: 8, h: 2.8, d: 3.2, nest: true },
      { x: -16, y: 1.4, z: -14, w: 8, h: 2.8, d: 3.2, nest: true },
      { x: 22, y: 2, z: 0, w: 3, h: 4, d: 18 },
      { x: -22, y: 2, z: 0, w: 3, h: 4, d: 18 },
      { x: 0, y: 0.55, z: 22, w: 5, h: 1.1, d: 2 },
      { x: 0, y: 0.55, z: -22, w: 5, h: 1.1, d: 2 },
      { x: 30, y: 1.6, z: 20, w: 5, h: 3.2, d: 5 },
      { x: -30, y: 1.6, z: -20, w: 5, h: 3.2, d: 5 },
      { x: 14, y: 0.8, z: -20, w: 3, h: 1.6, d: 3 },
      { x: -14, y: 0.8, z: 20, w: 3, h: 1.6, d: 3 },
      { x: 45, y: 4, z: 0, w: 0.8, h: 8, d: 90 },
      { x: -45, y: 4, z: 0, w: 0.8, h: 8, d: 90 },
      { x: 0, y: 4, z: 45, w: 90, h: 8, d: 0.8 },
      { x: 0, y: 4, z: -45, w: 90, h: 8, d: 0.8 },
    ],
  },
  {
    id: "ruins",
    name: "모래 원형",
    nameEn: "SAND ROTUNDA",
    mode: "쟁탈",
    kind: "control",
    place: "사막 유적 · 원형 경기장",
    blurb: "가장 넓은 거점. 기둥이 엄폐다.",
    art: "ruins",
    captureR: 7.2,
    floorR: 56,
    bound: 48,
    fogNear: 44,
    fogFar: 138,
    floor: 0x6d5c42,
    block: 0xa88d64,
    nest: 0xb8945e,
    skyTop: 0x2f4a74,
    skyLow: 0xd8b184,
    allySpawns: line(40, 0, XS),
    enemySpawns: line(-40, Math.PI, XS),
    allyPerch: new THREE.Vector3(22, 3.6, 10),
    enemyPerch: new THREE.Vector3(-22, 3.6, -10),
    props: [
      { x: 10, y: 2.4, z: 10, w: 2.2, h: 4.8, d: 2.2 },
      { x: -10, y: 2.4, z: 10, w: 2.2, h: 4.8, d: 2.2 },
      { x: 10, y: 2.4, z: -10, w: 2.2, h: 4.8, d: 2.2 },
      { x: -10, y: 2.4, z: -10, w: 2.2, h: 4.8, d: 2.2 },
      { x: 18, y: 1.2, z: 0, w: 2.8, h: 2.4, d: 2.8 },
      { x: -18, y: 1.2, z: 0, w: 2.8, h: 2.4, d: 2.8 },
      { x: 0, y: 1.2, z: 18, w: 2.8, h: 2.4, d: 2.8 },
      { x: 0, y: 1.2, z: -18, w: 2.8, h: 2.4, d: 2.8 },
      { x: 22, y: 1.6, z: 10, w: 7, h: 3.2, d: 3.2, nest: true },
      { x: -22, y: 1.6, z: -10, w: 7, h: 3.2, d: 3.2, nest: true },
      { x: 32, y: 1.8, z: 24, w: 6, h: 3.6, d: 6 },
      { x: -32, y: 1.8, z: -24, w: 6, h: 3.6, d: 6 },
      { x: 0, y: 0.6, z: 28, w: 10, h: 1.2, d: 1.6 },
      { x: 0, y: 0.6, z: -28, w: 10, h: 1.2, d: 1.6 },
      { x: 49, y: 4, z: 0, w: 0.8, h: 8, d: 98 },
      { x: -49, y: 4, z: 0, w: 0.8, h: 8, d: 98 },
      { x: 0, y: 4, z: 49, w: 98, h: 8, d: 0.8 },
      { x: 0, y: 4, z: -49, w: 98, h: 8, d: 0.8 },
    ],
  },
];

export function mapById(id: MapId): MapDef {
  const m = MAPS.find((x) => x.id === id);
  if (!m) throw new Error(id);
  return m;
}
