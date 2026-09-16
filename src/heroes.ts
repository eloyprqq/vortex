export type HeroId = "soldier76" | "widowmaker" | "nova";

export type HeroDef = {
  id: HeroId;
  name: string;
  role: string;
  blurb: string;
  health: number;
  speed: number;
  color: number;
  accent: number;
  abilities: {
    primary: string;
    secondary: string;
    ability1: string;
    ability2: string;
    ultimate: string;
  };
};

export const HEROES: HeroDef[] = [
  {
    id: "soldier76",
    name: "솔저: 76",
    role: "딜러",
    blurb: "펄스 라이플 · 헬릭스 · 질주 · 생체장 · 전술 조준경",
    health: 200,
    speed: 5.5,
    color: 0x2c4a6e,
    accent: 0xe09f3e,
    abilities: {
      primary: "펄스 라이플",
      secondary: "헬릭스 로켓",
      ability1: "질주",
      ability2: "생체장",
      ultimate: "전술 조준경",
    },
  },
  {
    id: "widowmaker",
    name: "위도우메이커",
    role: "딜러",
    blurb: "위도우의 입맞춤 · 갈고리 · 맹독 지뢰 · 적외선 투시",
    health: 175,
    speed: 5.5,
    color: 0x4a2158,
    accent: 0xe8a0c8,
    abilities: {
      primary: "위도우의 입맞춤",
      secondary: "조준경",
      ability1: "갈고리 총",
      ability2: "맹독 지뢰",
      ultimate: "적외선 투시",
    },
  },
  {
    id: "nova",
    name: "노바",
    role: "힐러",
    blurb: "점사 기관단총 · 비행 · 가속 장판 · 치유 구역",
    health: 200,
    speed: 5.6,
    color: 0x1c2e38,
    accent: 0x4ecdc4,
    abilities: {
      primary: "점사 기관단총",
      secondary: "비행",
      ability1: "비행",
      ability2: "가속 장판",
      ultimate: "치유 구역",
    },
  },
];

export function otherHero(id: HeroId): HeroId {
  const h = HEROES.find((x) => x.id !== id);
  return h ? h.id : "soldier76";
}

export function heroById(id: HeroId): HeroDef {
  const h = HEROES.find((x) => x.id === id);
  if (!h) throw new Error(id);
  return h;
}
