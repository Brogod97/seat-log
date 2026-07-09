import { useState, useRef, useEffect } from 'react'
import type { SeatMapConfig, Range, ExitSide, EditMode } from '../types'
import {
  normalizeRange, inRange, pointInOrOnPolygon, type SeatPos,
} from '../utils/seatGeometry'
import { LAYER_BG, LAYER_RING, getAppliedLayers, MODE_STATUS } from '../utils/seatStyles'
import type { PopupState, HighlightHint } from '../components/preview/previewTypes'

interface Params {
  config: SeatMapConfig
  editMode: EditMode        // viewOnly 반영 후 값
  layoutPhase: 'size' | 'edit'
  modeStartPos: { row: number; col: number } | null
  rows: number
  cols: number
  centerCols: number[]
  viewOnly: boolean
  exitTapMode: boolean
  zoneModeProp?: 'aisle' | 'excluded'
  onZoneModeChange?: (m: 'aisle' | 'excluded') => void
  onAddPrimeRange: (range: Range) => void
  onAddWatchedRange: (range: Range) => void
  onExcludeSeats: (seats: { row: number; col: number }[]) => void
  onToggleExit: (row: number, col: number, side: ExitSide) => void
  onCompleteEditMode: () => void
}

// 좌석표 상호작용: 드래그·클릭·폴리곤 꼭짓점·팝업 상태 + 핸들러 + 좌석 외형 계산
export function useSeatInteraction({
  config, editMode, layoutPhase, modeStartPos, rows, cols, centerCols,
  viewOnly, exitTapMode, zoneModeProp, onZoneModeChange,
  onAddPrimeRange, onAddWatchedRange, onExcludeSeats, onToggleExit, onCompleteEditMode,
}: Params) {
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

  return {
    // 상태·ref
    hoverPos, setHoverPos,
    hoverAisleRow, setHoverAisleRow,
    hoverAisleCol, setHoverAisleCol,
    popup, setPopup, popupRef,
    setHighlightHint,
    dragStart, setDragStart,
    isDragging, setIsDragging,
    dragHandledRef,
    polyVertices, polyPreviewVertices,
    // 파생
    zoneMode, switchZoneMode,
    isRangeMode,
    modeInfo,
    // 계산·핸들러
    getSeatAppearance,
    handleRangeMouseDown,
    handleRangeMouseEnter,
    handleRangeMouseUp,
    commitRange,
    handleSeatClick,
  }
}
