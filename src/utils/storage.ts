// localStorage 영속화 헬퍼 + 기본 설정 (React 무관 순수 함수)
import type { SeatMapConfig } from "../types";

export const STORAGE_KEY = "seat_map_current";
export const SAVES_KEY = "seat_map_saves";
export const THEME_KEY = "seat_map_theme";
export const LAST_SAVED_KEY = "seat_map_last_saved";

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

export function loadConfig(): SeatMapConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_CONFIG;
}

export function loadSaves(): Record<string, SeatMapConfig> {
  try {
    return JSON.parse(localStorage.getItem(SAVES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function writeSaves(saves: Record<string, SeatMapConfig>) {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
  } catch {}
}
