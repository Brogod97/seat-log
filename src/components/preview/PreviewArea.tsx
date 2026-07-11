import type { ComponentProps, RefObject } from "react";
import SeatMapPreview from "../SeatMapPreview";

interface Props {
  fitAreaRef: RefObject<HTMLDivElement | null>;
  fitContentRef: RefObject<HTMLDivElement | null>;
  exportRef: RefObject<HTMLDivElement | null>;
  fitScale: number;
  fitHeight: number | undefined;
  compact: boolean;
  previewProps: Omit<ComponentProps<typeof SeatMapPreview>, "viewOnly">;
  onOpenViewer?: () => void; // compact: 프리뷰 탭 시 확대 뷰어 열기
}

// 좌석표 미리보기 = 다운로드 이미지 영역. 영역에 맞춰 확대/축소 (compact에선 보기 전용)
export function PreviewArea({
  fitAreaRef,
  fitContentRef,
  exportRef,
  fitScale,
  fitHeight,
  compact,
  previewProps,
  onOpenViewer,
}: Props) {
  const tappable = compact && !!onOpenViewer;
  return (
    // 가용 영역 측정용 (좌우 분할 시 높이까지 채움)
    <div
      ref={fitAreaRef}
      className="relative w-full lg:landscape:h-full overflow-hidden flex items-center justify-center"
      style={{ height: compact ? fitHeight : undefined }}
    >
      {/* transform으로 확대/축소 (추출엔 미반영). 중앙 기준 스케일이라 확대/축소해도 중앙 정렬 유지 */}
      <div
        ref={fitContentRef}
        className="inline-block"
        style={{
          transform: `scale(${fitScale})`,
          transformOrigin: "center",
        }}
      >
        {/* 점선 테두리는 미리보기용 — ref는 안쪽 카드에 있어 PNG에는 미포함 */}
        <div className="inline-block rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-1">
          <div ref={exportRef} className="inline-block bg-white rounded-lg p-6">
            <SeatMapPreview {...previewProps} viewOnly={compact} />
          </div>
        </div>
      </div>

      {/* 보기 전용 프리뷰 위에 투명 오버레이로 탭을 받음 (내부 그리드가 stopPropagation 하므로 버블링 대신 오버레이 사용) */}
      {tappable && (
        <button
          type="button"
          onClick={onOpenViewer}
          aria-label="좌석표 크게 보기"
          className="absolute inset-0 z-10 cursor-zoom-in"
        />
      )}

      {tappable && (
        <span className="absolute bottom-2 right-2 z-20 pointer-events-none flex items-center gap-1 px-2 py-1 rounded-full bg-black/55 text-white text-[11px] font-medium">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
          </svg>
          크게 보기
        </span>
      )}
    </div>
  );
}
