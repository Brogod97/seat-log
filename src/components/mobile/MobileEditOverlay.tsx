import type { ComponentProps, Dispatch, SetStateAction } from "react";
import SeatMapPreview from "../SeatMapPreview";
import { PublishLayoutButton } from "../PublishLayoutButton";
import { indexToLabel } from "../../utils/rowLabel";
import type { SeatMapConfig, EditMode } from "../../types";

type MobileScreen = "seat" | "layout" | "zone" | "exit";

interface Props {
  config: SeatMapConfig;
  isAdmin: boolean;
  mobileScreen: MobileScreen;
  setMobileScreen: Dispatch<SetStateAction<MobileScreen>>;
  mobileZoneMode: "aisle" | "excluded";
  setMobileZoneMode: Dispatch<SetStateAction<"aisle" | "excluded">>;
  ghostSel: { rows: number; cols: number };
  setGhostSel: Dispatch<SetStateAction<{ rows: number; cols: number }>>;
  previewProps: Omit<ComponentProps<typeof SeatMapPreview>, "viewOnly">;
  cancelEditMode: () => void;
  completeEditMode: () => void;
  closeMobileEdit: () => void;
  enterGridResize: () => void;
  enterEditMode: (mode: EditMode) => void;
  setGridSize: (rows: number, cols: number) => void;
  presetExists: boolean;
  canPublish: boolean; // 브랜드·지점·상영관이 모두 채워져 게시 가능한지
  onPublish: () => Promise<boolean>;
}

// 모바일 전체화면 편집 오버레이 (시안 3: 헤더 + 카드 + 바텀시트)
export function MobileEditOverlay({
  config,
  isAdmin,
  mobileScreen,
  setMobileScreen,
  mobileZoneMode,
  setMobileZoneMode,
  ghostSel,
  setGhostSel,
  previewProps,
  cancelEditMode,
  completeEditMode,
  closeMobileEdit,
  enterGridResize,
  enterEditMode,
  setGridSize,
  presetExists,
  canPublish,
  onPublish,
}: Props) {
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
            <div className="text-xs text-gray-400 truncate">{subtitle}</div>
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
        {mobileScreen === "layout" && isAdmin && (
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
            onGhostSelChange={(rows, cols) => setGhostSel({ rows, cols })}
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
            {isAdmin && (
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
            )}
            {/* 공용 레이아웃 게시 — 편집을 마친 뒤 이 화면에서 바로 게시 (동선 개선) */}
            {isAdmin && canPublish && (
              <PublishLayoutButton presetExists={presetExists} onPublish={onPublish} />
            )}
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
              우하단 <span className="text-accent font-medium">● 핸들</span>을
              끌어 크기를 조절하세요. (그 외 영역은 스크롤)
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
                onClick={() => setGridSize(ghostSel.rows, ghostSel.cols)}
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
                : "좌석을 탭하면 제외/해제가 토글돼요. (여러 칸 드래그 칠하기는 PC에서)"}
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
}
