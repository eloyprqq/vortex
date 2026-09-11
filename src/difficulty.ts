export type DifficultyId = "easy" | "normal" | "hard";

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
};

export const DIFFICULTIES: Difficulty[] = [
  {
    id: "easy",
    name: "쉬움",
    blurb: "상대 조준이 많이 흔들린다. 아군이 거점을 더 잘 지켜 준다.",
    enemySpread: 0.22,
    allySpread: 0.05,
    enemyHit: 0.28,
    allyHit: 0.72,
    enemyFire: 0.42,
    allyFire: 0.85,
    enemyJitter: 0.42,
    allyJitter: 0.08,
    enemyHelix: 0.22,
    enemyUlt: false,
  },
  {
    id: "normal",
    name: "보통",
    blurb: "상대가 가끔 맞춘다. 팀 싸움이 비슷하다.",
    enemySpread: 0.12,
    allySpread: 0.07,
    enemyHit: 0.48,
    allyHit: 0.62,
    enemyFire: 0.62,
    allyFire: 0.78,
    enemyJitter: 0.22,
    allyJitter: 0.12,
    enemyHelix: 0.4,
    enemyUlt: false,
  },
  {
    id: "hard",
    name: "어려움",
    blurb: "상대 조준이 빨라진다. 아군은 조금 덜 도와준다.",
    enemySpread: 0.055,
    allySpread: 0.1,
    enemyHit: 0.7,
    allyHit: 0.5,
    enemyFire: 0.88,
    allyFire: 0.65,
    enemyJitter: 0.1,
    allyJitter: 0.18,
    enemyHelix: 0.7,
    enemyUlt: true,
  },
];

export function difficultyById(id: DifficultyId): Difficulty {
  const d = DIFFICULTIES.find((x) => x.id === id);
  if (!d) throw new Error(id);
  return d;
}
