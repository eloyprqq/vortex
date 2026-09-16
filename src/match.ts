import * as THREE from "three";
import {
  buildArena,
  CAPTURE_GOAL,
  MATCH_SECONDS,
  onPoint,
  PUSH_PATH,
  PUSH_RADIUS,
  resolveMove,
  type Aabb,
} from "./arena";
import { Fighter } from "./fighter";
import { heroById, type HeroId } from "./heroes";
import { Input } from "./input";
import { sfx, unlockSfx } from "./sfx";
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
  kind: "heal" | "haste";
  radius: number;
  healRate: number;
};

export type MatchFormat = "5v5" | "1v1";

export const DUEL_KILLS = 5;

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
  sprint: boolean;
  fly: boolean;
  hero: HeroId;
  obj: string;
  allyCap: number;
  enemyCap: number;
  time: number;
  contested: boolean;
  hint: string;
  crosshairHot: boolean;
  feed: string[];
  hpBars: { id: string; x: number; y: number; health: number; maxHealth: number; ally: boolean }[];
  aliveAlly: number;
  aliveEnemy: number;
  mode: "control" | "push";
  k: number;
  d: number;
  a: number;
  duel: boolean;
  enemyKills: number;
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
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private clock = new THREE.Clock();
  private raf = 0;
  private live = true;
  private onResize: () => void;
  private paused = false;
  private ended = false;
  private timeLeft = MATCH_SECONDS;
  private allyCap = 0;
  private enemyCap = 0;
  private feed: { t: number; text: string }[] = [];
  private botThink = 0;
  private worldHits: THREE.Object3D[] = [];
  private viewGun = new THREE.Group();
  private viewGrip: THREE.Group | null = null;
  private viewSupport: THREE.Group | null = null;
  private viewField = new THREE.Group();
  private viewGrapple = new THREE.Group();
  private viewScene = new THREE.Scene();
  private viewCamera: THREE.PerspectiveCamera;
  private viewAct: "idle" | "field" | "grapple" | "reload" = "idle";
  private viewActT = 0;
  private viewKick = 0;
  private fieldArmed = false;
  private grappleLine: THREE.Line | null = null;
  private hpReveal = new Map<string, number>();
  private map: MapDef;
  private diff: Difficulty;
  private duel = false;
  result: "win" | "lose" | "draw" | null = null;
  onHud: (s: HudSnap) => void = () => {};
  onPause: (p: boolean) => void = () => {};
  onEnd: (r: "win" | "lose" | "draw") => void = () => {};
  onKill: (headshot: boolean) => void = () => {};
  onHit: (hit: { dmg: number; head: boolean; x: number; y: number }) => void = () => {};
  private robot = new THREE.Group();
  private robotProg = 0.5;
  private pushLen = 0;
  private pushCum: number[] = [];
  private botNav = new Map<string, { x: number; z: number; stuck: number; side: number; avoid: number }>();

  constructor(canvas: HTMLCanvasElement, hero: HeroId, mapId: MapId, difficultyId: DifficultyId, format: MatchFormat = "5v5") {
    this.map = mapById(mapId);
    this.diff = difficultyById(difficultyId);
    this.duel = format === "1v1";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(this.map.skyLow, 1);
    this.scene.fog = new THREE.Fog(this.map.skyLow, this.map.fogNear, this.map.fogFar);
    // far must clear the sky dome from anywhere in the arena, or the dome gets
    // clipped and the clear colour shows through as a hole.
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 260);
    this.camera.rotation.order = "YXZ";
    this.viewCamera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.02, 6);
    this.renderer.autoClear = false;
    this.input = new Input(canvas);

    this.scene.add(new THREE.HemisphereLight(this.map.skyTop, this.map.floor, 1.5));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
    sun.position.set(-14, 28, 12);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fb6dd, 0.5);
    rim.position.set(16, 10, -18);
    this.scene.add(rim);

    const built = buildArena(this.scene, this.map);
    this.colliders = built.colliders;
    this.worldHits = built.meshes;

    this.player = new Fighter("you", "ally", hero, this.map.allySpawns[0]);
    this.scene.add(this.player.group);
    this.fighters.push(this.player);
    if (this.duel) {
      const all: HeroId[] = ["soldier76", "widowmaker", "nova"];
      const pool = all.filter((id) => id !== hero);
      const enemyHero = pool[Math.floor(Math.random() * pool.length)] ?? "soldier76";
      const foe = new Fighter("enemy0", "enemy", enemyHero, this.map.enemySpawns[0]);
      this.scene.add(foe.group);
      this.fighters.push(foe);
    } else {
      const allyBots: HeroId[] =
        hero === "nova"
          ? ["soldier76", "widowmaker", "soldier76", "widowmaker"]
          : ["nova", "soldier76", "widowmaker", hero === "soldier76" ? "widowmaker" : "soldier76"];
      allyBots.forEach((id, i) => {
        const f = new Fighter(`ally${i + 1}`, "ally", id, this.map.allySpawns[i + 1]);
        this.scene.add(f.group);
        this.fighters.push(f);
      });
      const enemyBots: HeroId[] = ["nova", "soldier76", "widowmaker", "soldier76", "widowmaker"];
      enemyBots.forEach((id, i) => {
        const f = new Fighter(`enemy${i}`, "enemy", id, this.map.enemySpawns[i]);
        this.scene.add(f.group);
        this.fighters.push(f);
      });
    }
    for (const f of this.fighters) {
      if (f.team !== "enemy" || this.diff.enemyHp === 1) continue;
      f.maxHealth = Math.round(f.maxHealth * this.diff.enemyHp);
      f.health = f.maxHealth;
    }

    this.onResize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.viewCamera.aspect = innerWidth / innerHeight;
      this.viewCamera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    };
    window.addEventListener("resize", this.onResize);

    canvas.addEventListener("click", () => {
      unlockSfx();
      if (!this.ended && !this.paused) this.input.requestLock();
    });
    this.ray.layers.enable(0);
    this.ray.layers.enable(2);
    this.player.outline.visible = false;
    this.hideOwnBody();
    this.buildViewGun(hero);
    this.buildViewField();
    this.buildViewGrapple();

    if (!this.duel && this.map.kind === "push") {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.9, 1.6, 10),
        new THREE.MeshStandardMaterial({ color: 0xc8d0c0, metalness: 0.45, roughness: 0.4 }),
      );
      body.position.y = 0.9;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.08, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xf5c518 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.15;
      this.robot.add(body, ring);
      this.scene.add(this.robot);
      this.initPushPath();
      const start = this.pointOnPush(this.robotProg);
      this.robot.position.set(start.x, 0, start.z);
    }
  }

  start() {
    if (!this.live) return;
    this.clock.start();
    this.input.requestLock();
    const loop = () => {
      if (!this.live) return;
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
    this.live = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.clearGrappleLine();
    this.input.dispose();
    this.renderer.dispose();
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.ended) {
      this.timeLeft -= dt;
      this.tickPlayer(dt);
      this.tickBots(dt);
      this.tickWorld(dt);
      if (!this.duel) {
        if (this.map.kind === "push") this.tickPush(dt);
        else this.tickCapture(dt);
      }
      if (this.timeLeft <= 0) this.finishByTime();
    }

    this.updateCamera(dt);
    this.tickHpReveal(dt);
    this.updateViewHands(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.viewGun.visible || this.viewField.visible || this.viewGrapple.visible) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
    }
    this.pushHud();
    this.input.endFrame();
  }

  private tickPlayer(dt: number) {
    const p = this.player;
    if (!p.alive) {
      this.viewAct = "idle";
      this.viewActT = 0;
      this.fieldArmed = false;
      p.respawn -= dt;
      if (p.respawn <= 0) p.place();
      return;
    }
    p.yaw -= this.input.mouseDX * 0.0022;
    p.pitch -= this.input.mouseDY * 0.0022;
    p.pitch = THREE.MathUtils.clamp(p.pitch, -1.45, 1.45);

    this.controlHero(p, dt, true);
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
    if (f.cloakT > 0) speed *= 1.12;
    if (f.slowT > 0) speed *= 0.45;
    for (const field of this.fields) {
      if (field.kind !== "haste" || field.owner.team !== f.team) continue;
      const hx = f.group.position.x - field.pos.x;
      const hz = f.group.position.z - field.pos.z;
      if (hx * hx + hz * hz < field.radius * field.radius) {
        speed *= 1.5;
        break;
      }
    }

    if (f.grappleT > 0 && f.grappleTo) {
      f.grappleT -= dt;
      f.group.position.lerp(f.grappleTo, 1 - Math.pow(0.001, dt));
      f.vel.set(0, 0, 0);
      if (f.grappleT <= 0) f.grappleTo = null;
    } else {
      const flying = f.flyT > 0;
      if (flying && isPlayer) {
        const flySp = speed * 1.28;
        f.lookDir(this.tmp);
        f.vel.set(0, 0, 0);
        if (this.input.keys.has("KeyW")) f.vel.addScaledVector(this.tmp, flySp);
        if (this.input.keys.has("KeyS")) f.vel.addScaledVector(this.tmp, -flySp);
        const rx = Math.cos(f.yaw);
        const rz = -Math.sin(f.yaw);
        if (this.input.keys.has("KeyD")) {
          f.vel.x += rx * flySp;
          f.vel.z += rz * flySp;
        }
        if (this.input.keys.has("KeyA")) {
          f.vel.x -= rx * flySp;
          f.vel.z -= rz * flySp;
        }
        if (this.input.keys.has("Space")) f.vel.y += flySp;
        if (this.input.keys.has("ControlLeft") || this.input.keys.has("ControlRight")) f.vel.y -= flySp;
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
        if (flying) {
          f.vel.y = THREE.MathUtils.clamp((3.8 - f.group.position.y) * 2.4, -5, 6);
        } else if (isPlayer && this.input.keys.has("Space") && f.grounded) {
          f.vel.y = 8.2;
          f.grounded = false;
        }
      }
      f.grounded = resolveMove(f.group.position, f.vel, f.radius, f.height, this.colliders, dt, this.map.bound, !flying);
      if (flying) {
        f.group.position.y = THREE.MathUtils.clamp(f.group.position.y, 0, 11);
        if (f.group.position.y <= 0) {
          f.group.position.y = 0;
          f.vel.y = Math.max(0, f.vel.y);
          f.grounded = true;
        }
      }
    }

    f.group.rotation.y = f.yaw;

    if (soldier) this.tickSoldier(f, dt, isPlayer);
    else if (f.heroId === "widowmaker") this.tickWidow(f, dt, isPlayer);
    else this.tickNova(f, dt, isPlayer);
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
    f.slowT = Math.max(0, f.slowT - dt);
    f.cloakT = Math.max(0, f.cloakT - dt);
    f.flyT = Math.max(0, f.flyT - dt);
    f.burstGap = Math.max(0, f.burstGap - dt);
    this.applyCloak(f);
    if (f.reload > 0) {
      f.reload -= dt;
      if (f.reload <= 0) f.ammo = f.maxAmmo;
    }
    if (f.poisonT > 0) {
      f.poisonT -= dt;
      this.hurt(f, 12 * dt, f, false);
    }
    for (const field of this.fields) {
      if (field.owner.team !== f.team || field.healRate <= 0) continue;
      const dx = f.group.position.x - field.pos.x;
      const dz = f.group.position.z - field.pos.z;
      if (dx * dx + dz * dz < field.radius * field.radius) {
        f.health = Math.min(f.maxHealth, f.health + field.healRate * dt);
      }
    }
  }

  private tickSoldier(f: Fighter, _dt: number, isPlayer: boolean) {
    if (isPlayer && this.viewAct !== "idle") return;
    if (isPlayer && this.input.keys.has("KeyR") && f.reload <= 0 && f.ammo < f.maxAmmo) {
      this.beginReload(f, 1.5);
    }
    if (isPlayer && this.input.rmbDown && f.helixCd <= 0) this.fireHelix(f);
    if (isPlayer && this.input.keys.has("KeyE") && f.fieldCd <= 0) this.dropField(f);
    if (isPlayer && this.input.keys.has("KeyQ") && f.ult >= 100) {
      f.ult = 0;
      f.visorT = 6;
      sfx.ult();
    }
    if (f.visorT > 0 && isPlayer) this.assistAim(f);

    const shoot = isPlayer
      ? (this.input.lmb || f.visorT > 0) && !f.sprinting
      : f.fireCd <= 0 && Math.random() < this.bot(f).fireGate;
    if (shoot) this.firePulse(f);
  }

  private tickWidow(f: Fighter, dt: number, isPlayer: boolean) {
    if (isPlayer && this.viewAct !== "idle") return;
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
      sfx.ult();
    }
    if (isPlayer && this.input.keys.has("KeyR") && f.reload <= 0 && f.ammo < f.maxAmmo) this.beginReload(f, 1.4);

    if (isPlayer) {
      if (f.scoped && this.input.lmbDown) this.fireWidow(f);
      else if (!f.scoped && this.input.lmb) this.fireWidow(f);
    }
  }

  private firePulse(f: Fighter) {
    if (f.fireCd > 0 || f.reload > 0) return;
    if (f.ammo <= 0) {
      this.beginReload(f, 1.5);
      return;
    }
    f.ammo -= 1;
    const botMul = f === this.player ? 1 : this.bot(f).fire;
    f.fireCd = (f.visorT > 0 ? 0.09 : 0.11) / botMul;
    const spread = (f.visorT > 0 && f === this.player ? 0 : 0.018) + (f === this.player ? 0 : this.bot(f).spread);
    this.hitscan(f, 19, 1, spread, 55);
    this.kickView(f, 0.048);
    if (f === this.player) sfx.fire("pulse");
  }

  private fireWidow(f: Fighter) {
    if (f.fireCd > 0 || f.reload > 0) return;
    if (f.ammo <= 0) {
      this.beginReload(f, 1.4);
      return;
    }
    f.ammo -= 1;
    const extra = f === this.player ? 0 : this.bot(f).spread;
    if (f.scoped) {
      f.fireCd = 0.55 / (f === this.player ? 1 : this.bot(f).fire);
      const dmg = 12 + 108 * f.charge;
      this.hitscan(f, dmg, 2.5, 0.02 + extra * 0.6, 80);
      f.charge = 0;
      this.kickView(f, 0.1);
    } else {
      f.fireCd = 0.12 / (f === this.player ? 1 : this.bot(f).fire);
      this.hitscan(f, 13, 1, 0.03 + extra, 40);
      this.kickView(f, 0.055);
    }
    if (f === this.player) sfx.fire("sniper");
  }

  private tickNova(f: Fighter, _dt: number, isPlayer: boolean) {
    if (isPlayer && this.viewAct !== "idle") return;
    if (isPlayer && this.input.keys.has("KeyR") && f.reload <= 0 && f.ammo < f.maxAmmo) {
      this.beginReload(f, 1.45);
    }
    if (f.reload > 0) return;
    if (isPlayer && (this.input.keys.has("ShiftLeft") || this.input.keys.has("ShiftRight")) && f.fieldCd <= 0) {
      f.fieldCd = 10;
      f.flyT = 4;
    }
    if (f.flyT > 0 && ((isPlayer && this.input.keys.has("KeyE")) || !isPlayer) && f.mineCd <= 0) {
      this.spawnHastePad(f);
    }
    if (isPlayer && this.input.keys.has("KeyQ") && f.ult >= 100) {
      f.ult = 0;
      this.spawnHealZone(f);
      sfx.ult();
    }
    if (f.burstLeft > 0) {
      this.tickNovaBurst(f);
      return;
    }
    const shoot = isPlayer
      ? this.input.lmbDown
      : f.fireCd <= 0 && Math.random() < this.bot(f).fireGate;
    if (shoot) this.startNovaBurst(f);
  }

  private startNovaBurst(f: Fighter) {
    if (f.fireCd > 0 || f.reload > 0 || f.burstLeft > 0) return;
    if (f.ammo <= 0) {
      this.beginReload(f, 1.45);
      return;
    }
    f.burstLeft = Math.min(10, f.ammo);
    f.burstGap = 0;
    this.fireNovaPellet(f);
  }

  private tickNovaBurst(f: Fighter) {
    if (f.reload > 0) {
      f.burstLeft = 0;
      return;
    }
    if (f.burstGap > 0) return;
    this.fireNovaPellet(f);
  }

  private fireNovaPellet(f: Fighter) {
    if (f.reload > 0 || f.ammo <= 0) {
      f.burstLeft = 0;
      if (f.ammo <= 0) this.beginReload(f, 1.45);
      return;
    }
    f.ammo -= 1;
    f.burstLeft = Math.max(0, f.burstLeft - 1);
    f.burstGap = 0.042;
    if (f.burstLeft <= 0) {
      const botMul = f === this.player ? 1 : this.bot(f).fire;
      f.fireCd = (f === this.player ? 0.2 : 0.55) / botMul;
    }
    const spread = (f === this.player ? 0.016 : 0.03) + (f === this.player ? 0 : this.bot(f).spread);
    this.hitscan(f, 8, 1.7, spread, 42);
    this.kickView(f, 0.036);
    if (f === this.player) sfx.fire("burst");
  }

  private applyCloak(f: Fighter) {
    const cloaked = f.cloakT > 0 && f.alive;
    const allySee = f.team === this.player.team;
    f.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o === f.outline) {
        o.visible = !cloaked && f !== this.player && f.alive;
        return;
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
        if (!("opacity" in mat)) continue;
        mat.transparent = cloaked;
        mat.opacity = cloaked ? (allySee ? 0.28 : 0.04) : 1;
        mat.depthWrite = !cloaked;
      }
    });
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
    this.hurt(target, dealt, f, true, part === "head");
    if (f === this.player) this.flashHit(dealt, part === "head", first.point);
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
    if (f === this.player) sfx.fire("helix");
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
    if (f === this.player) {
      this.viewAct = "field";
      this.viewActT = 0;
      this.fieldArmed = true;
      return;
    }
    this.spawnField(f);
  }

  private spawnField(f: Fighter) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.08, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7bed9f, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    const pack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0x6ee7a8, emissive: 0x2ecc71, emissiveIntensity: 0.45 }),
    );
    pack.position.y = 0.16;
    mesh.add(pack);
    const pos = f.group.position.clone();
    pos.y += 0.05;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.fields.push({ mesh, pos, owner: f, life: 5, kind: "heal", radius: 4, healRate: 40 });
  }

  private spawnHastePad(f: Fighter) {
    f.mineCd = 10;
    const radius = 4;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.08, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.92, 28),
      new THREE.MeshBasicMaterial({ color: 0x2ec4b6, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    mesh.add(disc);
    const pos = f.group.position.clone();
    pos.y = 0.06;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.fields.push({ mesh, pos, owner: f, life: 8, kind: "haste", radius, healRate: 16 });
  }

  private spawnHealZone(f: Fighter) {
    const radius = 5.5;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.1, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.94, 32),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    mesh.add(disc);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.28, 10),
      new THREE.MeshStandardMaterial({ color: 0x6ee7a8, emissive: 0x22c55e, emissiveIntensity: 0.55 }),
    );
    core.position.y = 0.18;
    mesh.add(core);
    const pos = f.group.position.clone();
    pos.y = 0.06;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.fields.push({ mesh, pos, owner: f, life: 15, kind: "heal", radius, healRate: 38 });
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
    if (f === this.player) {
      this.viewAct = "grapple";
      this.viewActT = 0;
    }
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
      if (f === this.player) {
        f.outline.visible = false;
        continue;
      }
      const mat = f.outline.material as THREE.MeshBasicMaterial;
      const infra = this.player.alive && this.player.infraT > 0 && f.team === "enemy" && f.alive;
      if (infra) {
        f.outline.visible = true;
        mat.depthTest = false;
        mat.depthWrite = false;
        mat.color.setHex(0xff6b8a);
        f.outline.renderOrder = 24;
      } else {
        mat.depthTest = true;
        mat.depthWrite = false;
        mat.color.setHex(f.team === "ally" ? 0x3d9eff : 0xff3b5c);
        f.outline.renderOrder = 9;
        f.outline.visible = f.alive && f.cloakT <= 0;
      }
    }
  }

  private explode(at: THREE.Vector3, owner: Fighter, dmg: number, radius: number) {
    if (owner === this.player) sfx.boom();
    for (const f of this.fighters) {
      if (!f.alive || f.team === owner.team) continue;
      const d = f.group.position.distanceTo(at);
      if (d < radius) {
        const dealt = dmg * (1 - d / radius);
        this.hurt(f, dealt, owner, true);
        if (owner === this.player) this.flashHit(dealt, false, f.group.position);
      }
    }
  }

  private flashHit(dmg: number, head: boolean, at: THREE.Vector3) {
    sfx.hit(head);
    this.tmp.copy(at);
    this.tmp.project(this.camera);
    this.onHit({
      dmg: Math.max(1, Math.round(dmg)),
      head,
      x: (this.tmp.x * 0.5 + 0.5) * innerWidth,
      y: (-this.tmp.y * 0.5 + 0.5) * innerHeight,
    });
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

  private hurt(target: Fighter, amount: number, src: Fighter, credit: boolean, headshot = false) {
    if (!target.alive || amount <= 0) return;
    if (src.team === "enemy" && src !== target) amount *= this.diff.enemyDmg;
    target.health -= amount;
    target.cloakT = 0;
    if (credit && src.team !== target.team) {
      src.ult = Math.min(100, src.ult + amount * 0.12 * (src.team === "enemy" ? this.diff.enemyUltGain : 1));
      target.hits.push({ id: src.id, team: src.team, t: performance.now() });
    }
    if (src === this.player && target.team === "enemy") this.hpReveal.set(target.id, 5);
    if (target.health <= 0) {
      target.health = 0;
      target.alive = false;
      target.group.visible = false;
      target.respawn = this.spawnWait(target);
      target.scoped = false;
      target.deaths += 1;
      if (credit) {
        src.kills += 1;
        src.ult = Math.min(100, src.ult + 20 * (src.team === "enemy" ? this.diff.enemyUltGain : 1));
        const now = performance.now();
        const helped = new Set<string>();
        for (const h of target.hits) {
          if (now - h.t > 4000 || h.team !== src.team || h.id === src.id) continue;
          helped.add(h.id);
        }
        for (const id of helped) {
          const pal = this.fighters.find((x) => x.id === id);
          if (pal) pal.assists += 1;
        }
        this.feed.push({
          t: 4,
          text: `${heroById(src.heroId).name}  →  ${heroById(target.heroId).name}`,
        });
        if (src === this.player) {
          sfx.kill();
          this.onKill(headshot);
        }
        if (this.duel && src.kills >= DUEL_KILLS) {
          this.endMatch(src === this.player ? "win" : "lose");
        }
      }
      target.hits = [];
    }
  }

  // The weapon gets its own scene and a narrower lens. Sharing the 80-degree
  // world camera stretches anything this close into a wall of geometry, and a
  // separate depth-cleared pass also stops the gun poking through cover.
  private buildViewGun(hero: HeroId) {
    this.viewCamera.position.set(0, 0, 0);
    this.viewScene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xfff2d8, 1.25);
    key.position.set(-0.6, 1, 0.8);
    this.viewScene.add(key);
    this.shapeViewGun(hero);
    // Angled across the lower right so the barrel reads as a length rather than
    // a block pointed straight at the lens.
    this.viewGun.scale.setScalar(0.62);
    this.viewGun.position.set(0.27, -0.25, -0.7);
    this.viewGun.rotation.set(0.05, 0.2, 0.04);
    this.viewScene.add(this.viewGun);
  }

  private shapeViewGun(hero: HeroId) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.45, metalness: 0.5, fog: false });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f242e, roughness: 0.6, fog: false });
    const glove = new THREE.MeshStandardMaterial({
      color: hero === "widowmaker" ? 0x6a3a58 : hero === "nova" ? 0x2a3a40 : 0xb08968,
      roughness: 0.78,
      fog: false,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: hero === "widowmaker" ? 0x9c4a92 : hero === "nova" ? 0x4ecdc4 : 0xd8ae34,
      emissive: hero === "widowmaker" ? 0x5a2050 : hero === "nova" ? 0x1a5a55 : 0x6a5410,
      emissiveIntensity: 0.6,
      fog: false,
    });

    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      this.viewGun.add(m);
      return m;
    };

    const receiver = hero === "widowmaker" ? 0.42 : 0.4;
    box(0.09, 0.13, receiver, dark, 0, 0, 0.06);
    box(0.075, 0.1, 0.16, dark, 0, -0.02, 0.32);

    if (hero === "widowmaker") {
      box(0.045, 0.045, 0.78, metal, 0, 0.01, -0.62);
      box(0.05, 0.05, 0.28, trim, 0, 0.12, -0.04);
      box(0.02, 0.06, 0.02, metal, 0, 0.09, 0.06);
      box(0.02, 0.06, 0.02, metal, 0, 0.09, -0.14);
      box(0.06, 0.05, 0.12, dark, 0, -0.02, -1.03);
    } else if (hero === "nova") {
      box(0.05, 0.05, 0.48, metal, 0, 0.012, -0.4);
      box(0.055, 0.06, 0.22, trim, 0, 0.08, -0.04);
      box(0.07, 0.2, 0.14, dark, 0, -0.16, 0.04);
      box(0.04, 0.04, 0.1, dark, 0, 0.01, -0.68);
    } else {
      box(0.06, 0.06, 0.42, metal, 0, 0.012, -0.42);
      box(0.08, 0.08, 0.08, dark, 0, 0.012, -0.66);
      box(0.075, 0.03, 0.34, trim, 0, 0.08, -0.02);
      box(0.062, 0.2, 0.12, dark, 0, -0.15, 0.02);
    }

    box(0.06, 0.15, 0.08, dark, 0, -0.13, 0.22).rotation.x = -0.22;

    const grip = this.makeHand(glove, 1);
    grip.position.set(-0.02, -0.16, 0.2);
    grip.rotation.set(0.62, 0.22, 0.2);
    this.viewGun.add(grip);
    this.viewGrip = grip;

    const support = this.makeHand(glove, -1);
    support.position.set(-0.02, -0.075, -0.36);
    support.rotation.set(0.28, 0.1, -0.16);
    this.viewGun.add(support);
    this.viewSupport = support;

    this.viewGun.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  private makeHand(glove: THREE.Material, side: 1 | -1) {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.1, 0.12), glove);
    palm.position.set(side * 0.012, 0, 0);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.078, 0.14), glove);
    wrist.position.set(side * 0.012, -0.03, 0.11);
    wrist.rotation.x = 0.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.32), glove);
    arm.position.set(side * 0.02, -0.08, 0.28);
    arm.rotation.x = 0.35;
    g.add(palm, wrist, arm);
    for (let i = 0; i < 4; i++) {
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.024, 0.05), glove);
      knuckle.position.set(side * 0.014, 0.036 - i * 0.026, -0.078);
      knuckle.rotation.x = 1.05;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.04), glove);
      tip.position.set(side * 0.014, 0.008 - i * 0.026, -0.112);
      tip.rotation.x = 1.4;
      g.add(knuckle, tip);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.026, 0.058), glove);
    thumb.position.set(side * -0.048, 0.02, -0.018);
    thumb.rotation.set(0.4, side * 0.75, side * 0.28);
    g.add(thumb);
    return g;
  }

  private buildViewField() {
    const green = new THREE.MeshStandardMaterial({
      color: 0x7bed9f,
      emissive: 0x2ecc71,
      emissiveIntensity: 0.55,
      fog: false,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2a22, roughness: 0.55, fog: false });
    const glove = new THREE.MeshStandardMaterial({ color: 0xb08968, roughness: 0.78, fog: false });
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 10), green);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 10), dark);
    lid.position.y = 0.09;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 14), dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.06;
    const left = this.makeHand(glove, -1);
    left.position.set(-0.07, -0.02, 0.02);
    left.rotation.set(0.2, 0.4, 0.3);
    const right = this.makeHand(glove, 1);
    right.position.set(0.07, -0.02, 0.04);
    right.rotation.set(0.25, -0.35, -0.25);
    this.viewField.add(can, lid, ring, left, right);
    this.viewField.scale.setScalar(0.42);
    this.viewField.visible = false;
    this.viewField.traverse((o) => {
      o.frustumCulled = false;
    });
    this.viewScene.add(this.viewField);
  }

  private buildViewGrapple() {
    const glove = new THREE.MeshStandardMaterial({ color: 0x3a2038, roughness: 0.75, fog: false });
    const trim = new THREE.MeshStandardMaterial({
      color: 0x9c4a92,
      emissive: 0x5a2050,
      emissiveIntensity: 0.55,
      fog: false,
    });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.34), glove);
    arm.position.set(0, 0, 0.22);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.06, 0.08), glove);
    wrist.position.set(0, 0.01, 0.02);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.1), glove);
    palm.position.set(0, 0.02, -0.06);
    const web = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.07, 6), trim);
    web.rotation.x = Math.PI / 2;
    web.position.set(0, 0.01, -0.12);
    const hook = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), trim);
    hook.rotation.x = -Math.PI / 2;
    hook.position.set(0, 0.01, -0.17);
    const hand = this.makeHand(glove, -1);
    hand.position.set(-0.01, -0.01, -0.02);
    hand.rotation.set(1.1, 0.15, -0.35);
    this.viewGrapple.add(arm, wrist, palm, web, hook, hand);
    this.viewGrapple.scale.setScalar(0.62);
    this.viewGrapple.visible = false;
    this.viewGrapple.traverse((o) => {
      o.frustumCulled = false;
    });
    this.viewScene.add(this.viewGrapple);
  }

  private restHands() {
    if (this.viewGrip) {
      this.viewGrip.position.set(-0.02, -0.16, 0.2);
      this.viewGrip.rotation.set(0.62, 0.22, 0.2);
    }
    if (this.viewSupport) {
      this.viewSupport.position.set(-0.02, -0.075, -0.36);
      this.viewSupport.rotation.set(0.28, 0.1, -0.16);
    }
  }

  private restGun() {
    this.restHands();
    this.viewGun.scale.setScalar(0.62);
    const kick = this.viewKick;
    this.viewGun.position.set(0.27, -0.25 + kick * 0.28, -0.7 + kick * 0.12);
    this.viewGun.rotation.set(0.05 + kick, 0.2, 0.04 - kick * 0.08);
  }

  private kickView(f: Fighter, amount: number) {
    if (f !== this.player) return;
    this.viewKick = Math.min(0.24, this.viewKick + amount);
  }

  private beginReload(f: Fighter, duration: number) {
    if (f.reload > 0) return;
    f.reload = duration;
    f.burstLeft = 0;
    if (f === this.player && this.viewAct === "idle") {
      this.viewAct = "reload";
      this.viewActT = 0;
    }
  }

  private updateViewHands(dt: number) {
    const p = this.player;
    this.viewKick *= Math.max(0, 1 - dt * 9);
    const scoped = p.alive && p.heroId === "widowmaker" && p.scoped;
    if (!p.alive || (scoped && this.viewAct !== "grapple")) {
      this.viewGun.visible = false;
      this.viewField.visible = false;
      this.viewGrapple.visible = false;
      if (!p.alive) {
        this.clearGrappleLine();
        this.viewAct = "idle";
        this.viewKick = 0;
      }
      return;
    }

    if (this.viewAct === "field") {
      this.viewActT += dt;
      this.poseField();
      if (this.viewActT >= 0.82) {
        this.viewAct = "idle";
        this.viewActT = 0;
      }
    } else if (this.viewAct === "grapple") {
      this.viewActT += dt;
      this.poseGrapple();
      if (this.viewActT >= 0.52) {
        this.viewAct = "idle";
        this.viewActT = 0;
      }
    } else if (this.viewAct === "reload") {
      this.viewActT += dt;
      this.poseReload();
      if (p.reload <= 0) {
        this.viewAct = "idle";
        this.viewActT = 0;
        this.restGun();
      }
    } else {
      this.viewGun.visible = true;
      this.viewField.visible = false;
      this.viewGrapple.visible = false;
      this.restGun();
    }

    this.updateGrappleLine();
  }

  private poseField() {
    const t = this.viewActT;
    const gunOut = t < 0.16 || t > 0.64;
    this.viewGun.visible = gunOut;
    this.viewField.visible = t >= 0.08 && t <= 0.64;
    this.viewGrapple.visible = false;
    if (t < 0.16) {
      const k = t / 0.16;
      this.viewGun.position.set(0.27, -0.25 - k * 0.45, -0.7);
      this.viewGun.rotation.set(0.05 + k * 0.7, 0.2, 0.04);
    } else {
      this.restGun();
    }
    if (this.viewField.visible) {
      const u = THREE.MathUtils.clamp((t - 0.1) / 0.46, 0, 1);
      this.viewField.position.set(0.1, -0.1 - u * 0.42, -0.42);
      this.viewField.rotation.set(0.2 + u * 0.95, 0.08, 0);
    }
    if (t >= 0.44 && this.fieldArmed) {
      this.fieldArmed = false;
      this.spawnField(this.player);
    }
  }

  private poseGrapple() {
    const t = this.viewActT;
    this.viewGrapple.visible = true;
    this.viewField.visible = false;
    this.viewGun.visible = t < 0.06 || t > 0.42;
    if (this.viewGun.visible) this.restGun();
    const punch = t < 0.1 ? t / 0.1 : Math.max(0, 1 - (t - 0.1) / 0.28);
    this.viewGrapple.position.set(-0.3 + punch * 0.14, -0.24 + punch * 0.22, -0.22 - punch * 0.5);
    this.viewGrapple.rotation.set(-1.05 * punch, 0.45, -0.55);
  }

  private poseReload() {
    const p = this.player;
    const dur = this.viewActT + Math.max(0, p.reload);
    const t = dur > 0.001 ? THREE.MathUtils.clamp(this.viewActT / dur, 0, 1) : 1;
    this.viewGun.visible = true;
    this.viewField.visible = false;
    this.viewGrapple.visible = false;
    this.viewGun.scale.setScalar(0.62);

    let gunY = -0.25;
    let gunRx = 0.05;
    let gunRz = 0.04;
    let supportX = -0.02;
    let supportY = -0.075;
    let supportZ = -0.36;
    let supportRx = 0.28;
    let gripZ = 0.2;
    let gripRx = 0.62;

    if (t < 0.22) {
      const k = t / 0.22;
      gunY = -0.25 - k * 0.14;
      gunRx = 0.05 + k * 0.58;
      gunRz = 0.04 + k * 0.28;
      supportY = -0.075 - k * 0.2;
      supportRx = 0.28 + k * 0.7;
      gripRx = 0.62 + k * 0.28;
    } else if (t < 0.52) {
      const k = (t - 0.22) / 0.3;
      gunY = -0.39;
      gunRx = 0.63;
      gunRz = 0.32;
      supportX = -0.02 - k * 0.1;
      supportY = -0.275 - Math.sin(k * Math.PI) * 0.16;
      supportZ = -0.36 + k * 0.14;
      supportRx = 0.98 + k * 0.45;
      gripRx = 0.9;
    } else if (t < 0.74) {
      const k = (t - 0.52) / 0.22;
      gunY = -0.39 + k * 0.08;
      gunRx = 0.63 - k * 0.18;
      gunRz = 0.32 - k * 0.12;
      supportX = -0.12 + k * 0.1;
      supportY = -0.275 + k * 0.2;
      supportZ = -0.22 - k * 0.14;
      supportRx = 1.43 - k * 1.15;
      gripRx = 0.9 - k * 0.18;
    } else {
      const k = (t - 0.74) / 0.26;
      const rack = Math.sin(k * Math.PI);
      gunY = -0.31 + k * 0.06;
      gunRx = 0.45 - k * 0.4 + rack * 0.14;
      gunRz = 0.2 * (1 - k);
      supportY = -0.075;
      supportX = -0.02;
      supportZ = -0.36;
      supportRx = 0.28;
      gripRx = 0.62;
      gripZ = 0.2 - rack * 0.06;
    }

    this.viewGun.position.set(0.27, gunY, -0.7);
    this.viewGun.rotation.set(gunRx, 0.2, gunRz);
    if (this.viewSupport) {
      this.viewSupport.position.set(supportX, supportY, supportZ);
      this.viewSupport.rotation.set(supportRx, 0.1 + (t < 0.52 ? 0.25 : 0), -0.16);
    }
    if (this.viewGrip) {
      this.viewGrip.position.set(-0.02, -0.16, gripZ);
      this.viewGrip.rotation.set(gripRx, 0.22, 0.2);
    }
  }

  private updateGrappleLine() {
    const p = this.player;
    if (!p.grappleTo || p.grappleT <= 0) {
      this.clearGrappleLine();
      return;
    }
    p.eye(this.tmp);
    this.tmp.addScaledVector(this.camera.getWorldDirection(this.tmp2), 0.28);
    this.tmp.x -= Math.cos(p.yaw) * 0.22;
    this.tmp.y -= 0.14;
    this.tmp.z += Math.sin(p.yaw) * 0.22;
    if (!this.grappleLine) {
      const g = new THREE.BufferGeometry().setFromPoints([this.tmp, p.grappleTo]);
      this.grappleLine = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({ color: 0xc77db8, transparent: true, opacity: 0.85 }),
      );
      this.scene.add(this.grappleLine);
    } else {
      const pos = this.grappleLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      pos.setXYZ(0, this.tmp.x, this.tmp.y, this.tmp.z);
      pos.setXYZ(1, p.grappleTo.x, p.grappleTo.y, p.grappleTo.z);
      pos.needsUpdate = true;
    }
  }

  private clearGrappleLine() {
    if (!this.grappleLine) return;
    this.scene.remove(this.grappleLine);
    this.grappleLine.geometry.dispose();
    this.grappleLine = null;
  }

  private tickHpReveal(dt: number) {
    for (const [id, left] of this.hpReveal) {
      const next = left - dt;
      if (next <= 0) this.hpReveal.delete(id);
      else this.hpReveal.set(id, next);
    }
  }

  private collectHpBars() {
    const bars: HudSnap["hpBars"] = [];
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f === this.player) continue;
      if (f.cloakT > 0 && f.team === "enemy" && (this.hpReveal.get(f.id) ?? 0) <= 0 && this.player.infraT <= 0) continue;
      const enemy = f.team === "enemy";
      if (enemy && (this.hpReveal.get(f.id) ?? 0) <= 0 && this.player.infraT <= 0) continue;
      this.tmp.set(f.group.position.x, f.group.position.y + f.height + 0.32, f.group.position.z);
      this.tmp.project(this.camera);
      if (this.tmp.z < -1 || this.tmp.z > 1 || this.tmp.x < -1.15 || this.tmp.x > 1.15) continue;
      bars.push({
        id: f.id,
        x: (this.tmp.x * 0.5 + 0.5) * innerWidth,
        y: (-this.tmp.y * 0.5 + 0.5) * innerHeight,
        health: Math.max(0, f.health),
        maxHealth: f.maxHealth,
        ally: f.team === "ally",
      });
    }
    return bars;
  }

  // Your own body lives on layer 2, which the camera never renders but rays
  // still test, so you stay a valid target without blocking your own view.
  private hideOwnBody() {
    this.player.group.traverse((o) => o.layers.set(2));
    this.camera.layers.set(0);
    this.ray.layers.enable(0);
    this.ray.layers.enable(2);
  }

  private nearestFoe(f: Fighter): Fighter | null {
    let best: Fighter | null = null;
    let bestD = 1e9;
    for (const o of this.fighters) {
      if (!o.alive || o.team === f.team) continue;
      if (o.cloakT > 0 && o.group.position.distanceTo(f.group.position) > 3.2) continue;
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
      } else if (f.heroId === "nova") {
        if (f.fieldCd <= 0 && foe && f.group.position.distanceTo(foe.group.position) < 16 && Math.random() < 0.08) {
          f.fieldCd = 10;
          f.flyT = 4;
        }
        if (f.ult >= 100 && (f.team === "ally" || this.diff.enemyUlt)) {
          const need = this.fighters.some((x) => x.team === f.team && x.alive && x.health < x.maxHealth * 0.75);
          if (need || foe) {
            f.ult = 0;
            this.spawnHealZone(f);
          }
        }
      } else if (foe) {
        const d = f.group.position.distanceTo(foe.group.position);
        if (this.duel) {
          f.scoped = d > 8 && this.canSee(f, foe);
          if (f.fireCd <= 0 && this.canSee(f, foe) && Math.random() < this.bot(f).fireGate) {
            this.lookAt(f, foe);
            this.fireWidow(f);
          }
          if (f.ult >= 100 && this.diff.enemyUlt) {
            f.ult = 0;
            f.infraT = 12;
          }
        } else {
          const onCap = onPoint(f.group.position.x, f.group.position.z, this.map.captureR);
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
    if (this.duel) {
      if (foe) {
        this.setBotMove(f, foe.group.position.x, foe.group.position.z, 1.35);
        f.sprinting = f.heroId === "soldier76";
        if (this.canSee(f, foe)) this.lookAt(f, foe);
        else this.faceToward(f, foe.group.position);
      }
      return;
    }
    if (this.map.kind === "push") {
      const rx = this.robot.position.x;
      const rz = this.robot.position.z;
      this.setBotMove(f, rx, rz, 1.55);
      f.sprinting = true;
      if (foe && this.canSee(f, foe)) this.lookAt(f, foe);
      else this.faceToward(f, this.tmp.set(rx, 0, rz));
      return;
    }
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
    if (b.cloakT > 0 && a.group.position.distanceTo(b.group.position) > 3.2) return false;
    a.eye(this.tmp);
    b.eye(this.tmp2);
    const dist = this.tmp.distanceTo(this.tmp2);
    const dir = this.tmp2.clone().sub(this.tmp).normalize();
    this.ray.set(this.tmp, dir);
    const walls = this.ray.intersectObjects(this.worldHits, false);
    return !walls.length || walls[0].distance > dist - 0.4;
  }

  private spawnWait(f: Fighter) {
    if (f === this.player) return this.diff.playerRespawn;
    if (f.team === "enemy") return this.diff.enemyRespawn;
    return this.diff.allyRespawn;
  }

  private bot(f: Fighter) {
    const enemy = f.team === "enemy";
    return {
      spread: enemy ? this.diff.enemySpread : this.diff.allySpread,
      hit: enemy ? this.diff.enemyHit : this.diff.allyHit,
      fire: enemy ? this.diff.enemyFire : this.diff.allyFire,
      jitter: enemy ? this.diff.enemyJitter : this.diff.allyJitter,
      fireGate: enemy ? this.diff.enemyFireGate : this.diff.allyFireGate,
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

  private initPushPath() {
    this.pushCum = [0];
    this.pushLen = 0;
    for (let i = 1; i < PUSH_PATH.length; i++) {
      const a = PUSH_PATH[i - 1];
      const b = PUSH_PATH[i];
      this.pushLen += Math.hypot(b.x - a.x, b.z - a.z);
      this.pushCum.push(this.pushLen);
    }
  }

  private pointOnPush(prog: number) {
    const dist = THREE.MathUtils.clamp(prog, 0, 1) * this.pushLen;
    let i = 1;
    while (i < this.pushCum.length && this.pushCum[i] < dist) i += 1;
    const a = PUSH_PATH[i - 1];
    const b = PUSH_PATH[Math.min(i, PUSH_PATH.length - 1)];
    const d0 = this.pushCum[i - 1];
    const d1 = this.pushCum[Math.min(i, this.pushCum.length - 1)];
    const t = (dist - d0) / Math.max(0.001, d1 - d0);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }

  private tickPush(dt: number) {
    let ally = 0;
    let enemy = 0;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const dx = f.group.position.x - this.robot.position.x;
      const dz = f.group.position.z - this.robot.position.z;
      if (dx * dx + dz * dz > PUSH_RADIUS * PUSH_RADIUS) continue;
      if (f.team === "ally") ally += 1;
      else enemy += 1;
    }
    if (ally > 0 && enemy === 0) this.robotProg += (dt * 0.48 * Math.min(ally, 3)) / Math.max(1, this.pushLen);
    else if (enemy > 0 && ally === 0) this.robotProg -= (dt * 0.48 * Math.min(enemy, 3)) / Math.max(1, this.pushLen);
    this.robotProg = THREE.MathUtils.clamp(this.robotProg, 0, 1);
    const at = this.pointOnPush(this.robotProg);
    this.robot.position.set(at.x, 0, at.z);
    this.allyCap = this.robotProg * 100;
    this.enemyCap = (1 - this.robotProg) * 100;
    if (this.robotProg >= 0.995) this.endMatch("win");
    else if (this.robotProg <= 0.005) this.endMatch("lose");
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
      if (ally > 0) this.allyCap = Math.min(CAPTURE_GOAL, this.allyCap + dt * 1.04 * Math.min(ally, 3));
      if (enemy > 0) this.enemyCap = Math.min(CAPTURE_GOAL, this.enemyCap + dt * 1.04 * Math.min(enemy, 3));
    }
    if (this.allyCap >= CAPTURE_GOAL) this.endMatch("win");
    else if (this.enemyCap >= CAPTURE_GOAL) this.endMatch("lose");
  }

  private finishByTime() {
    if (this.duel) {
      const foe = this.fighters.find((f) => f.team === "enemy");
      const ek = foe?.kills ?? 0;
      if (this.player.kills > ek) this.endMatch("win");
      else if (this.player.kills < ek) this.endMatch("lose");
      else this.endMatch("draw");
      return;
    }
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
    const fov = scoped ? 28 : 80;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();

    // Euler YXZ with rotation.x = +pitch reproduces Fighter.lookDir exactly,
    // so screen center and the hitscan ray always agree.
    this.camera.rotation.set(p.pitch, p.yaw, 0);
    p.eye(this.tmp);
    this.camera.position.copy(this.tmp);

  }

  private pushHud() {
    this.feed = this.feed.filter((x) => {
      x.t -= 0.016;
      return x.t > 0;
    });
    let ally = 0;
    let enemy = 0;
    if (!this.duel) {
      for (const f of this.fighters) {
        if (!f.alive) continue;
        if (this.map.kind === "push") {
          const dx = f.group.position.x - this.robot.position.x;
          const dz = f.group.position.z - this.robot.position.z;
          if (dx * dx + dz * dz > PUSH_RADIUS * PUSH_RADIUS) continue;
        } else if (!onPoint(f.group.position.x, f.group.position.z, this.map.captureR)) continue;
        if (f.team === "ally") ally += 1;
        else enemy += 1;
      }
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
      sprint: p.sprinting,
      fly: p.flyT > 0,
      hero: p.heroId,
      obj: this.duel
        ? `1v1 · ${DUEL_KILLS}킬 선승`
        : this.map.kind === "push"
          ? ally && enemy
            ? "로봇 경합"
            : ally
              ? "미는 중"
              : enemy
                ? "적이 미는 중"
                : "로봇으로"
          : ally && enemy
            ? "경합"
            : ally
              ? "점령 중"
              : enemy
                ? "적 점령"
                : "거점으로",
      allyCap: this.duel ? (p.kills / DUEL_KILLS) * 100 : this.allyCap,
      enemyCap: this.duel ? ((this.fighters.find((f) => f.team === "enemy")?.kills ?? 0) / DUEL_KILLS) * 100 : this.enemyCap,
      time: Math.max(0, this.timeLeft),
      contested: ally > 0 && enemy > 0,
      hint: p.alive
        ? this.input.locked
          ? ""
          : "클릭해서 조준 잠금"
        : `${p.respawn.toFixed(1)}초 후 리스폰`,
      crosshairHot: hot,
      feed: this.feed.map((x) => x.text),
      hpBars: this.collectHpBars(),
      aliveAlly,
      aliveEnemy,
      mode: this.map.kind,
      k: p.kills,
      d: p.deaths,
      a: p.assists,
      duel: this.duel,
      enemyKills: this.fighters.find((f) => f.team === "enemy")?.kills ?? 0,
    });
  }
}
