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
}: Props) {
  return (
    // 가용 영역 측정용 (좌우 분할 시 높이까지 채움)
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
          <div ref={exportRef} className="inline-block bg-white rounded-lg p-6">
            <SeatMapPreview {...previewProps} viewOnly={compact} />
          </div>
        </div>
      </div>
    </div>
  );
}
