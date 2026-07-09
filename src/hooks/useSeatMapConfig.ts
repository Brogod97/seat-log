import { useEffect, useState } from "react";
import type { SeatMapConfig, Range, ExitSide, EditMode } from "../types";
import { DEFAULT_CONFIG, STORAGE_KEY, loadConfig } from "../utils/storage";

// 좌석표 편집 도메인: config 상태 + 편집 모드 워크플로 + 모든 변형 함수
export function useSeatMapConfig() {
  const [config, setConfig] = useState<SeatMapConfig>(loadConfig);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [snapshot, setSnapshot] = useState<SeatMapConfig | null>(null);
  const [modeStartPos, setModeStartPos] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [layoutPhase, setLayoutPhase] = useState<"size" | "edit">("size");

  // config 변경 시 localStorage 저장
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }, [config]);

  function enterEditMode(mode: EditMode) {
    setSnapshot(config);
    setEditMode(mode);
    setModeStartPos(null);
    // 레이아웃 편집은 기존 그리드를 유지한 채 복도/제외 편집(2단계)으로 바로 진입
    if (mode === "layout") setLayoutPhase("edit");
  }

  // 그리드 크기부터 다시 짜기 (모든 레이어 초기화)
  function enterGridResize() {
    setSnapshot(config);
    setEditMode("layout");
    setModeStartPos(null);
    setLayoutPhase("size");
  }

  // 좌석 클릭 메뉴에서 편집 모드 진입 (시작 좌석 미리 지정)
  function enterModeFrom(
    mode: "prime" | "watched" | "excluded",
    pos: { row: number; col: number },
  ) {
    setSnapshot(config);
    setEditMode(mode as EditMode);
    setModeStartPos(pos);
  }

  function cancelEditMode() {
    if (snapshot) setConfig(snapshot);
    setSnapshot(null);
    setEditMode(null);
    setModeStartPos(null);
  }

  function completeEditMode() {
    setSnapshot(null);
    setEditMode(null);
    setModeStartPos(null);
  }

  function setGridSize(rows: number, cols: number) {
    setConfig((c) => ({
      ...c,
      rows,
      cols,
      rowAisles: [],
      colAisles: [],
      sightRows: [],
      primeRanges: [],
      watchedSeats: [],
      excludedSeats: [],
      exits: [],
    }));
    // 크기 확정 후 layout 2단계(복도/제외 편집)로 자동 전환
    setLayoutPhase("edit");
  }

  function toggleExit(row: number, col: number, side: ExitSide) {
    setConfig((c) => {
      const exists = c.exits.some(
        (s) => s.row === row && s.col === col && s.side === side,
      );
      return {
        ...c,
        exits: exists
          ? c.exits.filter(
              (s) => !(s.row === row && s.col === col && s.side === side),
            )
          : [...c.exits, { row, col, side }],
      };
    });
  }

  function addPrimeRange(range: Range) {
    setConfig((c) => ({ ...c, primeRanges: [...c.primeRanges, range] }));
  }

  function removePrimeRange(index: number) {
    setConfig((c) => ({
      ...c,
      primeRanges: c.primeRanges.filter((_, i) => i !== index),
    }));
  }

  function toggleWatchedSeat(row: number, col: number) {
    setConfig((c) => {
      const exists = c.watchedSeats.some((s) => s.row === row && s.col === col);
      return {
        ...c,
        watchedSeats: exists
          ? c.watchedSeats.filter((s) => !(s.row === row && s.col === col))
          : [...c.watchedSeats, { row, col }],
      };
    });
  }

  function setWatchedMemo(row: number, col: number, memo: string) {
    setConfig((c) => ({
      ...c,
      watchedSeats: c.watchedSeats.map((s) =>
        s.row === row && s.col === col ? { ...s, memo } : s,
      ),
    }));
  }

  function addWatchedRange(range: Range) {
    setConfig((c) => {
      const toAdd: { row: number; col: number }[] = [];
      for (let r = range.rowStart; r <= range.rowEnd; r++) {
        for (let col = range.colStart; col <= range.colEnd; col++) {
          if (!c.watchedSeats.some((s) => s.row === r && s.col === col)) {
            toAdd.push({ row: r, col });
          }
        }
      }
      return { ...c, watchedSeats: [...c.watchedSeats, ...toAdd] };
    });
  }

  function toggleSightRow(row: number) {
    setConfig((c) => {
      const exists = c.sightRows.includes(row);
      return {
        ...c,
        sightRows: exists
          ? c.sightRows.filter((r) => r !== row)
          : [...c.sightRows, row].sort((a, b) => a - b),
      };
    });
  }

  function toggleRowAisle(row: number) {
    setConfig((c) => {
      const exists = c.rowAisles.includes(row);
      return {
        ...c,
        rowAisles: exists
          ? c.rowAisles.filter((r) => r !== row)
          : [...c.rowAisles, row].sort((a, b) => a - b),
      };
    });
  }

  function toggleExcludedSeat(row: number, col: number) {
    setConfig((c) => {
      const exists = c.excludedSeats.some(
        (s) => s.row === row && s.col === col,
      );
      return {
        ...c,
        excludedSeats: exists
          ? c.excludedSeats.filter((s) => !(s.row === row && s.col === col))
          : [...c.excludedSeats, { row, col }],
      };
    });
  }

  function excludeSeats(seats: { row: number; col: number }[]) {
    setConfig((c) => {
      const toAdd = seats.filter(
        (s) => !c.excludedSeats.some((e) => e.row === s.row && e.col === s.col),
      );
      return { ...c, excludedSeats: [...c.excludedSeats, ...toAdd] };
    });
  }

  function toggleColAisle(col: number) {
    setConfig((c) => {
      const exists = c.colAisles.includes(col);
      return {
        ...c,
        colAisles: exists
          ? c.colAisles.filter((c2) => c2 !== col)
          : [...c.colAisles, col].sort((a, b) => a - b),
      };
    });
  }

  function resetConfig() {
    setConfig(DEFAULT_CONFIG);
    setSnapshot(null);
    setEditMode(null);
  }

  return {
    config,
    setConfig,
    editMode,
    setEditMode,
    layoutPhase,
    modeStartPos,
    enterEditMode,
    enterGridResize,
    enterModeFrom,
    cancelEditMode,
    completeEditMode,
    setGridSize,
    resetConfig,
    toggleExit,
    addPrimeRange,
    removePrimeRange,
    toggleWatchedSeat,
    setWatchedMemo,
    addWatchedRange,
    toggleSightRow,
    toggleRowAisle,
    toggleExcludedSeat,
    excludeSeats,
    toggleColAisle,
  };
}
