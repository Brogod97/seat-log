import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { isAdmin as checkIsAdmin } from "../utils/admin";
import { isKnownBranch, isKnownScreen, CUSTOM } from "../data/theaters";
import { configKey, DEFAULT_CONFIG } from "../utils/storage";
import type { SeatMapConfig, TheaterLayoutPreset } from "../types";

interface Params {
  user: User | null;
  config: SeatMapConfig;
  setConfig: Dispatch<SetStateAction<SeatMapConfig>>;
  adminMode: boolean; // 관리자 계정이어도 이 토글이 꺼져 있으면 일반 사용자로 동작
}

export interface PublicTheaterData {
  branches: string[];
  screensByBranch: Record<string, string[]>;
}

const COLLECTION = "theaterLayouts";

// 관리자가 게시한 지점 공용 레이아웃 전체를 한 번에 불러와(catalog) select 옵션 구성 + 자동 적용/게시에 사용
export function useTheaterLayoutPreset({ user, config, setConfig, adminMode }: Params) {
  const [catalog, setCatalog] = useState<Record<string, TheaterLayoutPreset>>(
    {},
  );
  const [catalogLoading, setCatalogLoading] = useState(true);
  // 비동기 응답 시점의 최신 config를 보기 위한 ref (effect 클로저는 선택 변경 시점 값이라 stale할 수 있음)
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  // 직전에 적용한 선택 키 — 마운트 시 복원된 선택으로 초기화해, 최초 진입/카탈로그 로드 때는
  // 선택이 "바뀐" 게 아니므로 자동 적용(및 초기화 confirm)을 건너뛴다
  const prevSelKeyRef = useRef(configKey(config));

  // 계정이 관리자인지(raw) vs 실제 관리자 권한 발동 여부(effective = 계정관리자 && 모드ON)
  const accountIsAdmin = checkIsAdmin(user);
  const admin = accountIsAdmin && adminMode;
  const isKnownSelection =
    isKnownBranch(config.brand, config.branch) &&
    isKnownScreen(config.brand, config.screen);
  // 게시 가능 여부: 정적 목록에 있는지가 아니라 브랜드·지점·상영관이 모두 채워졌는지로 판단.
  // (관리자가 직접 입력(CUSTOM)한 지점/상영관도 게시할 수 있어야 함 — 자동 적용은 여전히 isKnownSelection 기준)
  const selectionComplete =
    !!config.brand &&
    !!config.branch &&
    config.branch !== CUSTOM &&
    !!config.screen &&
    config.screen !== CUSTOM;

  function fetchCatalog() {
    setCatalogLoading(true);
    return getDocs(collection(db, COLLECTION))
      .then((snap) => {
        const map: Record<string, TheaterLayoutPreset> = {};
        snap.forEach((d) => {
          map[d.id] = d.data() as TheaterLayoutPreset;
        });
        setCatalog(map);
      })
      .catch((e) => {
        console.error("공용 지점 레이아웃 목록 조회 실패", e);
      })
      .finally(() => setCatalogLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 카탈로그 조회 시작, 기존 fetch 훅과 동일 패턴
    fetchCatalog();
  }, []);

  const publicTheaters = useMemo(() => {
    const result: Record<string, PublicTheaterData> = {};
    for (const preset of Object.values(catalog)) {
      const brandEntry = (result[preset.brand] ??= {
        branches: [],
        screensByBranch: {},
      });
      if (!brandEntry.branches.includes(preset.branch))
        brandEntry.branches.push(preset.branch);
      const screens = (brandEntry.screensByBranch[preset.branch] ??= []);
      if (!screens.includes(preset.screen)) screens.push(preset.screen);
    }
    return result;
  }, [catalog]);

  function applyPhysicalLayout(preset: TheaterLayoutPreset | null) {
    const c = configRef.current;
    const hasPersonalData =
      c.sightRows.length > 0 ||
      c.primeRanges.length > 0 ||
      c.watchedSeats.length > 0;
    if (
      hasPersonalData &&
      !confirm(
        "지점을 변경하면 현재 시선일치/명당/실관람 표시가 초기화돼요. 계속할까요?",
      )
    )
      return;
    setConfig((cur) => ({
      ...cur,
      rows: preset?.rows ?? DEFAULT_CONFIG.rows,
      cols: preset?.cols ?? DEFAULT_CONFIG.cols,
      rowAisles: preset?.rowAisles ?? [],
      colAisles: preset?.colAisles ?? [],
      excludedSeats: preset?.excludedSeats ?? [],
      exits: preset?.exits ?? [],
      sightRows: [],
      primeRanges: [],
      watchedSeats: [],
    }));
  }

  // 선택(브랜드/지점/상영관)이 바뀌면 카탈로그에서 동기적으로 조회해 적용(있으면 프리셋, 없으면 빈 레이아웃)
  useEffect(() => {
    if (catalogLoading || !isKnownSelection) return;
    const key = configKey(config);
    // 선택 키가 실제로 바뀐 경우에만 적용 — 복원/카탈로그 로드 시엔 초기화 confirm이 뜨지 않게 함
    if (prevSelKeyRef.current === key) return;
    prevSelKeyRef.current = key;
    applyPhysicalLayout(catalog[key] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.brand, config.branch, config.screen, catalogLoading]);

  const presetExists = selectionComplete && !!catalog[configKey(config)];

  // 성공 시 true, 실패 시 false 반환 — 버튼이 로딩/완료 상태를 표시하는 데 사용
  async function publishPreset(): Promise<boolean> {
    if (!admin || !selectionComplete) return false;
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
      await setDoc(doc(db, COLLECTION, key), {
        ...preset,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid ?? null,
      });
      setCatalog((c) => ({ ...c, [key]: preset }));
      return true;
    } catch (e) {
      console.error("지점 레이아웃 게시 실패", e);
      alert("게시에 실패했어요.");
      return false;
    }
  }

  return {
    isAdmin: admin,          // effective (모드 반영)
    accountIsAdmin,          // 계정 자체가 관리자인지 (토글 노출 판단용)
    publicTheaters,
    catalogLoading,
    presetExists,
    selectionComplete,      // 게시 가능한(브랜드·지점·상영관 모두 채워진) 선택인지
    publishPreset,
    refetchCatalog: fetchCatalog,
  };
}
