import { useState, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { indexToLabel } from '../../utils/rowLabel'
import { GHOST_MAX_ROWS, GHOST_MAX_COLS, GHOST_CELL } from '../../utils/seatStyles'

// 그리드 크기 선택 — 드래그 사각형 + 코너 핸들 (시안 4a/5a)
export function GhostGrid({
  currentRows,
  currentCols,
  onApply,
  onCancel,
  hideActions = false,
  onSelChange,
}: {
  currentRows: number
  currentCols: number
  onApply: (rows: number, cols: number) => void
  onCancel: () => void
  hideActions?: boolean          // 모바일: 버튼은 바텀시트에서 렌더
  onSelChange?: (rows: number, cols: number) => void
}) {
  const [sel, setSel] = useState({ rows: currentRows, cols: currentCols })
  // PC: 클릭 전까지 마우스 호버를 따라 선택이 움직임. 클릭하면 고정(이후 드래그로 조정)
  const lockedRef = useRef(false)

  // 선택 변경을 부모(바텀시트)에 보고
  useEffect(() => {
    onSelChange?.(sel.rows, sel.cols)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.rows, sel.cols])
  const bodyRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const LABEL_W = 20        // 행 레이블 너비
  const PITCH = GHOST_CELL + 1  // 셀 간격 포함 피치

  function cellFromEvent(e: React.PointerEvent): { row: number; col: number } | null {
    const el = bodyRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    // 조상에 transform: scale이 있으면 시각 크기와 레이아웃 크기가 달라짐 — 배율 보정
    const scaleX = rect.width / el.offsetWidth || 1
    const scaleY = rect.height / el.offsetHeight || 1
    const col = Math.floor((e.clientX - rect.left) / scaleX / PITCH) + 1
    const row = Math.floor((e.clientY - rect.top) / scaleY / PITCH) + 1
    return {
      row: Math.min(Math.max(row, 1), GHOST_MAX_ROWS),
      col: Math.min(Math.max(col, 1), GHOST_MAX_COLS),
    }
  }
  // 그리드 본체 선택은 마우스 전용 (터치는 스크롤에 양보 — 크기 조절은 우하단 핸들로)
  function handleDown(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse') return
    draggingRef.current = true
    lockedRef.current = true  // 클릭한 순간부터 호버 추적 대신 고정
    e.currentTarget.setPointerCapture(e.pointerId)
    const c = cellFromEvent(e)
    if (c) setSel({ rows: c.row, cols: c.col })
  }
  function handleMove(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse') return
    if (draggingRef.current) {
      const c = cellFromEvent(e)
      if (c) setSel({ rows: c.row, cols: c.col })
      return
    }
    // 마우스 호버 추적 (클릭으로 고정하기 전까지)
    if (!lockedRef.current) {
      const c = cellFromEvent(e)
      if (c) setSel({ rows: c.row, cols: c.col })
    }
  }
  function handleUp() {
    draggingRef.current = false
  }

  // 우하단 리사이즈 핸들 (터치·마우스 공통) — 이걸 끌 때만 크기 변경
  const grabbingRef = useRef(false)
  function grabStart(e: React.PointerEvent) {
    e.stopPropagation()
    grabbingRef.current = true
    lockedRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function grabMove(e: React.PointerEvent) {
    if (!grabbingRef.current) return
    e.stopPropagation()
    const c = cellFromEvent(e)
    if (c) setSel({ rows: c.row, cols: c.col })
  }
  function grabEnd() { grabbingRef.current = false }

  const selW = sel.cols * PITCH - 1
  const selH = sel.rows * PITCH - 1
  const handleBase: CSSProperties = {
    position: 'absolute', width: 10, height: 10, borderRadius: '50%',
    background: '#fff', border: '2px solid var(--accent)',
    transform: 'translate(-50%, -50%)', pointerEvents: 'none',
  }

  return (
    <div>
      {/* 미니 스크린 라인 */}
      <div style={{ paddingLeft: LABEL_W + 1, width: GHOST_MAX_COLS * PITCH + LABEL_W, marginBottom: 12 }}>
        <div style={{ width: '55%', margin: '0 auto' }}>
          <div style={{ height: 2, borderRadius: 1, background: 'linear-gradient(to right, transparent, #d1d5db 20%, #d1d5db 80%, transparent)' }} />
          <div style={{ textAlign: 'center', fontSize: 10, letterSpacing: 5, color: '#9ca3af', marginTop: 5, fontWeight: 500 }}>SCREEN</div>
        </div>
      </div>

      <div style={{ display: 'flex', userSelect: 'none' }}>
        {/* 좌측 행 레이블 */}
        <div style={{ width: LABEL_W, flexShrink: 0 }}>
          {Array.from({ length: GHOST_MAX_ROWS }, (_, ri) => (
            <div
              key={ri}
              style={{ height: GHOST_CELL, marginBottom: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 5 }}
              className={`text-xs ${ri + 1 <= sel.rows ? 'text-accent font-medium' : 'text-gray-300 dark:text-gray-600'}`}
            >
              {indexToLabel(ri)}
            </div>
          ))}
        </div>

        {/* 셀 영역 + 선택 오버레이 (터치 스크롤 허용, 크기 조절은 핸들로) */}
        <div
          ref={bodyRef}
          style={{ position: 'relative', cursor: 'crosshair' }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
        >
          {Array.from({ length: GHOST_MAX_ROWS }, (_, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 1, marginBottom: 1 }}>
              {Array.from({ length: GHOST_MAX_COLS }, (_, ci) => (
                <div
                  key={ci}
                  style={{ width: GHOST_CELL, height: GHOST_CELL, flexShrink: 0 }}
                  className="rounded-sm bg-gray-100 dark:bg-gray-700/60"
                />
              ))}
            </div>
          ))}

          {/* 선택 사각형 */}
          <div
            style={{
              position: 'absolute', left: 0, top: 0, width: selW, height: selH,
              border: '2px solid var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              borderRadius: 4, pointerEvents: 'none',
            }}
          >
            {/* 나머지 3개 모서리는 장식용 (우하단은 아래 인터랙티브 핸들이 대체) */}
            <span style={{ ...handleBase, left: 0, top: 0 }} />
            <span style={{ ...handleBase, left: '100%', top: 0 }} />
            <span style={{ ...handleBase, left: 0, top: '100%' }} />
            {/* 크기 배지 — 마지막 행 알파벳 × 열 수 (예: O × 32) */}
            <span
              style={{
                position: 'absolute', left: '100%', top: '100%', marginLeft: 10, marginTop: 8,
                whiteSpace: 'nowrap', background: '#111827', color: '#fff',
                fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
              }}
            >
              {indexToLabel(sel.rows - 1)} × {sel.cols}
            </span>
          </div>

          {/* 우하단 리사이즈 핸들 — 넉넉한 터치 영역 + 액센트 점 (이걸 끌 때만 크기 변경) */}
          <div
            onPointerDown={grabStart}
            onPointerMove={grabMove}
            onPointerUp={grabEnd}
            onPointerCancel={grabEnd}
            style={{
              position: 'absolute', left: selW, top: selH, transform: 'translate(-50%, -50%)',
              width: 36, height: 36, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', cursor: 'nwse-resize', zIndex: 20,
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'var(--accent)', border: '2.5px solid #fff',
              boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
            }} />
          </div>
        </div>
      </div>

      {/* 적용 / 취소 (모바일에선 바텀시트가 대신 렌더) */}
      {!hideActions && (
        <div className="flex items-center gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onApply(sel.rows, sel.cols)}
            className="px-5 py-2 text-sm rounded-lg btn-accent font-medium"
          >
            이 크기로 적용
          </button>
          <span className="text-xs text-gray-400 ml-1">드래그해서 행·열 범위를 지정하세요</span>
        </div>
      )}
    </div>
  )
}
