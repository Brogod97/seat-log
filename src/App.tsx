import { useState, useRef, useEffect } from 'react'
import { toPng } from 'html-to-image'
import SeatMapForm from './components/SeatMapForm'
import SeatMapPreview from './components/SeatMapPreview'
import type { SeatMapConfig, Range } from './types'

export type EditMode = 'layout' | 'prime' | 'watched' | null

const STORAGE_KEY = 'seat_map_current'
const SAVES_KEY = 'seat_map_saves'

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
}

function App() {
  const [config, setConfig] = useState<SeatMapConfig>(loadConfig)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [saves, setSaves] = useState<Record<string, SeatMapConfig>>(loadSaves)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch {}
  }, [config])

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
    }))
    // 크기 확정 후 layout 2단계(복도/제외 편집)로 자동 전환
    setLayoutPhase('edit')
  }

  const [layoutPhase, setLayoutPhase] = useState<'size' | 'edit'>('size')

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

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-80 shrink-0 bg-white border-r border-gray-200 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-gray-800">좌석표 생성기</h1>
          <button
            type="button"
            onClick={resetConfig}
            className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded border border-gray-200 hover:border-red-200 transition-colors"
          >
            초기화
          </button>
        </div>

        {/* 저장 / 불러오기 */}
        <div className="mb-4 pb-4 border-b border-gray-200">
          {/* 불러오기 드롭다운 */}
          {Object.keys(saves).length > 0 && (
            <div className="mb-2">
              <select
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                defaultValue=""
                onChange={(e) => { if (e.target.value) loadSavedConfig(e.target.value) }}
              >
                <option value="">저장된 좌석표 불러오기</option>
                {Object.keys(saves).map((key) => (
                  <option key={key} value={key}>
                    {key.replace(/\|/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 저장 / JSON */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={saveCurrentConfig}
              className="flex-1 text-xs px-2 py-1.5 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
            >
              현재 저장
            </button>
            <button
              type="button"
              onClick={exportJson}
              disabled={Object.keys(saves).length === 0}
              className="text-xs px-2 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="JSON 내보내기"
            >
              내보내기
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="text-xs px-2 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
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
      </aside>
      <main className="flex-1 p-6 overflow-auto" onClick={() => { if (editMode) completeEditMode() }}>
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); downloadImage() }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-700 transition-colors"
          >
            ↓ 이미지 다운로드
          </button>
        </div>

        {/* 좌석표 — 편집 + 다운로드 이미지 영역 겸용 */}
        <div className="inline-block">
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
            <span>📷 다운로드 이미지 영역</span>
            <span className="text-xs text-gray-400">(점선 안쪽이 그대로 PNG로 저장됩니다)</span>
          </div>
          {/* 점선 테두리는 미리보기용 — ref는 안쪽 카드에 있어 PNG에는 미포함 */}
          <div className="inline-block rounded-lg border-2 border-dashed border-gray-300 p-1">
            <div ref={exportRef} className="inline-block bg-white rounded-lg p-6">
              <SeatMapPreview
            config={config}
            editMode={editMode}
            layoutPhase={layoutPhase}
            modeStartPos={modeStartPos}
            onEnterModeFrom={enterModeFrom}
            onCancelEditMode={cancelEditMode}
            onCompleteEditMode={completeEditMode}
            onSetGridSize={setGridSize}
            onToggleExcludedSeat={toggleExcludedSeat}
            onExcludeSeats={excludeSeats}
            onAddPrimeRange={addPrimeRange}
            onRemovePrimeRange={removePrimeRange}
            onAddWatchedRange={addWatchedRange}
            onToggleWatchedSeat={toggleWatchedSeat}
            onSetWatchedMemo={setWatchedMemo}
            onToggleSightRow={toggleSightRow}
            onToggleAisle={toggleRowAisle}
            onToggleColAisle={toggleColAisle}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
