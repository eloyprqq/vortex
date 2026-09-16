export type DifficultyId = "easy" | "normal" | "hard" | "extreme";

export type Difficulty = {
  id: DifficultyId;
  name: string;
  blurb: string;
  enemySpread: number;
  allySpread: number;
  enemyHit: number;
  allyHit: number;
  enemyFire: number;
  allyFire: number;
  enemyJitter: number;
  allyJitter: number;
  enemyHelix: number;
  enemyUlt: boolean;
  enemyDmg: number;
  enemyHp: number;
  enemyUltGain: number;
  enemyRespawn: number;
  playerRespawn: number;
  allyRespawn: number;
  enemyFireGate: number;
  allyFireGate: number;
};

export const DIFFICULTIES: Difficulty[] = [
  {
    id: "easy",
    name: "쉬움",
    blurb: "상대 조준이 많이 흔들린다. 아군이 거점을 더 잘 지켜 준다.",
    enemySpread: 0.22,
    allySpread: 0.022,
    enemyHit: 0.28,
    allyHit: 0.9,
    enemyFire: 0.42,
    allyFire: 0.95,
    enemyJitter: 0.42,
    allyJitter: 0.04,
    enemyHelix: 0.22,
    enemyUlt: false,
    enemyDmg: 1,
    enemyHp: 1,
    enemyUltGain: 1,
    enemyRespawn: 5,
    playerRespawn: 5,
    allyRespawn: 5,
    enemyFireGate: 0.45,
    allyFireGate: 0.88,
  },
  {
    id: "normal",
    name: "보통",
    blurb: "상대가 가끔 맞춘다. 팀 싸움이 비슷하다.",
    enemySpread: 0.12,
    allySpread: 0.03,
    enemyHit: 0.48,
    allyHit: 0.84,
    enemyFire: 0.62,
    allyFire: 0.9,
    enemyJitter: 0.22,
    allyJitter: 0.055,
    enemyHelix: 0.4,
    enemyUlt: false,
    enemyDmg: 1,
    enemyHp: 1,
    enemyUltGain: 1,
    enemyRespawn: 5,
    playerRespawn: 5,
    allyRespawn: 5,
    enemyFireGate: 0.55,
    allyFireGate: 0.85,
  },
  {
    id: "hard",
    name: "어려움",
    blurb: "상대 조준이 빨라진다. 아군은 조금 덜 도와준다.",
    enemySpread: 0.055,
    allySpread: 0.038,
    enemyHit: 0.7,
    allyHit: 0.78,
    enemyFire: 0.88,
    allyFire: 0.82,
    enemyJitter: 0.1,
    allyJitter: 0.07,
    enemyHelix: 0.7,
    enemyUlt: true,
    enemyDmg: 1.08,
    enemyHp: 1.05,
    enemyUltGain: 1.15,
    enemyRespawn: 4.2,
    playerRespawn: 5.5,
    allyRespawn: 5.2,
    enemyFireGate: 0.7,
    allyFireGate: 0.8,
  },
  {
    id: "extreme",
    name: "익스트림",
    blurb: "규칙과 리스폰은 어려움과 같다. 상대 조준만 훨씬 정확하다.",
    enemySpread: 0.018,
    allySpread: 0.038,
    enemyHit: 0.92,
    allyHit: 0.78,
    enemyFire: 0.88,
    allyFire: 0.82,
    enemyJitter: 0.028,
    allyJitter: 0.07,
    enemyHelix: 0.7,
    enemyUlt: true,
    enemyDmg: 1,
    enemyHp: 1,
    enemyUltGain: 1.15,
    enemyRespawn: 4.2,
    playerRespawn: 5.5,
    allyRespawn: 5.2,
    enemyFireGate: 0.7,
    allyFireGate: 0.8,
  },
];

export function difficultyById(id: DifficultyId): Difficulty {
  const d = DIFFICULTIES.find((x) => x.id === id);
  if (!d) throw new Error(id);
  return d;
}
