import { useState, useRef, useLayoutEffect, forwardRef } from 'react'
import type { SeatMapConfig, Range, ExitSide } from '../../types'
import { inRange } from '../../utils/seatGeometry'
import { indexToLabel } from '../../utils/rowLabel'
import type { PopupState, HighlightHint } from './previewTypes'

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
  isAdmin: boolean
  onHoverHint: (hint: HighlightHint) => void
  onClose: () => void
  sheet?: boolean  // 바텀시트로 렌더 (모바일)
}

export const SeatPopup = forwardRef<HTMLDivElement, SeatPopupProps>(
  ({ popup, config, centerCols, onEnterModeFrom, onRemovePrimeRange, onToggleWatchedSeat, onSetWatchedMemo, onToggleSightRow, onToggleExcludedSeat, onToggleExit, isAdmin, onHoverHint, onClose, sheet = false }, ref) => {
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
      ...(isAdmin ? exitSideOptions.map(({ side, label }) => ({
        label: `출입구(${label}) ${hasExit(side) ? '해제' : '표시'}`,
        dot: 'bg-gray-500',
        action: () => { onToggleExit(row, col, side); onClose() },
      })) : []),
      isAdmin && isExcluded ? { label: '제외 해제', action: () => { onToggleExcludedSeat(row, col); onClose() } } : null,
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
