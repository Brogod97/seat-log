import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, PointerEvent as ReactPointerEvent } from "react";
import SeatMapPreview from "../SeatMapPreview";

interface Props {
  onClose: () => void;
  previewProps: Omit<ComponentProps<typeof SeatMapPreview>, "viewOnly">;
}

const MAX_ZOOM_FACTOR = 5; // baseFit 대비 최대 확대 배율

// 회전 순환: 오른쪽 가로(90) → 세로(0) → 왼쪽 가로(-90) → 다시 오른쪽 가로
function nextRotation(r: number): number {
  return r === 90 ? 0 : r === 0 ? -90 : 90;
}

// 모바일 좌석표 확대 뷰어 — 검은 오버레이 위에 회전(가로/세로)해 꽉 채우고 핀치 줌/팬
export function PreviewViewer({ onClose, previewProps }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const baseFitRef = useRef(1);
  const [rotation, setRotation] = useState(90); // 기본: 오른쪽 가로
  const [zoom, setZoom] = useState(0); // 0 = 측정 전(비표시)
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // 현재 회전 상태에 맞춰 카드를 화면에 꽉 맞추는 baseFit 계산 (paint 전, 회전 바뀔 때마다)
  useLayoutEffect(() => {
    const stage = stageRef.current,
      card = cardRef.current;
    if (!stage || !card) return;
    const sw = stage.clientWidth,
      sh = stage.clientHeight;
    const W = card.offsetWidth,
      H = card.offsetHeight;
    if (!W || !H) return;
    // 가로(±90)면 회전 후 폭=원본높이(H)·높이=원본폭(W), 세로(0)면 그대로
    const landscape = Math.abs(rotation) === 90;
    const rw = landscape ? H : W;
    const rh = landscape ? W : H;
    const fit = Math.min(sw / rw, sh / rh) * 0.96;
    baseFitRef.current = fit > 0 ? fit : 1;
    setZoom(baseFitRef.current);
    setTx(0);
    setTy(0);
  }, [rotation]);

  // 현재 transform 값을 클로저 최신화 없이 읽기 위한 ref
  const stateRef = useRef({ zoom, tx, ty });
  stateRef.current = { zoom, tx, ty };

  // 포인터 추적 (핀치 줌/팬)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const prevRef = useRef<{ c: { x: number; y: number }; dist: number } | null>(
    null,
  );
  const lastTapRef = useRef(0);

  function summary() {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const a = pts[0],
        b = pts[1];
      return {
        c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        dist: Math.hypot(a.x - b.x, a.y - b.y),
      };
    }
    return { c: pts[0], dist: 0 };
  }

  function stageCenter() {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function onPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    prevRef.current = summary();
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = summary();
    const prev = prevRef.current;
    if (!prev || !cur.c) return;

    const center = stageCenter();
    const M = { x: cur.c.x - center.x, y: cur.c.y - center.y };
    const PM = { x: prev.c.x - center.x, y: prev.c.y - center.y };
    const s = stateRef.current;

    const scaleFactor = cur.dist && prev.dist ? cur.dist / prev.dist : 1;
    const min = baseFitRef.current,
      max = baseFitRef.current * MAX_ZOOM_FACTOR;
    const newZoom = Math.min(max, Math.max(min, s.zoom * scaleFactor));
    const k = s.zoom ? newZoom / s.zoom : 1;
    // 손가락 아래 지점 고정: t' = M - k*(PM - t)
    setZoom(newZoom);
    setTx(M.x - k * (PM.x - s.tx));
    setTy(M.y - k * (PM.y - s.ty));

    prevRef.current = cur;
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    prevRef.current = pointers.current.size ? summary() : null;
    // 더블탭 = fit으로 리셋
    if (pointers.current.size === 0) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        setZoom(baseFitRef.current);
        setTx(0);
        setTy(0);
      }
      lastTapRef.current = now;
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col select-none">
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 py-3 text-white/90">
        <span className="text-xs text-white/60">핀치로 확대 · 더블탭 리셋</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRotation(nextRotation)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white"
            aria-label="회전"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v4h-4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white text-lg leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      </div>

      {/* 무대 (핀치 줌/팬) */}
      <div
        ref={stageRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: "center",
            visibility: zoom > 0 ? "visible" : "hidden",
          }}
        >
          <div ref={cardRef} className="inline-block bg-white rounded-lg p-4">
            <SeatMapPreview {...previewProps} viewOnly />
          </div>
        </div>
      </div>
    </div>
  );
}
