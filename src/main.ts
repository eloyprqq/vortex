import "./style.css";
import { HEROES, type HeroId } from "./heroes";
import { createLobbyBackdrop } from "./lobbyBackdrop";
import { Match, type HudSnap } from "./match";

type Screen = "home" | "heroes";

const canvasEl = document.querySelector<HTMLCanvasElement>("#backdrop");
if (!canvasEl) throw new Error("backdrop canvas missing");
const canvas = canvasEl;

let stopLobby = createLobbyBackdrop(canvas);
let match: Match | null = null;
let selected: HeroId = "soldier76";

const screens: Record<Screen, HTMLElement> = {
  home: must("#screen-home"),
  heroes: must("#screen-heroes"),
};

function must<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

function show(name: Screen) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", key !== name);
  }
}

function renderRoster() {
  const rosterEl = must("#roster");
  rosterEl.replaceChildren();
  for (const hero of HEROES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.classList.toggle("active", hero.id === selected);
    const role = document.createElement("span");
    role.className = "role";
    role.textContent = hero.role;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = hero.name;
    const blurb = document.createElement("span");
    blurb.className = "blurb";
    blurb.textContent = hero.blurb;
    btn.append(role, name, blurb);
    btn.addEventListener("click", () => {
      selected = hero.id;
      renderRoster();
    });
    rosterEl.append(btn);
  }
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function paintHud(h: HudSnap) {
  must("#clock").textContent = fmtTime(h.time);
  must("#ally-bar").style.width = `${h.allyCap}%`;
  must("#enemy-bar").style.width = `${h.enemyCap}%`;
  must("#obj-label").textContent = h.obj;
  must("#health-bar").style.setProperty("--hp", `${(h.health / h.maxHealth) * 100}%`);
  must("#health-num").textContent = `${Math.ceil(h.health)} / ${h.maxHealth}`;
  must("#ammo").textContent = h.ammo;
  must("#hint").textContent = h.hint;
  must("#crosshair").classList.toggle("hot", h.crosshairHot);
  must("#scope").classList.toggle("hidden", !h.scoped);
  const feed = must("#killfeed");
  feed.replaceChildren();
  for (const line of h.feed) {
    const p = document.createElement("div");
    p.textContent = line;
    feed.append(p);
  }
  const abils = must("#abils");
  abils.replaceChildren();
  const rows =
    h.hero === "soldier76"
      ? [
          ["헬릭스", h.helix],
          ["생체장", h.field],
          ["궁극기", h.visor ? 0 : (100 - h.ult) / 16.6],
        ]
      : [
          ["갈고리", h.grapple],
          ["지뢰", h.mine],
          ["궁극기", h.infra ? 0 : (100 - h.ult) / 8.3],
        ];
  for (const [label, cd] of rows) {
    const el = document.createElement("div");
    el.className = "abil";
    const ready = Number(cd) <= 0.05;
    if (ready) el.classList.add("ready");
    el.textContent = ready ? String(label) : `${label} ${Number(cd).toFixed(0)}`;
    abils.append(el);
  }
  if (h.sprint) {
    const el = document.createElement("div");
    el.className = "abil ready";
    el.textContent = "질주";
    abils.append(el);
  }
}

function openOverlay(title: string, copy: string, resume: boolean) {
  must("#overlay").classList.remove("hidden");
  must("#overlay-title").textContent = title;
  must("#overlay-copy").textContent = copy;
  must("#btn-resume").classList.toggle("hidden", !resume);
}

function closeOverlay() {
  must("#overlay").classList.add("hidden");
}

function leaveMatch() {
  match?.dispose();
  match = null;
  document.body.classList.remove("playing");
  must("#hud").classList.add("hidden");
  closeOverlay();
  stopLobby = createLobbyBackdrop(canvas);
  show("home");
}

function enterMatch() {
  stopLobby();
  document.body.classList.add("playing");
  must("#hud").classList.remove("hidden");
  closeOverlay();
  match = new Match(canvas, selected);
  match.onHud = paintHud;
  match.onPause = (p) => {
    if (p) openOverlay("일시정지", "거점 100이 먼저인 쪽이 이긴다.", true);
    else closeOverlay();
  };
  match.onEnd = (r) => {
    const title = r === "win" ? "승리" : r === "lose" ? "패배" : "무승부";
    openOverlay(title, "로비로 돌아가 다시 출전할 수 있다.", false);
  };
  match.start();
}

document.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.dataset.go as Screen | undefined;
    if (next) show(next);
  });
});

must("#btn-enter").addEventListener("click", enterMatch);
must("#btn-resume").addEventListener("click", () => match?.setPaused(false));
must("#btn-lobby").addEventListener("click", leaveMatch);

renderRoster();
show("home");
