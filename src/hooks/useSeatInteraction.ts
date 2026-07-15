import { useState, useRef, useEffect } from 'react'
import type { SeatMapConfig, Range, ExitSide, EditMode, ZoneMode } from '../types'
import {
  normalizeRange, inRange, type SeatPos,
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
  zoneModeProp?: ZoneMode
  onZoneModeChange?: (m: ZoneMode) => void
  onAddPrimeRange: (range: Range) => void
  onAddWatchedRange: (range: Range) => void
  onSetExcludedSeat: (row: number, col: number, excluded: boolean) => void
  onToggleExit: (row: number, col: number, side: ExitSide) => void
  onCompleteEditMode: () => void
}

// 좌석표 상호작용: 범위 드래그·제외 칠하기·클릭·팝업 상태 + 핸들러 + 좌석 외형 계산
export function useSeatInteraction({
  config, editMode, layoutPhase, modeStartPos, rows, cols, centerCols,
  viewOnly, exitTapMode, zoneModeProp, onZoneModeChange,
  onAddPrimeRange, onAddWatchedRange, onSetExcludedSeat, onToggleExit, onCompleteEditMode,
}: Params) {
  const [firstClick, setFirstClick] = useState<SeatPos | null>(null)
  const [dragStart, setDragStart] = useState<SeatPos | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverPos, setHoverPos] = useState<SeatPos | null>(null)
  const [hoverAisleRow, setHoverAisleRow] = useState<number | null>(null)
  const [hoverAisleCol, setHoverAisleCol] = useState<number | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [highlightHint, setHighlightHint] = useState<HighlightHint>(null)

  const popupRef = useRef<HTMLDivElement>(null)
  const dragHandledRef = useRef(false)
  const suppressNextClickRef = useRef(false)

  // 제외 칠하기(드래그) 상태: 시작 칸의 목표 상태(제외/해제)를 드래그 내내 유지
  const paintingRef = useRef(false)
  const paintTargetRef = useRef(false)

  // 레이아웃 2단계 안의 구역 모드: 복도 / 제외구역 (시안 4b/5b)
  // 모바일에선 부모(바텀시트)가 제어(zoneModeProp), 그 외엔 내부 상태
  const [zoneModeInternal, setZoneModeInternal] = useState<ZoneMode>('aisle')
  const zoneMode = zoneModeProp ?? zoneModeInternal
  function switchZoneMode(m: ZoneMode) {
    if (onZoneModeChange) onZoneModeChange(m)
    else setZoneModeInternal(m)
  }

  // 레이아웃 2단계에 진입하면 구역 모드를 복도로 초기화
  const wasLayoutEditRef = useRef(false)
  useEffect(() => {
    const isLayoutEditNow = editMode === 'layout' && layoutPhase === 'edit'
    if (!wasLayoutEditRef.current && isLayoutEditNow) {
      if (onZoneModeChange) onZoneModeChange('aisle')
      else setZoneModeInternal('aisle')
    }
    wasLayoutEditRef.current = isLayoutEditNow
  }, [editMode, layoutPhase])

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
      paintingRef.current = false
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

  // 제외 칠하기: 시작 칸의 반대 상태를 목표로 잡고, 드래그로 지나간 칸에 같은 상태 적용
  function handleExcludeDown(pos: SeatPos) {
    const isExcluded = config.excludedSeats.some((s) => s.row === pos.row && s.col === pos.col)
    paintingRef.current = true
    paintTargetRef.current = !isExcluded
    onSetExcludedSeat(pos.row, pos.col, paintTargetRef.current)
  }
  function handleExcludeEnter(pos: SeatPos) {
    if (!paintingRef.current) return
    onSetExcludedSeat(pos.row, pos.col, paintTargetRef.current)
  }
  function handleExcludeUp() {
    paintingRef.current = false
  }

  function handleSeatClick(row: number, col: number, e: React.MouseEvent) {
    if (viewOnly) return
    if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return }
    // 출입구 탭 모드: 가장자리 좌석 탭으로 출입구 토글 (모바일 exitTapMode / 데스크톱 zoneMode='exit')
    if (exitTapMode || zoneMode === 'exit') {
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
    // layout 2단계: 제외구역은 칠하기(down/enter/up)로, 복도는 갭 클릭으로 처리 → 좌석 클릭은 무시
    if (editMode === 'layout' && layoutPhase === 'edit') return
    // 일반 모드: 팝업 표시
    if (!isRangeMode) {
      setPopup({ x: e.clientX, y: e.clientY, row, col })
    }
  }

  const isExcludePaintMode = editMode === 'layout' && layoutPhase === 'edit' && zoneMode === 'excluded'
  const modeInfo = editMode === 'layout'
    ? layoutPhase === 'size'
      ? '크기를 선택하세요'
      : zoneMode === 'excluded'
        ? '좌석 탭 = 제외/해제  |  드래그로 여러 칸'
        : zoneMode === 'exit'
          ? '가장자리 좌석 탭 = 출입구 표시/해제'
          : '행·열 사이 갭을 클릭해 복도 지정'
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
    // 파생
    zoneMode, switchZoneMode,
    isRangeMode,
    isExcludePaintMode,
    modeInfo,
    // 계산·핸들러
    getSeatAppearance,
    handleRangeMouseDown,
    handleRangeMouseEnter,
    handleRangeMouseUp,
    commitRange,
    handleSeatClick,
    handleExcludeDown,
    handleExcludeEnter,
    handleExcludeUp,
  }
}
