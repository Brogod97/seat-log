// localStorage 영속화 헬퍼 + 기본 설정 (React 무관 순수 함수)
import type { SeatMapConfig, SavedVersion, WatchedSeat } from "../types";

export const STORAGE_KEY = "seat_map_current";
export const SAVES_KEY = "seat_map_saves";
export const THEME_KEY = "seat_map_theme";
export const LAST_SAVED_KEY = "seat_map_last_saved";
export const FREQ_KEY = "seat_map_branch_freq";
export const OWNER_KEY = "seat_map_owner";
export const ANON_OWNER = "anon";
export const SIDEBAR_WIDTH_KEY = "seat_map_sidebar_width";
export const SIDEBAR_COLLAPSED_KEY = "seat_map_sidebar_collapsed";
export const ADMIN_MODE_KEY = "seat_map_admin_mode";

export const DEFAULT_CONFIG: SeatMapConfig = {
  brand: "",
  branch: "",
  screen: "",
  rows: 10,
  cols: 20,
  rowAisles: [],
  colAisles: [],
  sightRows: [],
  primeRanges: [],
  watchedSeats: [],
  excludedSeats: [],
  exits: [],
};

export function configKey(c: SeatMapConfig): string {
  return [c.brand, c.branch, c.screen].filter(Boolean).join("|") || "이름 없음";
}

export function loadTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    // 저장값 없으면 OS 설정 따름
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches)
      return "dark";
  } catch {}
  return "light";
}

// 실관람 좌석 마이그레이션: 예전 형식({ row, col, memo? } — 좌석당 메모 1개)을
// 기록 배열 형식({ row, col, records: WatchedRecord[] })으로 변환한다.
// 이미 새 형식이면 그대로 통과. loadConfig / normalizeSaves 두 경로에서 공통 사용.
function normalizeWatchedSeats(raw: unknown): WatchedSeat[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const seat = s as { row: number; col: number; memo?: string; records?: unknown };
    if (Array.isArray(seat.records))
      return { row: seat.row, col: seat.col, records: seat.records as WatchedSeat["records"] };
    return {
      row: seat.row,
      col: seat.col,
      records: seat.memo?.trim() ? [{ memo: seat.memo }] : [],
    };
  });
}

// config 한 건의 형식 마이그레이션 (현재는 watchedSeats만 해당)
export function normalizeConfig<T extends SeatMapConfig>(c: T): T {
  return { ...c, watchedSeats: normalizeWatchedSeats(c.watchedSeats) };
}

export function loadConfig(): SeatMapConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) });
  } catch {}
  return DEFAULT_CONFIG;
}

// saves 한 항목은 상영관(브랜드|지점|상영관) 당 "구조별로 하나씩"인 버전 배열이다.
// 예전 형식(버전 배열 이전, 상영관당 config 1개)으로 저장된 데이터를 배열로 감싸 마이그레이션한다.
// 각 버전의 watchedSeats도 기록 배열 형식으로 함께 마이그레이션 (localStorage/Firestore/JSON 공통 경로).
export function normalizeSaves(
  raw: Record<string, unknown>,
): Record<string, SavedVersion[]> {
  const result: Record<string, SavedVersion[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value))
      result[key] = (value as SavedVersion[]).map(normalizeConfig);
    else if (value && typeof value === "object")
      result[key] = [normalizeConfig(value as SavedVersion)];
  }
  return result;
}

export function loadSaves(): Record<string, SavedVersion[]> {
  try {
    return normalizeSaves(JSON.parse(localStorage.getItem(SAVES_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function writeSaves(saves: Record<string, SavedVersion[]>) {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
  } catch {}
}

// 지금 로컬 데이터가 누구 것인지 표시하는 마커 (uid 또는 ANON_OWNER) — 계정 전환 시 로컬 오염 감지용
export function loadOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

export function writeOwner(id: string) {
  try {
    localStorage.setItem(OWNER_KEY, id);
  } catch {}
}

// 계정 전환(로그아웃/소유자 불일치) 시 개인 데이터 정리 — 테마/사이드바 같은 UI 설정은 유지
export function clearLocalPersonalData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SAVES_KEY);
    localStorage.removeItem(LAST_SAVED_KEY);
    localStorage.removeItem(FREQ_KEY);
  } catch {}
}

export function loadSidebarWidth(fallback: number): number {
  try {
    const v = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeSidebarWidth(width: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {}
}

export function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {}
}

// 관리자 모드 토글 (관리자 계정에서만 효과) — 기본 OFF, 켜면 지속
export function loadAdminMode(): boolean {
  try {
    return localStorage.getItem(ADMIN_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAdminMode(on: boolean) {
  try {
    localStorage.setItem(ADMIN_MODE_KEY, on ? "1" : "0");
  } catch {}
}
