export type HeroId = "soldier76" | "widowmaker";

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
];

export function heroById(id: HeroId): HeroDef {
  const h = HEROES.find((x) => x.id === id);
  if (!h) throw new Error(id);
  return h;
}
