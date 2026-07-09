import { createPortal } from 'react-dom'
import type { SeatMapConfig, Range, ExitSide, EditMode } from '../types'
import { calcCenterCols } from '../utils/centerCols'
import { indexToLabel } from '../utils/rowLabel'
import { makeSeatGeometry, normalizeRange, exitLineStyle } from '../utils/seatGeometry'
import { MODE_RING } from '../utils/seatStyles'
import { GhostGrid } from './preview/GhostGrid'
import { SeatPopup } from './preview/SeatPopup'
import { useSeatInteraction } from '../hooks/useSeatInteraction'

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


  // 그리드 픽셀 좌표 (layout edit 모드에서 gap div가 8px으로 확장됨 → normalGap)
  const isLayoutEdit = editMode === 'layout' && layoutPhase === 'edit'
  const normalGap = isLayoutEdit ? 8 : 2
  const { seatPixelCenter, gridPixelWidth, gridPixelHeight } = makeSeatGeometry({
    rows, cols, rowAisles, colAisles, seat: SEAT, aisle: AISLE, normalGap,
  })

  // 상호작용 (드래그·클릭·폴리곤·팝업) — 상태·핸들러·좌석 외형 계산
  const {
    hoverPos, setHoverPos,
    hoverAisleRow, setHoverAisleRow,
    hoverAisleCol, setHoverAisleCol,
    popup, setPopup, popupRef,
    setHighlightHint,
    dragStart, setDragStart,
    isDragging, setIsDragging,
    dragHandledRef,
    polyVertices, polyPreviewVertices,
    zoneMode, switchZoneMode,
    isRangeMode,
    modeInfo,
    getSeatAppearance,
    handleRangeMouseDown, handleRangeMouseEnter, handleRangeMouseUp, commitRange, handleSeatClick,
  } = useSeatInteraction({
    config, editMode, layoutPhase, modeStartPos, rows, cols, centerCols,
    viewOnly, exitTapMode, zoneModeProp, onZoneModeChange,
    onAddPrimeRange, onAddWatchedRange, onExcludeSeats, onToggleExit, onCompleteEditMode,
  })

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
                            highlight ? 'ring-2 ring-offset-1 ring-gray-500 z-10'
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
