// 구조/개인 데이터 비교 — 순서 무관, 내용이 완전히 같은지만 판단
import type { SeatMapConfig } from "../types";

type Structure = Pick<
  SeatMapConfig,
  "rows" | "cols" | "rowAisles" | "colAisles" | "excludedSeats" | "exits"
>;

type PersonalData = Pick<
  SeatMapConfig,
  "sightRows" | "primeRanges" | "watchedSeats"
>;

// 일반 JSON.stringify는 객체 키 순서에 따라 다른 문자열을 내놓는다 — 같은 좌석이라도
// { row, col } 순서로 만들어졌는지 { col, row } 순서로 만들어졌는지(생성 경로/Firestore 왕복 등)에 따라
// 겉보기엔 같은 값인데 다르다고 오판할 수 있어, 키를 정렬해 직렬화하는 안정적인 버전을 쓴다.
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

function sameArray<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.map(stableStringify).sort();
  const sb = b.map(stableStringify).sort();
  return sa.every((v, i) => v === sb[i]);
}

// 레이아웃 물리 구조가 완전히 동일한지 (행/열/복도/제외구역/출입구) — 다르면 좌석의 의미 자체가
// 달라질 수 있어(예: 10x10 일반관 -> 3x6 프리미엄관) 개인 데이터를 좌표 기준으로 병합하면 안 됨
export function sameStructure(a: Structure, b: Structure): boolean {
  return (
    a.rows === b.rows &&
    a.cols === b.cols &&
    sameArray(a.rowAisles, b.rowAisles) &&
    sameArray(a.colAisles, b.colAisles) &&
    sameArray(a.excludedSeats, b.excludedSeats) &&
    sameArray(a.exits, b.exits)
  );
}

// 개인 데이터(시선일치/명당/실관람)가 완전히 동일한지 — 상영관 전환 시 "저장 안 한 변경사항" 판단용
export function samePersonalData(a: PersonalData, b: PersonalData): boolean {
  return (
    sameArray(a.sightRows, b.sightRows) &&
    sameArray(a.primeRanges, b.primeRanges) &&
    sameArray(a.watchedSeats, b.watchedSeats)
  );
}
