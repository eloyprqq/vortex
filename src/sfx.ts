let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensure() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);
}

export function unlockSfx() {
  ensure();
  void ctx?.resume();
}

function env(start: number, peak: number, dur: number) {
  ensure();
  if (!ctx || !master) return null;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  g.connect(master);
  return g;
}

function tone(freq: number, type: OscillatorType, peak: number, dur: number, slide = 0) {
  ensure();
  if (!ctx) return;
  const t = ctx.currentTime;
  const g = env(t, peak, dur);
  if (!g) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(peak: number, dur: number) {
  ensure();
  if (!ctx || !master) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const t = ctx.currentTime;
  const g = env(t, peak, dur);
  if (!g) return;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1400;
  src.connect(f);
  f.connect(g);
  src.start(t);
}

export const sfx = {
  fire(kind: "pulse" | "burst" | "sniper" | "helix") {
    if (kind === "pulse") {
      noise(0.35, 0.045);
      tone(210, "square", 0.12, 0.05, -80);
    } else if (kind === "burst") {
      noise(0.28, 0.03);
      tone(260, "square", 0.1, 0.032, -60);
    } else if (kind === "sniper") {
      noise(0.45, 0.1);
      tone(90, "sawtooth", 0.18, 0.14, -40);
    } else {
      tone(160, "sawtooth", 0.16, 0.12, -70);
      noise(0.22, 0.08);
    }
  },
  hit(head: boolean) {
    tone(head ? 1480 : 880, "square", head ? 0.16 : 0.11, 0.05, 200);
  },
  kill() {
    tone(520, "sawtooth", 0.2, 0.22, -340);
    tone(260, "triangle", 0.12, 0.18, -80);
  },
  ult() {
    tone(280, "sawtooth", 0.14, 0.28, 640);
    tone(420, "triangle", 0.1, 0.32, 400);
  },
  boom() {
    tone(70, "sine", 0.28, 0.22, -20);
    noise(0.3, 0.16);
  },
};
