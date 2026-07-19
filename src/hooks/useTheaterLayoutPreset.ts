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
import { CUSTOM } from "../data/theaters";
import { naturalCompare, screenCompare } from "../utils/sort";
import { sameStructure, samePersonalData } from "../utils/configCompare";
import { configKey, DEFAULT_CONFIG } from "../utils/storage";
import type { SeatMapConfig, TheaterLayoutPreset, SavedVersion } from "../types";

interface Params {
  user: User | null;
  config: SeatMapConfig;
  setConfig: Dispatch<SetStateAction<SeatMapConfig>>;
  adminMode: boolean; // 관리자 계정이어도 이 토글이 꺼져 있으면 일반 사용자로 동작
  saves: Record<string, SavedVersion[]>; // 사용자 개인 저장(상영관별, 구조별 버전 배열) — 구조 일치 시 자동 병합용
}

export interface PublicTheaterData {
  branches: string[];
  screensByBranch: Record<string, string[]>;
}

const COLLECTION = "theaterLayouts";

// 관리자가 게시한 지점 공용 레이아웃 전체를 한 번에 불러와(catalog) select 옵션 구성 + 자동 적용/게시에 사용
export function useTheaterLayoutPreset({ user, config, setConfig, adminMode, saves }: Params) {
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
  // dirty(미저장 변경) 비교용 — config에 남아 있는 개인 데이터가 "어느 상영관 것인지"를 가리키는
  // 마지막 완성 선택의 키. prevSelKeyRef는 변경 감지용이라 지점/브랜드 변경 중의 미완성 선택
  // (부분 키, 예: 'CGV|인천')으로도 덮이는데(6-5 불변식), 그 부분 키로 저장본을 찾으면 저장본이
  // 있어도 못 찾아 항상 dirty로 오판된다 — 그래서 비교용 키를 분리 (실사용 2차 ①).
  const lastCompleteKeyRef = useRef(configKey(config));
  // "이 키에 대해 지금 구조와 일치하는 저장 버전을 찾아 확인 완료"로 표시된 키.
  // saves는 로그인 후 Firestore와 비동기로 동기화되므로, 상영관을 선택하는 시점엔 아직 동기화 전이라
  // 매칭되는 버전이 안 보일 수 있다 — 이 경우 null로 남겨두고, saves가 갱신되면 재확인 effect가 재시도한다.
  const mergedKeyRef = useRef<string | null>(null);

  // 계정이 관리자인지(raw) vs 실제 관리자 권한 발동 여부(effective = 계정관리자 && 모드ON)
  const accountIsAdmin = checkIsAdmin(user);
  const admin = accountIsAdmin && adminMode;
  // 게시 가능 여부이자 자동 적용 기준: 정적 목록에 있는지가 아니라 브랜드·지점·상영관이 모두
  // 채워졌는지로 판단. 관리자가 직접 입력(CUSTOM)한 지점/상영관도 게시·자동 적용 둘 다 동작해야 함
  // (CUSTOM 입력 자체는 관리자에게만 노출되므로, 일반 사용자가 고르는 publicTheaters엔 영향 없음).
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
    // 삽입 순서(사전식) 대신 자연 정렬 — 지점은 자연 정렬, 상영관은 일반관 숫자순 뒤 특별관
    for (const brandEntry of Object.values(result)) {
      brandEntry.branches.sort(naturalCompare);
      for (const screens of Object.values(brandEntry.screensByBranch)) {
        screens.sort(screenCompare);
      }
    }
    return result;
  }, [catalog]);

  function applySelection(key: string) {
    const preset = catalog[key] ?? null;
    const structure = {
      rows: preset?.rows ?? DEFAULT_CONFIG.rows,
      cols: preset?.cols ?? DEFAULT_CONFIG.cols,
      rowAisles: preset?.rowAisles ?? [],
      colAisles: preset?.colAisles ?? [],
      excludedSeats: preset?.excludedSeats ?? [],
      exits: preset?.exits ?? [],
    };
    // 구조가 완전히 같은 버전이 있을 때만 개인 데이터(시선일치/명당/실관람)를 함께 병합.
    // 다르면 좌표가 같아도 좌석의 의미가 달라졌을 수 있어 자동 병합하지 않는다
    // (개인 데이터는 버전 배열에 그대로 보존 — saveCurrentConfig가 덮어쓰지 않고 새 버전으로 추가함).
    const versions = saves[key] ?? [];
    const personalSave = versions.find((v) => sameStructure(structure, v));
    setConfig((cur) => ({
      ...cur,
      ...structure,
      sightRows: personalSave ? personalSave.sightRows : [],
      primeRanges: personalSave ? personalSave.primeRanges : [],
      watchedSeats: personalSave ? personalSave.watchedSeats : [],
    }));
    // 매칭되는 버전을 찾았을 때만 "확인 완료"로 표시. 못 찾았으면 null로 남겨 saves가
    // 나중에 동기화됐을 때 아래 재확인 effect가 다시 시도하게 한다.
    mergedKeyRef.current = personalSave ? key : null;
  }

  // 선택(브랜드/지점/상영관)이 바뀌면 카탈로그에서 동기적으로 조회해 적용(있으면 프리셋, 없으면 빈 레이아웃)
  useEffect(() => {
    if (catalogLoading) return;
    const key = configKey(config);
    if (!selectionComplete) {
      // 초기화 등으로 선택이 비워진 경우 — prevSelKeyRef를 그대로 두면, 나중에 초기화 전과
      // 똑같은 상영관을 다시 골랐을 때 "선택이 안 바뀐 것"으로 오인해 자동 적용을 건너뛰게 된다.
      // 이 "빈 선택" 상태도 하나의 선택으로 기록해둬야 다음 선택이 항상 변경으로 인식된다.
      // 단 lastCompleteKeyRef는 갱신하지 않는다 — config에 남은 개인 데이터는 여전히 직전 완성 선택의 것.
      prevSelKeyRef.current = key;
      mergedKeyRef.current = null;
      return;
    }
    // 선택 키가 실제로 바뀐 경우에만 적용 — 복원/카탈로그 로드 시엔 confirm이 뜨지 않게 함
    if (prevSelKeyRef.current === key) return;
    prevSelKeyRef.current = key;

    // 저장하지 않은 변경사항이 실제로 있을 때만 경고. 비교 대상은 부분 키(prevSelKeyRef)가 아니라
    // 개인 데이터의 출처인 마지막 완성 선택(lastCompleteKeyRef)의 저장본 — 지점/브랜드 변경은
    // 미완성 선택을 거치므로 부분 키로 찾으면 저장돼 있어도 항상 dirty로 오판된다 (실사용 2차 ①).
    const c = configRef.current;
    const hasPersonalData =
      c.sightRows.length > 0 ||
      c.primeRanges.length > 0 ||
      c.watchedSeats.length > 0;
    const prevVersions = saves[lastCompleteKeyRef.current] ?? [];
    const prevSave = prevVersions.find((v) => sameStructure(c, v));
    const isDirty = hasPersonalData && (!prevSave || !samePersonalData(c, prevSave));
    if (
      isDirty &&
      !confirm(
        "저장하지 않은 시선일치/명당/실관람 변경사항이 있어요. 지점을 바꾸면 사라져요. 계속할까요?",
      )
    )
      return;

    lastCompleteKeyRef.current = key;
    applySelection(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.brand, config.branch, config.screen, catalogLoading]);

  // saves가 뒤늦게 동기화돼 매칭되는 버전이 새로 나타난 경우 재시도 (선택 자체는 안 바뀌었으므로
  // 위 effect는 다시 실행되지 않음 — saves 변경에 반응하는 이 effect가 대신 따라잡는다).
  // 같은 선택에서 이미 확인 완료(mergedKeyRef)면 스킵하고, 사용자가 그 사이 직접 입력을 시작했다면
  // (개인 레이어가 비어있지 않으면) 덮어쓰지 않는다.
  useEffect(() => {
    if (catalogLoading || !selectionComplete) return;
    const key = configKey(config);
    if (mergedKeyRef.current === key) return;
    // 구조는 configRef(=config)가 아니라 catalog에서 다시 계산한다 — 위 selection-change effect의
    // setConfig가 아직 반영되기 전(같은 커밋의 effect 큐 안)이라 configRef가 "직전 상영관"의 구조를
    // 들고 있는 짧은 순간이 있는데, 그때의 구조로 매칭하면 (둘 다 기본 구조인 경우 등) 엉뚱한 상영관의
    // 저장본을 잘못 매칭할 위험이 있다. applySelection과 동일한 소스(catalog)로 계산해 이를 피한다.
    const preset = catalog[key] ?? null;
    const structure = {
      rows: preset?.rows ?? DEFAULT_CONFIG.rows,
      cols: preset?.cols ?? DEFAULT_CONFIG.cols,
      rowAisles: preset?.rowAisles ?? [],
      colAisles: preset?.colAisles ?? [],
      excludedSeats: preset?.excludedSeats ?? [],
      exits: preset?.exits ?? [],
    };
    const match = (saves[key] ?? []).find((v) => sameStructure(structure, v));
    if (!match) return;
    const c = configRef.current;
    const untouched =
      c.sightRows.length === 0 &&
      c.primeRanges.length === 0 &&
      c.watchedSeats.length === 0;
    if (untouched) {
      setConfig((cur) => ({
        ...cur,
        sightRows: match.sightRows,
        primeRanges: match.primeRanges,
        watchedSeats: match.watchedSeats,
      }));
    }
    mergedKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saves, catalog, config.brand, config.branch, config.screen, catalogLoading]);

  const presetExists = selectionComplete && !!catalog[configKey(config)];

  // 현재 선택된 상영관의 저장 버전들 중 지금 구조와 일치하는 게 있는지, 없다면 가장 최근 버전
  // (읽기 전용 열람용). 구조 필드는 사용자가 직접 편집하지 않아(관리자 전용) config 변경에 안정적으로 반응 가능.
  const currentVersions = saves[configKey(config)] ?? [];
  const currentStructure = {
    rows: config.rows,
    cols: config.cols,
    rowAisles: config.rowAisles,
    colAisles: config.colAisles,
    excludedSeats: config.excludedSeats,
    exits: config.exits,
  };
  const matchingSave = currentVersions.find((v) => sameStructure(currentStructure, v));
  const personalDataRestored = selectionComplete && !!matchingSave;
  // 지금 구조에 병합된 버전과 별개로, 다른 구조로 저장해둔 버전들이 있으면 전부 상시 열람 가능하게 노출.
  // 현재 버전이 정상 병합됐는지와 무관 — 구조가 여러 번 바뀌었어도 예전 버전 전부를 볼 수 있어야 함.
  const staleVersions = selectionComplete
    ? currentVersions.filter((v) => v !== matchingSave)
    : [];

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
    personalDataRestored,   // 현재 상영관의 개인 저장이 구조 일치로 자동 병합됐는지
    staleVersions,          // 다른 구조로 저장해둔 버전들 (읽기 전용 열람용, 여러 개일 수 있음)
    publishPreset,
    refetchCatalog: fetchCatalog,
  };
}
