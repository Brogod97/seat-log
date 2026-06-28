import { useState, useRef } from 'react'
import { toPng } from 'html-to-image'
import SeatMapForm from './components/SeatMapForm'
import SeatMapPreview from './components/SeatMapPreview'
import SeatMapExport from './components/SeatMapExport'
import type { SeatMapConfig, Range } from './types'

export type EditMode = 'gridSize' | 'excluded' | 'prime' | 'watched' | 'aisle' | null

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
  const [config, setConfig] = useState<SeatMapConfig>(DEFAULT_CONFIG)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [snapshot, setSnapshot] = useState<SeatMapConfig | null>(null)
  const [modeStartPos, setModeStartPos] = useState<{ row: number; col: number } | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  async function downloadImage() {
    if (!exportRef.current) return
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
    completeEditMode()
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

  function addExcludedRange(range: Range) {
    setConfig((c) => {
      const toAdd: { row: number; col: number }[] = []
      for (let r = range.rowStart; r <= range.rowEnd; r++) {
        for (let col = range.colStart; col <= range.colEnd; col++) {
          if (!c.excludedSeats.some((s) => s.row === r && s.col === col)) {
            toAdd.push({ row: r, col })
          }
        }
      }
      return { ...c, excludedSeats: [...c.excludedSeats, ...toAdd] }
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-gray-800">좌석표 생성기</h1>
          <button
            type="button"
            onClick={resetConfig}
            className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded border border-gray-200 hover:border-red-200 transition-colors"
          >
            초기화
          </button>
        </div>
        <SeatMapForm
          config={config}
          onChange={setConfig}
          editMode={editMode}
          onEnterEditMode={enterEditMode}
          onCancelEditMode={cancelEditMode}
          onCompleteEditMode={completeEditMode}
        />
      </aside>
      <main className="flex-1 p-6 overflow-auto" onClick={() => { if (editMode && editMode !== 'excluded') completeEditMode() }}>
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); downloadImage() }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-700 transition-colors"
          >
            ↓ 이미지 다운로드
          </button>
        </div>

        <SeatMapPreview
          config={config}
          editMode={editMode}
          modeStartPos={modeStartPos}
          onEnterModeFrom={enterModeFrom}
          onCancelEditMode={cancelEditMode}
          onCompleteEditMode={completeEditMode}
          onSetGridSize={setGridSize}
          onToggleExcludedSeat={toggleExcludedSeat}
          onAddExcludedRange={addExcludedRange}
          onExcludeSeats={excludeSeats}
          onAddPrimeRange={addPrimeRange}
          onRemovePrimeRange={removePrimeRange}
          onAddWatchedRange={addWatchedRange}
          onToggleWatchedSeat={toggleWatchedSeat}
          onToggleSightRow={toggleSightRow}
          onToggleAisle={toggleRowAisle}
          onToggleColAisle={toggleColAisle}
        />
        {/* 이미지 추출용 숨김 렌더링 */}
        <div style={{ position: 'absolute', left: -9999, top: 0, pointerEvents: 'none' }}>
          <SeatMapExport ref={exportRef} config={config} />
        </div>
      </main>
    </div>
  )
}

export default App
