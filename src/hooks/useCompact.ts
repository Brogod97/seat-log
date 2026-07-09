import { useEffect, useState } from "react";

// 좁은 화면(모바일·세로 태블릿) 감지 — 편집을 전체화면 오버레이로 분리하는 기준
export function useCompact(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(
      "(max-width: 1023px), (orientation: portrait)",
    );
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return compact;
}
