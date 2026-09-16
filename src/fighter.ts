import * as THREE from "three";
import { heroById, type HeroId } from "./heroes";
import type { Spawn } from "./maps";

export type Team = "ally" | "enemy";

export class Fighter {
  readonly id: string;
  readonly team: Team;
  readonly heroId: HeroId;
  readonly group = new THREE.Group();
  readonly vel = new THREE.Vector3();
  readonly radius = 0.38;
  height = 1.72;
  yaw = 0;
  pitch = 0;
  grounded = false;
  health: number;
  maxHealth: number;
  ammo = 0;
  maxAmmo = 0;
  reload = 0;
  fireCd = 0;
  helixCd = 0;
  fieldCd = 0;
  grappleCd = 0;
  mineCd = 0;
  meleeCd = 0;
  ult = 0;
  visorT = 0;
  infraT = 0;
  sprinting = false;
  scoped = false;
  charge = 0;
  poisonT = 0;
  cloakT = 0;
  flyT = 0;
  burstLeft = 0;
  burstGap = 0;
  slowT = 0;
  alive = true;
  respawn = 0;
  healT = 0;
  grappleT = 0;
  grappleTo: THREE.Vector3 | null = null;
  body!: THREE.Mesh;
  head!: THREE.Mesh;
  outline!: THREE.Mesh;
  spawn: Spawn;
  botMoveX = 0;
  botMoveZ = 0;
  kills = 0;
  deaths = 0;
  assists = 0;
  hits: { id: string; team: Team; t: number }[] = [];

  constructor(id: string, team: Team, heroId: HeroId, spawn: Spawn) {
    this.id = id;
    this.team = team;
    this.heroId = heroId;
    this.spawn = spawn;
    const def = heroById(heroId);
    this.maxHealth = def.health;
    this.health = def.health;
    this.resetLoadout();
    this.buildMesh(def.color, def.accent);
    this.place(spawn);
  }

  resetLoadout() {
    if (this.heroId === "soldier76") {
      this.maxAmmo = 25;
      this.ammo = 25;
    } else if (this.heroId === "nova") {
      this.maxAmmo = 120;
      this.ammo = 120;
    } else {
      this.maxAmmo = 35;
      this.ammo = 35;
    }
    this.reload = 0;
    this.fireCd = 0;
    this.helixCd = 0;
    this.fieldCd = 0;
    this.grappleCd = 0;
    this.mineCd = 0;
    this.meleeCd = 0;
    this.sprinting = false;
    this.scoped = false;
    this.charge = 0;
    this.flyT = 0;
    this.burstLeft = 0;
    this.burstGap = 0;
    this.botMoveX = 0;
    this.botMoveZ = 0;
  }

  place(spawn: Spawn = this.spawn) {
    this.group.position.set(spawn.x, spawn.y, spawn.z);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.alive = true;
    this.poisonT = 0;
    this.cloakT = 0;
    this.flyT = 0;
    this.burstLeft = 0;
    this.burstGap = 0;
    this.slowT = 0;
    this.healT = 0;
    this.grappleT = 0;
    this.grappleTo = null;
    this.visorT = 0;
    this.botMoveX = 0;
    this.botMoveZ = 0;
    this.resetLoadout();
    this.group.visible = true;
  }

  eye(out: THREE.Vector3) {
    return out.set(
      this.group.position.x,
      this.group.position.y + this.height * 0.88,
      this.group.position.z,
    );
  }

  lookDir(out: THREE.Vector3) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  private buildMesh(color: number, accent: number) {
    const slim = this.heroId === "widowmaker" || this.heroId === "nova";
    this.height = slim ? 1.78 : 1.7;
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(slim ? 0.32 : 0.38, slim ? 1.12 : 1.02, 6, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.12 }),
    );
    this.body.position.y = this.height * 0.5;
    this.body.castShadow = true;
    this.body.userData.hit = this;
    this.body.userData.part = "body";
    this.group.add(this.body);

    const lineColor = this.team === "ally" ? 0x3d9eff : 0xff3b5c;
    this.outline = new THREE.Mesh(
      new THREE.CapsuleGeometry(slim ? 0.36 : 0.44, slim ? 1.18 : 1.08, 8, 14),
      new THREE.MeshBasicMaterial({
        color: lineColor,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.outline.position.y = this.height * 0.5;
    this.outline.scale.setScalar(1.06);
    this.outline.renderOrder = 9;
    this.group.add(this.outline);

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(slim ? 0.2 : 0.22, 12, 10),
      new THREE.MeshStandardMaterial({ color: slim ? 0xc4a07a : 0xc9b39a, roughness: 0.6 }),
    );
    this.head.position.y = this.height - 0.12;
    this.head.userData.hit = this;
    this.head.userData.part = "head";
    this.group.add(this.head);

    if (this.heroId === "widowmaker") this.dressWidow(accent);
    else if (this.heroId === "nova") this.dressNova(accent);
    else this.dressSoldier(accent);
  }

  private dressSoldier(accent: number) {
    const jacket = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.62, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x2a4a72, roughness: 0.7 }),
    );
    jacket.position.y = 1.05;
    this.group.add(jacket);
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.42, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x1a2838, roughness: 0.65 }),
    );
    pack.position.set(0, 1.08, 0.28);
    this.group.add(pack);
    const helm = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x243044, metalness: 0.35, roughness: 0.4 }),
    );
    helm.position.y = this.height - 0.06;
    this.group.add(helm);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.1, 0.08),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.7 }),
    );
    visor.position.set(0, this.height - 0.08, -0.2);
    this.group.add(visor);
    const rifle = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x1a1f28, metalness: 0.5, roughness: 0.35 }),
    );
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.22, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x11141a }),
    );
    mag.position.set(0, -0.14, 0.1);
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.16, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2a2208 }),
    );
    stock.position.z = 0.52;
    rifle.add(barrel, mag, stock);
    rifle.position.set(0.42, 0.95, -0.22);
    this.group.add(rifle);
  }

  private dressWidow(accent: number) {
    const suit = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.7, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x4a1a58, roughness: 0.45, metalness: 0.2 }),
    );
    suit.position.y = 1.12;
    this.group.add(suit);
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a0a18 }),
    );
    hair.position.set(0, this.height + 0.02, 0.08);
    this.group.add(hair);
    const tail = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.05, 0.45, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a0a18 }),
    );
    tail.position.set(0, this.height - 0.15, 0.28);
    tail.rotation.x = 0.7;
    this.group.add(tail);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.07, 0.08),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55 }),
    );
    visor.position.set(0, this.height - 0.08, -0.18);
    this.group.add(visor);
    const rifle = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.03, 1.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1218, metalness: 0.6, roughness: 0.3 }),
    );
    barrel.rotation.x = Math.PI / 2;
    const scope = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x3a2030, emissive: 0x5a2040, emissiveIntensity: 0.25 }),
    );
    scope.position.set(0, 0.1, -0.15);
    rifle.add(barrel, scope);
    rifle.position.set(0.34, 1.15, -0.55);
    this.group.add(rifle);
  }

  private dressNova(accent: number) {
    const suit = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.68, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1a2830, roughness: 0.4, metalness: 0.35 }),
    );
    suit.position.y = 1.1;
    this.group.add(suit);
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.12, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.65 }),
    );
    hair.position.set(0, this.height + 0.02, 0.04);
    this.group.add(hair);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.7 }),
    );
    visor.position.set(0, this.height - 0.08, -0.18);
    this.group.add(visor);
    const rifle = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.026, 0.82, 8),
      new THREE.MeshStandardMaterial({ color: 0x12181c, metalness: 0.65, roughness: 0.28 }),
    );
    barrel.rotation.x = Math.PI / 2;
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.2, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x0c1216 }),
    );
    mag.position.set(0, -0.14, 0.06);
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.04, 0.32),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35 }),
    );
    rail.position.set(0, 0.06, -0.08);
    rifle.add(barrel, mag, rail);
    rifle.position.set(0.38, 1.05, -0.28);
    this.group.add(rifle);
  }
}
