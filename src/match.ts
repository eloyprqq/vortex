import * as THREE from "three";
import {
  buildArena,
  CAPTURE_GOAL,
  MATCH_SECONDS,
  onPoint,
  resolveMove,
  type Aabb,
} from "./arena";
import { Fighter } from "./fighter";
import { heroById, type HeroId } from "./heroes";
import { Input } from "./input";
import { difficultyById, type Difficulty, type DifficultyId } from "./difficulty";
import { mapById, type MapDef, type MapId } from "./maps";

type Rocket = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  owner: Fighter;
  life: number;
};

type Mine = {
  mesh: THREE.Mesh;
  owner: Fighter;
  armed: number;
};

type Field = {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  owner: Fighter;
  life: number;
};

export type HudSnap = {
  health: number;
  maxHealth: number;
  ammo: string;
  ult: number;
  helix: number;
  field: number;
  grapple: number;
  mine: number;
  visor: boolean;
  infra: boolean;
  scoped: boolean;
  charge: number;
  melee: number;
  sprint: boolean;
  hero: HeroId;
  obj: string;
  allyCap: number;
  enemyCap: number;
  time: number;
  contested: boolean;
  hint: string;
  crosshairHot: boolean;
  feed: string[];
  firstPerson: boolean;
  aliveAlly: number;
  aliveEnemy: number;
};

export class Match {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly player: Fighter;
  readonly fighters: Fighter[] = [];
  readonly input: Input;
  private colliders: Aabb[] = [];
  private rockets: Rocket[] = [];
  private mines: Mine[] = [];
  private fields: Field[] = [];
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2(0, 0);
  private wish = new THREE.Vector3();
  private look = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private camGoal = new THREE.Vector3();
  private clock = new THREE.Clock();
  private raf = 0;
  private onResize: () => void;
  private paused = false;
  private ended = false;
  private timeLeft = MATCH_SECONDS;
  private allyCap = 0;
  private enemyCap = 0;
  private feed: { t: number; text: string }[] = [];
  private botThink = 0;
  private worldHits: THREE.Object3D[] = [];
  private camDist = 4.2;
  private firstPerson = false;
  private map: MapDef;
  private diff: Difficulty;
  result: "win" | "lose" | "draw" | null = null;
  onHud: (s: HudSnap) => void = () => {};
  onPause: (p: boolean) => void = () => {};
  onEnd: (r: "win" | "lose" | "draw") => void = () => {};
  private lastLock = true;
  private botNav = new Map<string, { x: number; z: number; stuck: number; side: number; avoid: number }>();

  constructor(canvas: HTMLCanvasElement, hero: HeroId, mapId: MapId, difficultyId: DifficultyId) {
    this.map = mapById(mapId);
    this.diff = difficultyById(difficultyId);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x0b1018, 1);
    this.scene.fog = new THREE.Fog(0x0b1018, this.map.fogNear, this.map.fogFar);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.08, 140);
    this.input = new Input(canvas);

    this.scene.add(new THREE.AmbientLight(0x5a6a80, 0.6));
    const sun = new THREE.DirectionalLight(0xffe4b5, 1.05);
    sun.position.set(-14, 28, 12);
    this.scene.add(sun);

    const built = buildArena(this.scene, this.map);
    this.colliders = built.colliders;
    this.worldHits = built.meshes;

    const allyMix: HeroId[] = ["soldier76", "widowmaker", "soldier76", "widowmaker", "soldier76"];
    const enemyMix: HeroId[] = ["widowmaker", "soldier76", "widowmaker", "soldier76", "widowmaker"];
    this.player = new Fighter("you", "ally", hero, this.map.allySpawns[0]);
    this.scene.add(this.player.group);
    this.fighters.push(this.player);
    for (let i = 1; i < 5; i++) {
      const id = allyMix[i] === hero ? (hero === "soldier76" ? "widowmaker" : "soldier76") : allyMix[i];
      const f = new Fighter(`ally${i}`, "ally", id, this.map.allySpawns[i]);
      this.scene.add(f.group);
      this.fighters.push(f);
    }
    for (let i = 0; i < 5; i++) {
      const f = new Fighter(`enemy${i}`, "enemy", enemyMix[i], this.map.enemySpawns[i]);
      this.scene.add(f.group);
      this.fighters.push(f);
    }

    this.onResize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    };
    window.addEventListener("resize", this.onResize);

    canvas.addEventListener("click", () => {
      if (!this.ended && !this.paused) this.input.requestLock();
    });
    this.ray.layers.enable(0);
    this.ray.layers.enable(2);
    this.player.outline.visible = false;
  }

  start() {
    this.clock.start();
    this.input.requestLock();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  setPaused(p: boolean) {
    if (this.ended) return;
    this.paused = p;
    if (p) this.input.exitLock();
    else this.input.requestLock();
    this.onPause(p);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.input.dispose();
    this.renderer.dispose();
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused && this.lastLock && !this.input.locked && !this.ended) {
      this.setPaused(true);
    }
    this.lastLock = this.input.locked;

    if (!this.paused && !this.ended) {
      this.timeLeft -= dt;
      this.tickPlayer(dt);
      this.tickBots(dt);
      this.tickWorld(dt);
      this.tickCapture(dt);
      if (this.timeLeft <= 0) this.finishByTime();
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.pushHud();
    this.input.endFrame();
  }

  private tickPlayer(dt: number) {
    const p = this.player;
    if (this.input.keys.has("Escape")) {
      this.input.keys.delete("Escape");
      this.setPaused(true);
      return;
    }
    if (this.input.f3Down) {
      this.firstPerson = !this.firstPerson;
      this.applyViewLayer();
    }
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0) p.place();
      return;
    }
    p.yaw -= this.input.mouseDX * 0.0022;
    p.pitch -= this.input.mouseDY * 0.0022;
    p.pitch = THREE.MathUtils.clamp(p.pitch, -1.15, 1.15);

    this.controlHero(p, dt, true);
    if (this.input.keys.has("KeyV") && p.meleeCd <= 0) this.melee(p);
  }

  private controlHero(f: Fighter, dt: number, isPlayer: boolean) {
    if (!f.alive) return;
    this.tickStatus(f, dt);

    const def = heroById(f.heroId);
    const soldier = f.heroId === "soldier76";
    let speed = def.speed;
    if (soldier && isPlayer) {
      f.sprinting = this.input.keys.has("ShiftLeft") || this.input.keys.has("ShiftRight");
      if (f.sprinting && (this.input.lmb || this.input.rmb)) f.sprinting = false;
    }
    if (f.sprinting) speed *= 1.55;
    if (f.scoped) speed *= 0.55;

    if (f.grappleT > 0 && f.grappleTo) {
      f.grappleT -= dt;
      f.group.position.lerp(f.grappleTo, 1 - Math.pow(0.001, dt));
      f.vel.set(0, 0, 0);
      if (f.grappleT <= 0) f.grappleTo = null;
    } else {
      this.wish.set(0, 0, 0);
      if (isPlayer) {
        if (this.input.keys.has("KeyW")) this.wish.z -= 1;
        if (this.input.keys.has("KeyS")) this.wish.z += 1;
        if (this.input.keys.has("KeyA")) this.wish.x -= 1;
        if (this.input.keys.has("KeyD")) this.wish.x += 1;
        if (this.wish.lengthSq() > 0) {
          this.wish.normalize();
          const cs = Math.cos(f.yaw);
          const sn = Math.sin(f.yaw);
          f.vel.x = (this.wish.x * cs + this.wish.z * sn) * speed;
          f.vel.z = (this.wish.z * cs - this.wish.x * sn) * speed;
        } else {
          f.vel.x *= 1 - Math.min(1, dt * 12);
          f.vel.z *= 1 - Math.min(1, dt * 12);
        }
      } else if (f.botMoveX !== 0 || f.botMoveZ !== 0) {
        this.tmp.set(f.botMoveX, 0, f.botMoveZ);
        if (this.tmp.lengthSq() > 1) this.tmp.normalize();
        f.vel.x = this.tmp.x * speed;
        f.vel.z = this.tmp.z * speed;
      } else {
        f.vel.x *= 1 - Math.min(1, dt * 12);
        f.vel.z *= 1 - Math.min(1, dt * 12);
      }
      if (isPlayer && this.input.keys.has("Space") && f.grounded) {
        f.vel.y = 8.2;
        f.grounded = false;
      }
      f.grounded = resolveMove(f.group.position, f.vel, f.radius, f.height, this.colliders, dt, this.map.bound);
    }

    f.group.rotation.y = f.yaw;

    if (soldier) this.tickSoldier(f, dt, isPlayer);
    else this.tickWidow(f, dt, isPlayer);
  }

  private tickStatus(f: Fighter, dt: number) {
    f.fireCd = Math.max(0, f.fireCd - dt);
    f.helixCd = Math.max(0, f.helixCd - dt);
    f.fieldCd = Math.max(0, f.fieldCd - dt);
    f.grappleCd = Math.max(0, f.grappleCd - dt);
    f.mineCd = Math.max(0, f.mineCd - dt);
    f.meleeCd = Math.max(0, f.meleeCd - dt);
    f.visorT = Math.max(0, f.visorT - dt);
    f.infraT = Math.max(0, f.infraT - dt);
    if (f.reload > 0) {
      f.reload -= dt;
      if (f.reload <= 0) f.ammo = f.maxAmmo;
    }
    if (f.poisonT > 0) {
      f.poisonT -= dt;
      this.hurt(f, 12 * dt, f, false);
    }
    for (const field of this.fields) {
      if (field.owner.team !== f.team) continue;
      const dx = f.group.position.x - field.pos.x;
      const dz = f.group.position.z - field.pos.z;
      if (dx * dx + dz * dz < 16) {
        f.health = Math.min(f.maxHealth, f.health + 40 * dt);
      }
    }
  }

  private tickSoldier(f: Fighter, _dt: number, isPlayer: boolean) {
    if (isPlayer && this.input.keys.has("KeyR") && f.reload <= 0 && f.ammo < f.maxAmmo) {
      f.reload = 1.5;
    }
    if (isPlayer && this.input.rmbDown && f.helixCd <= 0) this.fireHelix(f);
    if (isPlayer && this.input.keys.has("KeyE") && f.fieldCd <= 0) this.dropField(f);
    if (isPlayer && this.input.keys.has("KeyQ") && f.ult >= 100) {
      f.ult = 0;
      f.visorT = 6;
    }
    if (f.visorT > 0 && isPlayer) this.assistAim(f);

    const shoot = isPlayer
      ? (this.input.lmb || f.visorT > 0) && !f.sprinting
      : f.fireCd <= 0 && Math.random() < this.bot(f).fireGate;
    if (shoot) this.firePulse(f);
  }

  private tickWidow(f: Fighter, dt: number, isPlayer: boolean) {
    if (isPlayer) f.scoped = this.input.rmb;
    if (f.scoped) f.charge = Math.min(1, f.charge + dt / 0.85);
    else f.charge = 0;

    if (isPlayer && (this.input.keys.has("ShiftLeft") || this.input.keys.has("ShiftRight")) && f.grappleCd <= 0) {
      this.grapple(f);
    }
    if (isPlayer && this.input.keys.has("KeyE") && f.mineCd <= 0) this.placeMine(f);
    if (isPlayer && this.input.keys.has("KeyQ") && f.ult >= 100) {
      f.ult = 0;
      f.infraT = 12;
    }
    if (isPlayer && this.input.keys.has("KeyR") && f.reload <= 0 && f.ammo < f.maxAmmo) f.reload = 1.4;

    if (isPlayer) {
      if (f.scoped && this.input.lmbDown) this.fireWidow(f);
      else if (!f.scoped && this.input.lmb) this.fireWidow(f);
    }
  }

  private melee(f: Fighter) {
    if (f.meleeCd > 0 || !f.alive) return;
    f.meleeCd = 1;
    f.eye(this.tmp);
    f.lookDir(this.tmp2);
    for (const o of this.fighters) {
      if (!o.alive || o.team === f.team) continue;
      const d = o.group.position.distanceTo(f.group.position);
      if (d > 2.35) continue;
      o.eye(this.look);
      const to = this.look.sub(this.tmp).normalize();
      if (to.dot(this.tmp2) < 0.15) continue;
      this.hurt(o, 30, f, true);
    }
  }

  private firePulse(f: Fighter) {
    if (f.fireCd > 0 || f.reload > 0) return;
    if (f.ammo <= 0) {
      f.reload = 1.5;
      return;
    }
    f.ammo -= 1;
    const botMul = f === this.player ? 1 : this.bot(f).fire;
    f.fireCd = (f.visorT > 0 ? 0.09 : 0.11) / botMul;
    const spread = (f.visorT > 0 && f === this.player ? 0 : 0.018) + (f === this.player ? 0 : this.bot(f).spread);
    this.hitscan(f, 19, 1, spread, 55);
  }

  private fireWidow(f: Fighter) {
    if (f.fireCd > 0 || f.reload > 0) return;
    if (f.ammo <= 0) {
      f.reload = 1.4;
      return;
    }
    f.ammo -= 1;
    const extra = f === this.player ? 0 : this.bot(f).spread;
    if (f.scoped) {
      f.fireCd = 0.55 / (f === this.player ? 1 : this.bot(f).fire);
      const dmg = 12 + 108 * f.charge;
      this.hitscan(f, dmg, 2.5, 0.02 + extra * 0.6, 80);
      f.charge = 0;
    } else {
      f.fireCd = 0.12 / (f === this.player ? 1 : this.bot(f).fire);
      this.hitscan(f, 13, 1, 0.03 + extra, 40);
    }
  }

  private hitscan(f: Fighter, damage: number, headMul: number, spread: number, range: number) {
    this.aimRay(f, spread);
    const hits = this.ray.intersectObjects(this.hitables(f), false);
    const first = hits.find((h) => h.distance <= range);
    if (!first) {
      this.tracer(this.ray.ray.origin, this.ray.ray.direction, Math.min(range, 28), 0xffe08a);
      return;
    }
    this.tracer(this.ray.ray.origin, this.ray.ray.direction, first.distance, 0xffe08a);
    const target = first.object.userData.hit as Fighter | undefined;
    if (!target || !target.alive || target.team === f.team) return;
    if (f !== this.player && Math.random() > this.bot(f).hit) {
      this.tracer(this.ray.ray.origin, this.ray.ray.direction, first.distance, 0x8b9bb0);
      return;
    }
    const part = first.object.userData.part as string;
    const dealt = part === "head" ? damage * headMul : damage;
    this.hurt(target, dealt, f, true);
  }

  private aimRay(f: Fighter, spread: number) {
    if (f === this.player && this.input.locked) {
      this.ray.setFromCamera(this.ndc, this.camera);
    } else {
      f.eye(this.tmp);
      f.lookDir(this.tmp2);
      this.ray.set(this.tmp, this.tmp2);
    }
    if (spread > 0) {
      this.ray.ray.direction.x += (Math.random() - 0.5) * spread;
      this.ray.ray.direction.y += (Math.random() - 0.5) * spread;
      this.ray.ray.direction.normalize();
    }
  }

  private fireHelix(f: Fighter) {
    f.helixCd = 6;
    this.aimRay(f, f === this.player ? 0 : this.bot(f).spread * 1.4);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb703 }),
    );
    mesh.position.copy(this.ray.ray.origin).addScaledVector(this.ray.ray.direction, 0.8);
    this.scene.add(mesh);
    this.rockets.push({
      mesh,
      vel: this.ray.ray.direction.clone().multiplyScalar(32),
      owner: f,
      life: 1.6,
    });
  }

  private dropField(f: Fighter) {
    f.fieldCd = 15;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.08, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7bed9f, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    const pos = f.group.position.clone();
    pos.y += 0.05;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.fields.push({ mesh, pos, owner: f, life: 5 });
  }

  private grapple(f: Fighter) {
    this.aimRay(f, 0);
    const hits = this.ray.intersectObjects(this.worldHits, false);
    const hit = hits.find((h) => h.distance > 2 && h.distance < 36);
    if (!hit) return;
    f.grappleCd = 12;
    f.grappleT = 0.38;
    f.grappleTo = hit.point.clone();
    f.grappleTo.y = Math.max(0, hit.point.y);
  }

  private placeMine(f: Fighter) {
    f.mineCd = 15;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x6d2b7a, emissive: 0x4a1658, emissiveIntensity: 0.5 }),
    );
    f.lookDir(this.tmp);
    mesh.position.copy(f.group.position).add(this.tmp.set(-Math.sin(f.yaw) * 1.2, 0.2, -Math.cos(f.yaw) * 1.2));
    this.scene.add(mesh);
    this.mines.push({ mesh, owner: f, armed: 0.4 });
  }

  private assistAim(f: Fighter) {
    let best: Fighter | null = null;
    let bestD = 70;
    f.eye(this.tmp);
    for (const o of this.fighters) {
      if (!o.alive || o.team === f.team) continue;
      const d = o.group.position.distanceTo(f.group.position);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) return;
    best.eye(this.tmp2);
    const dir = this.tmp2.sub(this.tmp).normalize();
    f.yaw = Math.atan2(-dir.x, -dir.z);
    f.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }

  private tickWorld(dt: number) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.mesh.position.addScaledVector(r.vel, dt);
      let boom = r.life <= 0;
      for (const f of this.fighters) {
        if (!f.alive || f.team === r.owner.team) continue;
        if (f.group.position.distanceTo(r.mesh.position) < 1.1) boom = true;
      }
      for (const b of this.colliders) {
        const p = r.mesh.position;
        if (p.x > b.minx && p.x < b.maxx && p.y > b.miny && p.y < b.maxy && p.z > b.minz && p.z < b.maxz) {
          boom = true;
        }
      }
      if (boom) {
        this.explode(r.mesh.position, r.owner, 120, 2.6);
        this.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }

    for (let i = this.fields.length - 1; i >= 0; i--) {
      this.fields[i].life -= dt;
      const m = this.fields[i].mesh.material as THREE.MeshBasicMaterial;
      m.opacity = 0.15 + 0.2 * Math.sin(this.fields[i].life * 8);
      if (this.fields[i].life <= 0) {
        this.scene.remove(this.fields[i].mesh);
        this.fields.splice(i, 1);
      }
    }

    for (const mine of this.mines) mine.armed -= dt;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      if (mine.armed > 0) continue;
      for (const f of this.fighters) {
        if (!f.alive || f.team === mine.owner.team) continue;
        if (f.group.position.distanceTo(mine.mesh.position) < 1.6) {
          f.poisonT = 5;
          this.hurt(f, 15, mine.owner, true);
          this.scene.remove(mine.mesh);
          this.mines.splice(i, 1);
          break;
        }
      }
    }

    for (const f of this.fighters) {
      f.outline.visible = f !== this.player && f.alive;
      const mat = f.outline.material as THREE.MeshBasicMaterial;
      mat.opacity = this.player.infraT > 0 && f.team === "enemy" ? 1 : 0.82;
    }
  }

  private explode(at: THREE.Vector3, owner: Fighter, dmg: number, radius: number) {
    for (const f of this.fighters) {
      if (!f.alive || f.team === owner.team) continue;
      const d = f.group.position.distanceTo(at);
      if (d < radius) this.hurt(f, dmg * (1 - d / radius), owner, true);
    }
  }

  private tracer(from: THREE.Vector3, dir: THREE.Vector3, len: number, color: number) {
    const g = new THREE.BufferGeometry().setFromPoints([
      from.clone(),
      from.clone().addScaledVector(dir, len),
    ]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    this.scene.add(line);
    window.setTimeout(() => {
      this.scene.remove(line);
      g.dispose();
    }, 60);
  }

  private hitables(owner: Fighter) {
    const list: THREE.Object3D[] = [];
    for (const f of this.fighters) {
      if (f === owner || !f.alive) continue;
      list.push(f.body, f.head);
    }
    return list;
  }

  private hurt(target: Fighter, amount: number, src: Fighter, credit: boolean) {
    if (!target.alive || amount <= 0) return;
    target.health -= amount;
    if (credit && src.team !== target.team) src.ult = Math.min(100, src.ult + amount * 0.12);
    if (target.health <= 0) {
      target.health = 0;
      target.alive = false;
      target.group.visible = false;
      target.respawn = 5;
      target.scoped = false;
      if (credit) {
        src.ult = Math.min(100, src.ult + 20);
        this.feed.push({
          t: 4,
          text: `${heroById(src.heroId).name}  →  ${heroById(target.heroId).name}`,
        });
      }
    }
  }

  private applyViewLayer() {
    this.player.group.traverse((o) => {
      o.layers.set(this.firstPerson ? 2 : 0);
    });
    this.ray.layers.enable(0);
    this.ray.layers.enable(2);
  }

  private nearestFoe(f: Fighter): Fighter | null {
    let best: Fighter | null = null;
    let bestD = 1e9;
    for (const o of this.fighters) {
      if (!o.alive || o.team === f.team) continue;
      const d = o.group.position.distanceTo(f.group.position);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  private tickBots(dt: number) {
    this.botThink -= dt;
    const think = this.botThink <= 0;
    if (think) this.botThink = 0.12;
    for (const f of this.fighters) {
      if (f === this.player) continue;
      if (!f.alive) {
        f.respawn -= dt;
        if (f.respawn <= 0) f.place();
        continue;
      }
      if (think) this.steerBot(f);
      this.controlHero(f, dt, false);
      const foe = this.nearestFoe(f);
      if (foe && f.meleeCd <= 0 && f.group.position.distanceTo(foe.group.position) < 2.15) {
        this.lookAt(f, foe);
        this.melee(f);
      }
      if (f.heroId === "soldier76") {
        if (
          foe &&
          f.helixCd <= 0 &&
          f.group.position.distanceTo(foe.group.position) < 18 &&
          Math.random() < (f.team === "enemy" ? this.diff.enemyHelix : 0.5)
        ) {
          this.lookAt(f, foe);
          this.fireHelix(f);
        }
        if (f.fieldCd <= 0 && f.health < f.maxHealth * 0.55) this.dropField(f);
        if (f.ult >= 100 && (f.team === "ally" || this.diff.enemyUlt)) {
          f.ult = 0;
          f.visorT = 6;
        }
      } else if (foe) {
        const onCap = onPoint(f.group.position.x, f.group.position.z, this.map.captureR);
        const d = f.group.position.distanceTo(foe.group.position);
        f.scoped = onCap && d > 10 && this.canSee(f, foe);
        if (f.team === "ally") {
          const perch = this.map.allyPerch;
          if (f.grappleCd <= 0 && f.group.position.y < 2.5 && Math.random() < 0.05) {
            f.grappleCd = 12;
            f.grappleT = 0.45;
            f.grappleTo = perch.clone();
          }
        } else if (!onCap && f.grappleCd <= 0 && f.group.position.distanceTo(this.tmp.set(0, 0, 0)) > 14 && Math.random() < 0.08) {
          this.faceToward(f, this.tmp.set(0, 0, 0));
          this.grapple(f);
        }
        if (f.mineCd <= 0 && onCap) this.placeMine(f);
        if (f.fireCd <= 0 && this.canSee(f, foe) && Math.random() < this.bot(f).fireGate) {
          this.lookAt(f, foe);
          this.fireWidow(f);
        }
        if (f.ult >= 100 && (f.team === "ally" || this.diff.enemyUlt)) {
          f.ult = 0;
          f.infraT = 12;
        }
      }
    }
  }

  private pointSlot(f: Fighter): THREE.Vector3 {
    const pack = this.fighters.filter((x) => x.team === f.team && x !== this.player);
    const i = Math.max(0, pack.indexOf(f));
    const ang = (i / Math.max(1, pack.length)) * Math.PI * 2 + (f.team === "enemy" ? 0.7 : 0);
    const r = this.map.captureR * 0.38;
    return this.tmp2.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
  }

  private enemiesOnPoint(): number {
    let n = 0;
    for (const f of this.fighters) {
      if (f.team !== "enemy" || !f.alive) continue;
      if (onPoint(f.group.position.x, f.group.position.z, this.map.captureR)) n += 1;
    }
    return n;
  }

  private steerBot(f: Fighter) {
    const foe = this.nearestFoe(f);
    const onCap = onPoint(f.group.position.x, f.group.position.z, this.map.captureR);
    const slot = this.pointSlot(f).clone();

    const sniper =
      f.team === "enemy" && f.heroId === "widowmaker" && f.id === "enemy0" && this.enemiesOnPoint() >= 3;
    if (sniper) {
      this.faceToward(f, this.map.enemyPerch);
      this.setBotMove(f, this.map.enemyPerch.x, this.map.enemyPerch.z, 1.4);
      if (foe) this.lookAt(f, foe);
      return;
    }

    if (f.team === "ally" && f.heroId === "widowmaker" && !onCap && this.enemiesOnPoint() < 2) {
      const perch = this.map.allyPerch;
      if (f.group.position.distanceTo(perch) > 4 && f.group.position.y < 3) {
        this.faceToward(f, perch);
        this.setBotMove(f, perch.x, perch.z, 1.2);
        return;
      }
    }

    if (!onCap) {
      this.setBotMove(f, slot.x, slot.z, 1.6);
      f.sprinting = true;
      f.scoped = false;
      if (foe && this.canSee(f, foe) && f.group.position.distanceTo(foe.group.position) < 16) {
        this.lookAt(f, foe);
      } else {
        this.faceToward(f, slot);
      }
      return;
    }

    const inner = this.map.captureR * 0.55;
    if (!onPoint(f.group.position.x, f.group.position.z, inner)) {
      this.setBotMove(f, slot.x, slot.z, 0.9);
      f.sprinting = true;
    } else {
      this.setBotMove(f, 0, 0, 0);
      f.sprinting = false;
    }
    if (foe && this.canSee(f, foe)) this.lookAt(f, foe);
  }

  private setBotMove(f: Fighter, tx: number, tz: number, rush: number) {
    const px = f.group.position.x;
    const pz = f.group.position.z;
    let dx = tx - px;
    let dz = tz - pz;
    const nav = this.botNav.get(f.id) ?? { x: px, z: pz, stuck: 0, side: 1, avoid: 0 };
    const moved = Math.hypot(px - nav.x, pz - nav.z);
    if (rush > 0 && Math.hypot(dx, dz) > 1 && moved < 0.16) nav.stuck += 0.12;
    else nav.stuck = 0;
    if (nav.stuck > 0.3) {
      nav.side *= -1;
      nav.stuck = 0;
      nav.avoid = 0.9;
    }
    nav.avoid = Math.max(0, nav.avoid - 0.12);
    nav.x = px;
    nav.z = pz;
    this.botNav.set(f.id, nav);
    const len = Math.hypot(dx, dz) || 1;
    if (nav.avoid > 0) {
      const ox = (-dz / len) * 7 * nav.side;
      const oz = (dx / len) * 7 * nav.side;
      dx += ox;
      dz += oz;
    }
    const dist = Math.hypot(dx, dz);
    if (dist < 0.55 || rush === 0) {
      f.botMoveX = 0;
      f.botMoveZ = 0;
      return;
    }
    f.botMoveX = (dx / dist) * rush;
    f.botMoveZ = (dz / dist) * rush;
  }

  private canSee(a: Fighter, b: Fighter) {
    a.eye(this.tmp);
    b.eye(this.tmp2);
    const dist = this.tmp.distanceTo(this.tmp2);
    const dir = this.tmp2.clone().sub(this.tmp).normalize();
    this.ray.set(this.tmp, dir);
    const walls = this.ray.intersectObjects(this.worldHits, false);
    return !walls.length || walls[0].distance > dist - 0.4;
  }

  private bot(f: Fighter) {
    const enemy = f.team === "enemy";
    return {
      spread: enemy ? this.diff.enemySpread : this.diff.allySpread,
      hit: enemy ? this.diff.enemyHit : this.diff.allyHit,
      fire: enemy ? this.diff.enemyFire : this.diff.allyFire,
      jitter: enemy ? this.diff.enemyJitter : this.diff.allyJitter,
      fireGate: enemy ? 0.55 : 0.8,
    };
  }

  private lookAt(f: Fighter, t: Fighter) {
    t.eye(this.tmp2);
    f.eye(this.tmp);
    const dir = this.tmp2.sub(this.tmp).normalize();
    const j = this.bot(f).jitter;
    f.yaw = Math.atan2(-dir.x, -dir.z) + (Math.random() - 0.5) * j;
    f.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) + (Math.random() - 0.5) * j * 0.45;
  }

  private faceToward(f: Fighter, t: THREE.Vector3) {
    const dx = t.x - f.group.position.x;
    const dz = t.z - f.group.position.z;
    f.yaw = Math.atan2(-dx, -dz);
    f.pitch = 0;
  }

  private tickCapture(dt: number) {
    let ally = 0;
    let enemy = 0;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (!onPoint(f.group.position.x, f.group.position.z, this.map.captureR)) continue;
      if (f.team === "ally") ally += 1;
      else enemy += 1;
    }
    const contested = ally > 0 && enemy > 0;
    if (!contested) {
      if (ally > 0) this.allyCap = Math.min(CAPTURE_GOAL, this.allyCap + dt * 3.4 * Math.min(ally, 3));
      if (enemy > 0) this.enemyCap = Math.min(CAPTURE_GOAL, this.enemyCap + dt * 3.4 * Math.min(enemy, 3));
    }
    if (this.allyCap >= CAPTURE_GOAL) this.endMatch("win");
    else if (this.enemyCap >= CAPTURE_GOAL) this.endMatch("lose");
  }

  private finishByTime() {
    if (this.allyCap > this.enemyCap) this.endMatch("win");
    else if (this.enemyCap > this.allyCap) this.endMatch("lose");
    else this.endMatch("draw");
  }

  private endMatch(r: "win" | "lose" | "draw") {
    if (this.ended) return;
    this.ended = true;
    this.result = r;
    this.input.exitLock();
    this.onEnd(r);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const scoped = p.alive && p.heroId === "widowmaker" && p.scoped;
    const fov = scoped ? 28 : this.firstPerson ? 75 : p.visorT > 0 ? 58 : 62;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
    p.lookDir(this.look);
    if (this.firstPerson) {
      p.eye(this.camGoal);
      this.camera.position.copy(this.camGoal);
      this.tmp2.copy(this.camGoal).addScaledVector(this.look, 10);
      this.camera.lookAt(this.tmp2);
      return;
    }
    const dist = scoped ? 2.4 : this.camDist;
    const offX = scoped ? 0.18 : 0.85;
    const cy = Math.cos(p.pitch);
    const behind = this.tmp.set(
      Math.sin(p.yaw) * dist * cy + Math.cos(p.yaw) * offX,
      this.player.height * 0.72 - Math.sin(p.pitch) * dist * 0.65 + 0.35,
      Math.cos(p.yaw) * dist * cy - Math.sin(p.yaw) * offX,
    );
    this.camGoal.copy(p.group.position).add(behind);
    if (this.camGoal.y < 0.4) this.camGoal.y = 0.4;
    this.camera.position.lerp(this.camGoal, 1 - Math.pow(0.0002, dt));
    this.tmp2.copy(p.group.position).add(this.tmp.set(0, p.height * 0.78, 0)).addScaledVector(this.look, 8);
    this.camera.lookAt(this.tmp2);
  }

  private pushHud() {
    this.feed = this.feed.filter((x) => {
      x.t -= 0.016;
      return x.t > 0;
    });
    let ally = 0;
    let enemy = 0;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (!onPoint(f.group.position.x, f.group.position.z, this.map.captureR)) continue;
      if (f.team === "ally") ally += 1;
      else enemy += 1;
    }
    this.ray.setFromCamera(this.ndc, this.camera);
    const hover = this.ray.intersectObjects(this.hitables(this.player), false)[0];
    const hot = !!(hover && (hover.object.userData.hit as Fighter).team === "enemy");
    const p = this.player;
    let aliveAlly = 0;
    let aliveEnemy = 0;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f.team === "ally") aliveAlly += 1;
      else aliveEnemy += 1;
    }
    this.onHud({
      health: Math.max(0, p.health),
      maxHealth: p.maxHealth,
      ammo: p.reload > 0 ? "재장전" : `${p.ammo} / ${p.maxAmmo}`,
      ult: p.ult,
      helix: p.helixCd,
      field: p.fieldCd,
      grapple: p.grappleCd,
      mine: p.mineCd,
      visor: p.visorT > 0,
      infra: p.infraT > 0,
      scoped: p.scoped,
      charge: p.charge,
      melee: p.meleeCd,
      sprint: p.sprinting,
      hero: p.heroId,
      obj:
        ally && enemy
          ? "경합"
          : ally
            ? "점령 중"
            : enemy
              ? "적 점령"
              : "거점으로",
      allyCap: this.allyCap,
      enemyCap: this.enemyCap,
      time: Math.max(0, this.timeLeft),
      contested: ally > 0 && enemy > 0,
      hint: p.alive
        ? this.input.locked
          ? this.firstPerson
            ? "F3 3인칭"
            : "F3 1인칭"
          : "클릭해서 조준 잠금 · F3 시점"
        : `${p.respawn.toFixed(1)}초 후 리스폰`,
      crosshairHot: hot,
      feed: this.feed.map((x) => x.text),
      firstPerson: this.firstPerson,
      aliveAlly,
      aliveEnemy,
    });
  }
}
