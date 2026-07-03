import { useState, useRef, useEffect, useLayoutEffect, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { SeatMapConfig, Range, ExitSide } from '../types'
import type { EditMode } from '../App'
import { calcCenterCols } from '../utils/centerCols'
import { indexToLabel } from '../utils/rowLabel'

const GHOST_MAX_ROWS = 26
const GHOST_MAX_COLS = 36
const GHOST_CELL = 18

interface Props {
  config: SeatMapConfig
  editMode: EditMode
  layoutPhase: 'size' | 'edit'
  modeStartPos: { row: number; col: number } | null
  onEnterModeFrom: (mode: 'prime' | 'watched' | 'excluded', pos: { row: number; col: number }) => void
  onCancelEditMode: () => void
  onCompleteEditMode: () => void
  onSetGridSize: (rows: number, cols: number) => void
  onAddPrimeRange: (range: Range) => void
  onRemovePrimeRange: (index: number) => void
  onAddWatchedRange: (range: Range) => void
  onToggleWatchedSeat: (row: number, col: number) => void
  onSetWatchedMemo: (row: number, col: number, memo: string) => void
  onToggleSightRow: (row: number) => void
  onToggleAisle: (row: number) => void
  onToggleColAisle: (col: number) => void
  onToggleExcludedSeat: (row: number, col: number) => void
  onExcludeSeats: (seats: { row: number; col: number }[]) => void
  onToggleExit: (row: number, col: number, side: ExitSide) => void
  viewOnly?: boolean
}

interface SeatPos { row: number; col: number }
interface PopupState { x: number; y: number; row: number; col: number }

type HighlightHint =
  | { type: 'prime'; range: Range }
  | { type: 'watched'; row: number; col: number }
  | { type: 'sightRow'; row: number }
  | null

function normalizeRange(a: SeatPos, b: SeatPos): Range {
  return {
    rowStart: Math.min(a.row, b.row),
    rowEnd: Math.max(a.row, b.row),
    colStart: Math.min(a.col, b.col),
    colEnd: Math.max(a.col, b.col),
  }
}

function inRange(row: number, col: number, r: Range) {
  return row >= r.rowStart && row <= r.rowEnd && col >= r.colStart && col <= r.colEnd
}

// 우선순위: watched > prime > sightRow > center
type Layer = 'watched' | 'prime' | 'sightRow' | 'center'
const LAYER_BG: Record<Layer, string> = {
  watched:  'bg-yellow-300',
  prime:    'bg-red-300',
  sightRow: 'bg-green-300',
  center:   'bg-blue-300',
}
const LAYER_RING: Record<Layer, string> = {
  watched:  'ring-yellow-400',
  prime:    'ring-red-400',
  sightRow: 'ring-green-400',
  center:   'ring-blue-400',
}

function getAppliedLayers(
  row: number, col: number,
  config: SeatMapConfig,
  centerCols: number[]
): Layer[] {
  const layers: Layer[] = []
  if (config.watchedSeats.some((s) => s.row === row && s.col === col)) layers.push('watched')
  if (config.primeRanges.some((r) => inRange(row, col, r))) layers.push('prime')
  if (config.sightRows.includes(row)) layers.push('sightRow')
  if (centerCols.includes(col)) layers.push('center')
  return layers
}

const MODE_STATUS: Record<NonNullable<EditMode>, (arg: boolean | number) => string> = {
  layout:  () => '',  // phase별로 직접 표시
  prime:   (f) => f ? '끝 좌석을 클릭 또는 드래그해 범위 확정' : '시작 좌석 클릭 또는 드래그 시작',
  watched: (f) => f ? '끝 좌석 클릭 (같은 좌석 = 1칸)' : '시작 좌석 클릭',
}

const MODE_RING: Record<NonNullable<EditMode>, string> = {
  layout:  'ring-indigo-400 bg-indigo-50',
  prime:   'ring-red-400 bg-red-50',
  watched: 'ring-yellow-400 bg-yellow-50',
}

// 폴리곤 내부 판정 (ray casting)
function pointInPolygon(row: number, col: number, vertices: SeatPos[]): boolean {
  const n = vertices.length
  if (n < 3) return false
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].col, yi = vertices[i].row
    const xj = vertices[j].col, yj = vertices[j].row
    if (((yi > row) !== (yj > row)) && col < ((xj - xi) * (row - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// 점이 선분에 가까운지 판정 (threshold 단위: grid 좌표)
function pointNearSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  threshold = 0.6
): boolean {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay) < threshold
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) < threshold
}

// 내부 또는 경계선에 걸친 좌석 판정
function pointInOrOnPolygon(row: number, col: number, vertices: SeatPos[]): boolean {
  if (pointInPolygon(row, col, vertices)) return true
  const n = vertices.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (pointNearSegment(col, row, vertices[i].col, vertices[i].row, vertices[j].col, vertices[j].row)) return true
  }
  return false
}

// 출입구 선: 좌석의 바깥 변에 문 위치를 표시
function exitLineStyle(side: ExitSide): CSSProperties {
  const C = '#4b5563', T = 4, OUT = -5
  const base: CSSProperties = { position: 'absolute', background: C, borderRadius: 2, zIndex: 5 }
  if (side === 'left') return { ...base, left: OUT, top: 2, bottom: 2, width: T }
  if (side === 'right') return { ...base, right: OUT, top: 2, bottom: 2, width: T }
  if (side === 'top') return { ...base, top: OUT, left: 2, right: 2, height: T }
  return { ...base, bottom: OUT, left: 2, right: 2, height: T }  // bottom
}

export default function SeatMapPreview({
  config, editMode: editModeProp, layoutPhase, modeStartPos,
  onEnterModeFrom,
  onCancelEditMode, onCompleteEditMode, onSetGridSize,
  onToggleExcludedSeat, onExcludeSeats,
  onAddPrimeRange, onRemovePrimeRange,
  onAddWatchedRange, onToggleWatchedSeat, onSetWatchedMemo, onToggleSightRow,
  onToggleAisle, onToggleColAisle, onToggleExit,
  viewOnly = false,
}: Props) {
  // viewOnly(보기 전용)일 땐 편집 상태를 무시해 깔끔한 이미지로만 렌더링
  const editMode = viewOnly ? null : editModeProp
  const { rows, cols, rowAisles, colAisles } = config
  const SEAT = 32
  const AISLE = 12

  const rowAisleSet = new Set(rowAisles)
  const colAisleSet = new Set(colAisles)
  const centerCols = calcCenterCols(cols, colAisles)

  const [firstClick, setFirstClick] = useState<SeatPos | null>(null)
  const [dragStart, setDragStart] = useState<SeatPos | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverPos, setHoverPos] = useState<SeatPos | null>(null)
  const [hoverAisleRow, setHoverAisleRow] = useState<number | null>(null)
  const [hoverAisleCol, setHoverAisleCol] = useState<number | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [highlightHint, setHighlightHint] = useState<HighlightHint>(null)

  // 폴리곤 제외 모드
  const [polyVertices, setPolyVertices] = useState<SeatPos[]>([])
  const prevEditModeRef = useRef<EditMode>(null)

  const popupRef = useRef<HTMLDivElement>(null)
  const dragHandledRef = useRef(false)
  const suppressNextClickRef = useRef(false)

  // 좌석 픽셀 중심 계산 (SVG 오버레이용)
  // 열: flex container에 gap:2가 있어서 gap div 양쪽에 2px씩 추가됨
  // layout edit 모드에서는 gap div가 8px으로 확장되어 COL/ROW_STEP이 달라짐
  function seatPixelCenter(row: number, col: number): { x: number; y: number } {
    const COL_STEP = SEAT + 2 + normalGap + 2   // flex_gap(2) + gap_div + flex_gap(2)
    const ROW_STEP = SEAT + normalGap            // seat + gap_div
    const AISLE_EXTRA = AISLE - normalGap        // aisle 추가 여백

    let x = (col - 1) * COL_STEP + SEAT / 2
    for (let c = 1; c < col; c++) {
      if (colAisleSet.has(c)) x += AISLE_EXTRA
    }

    let y = (row - 1) * ROW_STEP + SEAT / 2
    for (let r = 1; r < row; r++) {
      if (rowAisleSet.has(r)) y += AISLE_EXTRA
    }

    return { x, y }
  }

  // 전체 그리드 픽셀 크기 계산
  const isLayoutEdit = editMode === 'layout' && layoutPhase === 'edit'
  const normalGap = isLayoutEdit ? 8 : 2
  const gridPixelWidth = (() => {
    let w = cols * (SEAT + normalGap) - normalGap
    colAisles.forEach(() => { w += AISLE - normalGap })
    return w
  })()
  const gridPixelHeight = (() => {
    let h = rows * (SEAT + normalGap) - normalGap
    rowAisles.forEach(() => { h += AISLE - normalGap })
    return h
  })()

  // 폴리곤 편집 모드(레이아웃 2단계)를 벗어나면 미완성 꼭짓점 정리
  const wasPolyModeRef = useRef(false)
  useEffect(() => {
    const isPolyModeNow = editMode === 'layout' && layoutPhase === 'edit'
    if (wasPolyModeRef.current && !isPolyModeNow) {
      setPolyVertices([])
    }
    wasPolyModeRef.current = isPolyModeNow
    prevEditModeRef.current = editMode
  }, [editMode, layoutPhase])

  // 폴리곤 미리보기: 현재 꼭짓점 + hover 위치로 계산
  const polyPreviewVertices = hoverPos && polyVertices.length > 0
    ? [...polyVertices, hoverPos]
    : polyVertices

  useEffect(() => {
    if (!popup) return
    function handler(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popup])

  useEffect(() => {
    if (!editMode) {
      setFirstClick(null); setDragStart(null); setIsDragging(false)
      setPolyVertices([])
      return
    }
    if ((editMode === 'prime' || editMode === 'watched') && modeStartPos) {
      setFirstClick(modeStartPos)
    }
  }, [editMode, modeStartPos])

  const isRangeMode = editMode === 'prime' || editMode === 'watched'

  const previewRange: Range | null = (() => {
    if (!isRangeMode || !hoverPos) return null
    if (isDragging && dragStart) return normalizeRange(dragStart, hoverPos)
    if (firstClick) return normalizeRange(firstClick, hoverPos)
    return null
  })()

  function isHighlighted(row: number, col: number): boolean {
    if (!highlightHint) return false
    if (highlightHint.type === 'prime') return inRange(row, col, highlightHint.range)
    if (highlightHint.type === 'watched') return highlightHint.row === row && highlightHint.col === col
    if (highlightHint.type === 'sightRow') return highlightHint.row === row
    return false
  }

  function getSeatAppearance(row: number, col: number): { bg: string; ring: string | null; highlight: boolean; excluded: boolean } {
    const highlight = isHighlighted(row, col)
    const isExcluded = config.excludedSeats.some((s) => s.row === row && s.col === col)

    // excluded 폴리곤 미리보기 (excluded 모드 또는 layout 2단계)
    const isPolyMode = editMode === 'layout' && layoutPhase === 'edit'
    if (isPolyMode) {
      const isFirstVertex = polyVertices[0]?.row === row && polyVertices[0]?.col === col
      const isVertex = polyVertices.some((v) => v.row === row && v.col === col)
      if (isFirstVertex && polyVertices.length >= 3)
        return { bg: 'bg-red-400', ring: 'ring-2 ring-red-600', highlight, excluded: false }
      if (isVertex) return { bg: 'bg-gray-500', ring: null, highlight, excluded: false }
      if (polyPreviewVertices.length >= 3 && pointInOrOnPolygon(row, col, polyPreviewVertices)) {
        return { bg: 'bg-gray-300', ring: null, highlight, excluded: false }
      }
    }

    // excluded seats always shown as excluded
    if (isExcluded) return { bg: 'bg-gray-50', ring: 'ring-1 ring-gray-200', highlight, excluded: true }

    // prime / watched 범위 미리보기
    if (editMode === 'prime' || editMode === 'watched') {
      const isFirst = firstClick?.row === row && firstClick?.col === col
      const isDragOrigin = isDragging && dragStart?.row === row && dragStart?.col === col
      const previewBg = editMode === 'prime' ? 'bg-red-400' : 'bg-yellow-400'
      const previewRangeBg = editMode === 'prime' ? 'bg-red-200' : 'bg-yellow-200'
      if (isFirst || isDragOrigin) return { bg: previewBg, ring: null, highlight, excluded: false }
      if (previewRange && inRange(row, col, previewRange)) return { bg: previewRangeBg, ring: null, highlight, excluded: false }
    }

    // stored data layers
    const layers = getAppliedLayers(row, col, config, centerCols)
    if (layers.length === 0) return { bg: 'bg-gray-200', ring: null, highlight, excluded: false }
    const bg = LAYER_BG[layers[0]]
    const ring = layers.length > 1 ? LAYER_RING[layers[1]] : null
    return { bg, ring, highlight, excluded: false }
  }

  function handleRangeMouseDown(pos: SeatPos) {
    setDragStart(pos)
    setIsDragging(false)
  }

  function handleRangeMouseEnter(pos: SeatPos) {
    if (dragStart && (dragStart.row !== pos.row || dragStart.col !== pos.col)) setIsDragging(true)
  }

  function commitRange(range: Range) {
    if (editMode === 'prime') onAddPrimeRange(range)
    else if (editMode === 'watched') onAddWatchedRange(range)
  }

  function handleRangeMouseUp(pos: SeatPos) {
    if (isDragging && dragStart) {
      dragHandledRef.current = true
      commitRange(normalizeRange(dragStart, pos))
      setDragStart(null); setIsDragging(false)
      onCompleteEditMode(); return
    }
    setDragStart(null)
    if (!firstClick) {
      setFirstClick(pos)
    } else {
      suppressNextClickRef.current = true
      commitRange(normalizeRange(firstClick, pos))
      setFirstClick(null)
      onCompleteEditMode()
    }
  }

  function handleSeatClick(row: number, col: number, e: React.MouseEvent) {
    if (viewOnly) return
    if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return }
    // layout 2단계: 좌석 클릭 = 폴리곤 제외 선택
    if (editMode === 'layout' && layoutPhase === 'edit') {
      const first = polyVertices[0]
      if (polyVertices.length >= 3 && first && first.row === row && first.col === col) {
        // 폴리곤 확정
        const seats: { row: number; col: number }[] = []
        for (let r = 1; r <= rows; r++) {
          for (let c = 1; c <= cols; c++) {
            if (pointInOrOnPolygon(r, c, polyVertices)) seats.push({ row: r, col: c })
          }
        }
        if (seats.length > 0) onExcludeSeats(seats)
        setPolyVertices([])
      } else {
        setPolyVertices((v) => [...v, { row, col }])
      }
      return
    }
    // 일반 모드: 팝업 표시
    if (!isRangeMode) {
      setPopup({ x: e.clientX, y: e.clientY, row, col })
    }
  }

  const modeInfo = editMode === 'layout'
    ? layoutPhase === 'size'
      ? '크기를 선택하세요'
      : polyVertices.length === 0
        ? '갭 클릭 = 복도  |  좌석 클릭 = 제외 영역 꼭짓점 시작'
        : `꼭짓점 ${polyVertices.length}개 — 계속 클릭하거나 첫 꼭짓점으로 확정`
    : editMode
      ? MODE_STATUS[editMode](!!firstClick)
      : null
  const ringClass = editMode ? (MODE_RING[editMode] ?? '') : ''

  // 행 라벨 열 (그리드 좌우 양쪽, 시안 2a) — 행/복도 높이를 그리드와 동일하게 미러링
  const rowLabelCol = (
    <div style={{ display: 'inline-block', userSelect: 'none' }} aria-hidden="true">
      {Array.from({ length: rows }, (_, ri) => {
        const row = ri + 1
        const isAisleRow = rowAisleSet.has(row)
        return (
          <div key={ri}>
            <div style={{ height: SEAT, width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 600 }} className="text-gray-400">{indexToLabel(ri)}</span>
            </div>
            {row < rows && <div style={{ height: isAisleRow ? AISLE : normalGap }} />}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="relative">
      {/* 제목 */}
      {(config.brand || config.branch || config.screen) && (
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          {[config.brand, config.branch, config.screen].filter(Boolean).join(' ')}
        </h2>
      )}

      {/* 정보 */}
      <p className="text-sm text-gray-500 mb-3">
        {rows} × {cols}
        <span className="mx-2 text-gray-300">|</span>
        총 {rows * cols - config.excludedSeats.length}석
        {centerCols.length > 0 && (
          <>
            <span className="mx-2 text-gray-300">|</span>
            <span className="text-accent font-medium">중앙열 {centerCols.join(', ')}</span>
          </>
        )}
      </p>

      {/* 편집 모드 안내 */}
      {editMode && modeInfo && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
            {modeInfo}
          </span>
          {editMode === 'layout' && layoutPhase === 'edit' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancelEditMode() }}
              className="text-xs text-indigo-500 hover:text-indigo-700"
            >
              ↩ 크기 재설정
            </button>
          )}
        </div>
      )}

      {/* 범례 */}
      <div className="flex gap-4 mb-4 text-xs text-gray-500">
        {[
          { color: 'bg-blue-300', label: '중앙열' },
          { color: 'bg-green-300', label: '시선일치행' },
          { color: 'bg-red-300', label: '명당' },
          { color: 'bg-yellow-300', label: '실관람' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${color}`} />{label}
          </span>
        ))}
        {config.exits.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-1.5 rounded-sm bg-gray-500" />출입구
          </span>
        )}
      </div>

      {/* Ghost 그리드 (layout 1단계: 크기 선택) */}
      {editMode === 'layout' && layoutPhase === 'size' && (
        <div onClick={(e) => e.stopPropagation()}>
        <GhostGrid
          currentRows={config.rows}
          currentCols={config.cols}
          hoverPos={hoverPos}
          onHover={(pos) => setHoverPos(pos)}
          onConfirm={(rows, cols) => onSetGridSize(rows, cols)}
          onLeave={() => setHoverPos(null)}
        />
        </div>
      )}

      {/* 그리드 (layout 2단계 or 일반 모드) */}
      {!(editMode === 'layout' && layoutPhase === 'size') && <div
        className={`inline-block relative rounded-lg transition-all duration-150 ${editMode ? `ring-2 ring-offset-4 p-3 ${ringClass}` : ''}`}
        onClick={(e) => e.stopPropagation()}
        onMouseLeave={() => { setHoverPos(null); if (isRangeMode) { setDragStart(null); setIsDragging(false) } }}
        onMouseUp={() => {
          if (dragHandledRef.current) { dragHandledRef.current = false; return }
          if (isRangeMode && isDragging && dragStart && hoverPos) {
            commitRange(normalizeRange(dragStart, hoverPos))
            setDragStart(null); setIsDragging(false); onCompleteEditMode()
          }
        }}
      >
        {/* 스크린 — 얇은 라인 + 레터스페이스 텍스트 (시안 2a) */}
        <div style={{ width: '100%', marginBottom: 18 }}>
          <div style={{ width: '58%', margin: '0 auto' }}>
            <div
              style={{
                height: 3,
                borderRadius: 2,
                background: 'linear-gradient(to right, transparent, #d1d5db 18%, #d1d5db 82%, transparent)',
              }}
            />
            <div
              style={{
                textAlign: 'center',
                fontSize: 11,
                letterSpacing: 7,
                color: '#9ca3af',
                marginTop: 8,
                fontWeight: 500,
              }}
            >
              SCREEN
            </div>
          </div>
        </div>
        {/* 행 라벨(A~) 좌우 + 그리드 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {rowLabelCol}
        <div style={{ display: 'inline-block', userSelect: 'none', position: 'relative' }}>
          {/* 폴리곤 SVG 오버레이 — inner div 기준으로 절대 위치 */}
          {editMode === 'layout' && layoutPhase === 'edit' && polyPreviewVertices.length >= 2 && (
            <svg
              style={{
                position: 'absolute', top: 0, left: 0,
                width: gridPixelWidth, height: gridPixelHeight,
                pointerEvents: 'none', overflow: 'visible', zIndex: 10,
              }}
            >
              <polygon
                points={polyPreviewVertices.map((v) => {
                  const { x, y } = seatPixelCenter(v.row, v.col)
                  return `${x},${y}`
                }).join(' ')}
                fill="rgba(107,114,128,0.15)"
                stroke="#6b7280"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
              {polyVertices.map((v, i) => {
                const { x, y } = seatPixelCenter(v.row, v.col)
                const isFirst = i === 0
                return (
                  <circle
                    key={i} cx={x} cy={y}
                    r={isFirst ? 6 : 4}
                    fill={isFirst ? '#ef4444' : '#374151'}
                    stroke="white" strokeWidth={1.5}
                  />
                )
              })}
            </svg>
          )}
          {Array.from({ length: rows }, (_, ri) => {
            const row = ri + 1
            const isAisleRow = rowAisleSet.has(row)

            return (
              <div key={`row-${ri}`}>
                <div style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: cols }, (_, ci) => {
                    const col = ci + 1
                    const isAisleCol = colAisleSet.has(col)
                    const { bg, ring, highlight, excluded } = getSeatAppearance(row, col)
                    const exitSides = config.exits.filter((s) => s.row === row && s.col === col).map((s) => s.side)
                    const inEditMode = editMode !== null

                    return (
                      <>
                        <div
                          key={`seat-${ri}-${ci}`}
                          style={{ width: SEAT, height: SEAT, flexShrink: 0, position: 'relative' }}
                          className={[
                            bg, 'rounded flex items-center justify-center transition-colors cursor-pointer',
                            excluded ? 'text-gray-300' : 'text-gray-700',
                            inEditMode ? 'hover:brightness-90' : '',
                            highlight ? 'ring-2 ring-offset-0 ring-gray-700 brightness-75'
                              : ring ? `ring-2 ring-offset-0 ${ring}` : '',
                          ].filter(Boolean).join(' ')}
                          onMouseDown={() => { if (isRangeMode) handleRangeMouseDown({ row, col }) }}
                          onMouseEnter={() => { setHoverPos({ row, col }); if (isRangeMode) handleRangeMouseEnter({ row, col }) }}
                          onMouseUp={() => { if (isRangeMode) handleRangeMouseUp({ row, col }) }}
                          onClick={(e) => { if (!isRangeMode) handleSeatClick(row, col, e) }}
                        >
                          {excluded
                            ? <span style={{ fontSize: 10, lineHeight: 1 }} className="text-gray-300">×</span>
                            : <span style={{ fontSize: 9, lineHeight: 1 }}>{indexToLabel(ri)}{col}</span>
                          }
                          {exitSides.map((side) => (
                            <div key={side} style={exitLineStyle(side)} />
                          ))}
                        </div>

                        {col < cols && (() => {
                          const isColAisleMode = editMode === 'layout' && layoutPhase === 'edit'
                          const isHovered = isColAisleMode && hoverAisleCol === col
                          const w = isAisleCol ? AISLE : isColAisleMode ? 8 : 2
                          return (
                            <div
                              key={`ca-${ri}-${ci}`}
                              style={{ width: w, flexShrink: 0, position: 'relative' }}
                              className={[
                                'transition-all',
                                isColAisleMode ? 'cursor-col-resize' : '',
                              ].filter(Boolean).join(' ')}
                              onMouseEnter={() => isColAisleMode && setHoverAisleCol(col)}
                              onMouseLeave={() => setHoverAisleCol(null)}
                              onClick={(e) => { if (isColAisleMode) { e.stopPropagation(); onToggleColAisle(col) } }}
                            >
                              {isColAisleMode && (
                                <div style={{
                                  position: 'absolute',
                                  top: 0, bottom: 0,
                                  left: '50%', transform: 'translateX(-50%)',
                                  width: isAisleCol || isHovered ? w : 2,
                                  background: isHovered ? '#6366f1' : isAisleCol ? '#a5b4fc' : 'transparent',
                                  borderRadius: 2,
                                  transition: 'all 0.1s',
                                }} />
                              )}
                            </div>
                          )
                        })()}
                      </>
                    )
                  })}
                </div>

                {row < rows && (() => {
                  const isRowAisleMode = editMode === 'layout' && layoutPhase === 'edit'
                  const isHovered = isRowAisleMode && hoverAisleRow === row
                  const h = isAisleRow ? AISLE : isRowAisleMode ? 8 : 2
                  return (
                    <div
                      key={`ra-${ri}`}
                      style={{ height: h, position: 'relative' }}
                      className={isRowAisleMode ? 'cursor-row-resize transition-all' : 'transition-all'}
                      onMouseEnter={() => isRowAisleMode && setHoverAisleRow(row)}
                      onMouseLeave={() => setHoverAisleRow(null)}
                      onClick={(e) => { if (isRowAisleMode) { e.stopPropagation(); onToggleAisle(row) } }}
                    >
                      {isRowAisleMode && (
                        <div style={{
                          position: 'absolute',
                          left: 0, right: 0,
                          top: '50%', transform: 'translateY(-50%)',
                          height: isAisleRow || isHovered ? h : 2,
                          background: isHovered ? '#6366f1' : isAisleRow ? '#a5b4fc' : 'transparent',
                          borderRadius: 2,
                          transition: 'all 0.1s',
                        }} />
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
          {rowLabelCol}
        </div>
      </div>

      }

      {/* 팝업 — transform 밖(body)에 portal로 렌더해 fixed 위치 정상화 */}
      {popup && createPortal(
        <SeatPopup
          ref={popupRef}
          popup={popup}
          config={config}
          centerCols={centerCols}
          onEnterModeFrom={onEnterModeFrom}
          onRemovePrimeRange={onRemovePrimeRange}
          onToggleWatchedSeat={onToggleWatchedSeat}
          onSetWatchedMemo={onSetWatchedMemo}
          onToggleSightRow={onToggleSightRow}
          onToggleExcludedSeat={onToggleExcludedSeat}
          onToggleExit={onToggleExit}
          onHoverHint={setHighlightHint}
          onClose={() => { setPopup(null); setHighlightHint(null) }}
        />,
        document.body
      )}
    </div>
  )
}

// --- Ghost Grid (그리드 크기 선택) ---
function GhostGrid({
  currentRows,
  currentCols,
  hoverPos,
  onHover,
  onConfirm,
  onLeave,
}: {
  currentRows: number
  currentCols: number
  hoverPos: SeatPos | null
  onHover: (pos: SeatPos) => void
  onConfirm: (rows: number, cols: number) => void
  onLeave: () => void
}) {
  const hoverRow = hoverPos?.row ?? currentRows
  const hoverCol = hoverPos?.col ?? currentCols

  const LABEL_W = 20  // 행 레이블 너비

  return (
    <div onMouseLeave={onLeave}>
      <div className="text-sm font-medium text-indigo-700 mb-2">
        {indexToLabel(hoverRow - 1)}{hoverCol} 까지 — {hoverRow}행 × {hoverCol}열
      </div>
      <div style={{ display: 'inline-block', userSelect: 'none' }}>
        {/* 상단 열 번호 축 */}
        <div style={{ display: 'flex', gap: 1, marginBottom: 3, paddingLeft: LABEL_W + 1 }}>
          {Array.from({ length: GHOST_MAX_COLS }, (_, ci) => {
            const col = ci + 1
            const show = col === 1 || col % 5 === 0 || col === hoverCol
            return (
              <div
                key={ci}
                style={{ width: GHOST_CELL, flexShrink: 0, textAlign: 'center' }}
                className={`text-xs ${col <= hoverCol ? 'text-indigo-500' : 'text-gray-300'}`}
              >
                {show ? col : ''}
              </div>
            )
          })}
        </div>

        {/* 행 */}
        {Array.from({ length: GHOST_MAX_ROWS }, (_, ri) => {
          const row = ri + 1
          return (
            <div key={ri} style={{ display: 'flex', gap: 1, marginBottom: 1, alignItems: 'center' }}>
              {/* 좌측 행 레이블 */}
              <div
                style={{ width: LABEL_W, flexShrink: 0, textAlign: 'right', paddingRight: 4 }}
                className={`text-xs ${row <= hoverRow ? 'text-indigo-500' : 'text-gray-300'}`}
              >
                {indexToLabel(ri)}
              </div>
              {Array.from({ length: GHOST_MAX_COLS }, (_, ci) => {
                const col = ci + 1
                const inSelected = row <= hoverRow && col <= hoverCol
                const isBorder = row === hoverRow || col === hoverCol
                return (
                  <div
                    key={ci}
                    style={{ width: GHOST_CELL, height: GHOST_CELL, flexShrink: 0 }}
                    className={[
                      'rounded-sm cursor-pointer transition-colors',
                      inSelected
                        ? isBorder ? 'bg-indigo-400' : 'bg-indigo-200'
                        : 'bg-gray-100 hover:bg-gray-200',
                    ].join(' ')}
                    onMouseEnter={() => onHover({ row, col })}
                    onClick={() => onConfirm(row, col)}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Popup ---
interface SeatPopupProps {
  popup: PopupState
  config: SeatMapConfig
  centerCols: number[]
  onEnterModeFrom: (mode: 'prime' | 'watched' | 'excluded', pos: { row: number; col: number }) => void
  onRemovePrimeRange: (i: number) => void
  onToggleWatchedSeat: (row: number, col: number) => void
  onSetWatchedMemo: (row: number, col: number, memo: string) => void
  onToggleSightRow: (row: number) => void
  onToggleExcludedSeat: (row: number, col: number) => void
  onToggleExit: (row: number, col: number, side: ExitSide) => void
  onHoverHint: (hint: HighlightHint) => void
  onClose: () => void
}

const SeatPopup = forwardRef<HTMLDivElement, SeatPopupProps>(
  ({ popup, config, centerCols, onEnterModeFrom, onRemovePrimeRange, onToggleWatchedSeat, onSetWatchedMemo, onToggleSightRow, onToggleExcludedSeat, onToggleExit, onHoverHint, onClose }, ref) => {
    const { row, col, x, y } = popup
    const innerRef = useRef<HTMLDivElement | null>(null)
    const [pos, setPos] = useState({ left: x + 8, top: y + 8 })

    // 화면 밖으로 넘치면 위/왼쪽으로 뒤집고 뷰포트 안으로 클램프
    useLayoutEffect(() => {
      const el = innerRef.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      const M = 8
      let left = x + 8
      let top = y + 8
      if (left + width > window.innerWidth - M) left = Math.max(M, x - width - 8)
      if (top + height > window.innerHeight - M) top = Math.max(M, y - height - 8)
      setPos({ left, top })
    }, [x, y])

    const primeMatches = config.primeRanges
      .map((r, i) => inRange(row, col, r) ? { r, i } : null)
      .filter(Boolean) as { r: Range; i: number }[]
    const watchedSeat = config.watchedSeats.find((s) => s.row === row && s.col === col)
    const isWatched = !!watchedSeat
    const isSightRow = config.sightRows.includes(row)
    const isCenter = centerCols.includes(col)
    const isExcluded = config.excludedSeats.some((s) => s.row === row && s.col === col)
    // 좌석이 그리드 가장자리에 닿는 변마다 출입구 선택지 제공
    const exitSideOptions: { side: ExitSide; label: string }[] = [
      col === 1 ? { side: 'left' as const, label: '왼쪽' } : null,
      col === config.cols ? { side: 'right' as const, label: '오른쪽' } : null,
      row === 1 ? { side: 'top' as const, label: '앞쪽' } : null,
      row === config.rows ? { side: 'bottom' as const, label: '뒤쪽' } : null,
    ].filter(Boolean) as { side: ExitSide; label: string }[]
    const hasExit = (side: ExitSide) => config.exits.some((s) => s.row === row && s.col === col && s.side === side)

    type Item = { label: string; action: () => void; hint?: HighlightHint; danger?: boolean; dot?: string }
    type Divider = { divider: true }
    type InfoItem = { info: true; label: string }
    type Row = Item | Divider | InfoItem

    const removeItems: Item[] = [
      ...primeMatches.map(({ r, i }) => ({
        label: '명당 범위 해제',
        hint: { type: 'prime' as const, range: r },
        action: () => { onRemovePrimeRange(i); onClose() },
        danger: true,
      })),
      isWatched ? { label: '실관람 해제', hint: { type: 'watched' as const, row, col }, action: () => { onToggleWatchedSeat(row, col); onClose() }, danger: true } : null,
      isSightRow ? { label: '시선일치행 해제', hint: { type: 'sightRow' as const, row }, action: () => { onToggleSightRow(row); onClose() }, danger: true } : null,
    ].filter(Boolean) as Item[]

    const setItems: Row[] = [
      { label: isSightRow ? '시선일치행 해제' : '시선일치행 설정', dot: 'bg-green-400', action: () => { onToggleSightRow(row); onClose() } },
      { label: '명당 범위 설정', dot: 'bg-red-300', action: () => { onClose(); onEnterModeFrom('prime', { row, col }) } },
      { label: '실관람 좌석 설정', dot: 'bg-yellow-400', action: () => { onClose(); onEnterModeFrom('watched', { row, col }) } },
      ...exitSideOptions.map(({ side, label }) => ({
        label: `출입구(${label}) ${hasExit(side) ? '해제' : '표시'}`,
        dot: 'bg-gray-500',
        action: () => { onToggleExit(row, col, side); onClose() },
      })),
      isExcluded ? { label: '제외 해제', action: () => { onToggleExcludedSeat(row, col); onClose() } } : null,
      isCenter ? { info: true, label: '중앙열 (자동 계산)' } : null,
    ].filter(Boolean) as Row[]

    const rows: Row[] = [
      ...setItems,
      ...(removeItems.length > 0 ? [{ divider: true } as Divider, ...removeItems] : []),
    ]

    return (
      <div
        ref={(node) => {
          innerRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) (ref as { current: HTMLDivElement | null }).current = node
        }}
        style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 50 }}
        className="bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-44 text-sm"
        onMouseLeave={() => onHoverHint(null)}
      >
        <div className="px-3.5 py-2 border-b border-gray-100 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-gray-800">{indexToLabel(row - 1)}{col}</span>
          <span className="text-xs text-gray-400">좌석 설정</span>
        </div>
        {isWatched && (
          <div className="px-3 py-2 border-b border-gray-100">
            <label className="block text-xs text-gray-400 mb-1">메모</label>
            <textarea
              defaultValue={watchedSeat?.memo ?? ''}
              onChange={(e) => onSetWatchedMemo(row, col, e.target.value)}
              placeholder="좌석 후기 메모…"
              rows={2}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-yellow-400"
            />
          </div>
        )}
        {rows.map((item, i) => {
          if ('divider' in item) return <div key={i} className="my-1 border-t border-gray-100" />
          if ('info' in item) return <div key={i} className="px-3 py-1.5 text-xs text-gray-400">{item.label}</div>
          return (
            <button
              key={i}
              type="button"
              onClick={item.action}
              onMouseEnter={() => item.hint && onHoverHint(item.hint)}
              className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center gap-2 ${
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.dot && <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${item.dot}`} />}
              {item.label}
            </button>
          )
        })}
      </div>
    )
  }
)
