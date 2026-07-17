import { useState, useRef, useLayoutEffect, forwardRef } from 'react'
import type { SeatMapConfig, Range, ExitSide, WatchedRecord } from '../../types'
import { inRange } from '../../utils/seatGeometry'
import { indexToLabel } from '../../utils/rowLabel'
import { compareRecordsDesc, formatRecordTime } from '../../utils/watchedRecords'
import type { PopupState, HighlightHint } from './previewTypes'

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface SeatPopupProps {
  popup: PopupState
  config: SeatMapConfig
  centerCols: number[]
  onEnterModeFrom: (mode: 'prime' | 'watched' | 'excluded', pos: { row: number; col: number }) => void
  onRemovePrimeRange: (i: number) => void
  onToggleWatchedSeat: (row: number, col: number) => void
  onAddWatchedRecord: (row: number, col: number, record: WatchedRecord) => void
  onUpdateWatchedRecord: (row: number, col: number, index: number, record: WatchedRecord) => void
  onRemoveWatchedRecord: (row: number, col: number, index: number) => void
  onToggleSightRow: (row: number) => void
  onToggleExcludedSeat: (row: number, col: number) => void
  onToggleExit: (row: number, col: number, side: ExitSide) => void
  isAdmin: boolean
  inspectOnly?: boolean  // 열람 전용 (예전 저장 열람) — 기록은 보이되 모든 편집 액션 숨김
  onHoverHint: (hint: HighlightHint) => void
  onClose: () => void
  sheet?: boolean  // 바텀시트로 렌더 (모바일)
}

export const SeatPopup = forwardRef<HTMLDivElement, SeatPopupProps>(
  ({ popup, config, centerCols, onEnterModeFrom, onRemovePrimeRange, onToggleWatchedSeat, onAddWatchedRecord, onUpdateWatchedRecord, onRemoveWatchedRecord, onToggleSightRow, onToggleExcludedSeat, onToggleExit, isAdmin, inspectOnly = false, onHoverHint, onClose, sheet = false }, ref) => {
    const { row, col, x, y } = popup
    const innerRef = useRef<HTMLDivElement | null>(null)
    const [pos, setPos] = useState({ left: x + 8, top: y + 8 })

    // 관람 기록 폼 상태: null=닫힘, 'new'=추가, 숫자=해당 원본 인덱스 수정
    const [formIndex, setFormIndex] = useState<number | 'new' | null>(null)
    const [fDate, setFDate] = useState('')
    const [fTime, setFTime] = useState('')
    const [fTimeEnd, setFTimeEnd] = useState('')
    const [fMovie, setFMovie] = useState('')
    const [fMemo, setFMemo] = useState('')

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
    const records = watchedSeat?.records ?? []
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

    // 표시: 일시 최신순(익일 반영), 날짜 없는 기록은 맨 아래 (원본 인덱스 보존 — 수정/삭제용)
    const sortedRecords = records
      .map((r, i) => ({ r, i }))
      .sort((a, b) => compareRecordsDesc(a.r, b.r))

    function openForm(index: number | 'new') {
      if (index === 'new') {
        setFDate(todayStr()); setFTime(''); setFTimeEnd(''); setFMovie(''); setFMemo('')
      } else {
        const r = records[index]
        setFDate(r?.date ?? ''); setFTime(r?.time ?? ''); setFTimeEnd(r?.timeEnd ?? '')
        setFMovie(r?.movie ?? ''); setFMemo(r?.memo ?? '')
      }
      setFormIndex(index)
    }

    function submitForm() {
      const record: WatchedRecord = {
        date: fDate || undefined,
        time: fTime || undefined,
        // 종료는 시작이 있을 때만 의미 (시작 없이 종료만 입력된 경우 버림)
        timeEnd: fTime && fTimeEnd ? fTimeEnd : undefined,
        movie: fMovie.trim() || undefined,
        memo: fMemo.trim() || undefined,
      }
      if (formIndex === 'new') {
        // 전부 비어 있으면 추가할 내용이 없으므로 그냥 닫음
        if (record.date || record.time || record.movie || record.memo) onAddWatchedRecord(row, col, record)
      } else if (typeof formIndex === 'number') {
        onUpdateWatchedRecord(row, col, formIndex, record)
      }
      setFormIndex(null)
    }

    function removeWatched() {
      if (records.length >= 2 && !confirm(`관람 기록 ${records.length}건이 모두 삭제돼요. 실관람을 해제할까요?`)) return
      onToggleWatchedSeat(row, col)
      onClose()
    }

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
      isWatched ? { label: '실관람 해제', hint: { type: 'watched' as const, row, col }, action: removeWatched, danger: true } : null,
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

    // 열람 전용: 액션 대신 이 좌석에 적용된 표시를 정보로만 나열
    const inspectRows: Row[] = [
      isCenter ? { info: true, label: '중앙열 (자동 계산)' } : null,
      isSightRow ? { info: true, label: '시선일치행' } : null,
      primeMatches.length > 0 ? { info: true, label: '명당 범위' } : null,
      isWatched ? { info: true, label: '실관람 좌석' } : null,
    ].filter(Boolean) as Row[]

    const rows: Row[] = inspectOnly
      ? (inspectRows.length > 0 ? inspectRows : [{ info: true, label: '설정된 표시 없음' }])
      : [
          ...setItems,
          ...(removeItems.length > 0 ? [{ divider: true } as Divider, ...removeItems] : []),
        ]

    const inputCls = 'w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-yellow-400'

    const recordForm = (
      <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-gray-50 border border-gray-200">
        <input
          type="date"
          value={fDate}
          onChange={(e) => setFDate(e.target.value)}
          className={inputCls}
          aria-label="관람 날짜"
        />
        {/* 상영 시간 범위 — 종료가 시작보다 이르면 자정 넘김(익일 종료)으로 자동 해석 */}
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            value={fTime}
            onChange={(e) => setFTime(e.target.value)}
            className={`${inputCls} flex-1 min-w-0`}
            aria-label="상영 시작 시간"
          />
          <span className="text-xs text-gray-400 shrink-0">~</span>
          <input
            type="time"
            value={fTimeEnd}
            onChange={(e) => setFTimeEnd(e.target.value)}
            disabled={!fTime}
            className={`${inputCls} flex-1 min-w-0 disabled:opacity-40`}
            aria-label="상영 종료 시간"
            title={fTime ? '종료 시간 (선택)' : '시작 시간을 먼저 입력하세요'}
          />
        </div>
        <input
          type="text"
          value={fMovie}
          onChange={(e) => setFMovie(e.target.value)}
          placeholder="영화명"
          className={inputCls}
        />
        <textarea
          value={fMemo}
          onChange={(e) => setFMemo(e.target.value)}
          placeholder="메모 (선택)"
          rows={2}
          className={`${inputCls} resize-y`}
        />
        <div className="flex gap-1.5 justify-end">
          <button type="button" onClick={() => setFormIndex(null)} className="text-xs px-2 py-1 rounded text-gray-500 hover:bg-gray-100">취소</button>
          <button type="button" onClick={submitForm} className="text-xs px-2.5 py-1 rounded bg-yellow-400 text-yellow-950 font-medium hover:bg-yellow-500">저장</button>
        </div>
      </div>
    )

    return (
      <div
        ref={(node) => {
          innerRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) (ref as { current: HTMLDivElement | null }).current = node
        }}
        // 비시트 팝업 z=70: StaleSaveModal(z-60) 안에서 좌석 클릭 시에도 모달 위에 떠야 함
        style={sheet ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60 } : { position: 'fixed', left: pos.left, top: pos.top, zIndex: 70 }}
        className={sheet
          ? 'bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl pt-2 pb-6 px-2 text-sm max-h-[70vh] overflow-y-auto'
          : 'bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-44 text-sm max-h-[80vh] overflow-y-auto'}
        onMouseLeave={() => onHoverHint(null)}
      >
        {sheet && <div className="mx-auto w-10 h-1 rounded-full bg-gray-200 mb-2" />}
        <div className={`border-b border-gray-100 flex items-baseline gap-1.5 ${sheet ? 'px-4 py-2.5' : 'px-3.5 py-2'}`}>
          <span className={`font-bold text-gray-800 ${sheet ? 'text-base' : 'text-sm'}`}>{indexToLabel(row - 1)}{col}</span>
          <span className="text-xs text-gray-400">{inspectOnly ? '예전 저장 열람' : '좌석 설정'}</span>
        </div>

        {/* 관람 기록 (실관람 좌석일 때) — 최신순 리스트 + 건별 수정/삭제 + 추가 */}
        {isWatched && (
          <div className={`border-b border-gray-100 min-w-60 ${sheet ? 'px-4 py-2.5' : 'px-3 py-2'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">
                관람 기록{records.length > 0 && ` ${records.length}건`}
              </span>
              {!inspectOnly && formIndex === null && (
                <button
                  type="button"
                  onClick={() => openForm('new')}
                  className="text-xs text-accent font-medium hover:underline"
                >
                  + 기록 추가
                </button>
              )}
            </div>
            {records.length === 0 && formIndex !== 'new' && (
              <p className="text-xs text-gray-300 py-0.5">기록 없음</p>
            )}
            <div className="flex flex-col gap-1">
              {sortedRecords.map(({ r, i }) =>
                formIndex === i ? (
                  <div key={i}>{recordForm}</div>
                ) : (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 bg-yellow-50 border border-yellow-100">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-gray-700">{r.movie || '(영화명 없음)'}</span>
                        {(r.date || r.time) && (
                          <span className="text-[11px] text-gray-400">
                            {[r.date, formatRecordTime(r)].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </div>
                      {r.memo && <p className="text-[11px] text-gray-500 whitespace-pre-wrap break-all mt-0.5">{r.memo}</p>}
                    </div>
                    {!inspectOnly && (
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openForm(i)}
                          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-yellow-100 text-[11px]"
                          aria-label="기록 수정"
                        >✎</button>
                        <button
                          type="button"
                          onClick={() => { onRemoveWatchedRecord(row, col, i); setFormIndex(null) }}
                          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-yellow-100 text-xs"
                          aria-label="기록 삭제"
                        >×</button>
                      </div>
                    )}
                  </div>
                )
              )}
              {formIndex === 'new' && recordForm}
            </div>
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
