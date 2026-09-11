import "./style.css";
import { DIFFICULTIES, type DifficultyId } from "./difficulty";
import { HEROES, type HeroId } from "./heroes";
import { createLobbyBackdrop } from "./lobbyBackdrop";
import { MAPS, mapById, type MapId } from "./maps";
import { Match, type HudSnap } from "./match";

type Screen = "home" | "diff" | "maps" | "heroes";

const canvasEl = document.querySelector<HTMLCanvasElement>("#backdrop");
if (!canvasEl) throw new Error("backdrop canvas missing");
const canvas = canvasEl;

let stopLobby = createLobbyBackdrop(canvas);
let match: Match | null = null;
let selected: HeroId = "soldier76";
let selectedMap: MapId = "horizon";
let selectedDiff: DifficultyId = "easy";
let playerVote: MapId | null = null;
const votes: Record<MapId, number> = { horizon: 0, streets: 0, ruins: 0 };
let votePhase: "idle" | "voting" | "spin" | "done" = "idle";
let voteLeft = 8;
let voteTick: number | null = null;
let voteBots: number[] = [];

const screens: Record<Screen, HTMLElement> = {
  home: must("#screen-home"),
  diff: must("#screen-diff"),
  maps: must("#screen-maps"),
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
  if (name === "maps") startVote();
  if (name !== "maps") stopVoteTimers();
  if (name === "heroes") {
    const m = mapById(selectedMap);
    must("#hero-map-copy").textContent = `${m.mode} · ${m.name}. 난이도 ${
      DIFFICULTIES.find((d) => d.id === selectedDiff)?.name
    }.`;
  }
}

function renderDiff() {
  const list = must("#diff-list");
  list.replaceChildren();
  for (const d of DIFFICULTIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-card";
    btn.classList.toggle("active", d.id === selectedDiff);
    const art = document.createElement("span");
    art.className = `map-art ${d.id === "easy" ? "horizon" : d.id === "normal" ? "streets" : "ruins"}`;
    const meta = document.createElement("span");
    meta.className = "map-meta";
    const mode = document.createElement("span");
    mode.className = "map-mode";
    mode.textContent = "상대 AI";
    const name = document.createElement("span");
    name.className = "map-name";
    name.textContent = d.name;
    const place = document.createElement("span");
    place.className = "map-place";
    place.textContent = d.blurb;
    meta.append(mode, name, place);
    btn.append(art, meta);
    btn.addEventListener("click", () => {
      selectedDiff = d.id;
      renderDiff();
    });
    list.append(btn);
  }
}

function stopVoteTimers() {
  if (voteTick !== null) {
    window.clearInterval(voteTick);
    voteTick = null;
  }
  for (const id of voteBots) window.clearTimeout(id);
  voteBots = [];
}

function beep(freq: number, ms: number) {
  const ctx = new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = freq;
  o.type = "square";
  g.gain.value = 0.04;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  window.setTimeout(() => {
    o.stop();
    void ctx.close();
  }, ms);
}

function startVote() {
  stopVoteTimers();
  playerVote = null;
  votes.horizon = 0;
  votes.streets = 0;
  votes.ruins = 0;
  votePhase = "voting";
  voteLeft = 8;
  must<HTMLButtonElement>("#btn-after-vote").disabled = true;
  renderMaps();
  voteTick = window.setInterval(() => {
    if (votePhase !== "voting") return;
    voteLeft -= 0.1;
    must("#vote-timer").textContent = `투표 ${Math.max(0, voteLeft).toFixed(1)}`;
    if (voteLeft <= 0) startSpin();
  }, 100);
  for (let i = 0; i < 9; i++) {
    const t = window.setTimeout(() => {
      if (votePhase !== "voting") return;
      const pick = MAPS[Math.floor(Math.random() * MAPS.length)].id;
      votes[pick] += 1;
      renderMaps();
      beep(420, 40);
    }, 400 + Math.random() * 6500);
    voteBots.push(t);
  }
}

function startSpin() {
  votePhase = "spin";
  stopVoteTimers();
  must("#vote-timer").textContent = "추첨";
  const ids = MAPS.map((m) => m.id);
  const pool: MapId[] = [];
  for (const id of ids) {
    const n = Math.max(1, votes[id]);
    for (let i = 0; i < n; i++) pool.push(id);
  }
  const winner = pool[Math.floor(Math.random() * pool.length)];
  let i = 0;
  const hops = 18 + Math.floor(Math.random() * 8);
  const tick = () => {
    const current = ids[i % ids.length];
    selectedMap = current;
    renderMaps(current);
    beep(680 + (i % 3) * 80, 35);
    i += 1;
    if (i >= hops) {
      selectedMap = winner;
      votePhase = "done";
      renderMaps(winner);
      must("#vote-timer").textContent = `${mapById(winner).name}`;
      must<HTMLButtonElement>("#btn-after-vote").disabled = false;
      beep(980, 180);
      return;
    }
    window.setTimeout(tick, 55 + i * 18);
  };
  tick();
}

function renderMaps(spinId?: MapId) {
  const list = must("#map-list");
  list.replaceChildren();
  for (const map of MAPS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-card";
    if (playerVote === map.id) btn.classList.add("active");
    if (spinId === map.id) btn.classList.add("spin-on");
    if (votePhase === "done" && selectedMap === map.id) btn.classList.add("winner");
    const art = document.createElement("span");
    art.className = `map-art ${map.art}`;
    const meta = document.createElement("span");
    meta.className = "map-meta";
    const mode = document.createElement("span");
    mode.className = "map-mode";
    mode.textContent = map.mode;
    const name = document.createElement("span");
    name.className = "map-name";
    name.textContent = map.name;
    const en = document.createElement("span");
    en.className = "map-en";
    en.textContent = map.nameEn;
    const count = document.createElement("span");
    count.className = "vote-count";
    count.textContent = `${votes[map.id]}`;
    meta.append(mode, name, en, count);
    btn.append(art, meta);
    btn.disabled = votePhase !== "voting";
    btn.addEventListener("click", () => {
      if (votePhase !== "voting") return;
      if (playerVote) votes[playerVote] -= 1;
      playerVote = map.id;
      votes[map.id] += 1;
      selectedMap = map.id;
      renderMaps();
    });
    list.append(btn);
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
  must("#team-count").textContent = `${h.aliveAlly} vs ${h.aliveEnemy}`;
  must("#health-bar").style.setProperty("--hp", `${(h.health / h.maxHealth) * 100}%`);
  must("#health-num").textContent = `${Math.ceil(h.health)} / ${h.maxHealth}`;
  must("#ammo").textContent = h.ammo;
  must("#hint").textContent = h.hint;
  must("#crosshair").classList.toggle("hot", h.crosshairHot);
  must("#scope").classList.toggle("hidden", !h.scoped);
  if (h.scoped) {
    must("#charge-fill").style.height = `${Math.round(h.charge * 100)}%`;
    must("#charge-num").textContent = `${Math.round(h.charge * 100)}%`;
  }
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
          ["밀기", h.melee],
          ["궁극기", h.visor ? 0 : (100 - h.ult) / 16.6],
        ]
      : [
          ["갈고리", h.grapple],
          ["지뢰", h.mine],
          ["밀기", h.melee],
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
  match = new Match(canvas, selected, selectedMap, selectedDiff);
  match.onHud = paintHud;
  match.onPause = (p) => {
    if (p) openOverlay("일시정지", "5대5 쟁탈. F3 시점. 난이도는 로비에서 고른다.", true);
    else closeOverlay();
  };
  match.onEnd = (r) => {
    const title = r === "win" ? "승리" : r === "lose" ? "패배" : "무승부";
    openOverlay(title, "로비로 돌아가 맵을 다시 고를 수 있다.", false);
  };
  match.start();
}

document.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.dataset.go as Screen | undefined;
    if (next) show(next);
  });
});

must("#btn-after-vote").addEventListener("click", () => show("heroes"));
must("#btn-enter").addEventListener("click", enterMatch);
must("#btn-resume").addEventListener("click", () => match?.setPaused(false));
must("#btn-lobby").addEventListener("click", leaveMatch);

renderDiff();
renderMaps();
renderRoster();
show("home");
