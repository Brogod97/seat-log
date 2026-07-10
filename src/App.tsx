import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import SeatMapForm from "./components/SeatMapForm";
import { themeFor } from "./theme";
import { SunIcon, MoonIcon, ResetIcon } from "./components/icons";
import { AccountCard } from "./components/sidebar/AccountCard";
import { SavedList } from "./components/sidebar/SavedList";
import { PreviewArea } from "./components/preview/PreviewArea";
import { MobileEditOverlay } from "./components/mobile/MobileEditOverlay";
import { useTheme } from "./hooks/useTheme";
import { useCompact } from "./hooks/useCompact";
import { useFitScale } from "./hooks/useFitScale";
import { useSeatMapConfig } from "./hooks/useSeatMapConfig";
import { useSavedConfigs } from "./hooks/useSavedConfigs";
import { useTheaterLayoutPreset } from "./hooks/useTheaterLayoutPreset";
import { useImageDownload } from "./hooks/useImageDownload";

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
  const { theme, setTheme } = useTheme();
  const compact = useCompact();
  const {
    saves,
    user,
    authReady,
    lastSavedAt,
    importRef,
    login,
    logout,
    saveCurrentConfig,
    loadSavedConfig,
    deleteSavedConfig,
    exportJson,
    importJson,
  } = useSavedConfigs({ config, setConfig, setEditMode });
  const {
    isAdmin,
    publicTheaters,
    catalogLoading,
    presetExists,
    publishPreset,
  } = useTheaterLayoutPreset({ user, config, setConfig });
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

  // 프리뷰를 영역에 맞춰 확대/축소 (다운로드 추출엔 영향 없음 — transform은 시각 효과)
  const { fitAreaRef, fitContentRef, fitScale, fitHeight } =
    useFitScale(compact);

  const { exportRef, downloadImage } = useImageDownload({
    config,
    editMode,
    completeEditMode,
  });

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
    isAdmin,
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
          <AccountCard
            user={user}
            authReady={authReady}
            lastSavedAt={lastSavedAt}
            onLogin={login}
            onLogout={logout}
          />

          <SavedList
            saves={saves}
            onLoad={loadSavedConfig}
            onDelete={deleteSavedConfig}
          />

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
          isAdmin={isAdmin}
          publicTheaters={publicTheaters}
          catalogLoading={catalogLoading}
          presetExists={presetExists}
          onPublishPreset={publishPreset}
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
        <PreviewArea
          fitAreaRef={fitAreaRef}
          fitContentRef={fitContentRef}
          exportRef={exportRef}
          fitScale={fitScale}
          fitHeight={fitHeight}
          compact={compact}
          previewProps={previewProps}
        />

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
        {compact && mobileEditOpen && (
          <MobileEditOverlay
            config={config}
            isAdmin={isAdmin}
            mobileScreen={mobileScreen}
            setMobileScreen={setMobileScreen}
            mobileZoneMode={mobileZoneMode}
            setMobileZoneMode={setMobileZoneMode}
            ghostSel={ghostSel}
            setGhostSel={setGhostSel}
            previewProps={previewProps}
            cancelEditMode={cancelEditMode}
            completeEditMode={completeEditMode}
            closeMobileEdit={closeMobileEdit}
            enterGridResize={enterGridResize}
            enterEditMode={enterEditMode}
            setGridSize={setGridSize}
          />
        )}
      </main>
    </div>
  );
}

export default App;
