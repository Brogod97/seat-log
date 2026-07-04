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
  seatMenuAsSheet?: boolean  // 모바일: 좌석 메뉴를 바텀시트로 (시안 5d)
  exitTapMode?: boolean      // 모바일: 가장자리 탭으로 출입구 토글 (시안 5c)
  ghostHideActions?: boolean // 모바일: 고스트 그리드 버튼을 바텀시트에서 렌더
  onGhostSelChange?: (rows: number, cols: number) => void
  zoneMode?: 'aisle' | 'excluded'            // 모바일: 바텀시트에서 제어
  onZoneModeChange?: (m: 'aisle' | 'excluded') => void
  hideZoneToolbar?: boolean                  // 모바일: 카드 안 토글 숨김 (바텀시트가 대신)
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
  seatMenuAsSheet = false,
  exitTapMode = false,
  ghostHideActions = false,
  onGhostSelChange,
  zoneMode: zoneModeProp,
  onZoneModeChange,
  hideZoneToolbar = false,
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

  // 그리드 픽셀 스텝 (좌석 중심·전체 크기 계산 공통 기준)
  // 열: 행이 flex(gap:2)라 gap div 양쪽에 2px씩 붙음 → COL_STEP = seat + 2 + gap_div + 2
  //     layout edit 모드에서는 gap div가 8px으로 확장됨
  // 행: 바깥 div는 flex gap이 없어 ROW_STEP = seat + gap_div
  const isLayoutEdit = editMode === 'layout' && layoutPhase === 'edit'
  const normalGap = isLayoutEdit ? 8 : 2
  const COL_STEP = SEAT + 2 + normalGap + 2
  const ROW_STEP = SEAT + normalGap
  const AISLE_EXTRA = AISLE - normalGap

  // 좌석 픽셀 중심 계산 (SVG 오버레이·복도 띠용)
  function seatPixelCenter(row: number, col: number): { x: number; y: number } {
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

  // 전체 그리드 픽셀 크기 (스텝과 동일 기준으로 계산)
  const gridPixelWidth = (() => {
    let w = (cols - 1) * COL_STEP + SEAT
    colAisles.forEach((c) => { if (c < cols) w += AISLE_EXTRA })
    return w
  })()
  const gridPixelHeight = (() => {
    let h = (rows - 1) * ROW_STEP + SEAT
    rowAisles.forEach((r) => { if (r < rows) h += AISLE_EXTRA })
    return h
  })()

  // 레이아웃 2단계 안의 구역 모드: 복도 / 제외구역 (시안 4b/5b)
  // 모바일에선 부모(바텀시트)가 제어(zoneModeProp), 그 외엔 내부 상태
  const [zoneModeInternal, setZoneModeInternal] = useState<'aisle' | 'excluded'>('aisle')
  const zoneMode = zoneModeProp ?? zoneModeInternal
  function switchZoneMode(m: 'aisle' | 'excluded') {
    if (onZoneModeChange) onZoneModeChange(m)
    else setZoneModeInternal(m)
  }
  // 모드가 어느 경로로 바뀌든(내부 토글·바텀시트) 미완성 꼭짓점 정리
  useEffect(() => {
    setPolyVertices([])
  }, [zoneMode])

  // 폴리곤 편집 모드(레이아웃 2단계)를 벗어나면 미완성 꼭짓점 정리 + 구역 모드 초기화
  const wasPolyModeRef = useRef(false)
  useEffect(() => {
    const isPolyModeNow = editMode === 'layout' && layoutPhase === 'edit'
    if (wasPolyModeRef.current && !isPolyModeNow) {
      setPolyVertices([])
    }
    if (!wasPolyModeRef.current && isPolyModeNow) {
      if (onZoneModeChange) onZoneModeChange('aisle')
      else setZoneModeInternal('aisle')
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
    const isPolyMode = editMode === 'layout' && layoutPhase === 'edit' && zoneMode === 'excluded'
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
    // 출입구 탭 모드: 가장자리 좌석 탭으로 출입구 토글 (시안 5c)
    if (exitTapMode) {
      const sides: ExitSide[] = []
      if (row === 1) sides.push('top')
      if (row === rows) sides.push('bottom')
      if (col === 1) sides.push('left')
      if (col === cols) sides.push('right')
      if (sides.length === 0) return
      const existing = config.exits.filter((s) => s.row === row && s.col === col)
      if (existing.length > 0) existing.forEach((s) => onToggleExit(row, col, s.side))
      else onToggleExit(row, col, sides[0])
      return
    }
    // layout 2단계: 제외구역 모드에서만 좌석 클릭 = 폴리곤 꼭짓점
    if (editMode === 'layout' && layoutPhase === 'edit') {
      if (zoneMode !== 'excluded') return
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

      {/* 편집 모드 안내: layout 2단계는 복도/제외구역 토글 (시안 4b/5b) */}
      {editMode === 'layout' && layoutPhase === 'edit' ? (hideZoneToolbar ? null : (
        <div className="flex items-center gap-2 mb-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => switchZoneMode('aisle')}
              className={`text-xs px-3 py-1.5 transition-colors ${zoneMode === 'aisle' ? 'bg-accent-soft text-accent font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              복도
            </button>
            <button
              type="button"
              onClick={() => switchZoneMode('excluded')}
              className={`text-xs px-3 py-1.5 transition-colors border-l border-gray-200 ${zoneMode === 'excluded' ? 'bg-accent-soft text-accent font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              제외구역
            </button>
          </div>
          <span className="text-xs text-gray-400">
            {zoneMode === 'aisle'
              ? '행·열 사이 틈을 클릭해 복도 지정'
              : polyVertices.length === 0
                ? '좌석을 눌러 꼭짓점 시작'
                : `꼭짓점 ${polyVertices.length}개 — 첫 꼭짓점을 다시 눌러 확정`}
          </span>
          <button
            type="button"
            onClick={() => onCancelEditMode()}
            className="text-xs text-accent hover:underline"
          >
            ↩ 크기 재설정
          </button>
        </div>
      )) : editMode && modeInfo && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
            {modeInfo}
          </span>
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
          onApply={(rows, cols) => onSetGridSize(rows, cols)}
          onCancel={onCancelEditMode}
          hideActions={ghostHideActions}
          onSelChange={onGhostSelChange}
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
          {/* 복도 파란 띠 (레이아웃 편집 중, 시안 4b) */}
          {editMode === 'layout' && layoutPhase === 'edit' && (
            <>
              {colAisles.filter((c) => c < cols).map((c) => (
                <div
                  key={`cband-${c}`}
                  style={{
                    position: 'absolute',
                    left: seatPixelCenter(1, c).x + SEAT / 2 + 2,
                    top: -4,
                    width: AISLE,
                    height: gridPixelHeight + 8,
                    background: 'rgba(99, 102, 241, 0.28)',
                    borderRadius: 4,
                    pointerEvents: 'none',
                    zIndex: 4,
                  }}
                />
              ))}
              {rowAisles.filter((r) => r < rows).map((r) => (
                <div
                  key={`rband-${r}`}
                  style={{
                    position: 'absolute',
                    top: seatPixelCenter(r, 1).y + SEAT / 2,
                    left: -4,
                    height: AISLE,
                    width: gridPixelWidth + 8,
                    background: 'rgba(99, 102, 241, 0.28)',
                    borderRadius: 4,
                    pointerEvents: 'none',
                    zIndex: 4,
                  }}
                />
              ))}
            </>
          )}
          {/* 폴리곤 SVG 오버레이 — inner div 기준으로 절대 위치 */}
          {editMode === 'layout' && layoutPhase === 'edit' && zoneMode === 'excluded' && polyPreviewVertices.length >= 2 && (
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
                          // 폭(w)은 레이아웃 편집 내내 8px 유지(좌표 일관성), 상호작용은 복도 모드에서만
                          const isLayoutEditPhase = editMode === 'layout' && layoutPhase === 'edit'
                          const canEditAisle = isLayoutEditPhase && zoneMode === 'aisle'
                          const isHovered = canEditAisle && hoverAisleCol === col
                          const w = isAisleCol ? AISLE : isLayoutEditPhase ? 8 : 2
                          return (
                            <div
                              key={`ca-${ri}-${ci}`}
                              style={{ width: w, flexShrink: 0, position: 'relative' }}
                              className={[
                                'transition-all',
                                canEditAisle ? 'cursor-col-resize' : '',
                              ].filter(Boolean).join(' ')}
                              onMouseEnter={() => canEditAisle && setHoverAisleCol(col)}
                              onMouseLeave={() => setHoverAisleCol(null)}
                              onClick={(e) => { if (canEditAisle) { e.stopPropagation(); onToggleColAisle(col) } }}
                            >
                              {isHovered && (
                                <div style={{
                                  position: 'absolute',
                                  top: 0, bottom: 0,
                                  left: '50%', transform: 'translateX(-50%)',
                                  width: w,
                                  background: 'color-mix(in srgb, #6366f1 55%, transparent)',
                                  borderRadius: 2,
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
                  const isLayoutEditPhase = editMode === 'layout' && layoutPhase === 'edit'
                  const canEditAisle = isLayoutEditPhase && zoneMode === 'aisle'
                  const isHovered = canEditAisle && hoverAisleRow === row
                  const h = isAisleRow ? AISLE : isLayoutEditPhase ? 8 : 2
                  return (
                    <div
                      key={`ra-${ri}`}
                      style={{ height: h, position: 'relative' }}
                      className={canEditAisle ? 'cursor-row-resize transition-all' : 'transition-all'}
                      onMouseEnter={() => canEditAisle && setHoverAisleRow(row)}
                      onMouseLeave={() => setHoverAisleRow(null)}
                      onClick={(e) => { if (canEditAisle) { e.stopPropagation(); onToggleAisle(row) } }}
                    >
                      {isHovered && (
                        <div style={{
                          position: 'absolute',
                          left: 0, right: 0,
                          top: '50%', transform: 'translateY(-50%)',
                          height: h,
                          background: 'color-mix(in srgb, #6366f1 55%, transparent)',
                          borderRadius: 2,
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
          sheet={seatMenuAsSheet}
        />,
        document.body
      )}
    </div>
  )
}

// --- Ghost Grid (그리드 크기 선택 — 드래그 사각형 + 코너 핸들, 시안 4a/5a) ---
function GhostGrid({
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
  function handleDown(e: React.PointerEvent) {
    draggingRef.current = true
    lockedRef.current = true  // 클릭한 순간부터 호버 추적 대신 고정
    e.currentTarget.setPointerCapture(e.pointerId)
    const c = cellFromEvent(e)
    if (c) setSel({ rows: c.row, cols: c.col })
  }
  function handleMove(e: React.PointerEvent) {
    if (draggingRef.current) {
      const c = cellFromEvent(e)
      if (c) setSel({ rows: c.row, cols: c.col })
      return
    }
    // 마우스 호버 추적 (클릭으로 고정하기 전까지)
    if (!lockedRef.current && e.pointerType === 'mouse') {
      const c = cellFromEvent(e)
      if (c) setSel({ rows: c.row, cols: c.col })
    }
  }
  function handleUp() {
    draggingRef.current = false
  }

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

        {/* 셀 영역 + 선택 오버레이 */}
        <div
          ref={bodyRef}
          style={{ position: 'relative', touchAction: 'none', cursor: 'crosshair' }}
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
            <span style={{ ...handleBase, left: 0, top: 0 }} />
            <span style={{ ...handleBase, left: '100%', top: 0 }} />
            <span style={{ ...handleBase, left: 0, top: '100%' }} />
            <span style={{ ...handleBase, left: '100%', top: '100%', width: 14, height: 14, background: 'var(--accent)' }} />
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
  sheet?: boolean  // 바텀시트로 렌더 (모바일)
}

const SeatPopup = forwardRef<HTMLDivElement, SeatPopupProps>(
  ({ popup, config, centerCols, onEnterModeFrom, onRemovePrimeRange, onToggleWatchedSeat, onSetWatchedMemo, onToggleSightRow, onToggleExcludedSeat, onToggleExit, onHoverHint, onClose, sheet = false }, ref) => {
    const { row, col, x, y } = popup
    const innerRef = useRef<HTMLDivElement | null>(null)
    const [pos, setPos] = useState({ left: x + 8, top: y + 8 })

    // 화면 밖으로 넘치면 위/왼쪽으로 뒤집고 뷰포트 안으로 클램프 (시트 모드에선 불필요)
    useLayoutEffect(() => {
      if (sheet) return
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
        style={sheet ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60 } : { position: 'fixed', left: pos.left, top: pos.top, zIndex: 50 }}
        className={sheet
          ? 'bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl pt-2 pb-6 px-2 text-sm'
          : 'bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-44 text-sm'}
        onMouseLeave={() => onHoverHint(null)}
      >
        {sheet && <div className="mx-auto w-10 h-1 rounded-full bg-gray-200 mb-2" />}
        <div className={`border-b border-gray-100 flex items-baseline gap-1.5 ${sheet ? 'px-4 py-2.5' : 'px-3.5 py-2'}`}>
          <span className={`font-bold text-gray-800 ${sheet ? 'text-base' : 'text-sm'}`}>{indexToLabel(row - 1)}{col}</span>
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
              className={`w-full text-left transition-colors flex items-center gap-2 ${
                sheet ? 'px-4 py-3 text-sm rounded-lg' : 'px-3.5 py-2 text-xs'
              } ${
                item.danger
                  ? 'text-rose-400/90 hover:bg-gray-50'
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
