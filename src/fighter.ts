import * as THREE from "three";
import { heroById, type HeroId } from "./heroes";
import type { Spawn } from "./arena";

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
  ult = 0;
  visorT = 0;
  infraT = 0;
  sprinting = false;
  scoped = false;
  charge = 0;
  poisonT = 0;
  alive = true;
  respawn = 0;
  healT = 0;
  grappleT = 0;
  grappleTo: THREE.Vector3 | null = null;
  body!: THREE.Mesh;
  head!: THREE.Mesh;
  outline!: THREE.Mesh;

  constructor(id: string, team: Team, heroId: HeroId, spawn: Spawn) {
    this.id = id;
    this.team = team;
    this.heroId = heroId;
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
    this.sprinting = false;
    this.scoped = false;
    this.charge = 0;
  }

  place(spawn: Spawn) {
    this.group.position.set(spawn.x, spawn.y, spawn.z);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.alive = true;
    this.poisonT = 0;
    this.healT = 0;
    this.grappleT = 0;
    this.grappleTo = null;
    this.visorT = 0;
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
    const slim = this.heroId === "widowmaker";
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

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(slim ? 0.2 : 0.22, 12, 10),
      new THREE.MeshStandardMaterial({ color: slim ? 0xc4a07a : 0xc9b39a, roughness: 0.6 }),
    );
    this.head.position.y = this.height - 0.12;
    this.head.userData.hit = this;
    this.head.userData.part = "head";
    this.group.add(this.head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(slim ? 0.28 : 0.32, 0.08, 0.12),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35 }),
    );
    visor.position.set(0, this.height - 0.1, slim ? -0.16 : -0.18);
    this.group.add(visor);

    const rifle = new THREE.Mesh(
      new THREE.BoxGeometry(slim ? 0.08 : 0.1, 0.1, slim ? 1.35 : 0.85),
      new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.4, metalness: 0.4 }),
    );
    rifle.position.set(0.38, this.height * 0.62, slim ? -0.35 : -0.28);
    this.group.add(rifle);

    this.outline = new THREE.Mesh(
      new THREE.CapsuleGeometry(slim ? 0.4 : 0.46, slim ? 1.2 : 1.1, 4, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff4d6a,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      }),
    );
    this.outline.position.y = this.height * 0.5;
    this.outline.visible = false;
    this.outline.renderOrder = 10;
    this.group.add(this.outline);
  }
}
