import { useRef } from "react";
import { toPng } from "html-to-image";
import type { SeatMapConfig, EditMode } from "../types";

interface Params {
  config: SeatMapConfig;
  editMode: EditMode;
  completeEditMode: () => void;
}

// 프리뷰 카드를 PNG로 추출해 다운로드
export function useImageDownload({
  config,
  editMode,
  completeEditMode,
}: Params) {
  const exportRef = useRef<HTMLDivElement>(null);

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

  return { exportRef, downloadImage };
}
