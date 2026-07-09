import { useEffect, useRef, useState } from "react";

const MAX_FIT_SCALE = 2.5;

// 프리뷰를 영역에 맞춰 확대/축소 (다운로드 추출엔 영향 없음 — transform은 시각 효과)
export function useFitScale(compact: boolean) {
  const fitAreaRef = useRef<HTMLDivElement>(null);
  const fitContentRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [fitHeight, setFitHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const area = fitAreaRef.current;
    const content = fitContentRef.current;
    if (!area || !content) return;
    function recompute() {
      const a = fitAreaRef.current,
        el = fitContentRef.current;
      if (!a || !el) return;
      const naturalW = el.offsetWidth,
        naturalH = el.offsetHeight;
      if (naturalW <= 0 || naturalH <= 0) return;
      const availW = a.clientWidth;
      const wScale = availW / naturalW;
      // 좌우 분할(비-compact)에선 영역 높이도 고려해 넘치지 않게, 모바일 스택에선 너비만(세로 스크롤 허용)
      const hScale = compact ? Infinity : a.clientHeight / naturalH;
      const s = Math.min(wScale, hScale, MAX_FIT_SCALE);
      setFitScale(s);
      setFitHeight(naturalH * s);
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(area);
    ro.observe(content);
    return () => ro.disconnect();
  }, [compact]);

  return { fitAreaRef, fitContentRef, fitScale, fitHeight };
}
