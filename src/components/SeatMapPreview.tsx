import { useState, useRef, useEffect, forwardRef } from 'react'
import type { SeatMapConfig, Range } from '../types'
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
  onToggleSightRow: (row: number) => void
  onToggleAisle: (row: number) => void
  onToggleColAisle: (col: number) => void
  onToggleExcludedSeat: (row: number, col: number) => void
  onAddExcludedRange: (range: Range) => void
  onExcludeSeats: (seats: { row: number; col: number }[]) => void
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

export default function SeatMapPreview({
  config, editMode, layoutPhase, modeStartPos,
  onEnterModeFrom,
  onCancelEditMode, onCompleteEditMode, onSetGridSize,
  onToggleExcludedSeat, onAddExcludedRange, onExcludeSeats,
  onAddPrimeRange, onRemovePrimeRange,
  onAddWatchedRange, onToggleWatchedSeat, onToggleSightRow,
  onToggleAisle, onToggleColAisle,
}: Props) {
  const { rows, cols, rowAisles, colAisles } = config
  const SEAT = 32
  const AISLE = 12
  const AISLE_PREVIEW = 10

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

  // 폴리곤 확정: excluded 진입 후 모드/페이즈가 바뀔 때
  const wasExcludedRef = useRef(false)
  useEffect(() => {
    const isExcludedNow = editMode === 'excluded' || (editMode === null && wasExcludedRef.current)
    if (wasExcludedRef.current && !isExcludedNow) {
      if (polyVertices.length >= 3) {
        const seats: { row: number; col: number }[] = []
        for (let r = 1; r <= rows; r++) {
          for (let c = 1; c <= cols; c++) {
            if (pointInOrOnPolygon(r, c, polyVertices)) seats.push({ row: r, col: c })
          }
        }
        if (seats.length > 0) onExcludeSeats(seats)
      }
      setPolyVertices([])
    }
    wasExcludedRef.current = editMode === 'excluded'
    prevEditModeRef.current = editMode
  }, [editMode])

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
    if (editMode === 'excluded' && modeStartPos) {
      setPolyVertices([modeStartPos])
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
    const isPolyMode = editMode === 'excluded' || (editMode === 'layout' && layoutPhase === 'edit')
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
    if (isExcluded) return { bg: 'bg-white', ring: 'ring-1 ring-gray-300', highlight, excluded: true }

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
    else if (editMode === 'excluded') onAddExcludedRange(range)
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
    if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return }
    if (editMode === 'excluded') {
      const first = polyVertices[0]
      if (polyVertices.length >= 3 && first && first.row === row && first.col === col) {
        onCompleteEditMode(); return
      }
      setPolyVertices((v) => [...v, { row, col }]); return
    }
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
        {rows}행 × {cols}열
        <span className="mx-2 text-gray-300">|</span>
        총 {rows * cols - config.excludedSeats.length}석
        {centerCols.length > 0 && (
          <span className="ml-2 text-blue-500">중앙열 {centerCols.join(', ')}열</span>
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
      <div className="flex gap-4 mb-4 text-xs text-gray-700">
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
        <div style={{ display: 'inline-block', userSelect: 'none', position: 'relative' }}>
          {/* 폴리곤 SVG 오버레이 — inner div 기준으로 절대 위치 */}
          {(editMode === 'excluded' || (editMode === 'layout' && layoutPhase === 'edit')) && polyPreviewVertices.length >= 2 && (
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
                    const inEditMode = editMode !== null

                    return (
                      <>
                        <div
                          key={`seat-${ri}-${ci}`}
                          style={{ width: SEAT, height: SEAT, flexShrink: 0 }}
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
                            ? <span style={{ fontSize: 11, lineHeight: 1 }}>╳</span>
                            : <span style={{ fontSize: 9, lineHeight: 1 }}>{indexToLabel(ri)}{col}</span>
                          }
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
      </div>

      }

      {/* 팝업 */}
      {popup && (
        <SeatPopup
          ref={popupRef}
          popup={popup}
          config={config}
          centerCols={centerCols}
          onEnterModeFrom={onEnterModeFrom}
          onRemovePrimeRange={onRemovePrimeRange}
          onToggleWatchedSeat={onToggleWatchedSeat}
          onToggleSightRow={onToggleSightRow}
          onToggleExcludedSeat={onToggleExcludedSeat}
          onHoverHint={setHighlightHint}
          onClose={() => { setPopup(null); setHighlightHint(null) }}
        />
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
  onToggleSightRow: (row: number) => void
  onToggleExcludedSeat: (row: number, col: number) => void
  onHoverHint: (hint: HighlightHint) => void
  onClose: () => void
}

const SeatPopup = forwardRef<HTMLDivElement, SeatPopupProps>(
  ({ popup, config, centerCols, onEnterModeFrom, onRemovePrimeRange, onToggleWatchedSeat, onToggleSightRow, onToggleExcludedSeat, onHoverHint, onClose }, ref) => {
    const { row, col, x, y } = popup

    const primeMatches = config.primeRanges
      .map((r, i) => inRange(row, col, r) ? { r, i } : null)
      .filter(Boolean) as { r: Range; i: number }[]
    const isWatched = config.watchedSeats.some((s) => s.row === row && s.col === col)
    const isSightRow = config.sightRows.includes(row)
    const isCenter = centerCols.includes(col)
    const isExcluded = config.excludedSeats.some((s) => s.row === row && s.col === col)

    type Item = { label: string; action: () => void; hint?: HighlightHint; danger?: boolean }
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
      { label: isSightRow ? '시선일치행 해제' : '시선일치행 설정', action: () => { onToggleSightRow(row); onClose() } },
      { label: '명당 범위 설정', action: () => { onClose(); onEnterModeFrom('prime', { row, col }) } },
      { label: '실관람 설정', action: () => { onClose(); onEnterModeFrom('watched', { row, col }) } },
      isExcluded ? { label: '제외 해제', action: () => { onToggleExcludedSeat(row, col); onClose() } } : null,
      isCenter ? { info: true, label: '중앙열 (자동 계산)' } : null,
    ].filter(Boolean) as Row[]

    const rows: Row[] = [
      ...setItems,
      ...(removeItems.length > 0 ? [{ divider: true } as Divider, ...removeItems] : []),
    ]

    return (
      <div
        ref={ref}
        style={{ position: 'fixed', left: x + 8, top: y + 8, zIndex: 50 }}
        className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-40 text-sm"
        onMouseLeave={() => onHoverHint(null)}
      >
        <div className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100">
          {indexToLabel(row - 1)}{col}
        </div>
        {rows.map((item, i) => {
          if ('divider' in item) return <div key={i} className="my-1 border-t border-gray-100" />
          if ('info' in item) return <div key={i} className="px-3 py-1.5 text-xs text-gray-400">{item.label}</div>
          return (
            <button
              key={i}
              type="button"
              onClick={item.action}
              onMouseEnter={() => item.hint && onHoverHint(item.hint)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    )
  }
)
