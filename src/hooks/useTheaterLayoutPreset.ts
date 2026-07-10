import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { isAdmin as checkIsAdmin } from "../utils/admin";
import { isKnownBranch, isKnownScreen } from "../data/theaters";
import { configKey } from "../utils/storage";
import type { SeatMapConfig, TheaterLayoutPreset } from "../types";

interface Params {
  user: User | null;
  config: SeatMapConfig;
  setConfig: Dispatch<SetStateAction<SeatMapConfig>>;
}

// 관리자가 게시한 지점 공용 레이아웃(theaterLayouts) 조회/불러오기/게시
export function useTheaterLayoutPreset({ user, config, setConfig }: Params) {
  const [presetExists, setPresetExists] = useState(false);
  const [presetLoading, setPresetLoading] = useState(false);
  const presetDataRef = useRef<TheaterLayoutPreset | null>(null);
  const requestedKeyRef = useRef<string | null>(null);

  const admin = checkIsAdmin(user);
  const isKnownSelection =
    isKnownBranch(config.brand, config.branch) &&
    isKnownScreen(config.brand, config.screen);

  useEffect(() => {
    if (!isKnownSelection) {
      presetDataRef.current = null;
      requestedKeyRef.current = null;
      return;
    }
    const key = configKey(config);
    requestedKeyRef.current = key;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 조회 시작을 알리는 로딩 표시, 프로젝트 내 기존 fetch 훅과 동일 패턴
    setPresetLoading(true);
    getDoc(doc(db, "theaterLayouts", key))
      .then((snap) => {
        if (requestedKeyRef.current !== key) return; // 늦게 온 응답 무시
        if (snap.exists()) {
          presetDataRef.current = snap.data() as TheaterLayoutPreset;
          setPresetExists(true);
        } else {
          presetDataRef.current = null;
          setPresetExists(false);
        }
      })
      .catch((e) => {
        console.error("지점 레이아웃 조회 실패", e);
        presetDataRef.current = null;
        setPresetExists(false);
      })
      .finally(() => {
        if (requestedKeyRef.current === key) setPresetLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.brand, config.branch, config.screen]);

  function loadPreset() {
    const preset = presetDataRef.current;
    if (!preset) return;
    const hasPersonalData =
      config.sightRows.length > 0 ||
      config.primeRanges.length > 0 ||
      config.watchedSeats.length > 0;
    if (
      hasPersonalData &&
      !confirm("지점 레이아웃을 불러오면 현재 시선일치/명당/실관람 표시가 초기화돼요. 계속할까요?")
    )
      return;
    setConfig((c) => ({
      ...c,
      rows: preset.rows,
      cols: preset.cols,
      rowAisles: preset.rowAisles,
      colAisles: preset.colAisles,
      excludedSeats: preset.excludedSeats,
      exits: preset.exits,
      sightRows: [],
      primeRanges: [],
      watchedSeats: [],
    }));
  }

  async function publishPreset() {
    if (!admin || !isKnownSelection) return;
    const key = configKey(config);
    const preset: TheaterLayoutPreset = {
      brand: config.brand,
      branch: config.branch,
      screen: config.screen,
      rows: config.rows,
      cols: config.cols,
      rowAisles: config.rowAisles,
      colAisles: config.colAisles,
      excludedSeats: config.excludedSeats,
      exits: config.exits,
    };
    try {
      await setDoc(doc(db, "theaterLayouts", key), {
        ...preset,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid ?? null,
      });
      presetDataRef.current = preset;
      setPresetExists(true);
    } catch (e) {
      console.error("지점 레이아웃 게시 실패", e);
      alert("게시에 실패했어요.");
    }
  }

  return {
    isAdmin: admin,
    presetExists: isKnownSelection && presetExists,
    presetLoading: isKnownSelection && presetLoading,
    loadPreset,
    publishPreset,
  };
}
