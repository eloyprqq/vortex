import "./style.css";
import { DIFFICULTIES, type DifficultyId } from "./difficulty";
import { HEROES, type HeroId } from "./heroes";
import { createLobbyBackdrop } from "./lobbyBackdrop";
import { MAPS, mapById, type MapId } from "./maps";
import { DUEL_KILLS, Match, type HudSnap, type MatchFormat } from "./match";
import { unlockSfx } from "./sfx";

type Screen = "home" | "diff" | "maps" | "heroes";

const canvasEl = document.querySelector<HTMLCanvasElement>("#backdrop");
if (!canvasEl) throw new Error("backdrop canvas missing");
const canvas = canvasEl;

// The lobby backdrop owns its own renderer and frame loop on the shared canvas.
// Exactly one of it or the match may be live, or both draw over each other every
// frame and the view appears to spin.
let stopLobby: (() => void) | null = createLobbyBackdrop(canvas);
let match: Match | null = null;
let selected: HeroId = "soldier76";
let selectedMap: MapId = "horizon";
let selectedDiff: DifficultyId = "easy";
let selectedFormat: MatchFormat = "5v5";
let playerVote: MapId | null = null;
const votes: Record<MapId, number> = { horizon: 0, streets: 0, ruins: 0 };
let votePhase: "idle" | "voting" | "spin" | "done" = "idle";
let voteLeft = 8;
let voteTick: number | null = null;
let voteBots: number[] = [];
let killMarkTimer = 0;
let hitMarkTimer = 0;

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

function setFormat(fmt: MatchFormat) {
  selectedFormat = fmt;
  must("#tab-5v5").classList.toggle("on", fmt === "5v5");
  must("#tab-1v1").classList.toggle("on", fmt === "1v1");
  must("#play-title").textContent = fmt === "1v1" ? "1V1" : "5V5";
  must("#play-lede").textContent =
    fmt === "1v1" ? `${DUEL_KILLS}킬 선승. 적 봇 한 명.` : "아군 봇 4명과 적 봇 5명.";
  must("#squad-count").textContent = fmt === "1v1" ? "1 / 2" : "1 / 6";
  renderSquad();
}

function renderSquad() {
  const n = selectedFormat === "1v1" ? 2 : 6;
  const list = must("#squad-list");
  list.replaceChildren();
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = i === 0 ? "squad-slot you" : "squad-slot empty";
    if (i === 0) {
      const tag = document.createElement("span");
      tag.className = "squad-tag";
      tag.textContent = "YOU";
      const name = document.createElement("span");
      name.textContent = "PLAYER";
      row.append(tag, name);
    } else {
      const plus = document.createElement("span");
      plus.className = "squad-plus";
      plus.textContent = "+";
      row.append(plus);
    }
    list.append(row);
  }
}

function show(name: Screen) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", key !== name);
  }
  if (name === "maps") startVote();
  if (name !== "maps") stopVoteTimers();
  if (name === "heroes") {
    const m = mapById(selectedMap);
    const diffName = DIFFICULTIES.find((d) => d.id === selectedDiff)?.name;
    must("#hero-map-copy").textContent =
      selectedFormat === "1v1"
        ? `1v1 · ${DUEL_KILLS}킬 선승 · ${m.name} · ${diffName}`
        : `${m.mode} · ${m.name} · ${diffName}. 힐러 노바가 양 팀에 들어간다.`;
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
    art.className = `map-art ${d.id}`;
    const meta = document.createElement("span");
    meta.className = "map-meta";
    const mode = document.createElement("span");
    mode.className = "map-mode";
    mode.textContent = d.id === "extreme" ? "경고" : "상대 AI";
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

function tickets(): MapId[] {
  const list: MapId[] = [];
  for (const map of MAPS) {
    for (let i = 0; i < votes[map.id]; i++) list.push(map.id);
  }
  return list;
}

function renderTickets(hi: number | null = null, win = -1) {
  const rail = must("#ticket-rail");
  rail.replaceChildren();
  tickets().forEach((id, i) => {
    const el = document.createElement("span");
    el.className = `ticket ${id}`;
    if (hi === i) el.classList.add("on");
    if (win === i) el.classList.add("win");
    rail.append(el);
  });
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
  renderTickets();
  voteTick = window.setInterval(() => {
    if (votePhase !== "voting") return;
    voteLeft -= 0.1;
    must("#vote-timer").textContent = `투표 ${Math.max(0, voteLeft).toFixed(1)}`;
    if (voteLeft <= 0) startSpin();
  }, 100);
  for (let i = 0; i < (selectedFormat === "1v1" ? 1 : 9); i++) {
    const t = window.setTimeout(() => {
      if (votePhase !== "voting") return;
      const pick = MAPS[Math.floor(Math.random() * MAPS.length)].id;
      votes[pick] += 1;
      renderMaps();
      renderTickets();
      beep(420, 40);
    }, 400 + Math.random() * 6500);
    voteBots.push(t);
  }
}

function startSpin() {
  votePhase = "spin";
  stopVoteTimers();
  const pool = tickets();
  if (pool.length === 0) {
    selectedMap = MAPS[Math.floor(Math.random() * MAPS.length)].id;
    votePhase = "done";
    renderMaps();
    renderTickets();
    must("#vote-timer").textContent = mapById(selectedMap).name;
    must<HTMLButtonElement>("#btn-after-vote").disabled = false;
    return;
  }
  const winAt = Math.floor(Math.random() * pool.length);
  selectedMap = pool[winAt];
  must("#vote-timer").textContent = "표 추첨";
  let i = 0;
  const hops = pool.length * 3 + winAt;
  const tick = () => {
    const idx = i % pool.length;
    renderTickets(idx);
    beep(620 + (idx % 4) * 40, 28);
    i += 1;
    if (i > hops) {
      votePhase = "done";
      renderMaps();
      renderTickets(null, winAt);
      must("#vote-timer").textContent = `${mapById(selectedMap).name} · ${mapById(selectedMap).mode}`;
      must<HTMLButtonElement>("#btn-after-vote").disabled = false;
      beep(980, 180);
      return;
    }
    window.setTimeout(tick, 40 + Math.floor(i / 2));
  };
  tick();
}

function renderMaps() {
  const list = must("#map-list");
  list.replaceChildren();
  for (const map of MAPS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-card";
    if (playerVote === map.id) btn.classList.add("active");
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
    count.textContent = `${votes[map.id]}표`;
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
      renderTickets();
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

function fillTicks(el: HTMLElement, max: number) {
  if (el.dataset.max === String(max)) return;
  el.dataset.max = String(max);
  el.replaceChildren();
  for (let i = 25; i < max; i += 25) {
    const tick = document.createElement("i");
    tick.style.left = `${(i / max) * 100}%`;
    if (i % 100 === 0) tick.className = "major";
    el.append(tick);
  }
}

function paintOwBar(bar: HTMLElement, health: number, max: number) {
  const fill = bar.querySelector(".hp-fill") as HTMLElement | null;
  const ticks = bar.querySelector(".hp-ticks") as HTMLElement | null;
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, (health / max) * 100))}%`;
  if (ticks) fillTicks(ticks, max);
}

function paintHpFloats(bars: HudSnap["hpBars"]) {
  const root = must("#hp-floats");
  const keep = new Set(bars.map((b) => b.id));
  for (const node of [...root.children]) {
    const id = (node as HTMLElement).dataset.id;
    if (!id || !keep.has(id)) node.remove();
  }
  for (const b of bars) {
    let el = root.querySelector<HTMLElement>(`[data-id="${b.id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "hp-float";
      el.dataset.id = b.id;
      el.innerHTML = `<div class="ow-hp"><i class="hp-fill"></i><div class="hp-ticks"></div></div>`;
      root.append(el);
    }
    el.classList.toggle("enemy", !b.ally);
    el.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -100%)`;
    paintOwBar(el.querySelector(".ow-hp") as HTMLElement, b.health, b.maxHealth);
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
  must("#obj-label").textContent = h.duel ? `${h.k} - ${h.enemyKills}` : h.obj;
  must("#team-count").textContent = h.duel ? `1v1 · ${DUEL_KILLS}킬 선승` : `${h.aliveAlly} vs ${h.aliveEnemy}`;
  paintOwBar(must("#health-bar"), h.health, h.maxHealth);
  must("#health-num").textContent = `${Math.ceil(h.health)} / ${h.maxHealth}`;
  paintHpFloats(h.hpBars);
  must("#ammo").textContent = h.ammo;
  must("#hint").textContent = h.hint;
  must("#crosshair").classList.toggle("hot", h.crosshairHot);
  must("#hud").classList.toggle("infra", h.infra);
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
        ]
      : h.hero === "nova"
        ? [
            ["비행", h.field],
            ["가속장", h.mine],
          ]
        : [
            ["갈고리", h.grapple],
            ["지뢰", h.mine],
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
  if (h.fly) {
    const el = document.createElement("div");
    el.className = "abil ready";
    el.textContent = "비행";
    abils.append(el);
  }
  paintUlt(h);
}

const ULT_TICKS = 40;

function buildUltRing() {
  const ring = must("#ult-ticks");
  ring.replaceChildren();
  for (let i = 0; i < ULT_TICKS; i++) {
    const tick = document.createElement("i");
    tick.style.transform = `rotate(${(i / ULT_TICKS) * 360}deg) translateY(-36px)`;
    ring.append(tick);
  }
}

function paintUlt(h: HudSnap) {
  const pct = Math.max(0, Math.min(100, Math.round(h.ult)));
  must("#ult-pct").textContent = `${pct}%`;
  must("#ult-meter").classList.toggle("ready", pct >= 100);
  const ticks = must("#ult-ticks").children;
  const filled = Math.round((pct / 100) * ticks.length);
  for (let i = 0; i < ticks.length; i++) {
    ticks[i].classList.toggle("on", i < filled);
  }
}

function openOverlay(title: string, copy: string) {
  must("#overlay").classList.remove("hidden");
  must("#overlay-title").textContent = title;
  must("#overlay-copy").textContent = copy;
}

function closeOverlay() {
  must("#overlay").classList.add("hidden");
}

function showBackdrop() {
  if (!stopLobby) stopLobby = createLobbyBackdrop(canvas);
}

function hideBackdrop() {
  stopLobby?.();
  stopLobby = null;
}

function leaveMatch() {
  match?.dispose();
  match = null;
  document.body.classList.remove("playing");
  must("#hud").classList.add("hidden");
  must("#hud").classList.remove("infra");
  must("#crosshair").classList.remove("hit", "head");
  must("#dmg-layer").replaceChildren();
  window.clearTimeout(killMarkTimer);
  window.clearTimeout(hitMarkTimer);
  const mark = must("#kill-mark");
  mark.classList.add("hidden");
  mark.classList.remove("show");
  closeOverlay();
  showBackdrop();
  show("home");
}

function enterMatch() {
  hideBackdrop();
  match?.dispose();
  match = null;
  document.body.classList.add("playing");
  must("#hud").classList.remove("hidden");
  closeOverlay();
  unlockSfx();
  match = new Match(canvas, selected, selectedMap, selectedDiff, selectedFormat);
  match.onHud = paintHud;
  match.onHit = (hit) => {
    const xhair = must("#crosshair");
    window.clearTimeout(hitMarkTimer);
    xhair.classList.add("hit");
    xhair.classList.toggle("head", hit.head);
    hitMarkTimer = window.setTimeout(() => xhair.classList.remove("hit", "head"), 120);
    const n = document.createElement("div");
    n.className = hit.head ? "dmg-num head" : "dmg-num";
    n.textContent = String(hit.dmg);
    n.style.left = `${hit.x}px`;
    n.style.top = `${hit.y}px`;
    must("#dmg-layer").append(n);
    window.setTimeout(() => n.remove(), 720);
  };
  match.onKill = (head) => {
    const mark = must("#kill-mark");
    window.clearTimeout(killMarkTimer);
    mark.classList.remove("hidden");
    mark.classList.toggle("head", head);
    mark.classList.remove("show");
    void mark.offsetWidth;
    mark.classList.add("show");
    killMarkTimer = window.setTimeout(() => {
      mark.classList.remove("show");
      killMarkTimer = window.setTimeout(() => mark.classList.add("hidden"), 150);
    }, 850);
  };
  match.onEnd = (r) => {
    const title = r === "win" ? "승리" : r === "lose" ? "패배" : "무승부";
    const h = match!;
    openOverlay(
      title,
      `K / D / A   ${h.player.kills} / ${h.player.deaths} / ${h.player.assists}`,
    );
  };
  match.start();
}

document.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.dataset.go as Screen | undefined;
    if (next) show(next);
  });
});

must("#tab-5v5").addEventListener("click", () => setFormat("5v5"));
must("#tab-1v1").addEventListener("click", () => setFormat("1v1"));
must("#btn-play").addEventListener("click", () => show("diff"));
must("#btn-after-vote").addEventListener("click", () => show("heroes"));
must("#btn-enter").addEventListener("click", enterMatch);
must("#btn-lobby").addEventListener("click", leaveMatch);

setFormat("5v5");
renderDiff();
renderMaps();
renderRoster();
buildUltRing();
show("home");
