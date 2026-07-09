import { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import { toPng } from "html-to-image";
import SeatMapForm from "./components/SeatMapForm";
import SeatMapPreview from "./components/SeatMapPreview";
import type { SeatMapConfig } from "./types";
import { themeFor } from "./theme";
import { indexToLabel } from "./utils/rowLabel";
import {
  SunIcon,
  MoonIcon,
  ResetIcon,
  SyncedCheckIcon,
  GoogleGIcon,
} from "./components/icons";
import { auth, googleProvider, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { relativeTime } from "./utils/relativeTime";
import {
  LAST_SAVED_KEY,
  DEFAULT_CONFIG,
  configKey,
  loadSaves,
  writeSaves,
} from "./utils/storage";
import { useTheme } from "./hooks/useTheme";
import { useCompact } from "./hooks/useCompact";
import { useFitScale } from "./hooks/useFitScale";
import { useSeatMapConfig } from "./hooks/useSeatMapConfig";

function App() {
  const {
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
  } = useSeatMapConfig();
  const [saves, setSaves] = useState<Record<string, SeatMapConfig>>(loadSaves);
  const { theme, setTheme } = useTheme();
  const importRef = useRef<HTMLInputElement>(null);

  // --- Firebase 기기 간 동기화 (로그인 시에만, local-first) ---
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(LAST_SAVED_KEY));
    return v > 0 ? v : null;
  });
  const unsubSnapRef = useRef<(() => void) | null>(null);

  const savesDoc = (uid: string) => doc(db, "users", uid, "state", "saves");

  async function pushSaves(next: Record<string, SeatMapConfig>) {
    const u = auth.currentUser;
    if (!u) return;
    try {
      await setDoc(savesDoc(u.uid), {
        saves: next,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("동기화 업로드 실패", e);
    }
  }

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      // 이전 구독 정리
      if (unsubSnapRef.current) {
        unsubSnapRef.current();
        unsubSnapRef.current = null;
      }
      if (!u) return;
      const ref = savesDoc(u.uid);
      try {
        // 최초: 로컬 + 원격 병합 (원격 우선), 다시 업로드
        const snap = await getDoc(ref);
        const remote = (
          snap.exists() ? (snap.data().saves ?? {}) : {}
        ) as Record<string, SeatMapConfig>;
        const local = loadSaves();
        const merged = { ...local, ...remote };
        setSaves(merged);
        writeSaves(merged);
        await setDoc(ref, { saves: merged, updatedAt: serverTimestamp() });
        // 이후: 다른 기기 변경을 실시간 반영
        unsubSnapRef.current = onSnapshot(ref, (s) => {
          if (s.metadata.hasPendingWrites) return; // 내 쓰기는 무시(루프 방지)
          const rs = (s.data()?.saves ?? {}) as Record<string, SeatMapConfig>;
          setSaves(rs);
          writeSaves(rs);
        });
      } catch (e) {
        console.error("동기화 초기화 실패", e);
      }
    });
    return () => {
      unsubAuth();
      if (unsubSnapRef.current) unsubSnapRef.current();
    };
  }, []);

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (
        err.code !== "auth/popup-closed-by-user" &&
        err.code !== "auth/cancelled-popup-request"
      ) {
        alert("로그인 실패: " + (err.message ?? err.code));
      }
    }
  }
  async function logout() {
    await signOut(auth);
  }

  const compact = useCompact();
  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  // 모바일 오버레이 화면 (시안 3): 좌석 설정 / 레이아웃 / 복도·제외 / 출입구
  const [mobileScreen, setMobileScreen] = useState<
    "seat" | "layout" | "zone" | "exit"
  >("seat");
  // 모바일 레이아웃 편집: 고스트 그리드 선택값 미러 (바텀시트 표시·적용용)
  const [ghostSel, setGhostSel] = useState({ rows: 10, cols: 20 });
  // 모바일 복도·제외구역 모드 (바텀시트 토글로 제어)
  const [mobileZoneMode, setMobileZoneMode] = useState<"aisle" | "excluded">(
    "aisle",
  );
  // compact에서 편집 모드가 켜지면 전체화면 오버레이를 띄우고 화면을 동기화
  useEffect(() => {
    if (compact && editMode !== null) {
      setMobileEditOpen(true);
      if (editMode === "layout")
        setMobileScreen(layoutPhase === "size" ? "layout" : "zone");
    }
  }, [compact, editMode, layoutPhase]);

  // 오버레이 내 화면 전환 동기화: 크기 적용 → 복도·제외, 편집 종료 → 좌석 설정
  useEffect(() => {
    if (!mobileEditOpen) return;
    if (
      mobileScreen === "layout" &&
      editMode === "layout" &&
      layoutPhase === "edit"
    )
      setMobileScreen("zone");
    if (
      (mobileScreen === "layout" || mobileScreen === "zone") &&
      editMode === null
    )
      setMobileScreen("seat");
  }, [mobileEditOpen, mobileScreen, editMode, layoutPhase]);

  function closeMobileEdit() {
    completeEditMode();
    setMobileEditOpen(false);
    setMobileScreen("seat");
  }

  function saveCurrentConfig() {
    const key = configKey(config);
    const next = { ...saves, [key]: config };
    setSaves(next);
    writeSaves(next);
    pushSaves(next);
    const now = Date.now();
    setLastSavedAt(now);
    try {
      localStorage.setItem(LAST_SAVED_KEY, String(now));
    } catch {}
  }

  function loadSavedConfig(key: string) {
    const saved = saves[key];
    if (saved) {
      setConfig({ ...DEFAULT_CONFIG, ...saved });
      setEditMode(null);
    }
  }

  function deleteSavedConfig(key: string) {
    if (!confirm(`'${key.replace(/\|/g, " ")}' 저장을 삭제할까요?`)) return;
    const next = { ...saves };
    delete next[key];
    setSaves(next);
    writeSaves(next);
    pushSaves(next);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(saves, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "seat-log.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (typeof parsed === "object" && parsed !== null) {
          const next = { ...saves, ...parsed };
          setSaves(next);
          writeSaves(next);
          pushSaves(next);
        }
      } catch {
        alert("파일을 읽을 수 없어요.");
      }
      if (importRef.current) importRef.current.value = "";
    };
    reader.readAsText(file);
  }
  const exportRef = useRef<HTMLDivElement>(null);

  // 프리뷰를 영역에 맞춰 확대/축소 (다운로드 추출엔 영향 없음 — transform은 시각 효과)
  const { fitAreaRef, fitContentRef, fitScale, fitHeight } =
    useFitScale(compact);

  async function downloadImage() {
    if (!exportRef.current) return;
    // 편집 중이면 편집 UI(테두리·핸들)가 이미지에 섞이므로 먼저 종료
    if (editMode) {
      completeEditMode();
      await new Promise((r) => requestAnimationFrame(r));
    }
    const title =
      [config.brand, config.branch, config.screen].filter(Boolean).join(" ") ||
      "좌석표";
    const dataUrl = await toPng(exportRef.current, { pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${title}.png`;
    a.click();
  }

  const previewProps = {
    config,
    editMode,
    layoutPhase,
    modeStartPos,
    onEnterModeFrom: enterModeFrom,
    onCancelEditMode: cancelEditMode,
    onCompleteEditMode: completeEditMode,
    onSetGridSize: setGridSize,
    onToggleExcludedSeat: toggleExcludedSeat,
    onExcludeSeats: excludeSeats,
    onAddPrimeRange: addPrimeRange,
    onRemovePrimeRange: removePrimeRange,
    onAddWatchedRange: addWatchedRange,
    onToggleWatchedSeat: toggleWatchedSeat,
    onSetWatchedMemo: setWatchedMemo,
    onToggleSightRow: toggleSightRow,
    onToggleAisle: toggleRowAisle,
    onToggleColAisle: toggleColAisle,
    onToggleExit: toggleExit,
  };

  const brandTheme = themeFor(config.brand);

  return (
    <div
      className="flex flex-col lg:landscape:flex-row min-h-screen lg:landscape:h-screen bg-gray-50 dark:bg-gray-900"
      style={
        {
          "--accent": brandTheme.accent,
          "--accent-hover": brandTheme.accentHover,
        } as CSSProperties
      }
    >
      <aside className="order-2 lg:landscape:order-1 w-full lg:landscape:w-80 shrink-0 bg-white dark:bg-gray-800 border-t lg:landscape:border-t-0 lg:landscape:border-r border-gray-200 dark:border-gray-700 p-4 lg:landscape:p-6 lg:landscape:overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
            <img
              src="/logo.svg"
              width="24"
              height="24"
              alt=""
              className="shrink-0 rounded-md"
            />
            Seat Log
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors"
              title={
                theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
              }
              aria-label={
                theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
              }
            >
              {theme === "dark" ? (
                <MoonIcon size={18} />
              ) : (
                <SunIcon size={18} />
              )}
            </button>
            <button
              type="button"
              onClick={resetConfig}
              className="flex items-center gap-1 text-xs pl-2 pr-2.5 py-1.5 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-red-200 transition-colors"
            >
              <ResetIcon size={15} /> 초기화
            </button>
          </div>
        </div>

        {/* 저장 / 불러오기 */}
        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          {/* 기기 간 동기화 (Google 로그인) */}
          <div className="mb-3">
            {user ? (
              (() => {
                const name =
                  user.displayName || (user.email ?? "").split("@")[0];
                const initial = (name || "?").trim().charAt(0).toUpperCase();
                return (
                  <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-600">
                    <div
                      className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{
                        background: "linear-gradient(135deg, #ffd06e, #ea9430)",
                      }}
                    >
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                          {name}
                        </span>
                        <span className="inline-flex items-center gap-0.5 shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                          <SyncedCheckIcon size={11} /> 동기화됨
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                        {user.email}
                        {lastSavedAt ? ` · ${relativeTime(lastSavedAt)}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={logout}
                      className="shrink-0 text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      로그아웃
                    </button>
                  </div>
                );
              })()
            ) : (
              <button
                type="button"
                onClick={login}
                disabled={!authReady}
                className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                title="로그인하면 여러 기기에서 저장 목록이 동기화돼요"
              >
                <GoogleGIcon size={15} />
                Google 로그인
              </button>
            )}
          </div>

          {/* 저장된 좌석표 목록 (불러오기 / 삭제) */}
          {Object.keys(saves).length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                저장된 좌석표
              </p>
              <div className="flex flex-col gap-1">
                {Object.keys(saves).map((key) => (
                  <div
                    key={key}
                    className="flex items-center gap-1 rounded border border-gray-200 dark:border-gray-600"
                  >
                    <button
                      type="button"
                      onClick={() => loadSavedConfig(key)}
                      className="flex-1 text-left text-xs px-2 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-l truncate"
                      title="불러오기"
                    >
                      {key.replace(/\|/g, " ")}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedConfig(key)}
                      className="px-2 py-1.5 text-gray-400 hover:text-red-500 text-sm"
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 저장 / JSON */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={saveCurrentConfig}
              className="flex-1 text-xs px-2 py-1.5 btn-accent rounded font-medium"
            >
              현재 저장
            </button>
            <button
              type="button"
              onClick={exportJson}
              disabled={Object.keys(saves).length === 0}
              className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="JSON 내보내기"
            >
              내보내기
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="JSON 가져오기"
            >
              가져오기
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={importJson}
            />
          </div>
        </div>
        <SeatMapForm
          config={config}
          onChange={setConfig}
          editMode={editMode}
          onEnterEditMode={enterEditMode}
          onEnterGridResize={enterGridResize}
          onCancelEditMode={cancelEditMode}
          onCompleteEditMode={completeEditMode}
        />

        {/* 이미지 다운로드 — 패널 하단 (모바일에선 페이지 맨 아래) */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              downloadImage();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 btn-accent text-sm font-semibold rounded-lg"
          >
            ↓ 이미지 다운로드
          </button>
        </div>
      </aside>
      <main
        className="order-1 lg:landscape:order-2 flex-1 p-2 lg:landscape:p-6 lg:landscape:overflow-auto lg:landscape:h-screen"
        onClick={() => {
          if (editMode && !compact) completeEditMode();
        }}
      >
        {/* 좌석표 미리보기 = 다운로드 이미지 영역. 영역에 맞춰 확대/축소. compact에선 보기 전용 */}
        {/* 가용 영역 측정용 (좌우 분할 시 높이까지 채움) */}
        <div
          ref={fitAreaRef}
          className="w-full lg:landscape:h-full overflow-hidden"
          style={{ height: compact ? fitHeight : undefined }}
        >
          {/* transform으로 확대/축소 (추출엔 미반영) */}
          <div
            ref={fitContentRef}
            className="inline-block"
            style={{
              transform: `scale(${fitScale})`,
              transformOrigin: "top left",
            }}
          >
            {/* 점선 테두리는 미리보기용 — ref는 안쪽 카드에 있어 PNG에는 미포함 */}
            <div className="inline-block rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-1">
              <div
                ref={exportRef}
                className="inline-block bg-white rounded-lg p-6"
              >
                <SeatMapPreview {...previewProps} viewOnly={compact} />
              </div>
            </div>
          </div>
        </div>

        {/* 모바일: 프리뷰 바로 아래 편집 진입 버튼 (시안 2a) */}
        {compact && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMobileEditOpen(true);
            }}
            className="w-full mt-3 px-4 py-3 btn-accent text-sm font-semibold rounded-xl"
          >
            좌석표 편집
          </button>
        )}

        {/* 모바일 전체화면 편집 오버레이 (시안 3: 헤더 + 카드 + 바텀시트) */}
        {compact &&
          mobileEditOpen &&
          (() => {
            const subtitle = [config.brand, config.branch, config.screen]
              .filter(Boolean)
              .join(" ");
            const SCREEN_TITLES = {
              seat: "좌석 설정",
              layout: "레이아웃 편집",
              zone: "복도·제외구역",
              exit: "출입구",
            } as const;
            const handleBack = () => {
              if (mobileScreen === "layout" || mobileScreen === "zone")
                cancelEditMode(); // 동기화 효과가 seat으로 되돌림
              else if (mobileScreen === "exit") setMobileScreen("seat");
              else closeMobileEdit();
            };
            return (
              <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-900 flex flex-col">
                {/* 헤더 */}
                <div className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-accent-soft text-accent text-lg shrink-0"
                    aria-label="뒤로"
                  >
                    ‹
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100">
                      {SCREEN_TITLES[mobileScreen]}
                    </div>
                    {subtitle && (
                      <div className="text-xs text-gray-400 truncate">
                        {subtitle}
                      </div>
                    )}
                  </div>
                  {mobileScreen === "seat" && (
                    <button
                      type="button"
                      onClick={closeMobileEdit}
                      className="text-sm px-3 py-1.5 rounded-lg btn-accent font-medium"
                    >
                      완료
                    </button>
                  )}
                  {mobileScreen === "zone" && (
                    <button
                      type="button"
                      onClick={completeEditMode}
                      className="text-sm px-3 py-1.5 rounded-lg btn-accent font-medium"
                    >
                      완료
                    </button>
                  )}
                  {mobileScreen === "exit" && (
                    <button
                      type="button"
                      onClick={() => setMobileScreen("seat")}
                      className="text-sm px-3 py-1.5 rounded-lg btn-accent font-medium"
                    >
                      완료
                    </button>
                  )}
                  {mobileScreen === "layout" && (
                    <button
                      type="button"
                      onClick={enterGridResize}
                      className="text-sm px-3 py-1.5 rounded-lg text-accent font-medium"
                    >
                      초기화
                    </button>
                  )}
                </div>

                {/* 좌석표 카드 (원본 크기 + 스크롤) */}
                <div className="flex-1 overflow-auto p-3">
                  <div className="inline-block bg-white rounded-2xl p-4 min-w-full">
                    <SeatMapPreview
                      {...previewProps}
                      seatMenuAsSheet
                      exitTapMode={mobileScreen === "exit"}
                      ghostHideActions
                      onGhostSelChange={(rows, cols) =>
                        setGhostSel({ rows, cols })
                      }
                      zoneMode={mobileZoneMode}
                      onZoneModeChange={setMobileZoneMode}
                      hideZoneToolbar
                    />
                  </div>
                </div>

                {/* 바텀시트 */}
                <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-t-2xl px-4 pt-3 pb-6 shadow-2xl">
                  <div className="mx-auto w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-600 mb-3" />
                  {mobileScreen === "seat" && (
                    <>
                      <p className="text-xs text-gray-400 mb-3">
                        좌석을 탭해 시선일치행·명당·실관람을 설정하세요.
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            enterGridResize();
                            setMobileScreen("layout");
                          }}
                          className="px-2 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium"
                        >
                          레이아웃 편집
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            enterEditMode("layout");
                            setMobileScreen("zone");
                          }}
                          className="px-2 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium"
                        >
                          복도·제외구역
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileScreen("exit")}
                          className="px-2 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium"
                        >
                          출입구
                        </button>
                      </div>
                    </>
                  )}
                  {mobileScreen === "layout" && (
                    <>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                          선택 범위
                        </span>
                        <span className="text-sm font-bold text-accent">
                          {indexToLabel(ghostSel.rows - 1)} × {ghostSel.cols}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-3">
                        우하단{" "}
                        <span className="text-accent font-medium">● 핸들</span>
                        을 끌어 크기를 조절하세요. (그 외 영역은 스크롤)
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={cancelEditMode}
                          className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setGridSize(ghostSel.rows, ghostSel.cols)
                          }
                          className="flex-1 px-4 py-2.5 text-sm rounded-xl btn-accent font-medium"
                        >
                          이 크기로 적용
                        </button>
                      </div>
                    </>
                  )}
                  {mobileScreen === "zone" && (
                    <>
                      <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">
                        구역 지정
                      </div>
                      <p className="text-xs text-gray-400 mb-3">
                        {mobileZoneMode === "aisle"
                          ? "행·열 사이 틈을 탭해 복도를 지정해요."
                          : "좌석을 탭해 꼭짓점을 잇고, 첫 꼭짓점을 다시 탭하면 제외구역이 확정돼요."}
                      </p>
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => setMobileZoneMode("aisle")}
                          className={`flex-1 px-4 py-2.5 text-sm rounded-xl border font-medium ${mobileZoneMode === "aisle" ? "bg-accent-soft text-accent border-accent-soft" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300"}`}
                        >
                          복도
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileZoneMode("excluded")}
                          className={`flex-1 px-4 py-2.5 text-sm rounded-xl border font-medium ${mobileZoneMode === "excluded" ? "bg-accent-soft text-accent border-accent-soft" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300"}`}
                        >
                          제외구역
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={cancelEditMode}
                          className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={completeEditMode}
                          className="flex-1 px-4 py-2.5 text-sm rounded-xl btn-accent font-medium"
                        >
                          완료
                        </button>
                      </div>
                    </>
                  )}
                  {mobileScreen === "exit" && (
                    <>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                          출입구 위치
                        </span>
                        <span className="text-sm font-bold text-accent">
                          {config.exits.length}곳
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-3">
                        그리드 가장자리 좌석을 탭해 출입구 위치를 표시하세요.
                      </p>
                      <button
                        type="button"
                        onClick={() => setMobileScreen("seat")}
                        className="w-full px-4 py-2.5 text-sm rounded-xl btn-accent font-medium"
                      >
                        완료
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
      </main>
    </div>
  );
}

export default App;
