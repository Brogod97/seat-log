import { useState, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { toPng } from 'html-to-image'
import SeatMapForm from './components/SeatMapForm'
import SeatMapPreview from './components/SeatMapPreview'
import type { SeatMapConfig, Range, ExitSide } from './types'
import { themeFor } from './theme'

export type EditMode = 'layout' | 'prime' | 'watched' | null

const STORAGE_KEY = 'seat_map_current'
const SAVES_KEY = 'seat_map_saves'
const THEME_KEY = 'seat_map_theme'

function loadTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    // 저장값 없으면 OS 설정 따름
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {}
  return 'light'
}

function configKey(c: SeatMapConfig): string {
  return [c.brand, c.branch, c.screen].filter(Boolean).join('|') || '이름 없음'
}

function loadConfig(): SeatMapConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
  } catch {}
  return DEFAULT_CONFIG
}

function loadSaves(): Record<string, SeatMapConfig> {
  try { return JSON.parse(localStorage.getItem(SAVES_KEY) ?? '{}') } catch { return {} }
}

function writeSaves(saves: Record<string, SeatMapConfig>) {
  try { localStorage.setItem(SAVES_KEY, JSON.stringify(saves)) } catch {}
}

const DEFAULT_CONFIG: SeatMapConfig = {
  brand: '',
  branch: '',
  screen: '',
  rows: 10,
  cols: 20,
  rowAisles: [],
  colAisles: [],
  sightRows: [],
  primeRanges: [],
  watchedSeats: [],
  excludedSeats: [],
  exits: [],
}

function App() {
  const [config, setConfig] = useState<SeatMapConfig>(loadConfig)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [saves, setSaves] = useState<Record<string, SeatMapConfig>>(loadSaves)
  const [theme, setTheme] = useState<'light' | 'dark'>(loadTheme)
  const importRef = useRef<HTMLInputElement>(null)

  // 좁은 화면(모바일·세로 태블릿): 편집은 전체화면 오버레이로 분리
  const [compact, setCompact] = useState(false)
  const [mobileEditOpen, setMobileEditOpen] = useState(false)
  // 모바일 오버레이 화면 (시안 3): 좌석 설정 / 레이아웃 / 복도·제외 / 출입구
  const [mobileScreen, setMobileScreen] = useState<'seat' | 'layout' | 'zone' | 'exit'>('seat')
  const [layoutPhase, setLayoutPhase] = useState<'size' | 'edit'>('size')
  // 모바일 레이아웃 편집: 고스트 그리드 선택값 미러 (바텀시트 표시·적용용)
  const [ghostSel, setGhostSel] = useState({ rows: 10, cols: 20 })
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px), (orientation: portrait)')
    const update = () => setCompact(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // compact에서 편집 모드가 켜지면 전체화면 오버레이를 띄우고 화면을 동기화
  useEffect(() => {
    if (compact && editMode !== null) {
      setMobileEditOpen(true)
      if (editMode === 'layout') setMobileScreen(layoutPhase === 'size' ? 'layout' : 'zone')
    }
  }, [compact, editMode, layoutPhase])

  // 오버레이 내 화면 전환 동기화: 크기 적용 → 복도·제외, 편집 종료 → 좌석 설정
  useEffect(() => {
    if (!mobileEditOpen) return
    if (mobileScreen === 'layout' && editMode === 'layout' && layoutPhase === 'edit') setMobileScreen('zone')
    if ((mobileScreen === 'layout' || mobileScreen === 'zone') && editMode === null) setMobileScreen('seat')
  }, [mobileEditOpen, mobileScreen, editMode, layoutPhase])

  function closeMobileEdit() {
    completeEditMode()
    setMobileEditOpen(false)
    setMobileScreen('seat')
  }

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch {}
  }, [config])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem(THEME_KEY, theme) } catch {}
  }, [theme])

  function saveCurrentConfig() {
    const key = configKey(config)
    const next = { ...saves, [key]: config }
    setSaves(next)
    writeSaves(next)
  }

  function loadSavedConfig(key: string) {
    const saved = saves[key]
    if (saved) { setConfig({ ...DEFAULT_CONFIG, ...saved }); setEditMode(null) }
  }

  function deleteSavedConfig(key: string) {
    if (!confirm(`'${key.replace(/\|/g, ' ')}' 저장을 삭제할까요?`)) return
    const next = { ...saves }
    delete next[key]
    setSaves(next)
    writeSaves(next)
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(saves, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'seat-maps.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        if (typeof parsed === 'object' && parsed !== null) {
          const next = { ...saves, ...parsed }
          setSaves(next)
          writeSaves(next)
        }
      } catch { alert('파일을 읽을 수 없어요.') }
      if (importRef.current) importRef.current.value = ''
    }
    reader.readAsText(file)
  }
  const [snapshot, setSnapshot] = useState<SeatMapConfig | null>(null)
  const [modeStartPos, setModeStartPos] = useState<{ row: number; col: number } | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  // 프리뷰를 영역에 맞춰 확대/축소 (다운로드 추출엔 영향 없음 — transform은 시각 효과)
  const fitAreaRef = useRef<HTMLDivElement>(null)
  const fitContentRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const [fitHeight, setFitHeight] = useState<number | undefined>(undefined)
  const MAX_FIT_SCALE = 2.5

  useEffect(() => {
    const area = fitAreaRef.current
    const content = fitContentRef.current
    if (!area || !content) return
    function recompute() {
      const a = fitAreaRef.current, el = fitContentRef.current
      if (!a || !el) return
      const naturalW = el.offsetWidth, naturalH = el.offsetHeight
      if (naturalW <= 0 || naturalH <= 0) return
      const availW = a.clientWidth
      const wScale = availW / naturalW
      // 좌우 분할(비-compact)에선 영역 높이도 고려해 넘치지 않게, 모바일 스택에선 너비만(세로 스크롤 허용)
      const hScale = compact ? Infinity : a.clientHeight / naturalH
      const s = Math.min(wScale, hScale, MAX_FIT_SCALE)
      setFitScale(s)
      setFitHeight(naturalH * s)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(area)
    ro.observe(content)
    return () => ro.disconnect()
  }, [compact])

  async function downloadImage() {
    if (!exportRef.current) return
    // 편집 중이면 편집 UI(테두리·핸들)가 이미지에 섞이므로 먼저 종료
    if (editMode) { completeEditMode(); await new Promise((r) => requestAnimationFrame(r)) }
    const title = [config.brand, config.branch, config.screen].filter(Boolean).join(' ') || '좌석표'
    const dataUrl = await toPng(exportRef.current, { pixelRatio: 2 })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${title}.png`
    a.click()
  }

  function enterEditMode(mode: EditMode) {
    setSnapshot(config)
    setEditMode(mode)
    setModeStartPos(null)
    // 레이아웃 편집은 기존 그리드를 유지한 채 복도/제외 편집(2단계)으로 바로 진입
    if (mode === 'layout') setLayoutPhase('edit')
  }

  // 그리드 크기부터 다시 짜기 (모든 레이어 초기화)
  function enterGridResize() {
    setSnapshot(config)
    setEditMode('layout')
    setModeStartPos(null)
    setLayoutPhase('size')
  }

  // 좌석 클릭 메뉴에서 편집 모드 진입 (시작 좌석 미리 지정)
  function enterModeFrom(mode: 'prime' | 'watched' | 'excluded', pos: { row: number; col: number }) {
    setSnapshot(config)
    setEditMode(mode as EditMode)
    setModeStartPos(pos)
  }

  function cancelEditMode() {
    if (snapshot) setConfig(snapshot)
    setSnapshot(null)
    setEditMode(null)
    setModeStartPos(null)
  }

  function completeEditMode() {
    setSnapshot(null)
    setEditMode(null)
    setModeStartPos(null)
  }

  function setGridSize(rows: number, cols: number) {
    setConfig((c) => ({
      ...c,
      rows,
      cols,
      rowAisles: [],
      colAisles: [],
      sightRows: [],
      primeRanges: [],
      watchedSeats: [],
      excludedSeats: [],
      exits: [],
    }))
    // 크기 확정 후 layout 2단계(복도/제외 편집)로 자동 전환
    setLayoutPhase('edit')
  }

  function toggleExit(row: number, col: number, side: ExitSide) {
    setConfig((c) => {
      const exists = c.exits.some((s) => s.row === row && s.col === col && s.side === side)
      return {
        ...c,
        exits: exists
          ? c.exits.filter((s) => !(s.row === row && s.col === col && s.side === side))
          : [...c.exits, { row, col, side }],
      }
    })
  }


  function addPrimeRange(range: Range) {
    setConfig((c) => ({ ...c, primeRanges: [...c.primeRanges, range] }))
  }

  function removePrimeRange(index: number) {
    setConfig((c) => ({ ...c, primeRanges: c.primeRanges.filter((_, i) => i !== index) }))
  }

  function toggleWatchedSeat(row: number, col: number) {
    setConfig((c) => {
      const exists = c.watchedSeats.some((s) => s.row === row && s.col === col)
      return {
        ...c,
        watchedSeats: exists
          ? c.watchedSeats.filter((s) => !(s.row === row && s.col === col))
          : [...c.watchedSeats, { row, col }],
      }
    })
  }

  function setWatchedMemo(row: number, col: number, memo: string) {
    setConfig((c) => ({
      ...c,
      watchedSeats: c.watchedSeats.map((s) =>
        s.row === row && s.col === col ? { ...s, memo } : s
      ),
    }))
  }

  function addWatchedRange(range: Range) {
    setConfig((c) => {
      const toAdd: { row: number; col: number }[] = []
      for (let r = range.rowStart; r <= range.rowEnd; r++) {
        for (let col = range.colStart; col <= range.colEnd; col++) {
          if (!c.watchedSeats.some((s) => s.row === r && s.col === col)) {
            toAdd.push({ row: r, col })
          }
        }
      }
      return { ...c, watchedSeats: [...c.watchedSeats, ...toAdd] }
    })
  }

  function toggleSightRow(row: number) {
    setConfig((c) => {
      const exists = c.sightRows.includes(row)
      return {
        ...c,
        sightRows: exists
          ? c.sightRows.filter((r) => r !== row)
          : [...c.sightRows, row].sort((a, b) => a - b),
      }
    })
  }

  function toggleRowAisle(row: number) {
    setConfig((c) => {
      const exists = c.rowAisles.includes(row)
      return {
        ...c,
        rowAisles: exists
          ? c.rowAisles.filter((r) => r !== row)
          : [...c.rowAisles, row].sort((a, b) => a - b),
      }
    })
  }

  function toggleExcludedSeat(row: number, col: number) {
    setConfig((c) => {
      const exists = c.excludedSeats.some((s) => s.row === row && s.col === col)
      return {
        ...c,
        excludedSeats: exists
          ? c.excludedSeats.filter((s) => !(s.row === row && s.col === col))
          : [...c.excludedSeats, { row, col }],
      }
    })
  }

  function excludeSeats(seats: { row: number; col: number }[]) {
    setConfig((c) => {
      const toAdd = seats.filter(
        (s) => !c.excludedSeats.some((e) => e.row === s.row && e.col === s.col)
      )
      return { ...c, excludedSeats: [...c.excludedSeats, ...toAdd] }
    })
  }

  function toggleColAisle(col: number) {
    setConfig((c) => {
      const exists = c.colAisles.includes(col)
      return {
        ...c,
        colAisles: exists
          ? c.colAisles.filter((c2) => c2 !== col)
          : [...c.colAisles, col].sort((a, b) => a - b),
      }
    })
  }

  function resetConfig() {
    setConfig(DEFAULT_CONFIG)
    setSnapshot(null)
    setEditMode(null)
  }

  const previewProps = {
    config,
    editMode,
    layoutPhase,
    modeStartPos,
    onEnterModeFrom: enterModeFrom,
    onCancelEditMode: cancelEditMode,
    onCompleteEditMode: completeEditMode,
    onSetGridSize: setGridSize,
    onToggleExcludedSeat: toggleExcludedSeat,
    onExcludeSeats: excludeSeats,
    onAddPrimeRange: addPrimeRange,
    onRemovePrimeRange: removePrimeRange,
    onAddWatchedRange: addWatchedRange,
    onToggleWatchedSeat: toggleWatchedSeat,
    onSetWatchedMemo: setWatchedMemo,
    onToggleSightRow: toggleSightRow,
    onToggleAisle: toggleRowAisle,
    onToggleColAisle: toggleColAisle,
    onToggleExit: toggleExit,
  }

  const brandTheme = themeFor(config.brand)

  return (
    <div
      className="flex flex-col lg:landscape:flex-row min-h-screen lg:landscape:h-screen bg-gray-50 dark:bg-gray-900"
      style={{ '--accent': brandTheme.accent, '--accent-hover': brandTheme.accentHover } as CSSProperties}
    >
      <aside className="order-2 lg:landscape:order-1 w-full lg:landscape:w-80 shrink-0 bg-white dark:bg-gray-800 border-t lg:landscape:border-t-0 lg:landscape:border-r border-gray-200 dark:border-gray-700 p-4 lg:landscape:p-6 lg:landscape:overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
            <img src="/logo.svg" width="24" height="24" alt="" className="shrink-0 rounded-md" />
            좌석표 생성기
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="text-sm px-2 py-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded border border-gray-200 dark:border-gray-600 transition-colors"
              title={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              type="button"
              onClick={resetConfig}
              className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded border border-gray-200 dark:border-gray-600 hover:border-red-200 transition-colors"
            >
              ↺ 초기화
            </button>
          </div>
        </div>

        {/* 저장 / 불러오기 */}
        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          {/* 저장된 좌석표 목록 (불러오기 / 삭제) */}
          {Object.keys(saves).length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">저장된 좌석표</p>
              <div className="flex flex-col gap-1">
                {Object.keys(saves).map((key) => (
                  <div key={key} className="flex items-center gap-1 rounded border border-gray-200 dark:border-gray-600">
                    <button
                      type="button"
                      onClick={() => loadSavedConfig(key)}
                      className="flex-1 text-left text-xs px-2 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-l truncate"
                      title="불러오기"
                    >
                      {key.replace(/\|/g, ' ')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedConfig(key)}
                      className="px-2 py-1.5 text-gray-400 hover:text-red-500 text-sm"
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 저장 / JSON */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={saveCurrentConfig}
              className="flex-1 text-xs px-2 py-1.5 btn-accent rounded font-medium"
            >
              현재 저장
            </button>
            <button
              type="button"
              onClick={exportJson}
              disabled={Object.keys(saves).length === 0}
              className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="JSON 내보내기"
            >
              내보내기
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="JSON 가져오기"
            >
              가져오기
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={importJson} />
          </div>
        </div>
        <SeatMapForm
          config={config}
          onChange={setConfig}
          editMode={editMode}
          onEnterEditMode={enterEditMode}
          onEnterGridResize={enterGridResize}
          onCancelEditMode={cancelEditMode}
          onCompleteEditMode={completeEditMode}
        />

        {/* 이미지 다운로드 — 패널 하단 (모바일에선 페이지 맨 아래) */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); downloadImage() }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 btn-accent text-sm font-semibold rounded-lg"
          >
            ↓ 이미지 다운로드
          </button>
        </div>
      </aside>
      <main className="order-1 lg:landscape:order-2 flex-1 p-2 lg:landscape:p-6 lg:landscape:overflow-auto lg:landscape:h-screen" onClick={() => { if (editMode && !compact) completeEditMode() }}>
        {/* 좌석표 미리보기 = 다운로드 이미지 영역. 영역에 맞춰 확대/축소. compact에선 보기 전용 */}
        {/* 가용 영역 측정용 (좌우 분할 시 높이까지 채움) */}
        <div ref={fitAreaRef} className="w-full lg:landscape:h-full overflow-hidden" style={{ height: compact ? fitHeight : undefined }}>
          {/* transform으로 확대/축소 (추출엔 미반영) */}
          <div
            ref={fitContentRef}
            className="inline-block"
            style={{ transform: `scale(${fitScale})`, transformOrigin: 'top left' }}
          >
            {/* 점선 테두리는 미리보기용 — ref는 안쪽 카드에 있어 PNG에는 미포함 */}
            <div className="inline-block rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-1">
              <div ref={exportRef} className="inline-block bg-white rounded-lg p-6">
                <SeatMapPreview {...previewProps} viewOnly={compact} />
              </div>
            </div>
          </div>
        </div>

        {/* 모바일: 프리뷰 바로 아래 편집 진입 버튼 (시안 2a) */}
        {compact && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMobileEditOpen(true) }}
            className="w-full mt-3 px-4 py-3 btn-accent text-sm font-semibold rounded-xl"
          >
            좌석표 편집
          </button>
        )}

        {/* 모바일 전체화면 편집 오버레이 (시안 3: 헤더 + 카드 + 바텀시트) */}
        {compact && mobileEditOpen && (() => {
          const subtitle = [config.brand, config.branch, config.screen].filter(Boolean).join(' ')
          const SCREEN_TITLES = { seat: '좌석 설정', layout: '레이아웃 편집', zone: '복도·제외구역', exit: '출입구' } as const
          const handleBack = () => {
            if (mobileScreen === 'layout' || mobileScreen === 'zone') cancelEditMode()  // 동기화 효과가 seat으로 되돌림
            else if (mobileScreen === 'exit') setMobileScreen('seat')
            else closeMobileEdit()
          }
          return (
            <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-900 flex flex-col">
              {/* 헤더 */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-accent-soft text-accent text-lg shrink-0"
                  aria-label="뒤로"
                >
                  ‹
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{SCREEN_TITLES[mobileScreen]}</div>
                  {subtitle && <div className="text-xs text-gray-400 truncate">{subtitle}</div>}
                </div>
                {mobileScreen === 'seat' && (
                  <button type="button" onClick={closeMobileEdit} className="text-sm px-3 py-1.5 rounded-lg btn-accent font-medium">완료</button>
                )}
                {mobileScreen === 'zone' && (
                  <button type="button" onClick={completeEditMode} className="text-sm px-3 py-1.5 rounded-lg btn-accent font-medium">완료</button>
                )}
                {mobileScreen === 'exit' && (
                  <button type="button" onClick={() => setMobileScreen('seat')} className="text-sm px-3 py-1.5 rounded-lg btn-accent font-medium">완료</button>
                )}
                {mobileScreen === 'layout' && (
                  <button type="button" onClick={enterGridResize} className="text-sm px-3 py-1.5 rounded-lg text-accent font-medium">초기화</button>
                )}
              </div>

              {/* 좌석표 카드 (원본 크기 + 스크롤) */}
              <div className="flex-1 overflow-auto p-3">
                <div className="inline-block bg-white rounded-2xl p-4 min-w-full">
                  <SeatMapPreview
                    {...previewProps}
                    seatMenuAsSheet
                    exitTapMode={mobileScreen === 'exit'}
                    ghostHideActions
                    onGhostSelChange={(rows, cols) => setGhostSel({ rows, cols })}
                  />
                </div>
              </div>

              {/* 바텀시트 */}
              <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-t-2xl px-4 pt-3 pb-6 shadow-2xl">
                <div className="mx-auto w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-600 mb-3" />
                {mobileScreen === 'seat' && (
                  <>
                    <p className="text-xs text-gray-400 mb-3">좌석을 탭해 시선일치행·명당·실관람을 설정하세요.</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => { enterGridResize(); setMobileScreen('layout') }} className="px-2 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium">레이아웃 편집</button>
                      <button type="button" onClick={() => { enterEditMode('layout'); setMobileScreen('zone') }} className="px-2 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium">복도·제외구역</button>
                      <button type="button" onClick={() => setMobileScreen('exit')} className="px-2 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium">출입구</button>
                    </div>
                  </>
                )}
                {mobileScreen === 'layout' && (
                  <>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100">선택 범위</span>
                      <span className="text-sm font-bold text-accent">{ghostSel.rows} × {ghostSel.cols}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">그리드를 드래그해 행·열 범위를 지정하세요. 핸들을 끌어 크기를 조절할 수 있어요.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={cancelEditMode} className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300">취소</button>
                      <button type="button" onClick={() => setGridSize(ghostSel.rows, ghostSel.cols)} className="flex-1 px-4 py-2.5 text-sm rounded-xl btn-accent font-medium">이 크기로 적용</button>
                    </div>
                  </>
                )}
                {mobileScreen === 'zone' && (
                  <>
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">구역 지정</div>
                    <p className="text-xs text-gray-400 mb-3">복도는 열/행 사이를, 제외구역은 좌석 중앙을 이어 다각형으로 지정해요.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={cancelEditMode} className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300">취소</button>
                      <button type="button" onClick={completeEditMode} className="flex-1 px-4 py-2.5 text-sm rounded-xl btn-accent font-medium">완료</button>
                    </div>
                  </>
                )}
                {mobileScreen === 'exit' && (
                  <>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100">출입구 위치</span>
                      <span className="text-sm font-bold text-accent">{config.exits.length}곳</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">그리드 가장자리 좌석을 탭해 출입구 위치를 표시하세요.</p>
                    <button type="button" onClick={() => setMobileScreen('seat')} className="w-full px-4 py-2.5 text-sm rounded-xl btn-accent font-medium">완료</button>
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </main>
    </div>
  )
}

export default App
