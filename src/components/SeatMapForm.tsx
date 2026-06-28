import type { SeatMapConfig } from '../types'
import type { EditMode } from '../App'
import { useState } from 'react'
import { indexToLabel } from '../utils/rowLabel'
import { THEATERS, BRAND_LIST } from '../data/theaters'

interface Props {
  config: SeatMapConfig
  onChange: (config: SeatMapConfig) => void
  editMode: EditMode
  onEnterEditMode: (mode: EditMode) => void
  onCancelEditMode: () => void
  onCompleteEditMode: () => void
}

type BtnColor = 'red' | 'yellow' | 'green' | 'indigo' | 'gray'

const COLOR_STYLES: Record<BtnColor, { active: string; idle: string }> = {
  red:    { active: 'bg-red-500 text-white border-red-500',       idle: 'text-red-600 border-red-300 hover:bg-red-50' },
  yellow: { active: 'bg-yellow-500 text-white border-yellow-500', idle: 'text-yellow-700 border-yellow-300 hover:bg-yellow-50' },
  green:  { active: 'bg-green-500 text-white border-green-500',   idle: 'text-green-700 border-green-300 hover:bg-green-50' },
  indigo: { active: 'bg-indigo-500 text-white border-indigo-500', idle: 'text-indigo-600 border-indigo-300 hover:bg-indigo-50' },
  gray:   { active: 'bg-gray-500 text-white border-gray-500',     idle: 'text-gray-600 border-gray-300 hover:bg-gray-50' },
}

function EditModeButton({
  label, color, active, mode, currentMode, onEnter, onCancel, onComplete,
}: {
  label: string
  color: BtnColor
  active: boolean
  mode: EditMode
  currentMode: EditMode
  onEnter: (m: EditMode) => void
  onCancel: () => void
  onComplete: () => void
}) {
  const c = COLOR_STYLES[color]
  if (active) {
    return (
      <div className="flex gap-1">
        <button type="button" onClick={onCancel}
          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
          취소
        </button>
        <button type="button" onClick={onComplete}
          className={`text-xs px-2 py-1 rounded border transition-colors ${c.active}`}>
          완료
        </button>
      </div>
    )
  }
  return (
    <button type="button" onClick={() => onEnter(mode)}
      disabled={currentMode !== null}
      className={`text-xs px-3 py-1 rounded border transition-colors bg-white ${c.idle} disabled:opacity-40 disabled:cursor-not-allowed`}>
      {label}
    </button>
  )
}

function CountInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value))

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setText(e.target.value)
    const n = parseInt(e.target.value)
    if (!isNaN(n) && n >= 1 && n <= 99) onChange(n)
  }

  function handleBlur() {
    const n = parseInt(text)
    if (isNaN(n) || n < 1) { setText(String(value)); return }
    const clamped = Math.min(n, 99)
    setText(String(clamped))
    onChange(clamped)
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" value={text} onChange={handleChange} onBlur={handleBlur}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
    </div>
  )
}

export default function SeatMapForm({
  config, onChange, editMode,
  onEnterEditMode, onCancelEditMode, onCompleteEditMode,
}: Props) {
  function update(partial: Partial<SeatMapConfig>) {
    onChange({ ...config, ...partial })
  }

  const btnProps = {
    currentMode: editMode,
    onEnter: onEnterEditMode,
    onCancel: onCancelEditMode,
    onComplete: onCompleteEditMode,
  }

  return (
    <div>
      {/* 영화관 선택 */}
      <TheaterSelector config={config} update={update} />

      <hr className="my-4 border-gray-200" />

      {/* 그리드 크기 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">그리드 크기</label>
          <EditModeButton label="편집" color="indigo" mode="gridSize" active={editMode === 'gridSize'} {...btnProps} />
        </div>
        <p className="text-sm text-gray-500">{config.rows}행 × {config.cols}열</p>
      </div>

      <hr className="my-4 border-gray-200" />

      {/* 가로 복도 */}
      <Section
        label="가로 복도 (행 기준)"
        button={<EditModeButton label="편집" color="indigo" mode="rowAisle" active={editMode === 'rowAisle'} {...btnProps} />}
        resetIcon={config.rowAisles.length > 0 ? <ResetIcon onClick={() => update({ rowAisles: [] })} title="가로 복도 초기화" /> : undefined}
      >
        <TagList
          items={config.rowAisles.map((v) => ({ key: v, label: `${indexToLabel(v - 1)}행 후` }))}
          color="indigo"
          onRemove={(v) => update({ rowAisles: config.rowAisles.filter((x) => x !== v) })}
        />
      </Section>

      {/* 세로 복도 */}
      <Section
        label="세로 복도 (열 기준)"
        button={<EditModeButton label="편집" color="indigo" mode="colAisle" active={editMode === 'colAisle'} {...btnProps} />}
        resetIcon={config.colAisles.length > 0 ? <ResetIcon onClick={() => update({ colAisles: [] })} title="세로 복도 초기화" /> : undefined}
      >
        <TagList
          items={config.colAisles.map((v) => ({ key: v, label: `${v}열 후` }))}
          color="indigo"
          onRemove={(v) => update({ colAisles: config.colAisles.filter((x) => x !== v) })}
        />
      </Section>

      {/* 제외 영역 */}
      <Section
        label="제외 영역"
        button={<EditModeButton label="편집" color="indigo" mode="excluded" active={editMode === 'excluded'} {...btnProps} />}
        resetIcon={config.excludedSeats.length > 0 ? <ResetIcon onClick={() => update({ excludedSeats: [] })} title="제외 영역 초기화" /> : undefined}
      >
        {config.excludedSeats.length > 0 && (
          <p className="text-xs text-gray-400">{config.excludedSeats.length}개 좌석 제외됨</p>
        )}
      </Section>

      <hr className="my-4 border-gray-200" />

      {/* 제외 영역 */}
      <Section
        label="제외 영역"
        button={<EditModeButton label="선택" color="gray" mode="excluded" active={editMode === 'excluded'} {...btnProps} />}
        resetIcon={config.excludedSeats.length > 0 ? <ResetIcon onClick={() => update({ excludedSeats: [] })} title="제외 영역 초기화" /> : undefined}
      >
        {config.excludedSeats.length > 0
          ? <p className="text-xs text-gray-400">{config.excludedSeats.length}개 좌석 제외됨</p>
          : null}
      </Section>

      <hr className="my-4 border-gray-200" />
      <p className="text-xs text-gray-500 mb-3">색칠 레이어</p>

      {/* 시선일치행 */}
      <Section
        label={<><Dot color="bg-green-300" />시선일치행</>}
        button={<EditModeButton label="선택" color="green" mode="sightRow" active={editMode === 'sightRow'} {...btnProps} />}
        resetIcon={config.sightRows.length > 0 ? <ResetIcon onClick={() => update({ sightRows: [] })} title="시선일치행 초기화" /> : undefined}
      >
        <TagList
          items={config.sightRows.map((v) => ({ key: v, label: `${indexToLabel(v - 1)}행` }))}
          color="green"
          onRemove={(v) => update({ sightRows: config.sightRows.filter((x) => x !== v) })}
        />
      </Section>

      {/* 명당 */}
      <Section
        label={<><Dot color="bg-red-300" />명당 범위</>}
        button={<EditModeButton label="선택" color="red" mode="prime" active={editMode === 'prime'} {...btnProps} />}
        resetIcon={config.primeRanges.length > 0 ? <ResetIcon onClick={() => update({ primeRanges: [] })} title="명당 범위 초기화" /> : undefined}
      >
        <div className="flex flex-col gap-1">
          {config.primeRanges.map((r, i) => (
            <span key={i} className="inline-flex items-center justify-between px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">
              {indexToLabel(r.rowStart - 1)}{r.colStart} ~ {indexToLabel(r.rowEnd - 1)}{r.colEnd}
              <button type="button" onClick={() => update({ primeRanges: config.primeRanges.filter((_, j) => j !== i) })} className="ml-2 hover:text-red-600">×</button>
            </span>
          ))}
        </div>
      </Section>

      {/* 실관람 */}
      <Section
        label={<><Dot color="bg-yellow-300" />실관람 좌석</>}
        button={<EditModeButton label="선택" color="yellow" mode="watched" active={editMode === 'watched'} {...btnProps} />}
        resetIcon={config.watchedSeats.length > 0 ? <ResetIcon onClick={() => update({ watchedSeats: [] })} title="실관람 초기화" /> : undefined}
      >
        <TagList
          items={[...config.watchedSeats]
            .map((s, i) => ({ s, i }))
            .sort((a, b) => a.s.row !== b.s.row ? a.s.row - b.s.row : a.s.col - b.s.col)
            .map(({ s, i }) => ({ key: i, label: `${indexToLabel(s.row - 1)}${s.col}` }))}
          color="yellow"
          onRemove={(i) => update({ watchedSeats: config.watchedSeats.filter((_, j) => j !== i) })}
        />
      </Section>
    </div>
  )
}

const CUSTOM = '직접 입력'
const FREQ_KEY = 'seat_map_branch_freq'
const TOP_N = 3

function loadFreq(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(FREQ_KEY) ?? '{}') } catch { return {} }
}

function recordBranchSelection(brand: string, branch: string) {
  if (!brand || !branch || branch === CUSTOM) return
  const freq = loadFreq()
  const key = `${brand}:${branch}`
  freq[key] = (freq[key] ?? 0) + 1
  localStorage.setItem(FREQ_KEY, JSON.stringify(freq))
}

function getTopBranches(brand: string, all: string[]): string[] {
  const freq = loadFreq()
  return all
    .map((b) => ({ b, count: freq[`${brand}:${b}`] ?? 0 }))
    .filter(({ count }) => count > 0)
    .sort((a, z) => z.count - a.count)
    .slice(0, TOP_N)
    .map(({ b }) => b)
}

function TheaterSelector({
  config,
  update,
}: {
  config: SeatMapConfig
  update: (p: Partial<SeatMapConfig>) => void
}) {
  const theaterData = config.brand ? THEATERS[config.brand] : null
  const allBranches = theaterData ? theaterData.branches : []
  const branches = [...allBranches, CUSTOM]
  const screens = theaterData ? [...theaterData.screens, CUSTOM] : [CUSTOM]

  const topBranches = config.brand ? getTopBranches(config.brand, allBranches) : []

  const isBranchCustom = config.branch === CUSTOM || (!!config.branch && !allBranches.includes(config.branch))
  const isScreenCustom = config.screen === CUSTOM || (!!config.screen && !(theaterData?.screens ?? []).includes(config.screen))

  function handleBrandChange(brand: string) {
    update({ brand, branch: '', screen: '' })
  }

  function handleBranchChange(value: string) {
    if (value !== CUSTOM && value !== '') recordBranchSelection(config.brand, value)
    update({ branch: value })
  }

  function handleScreenChange(value: string) {
    update({ screen: value })
  }

  return (
    <div className="mb-2">
      {/* 브랜드 */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">영화관</label>
        <div className="flex gap-1 flex-wrap">
          {BRAND_LIST.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => handleBrandChange(b)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                config.brand === b
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* 지점 */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">지점</label>
        <select
          value={isBranchCustom ? CUSTOM : config.branch}
          onChange={(e) => handleBranchChange(e.target.value)}
          disabled={!config.brand}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">선택</option>
          {topBranches.length > 0 && (
            <optgroup label="자주 선택">
              {topBranches.map((b) => <option key={`top-${b}`} value={b}>{b}</option>)}
            </optgroup>
          )}
          <optgroup label="전체">
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </optgroup>
        </select>
        {isBranchCustom && (
          <input
            type="text"
            value={config.branch === CUSTOM ? '' : config.branch}
            onChange={(e) => update({ branch: e.target.value })}
            placeholder="지점명 입력"
            className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
            autoFocus
          />
        )}
      </div>

      {/* 상영관 */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">상영관</label>
        <select
          value={isScreenCustom ? CUSTOM : config.screen}
          onChange={(e) => handleScreenChange(e.target.value)}
          disabled={!config.brand}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">선택</option>
          {screens.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {isScreenCustom && (
          <input
            type="text"
            value={config.screen === CUSTOM ? '' : config.screen}
            onChange={(e) => update({ screen: e.target.value })}
            placeholder="상영관명 입력"
            className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
            autoFocus
          />
        )}
      </div>

    </div>
  )
}

function Dot({ color }: { color: string }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded ${color} mr-1`} />
}

function Section({ label, button, resetIcon, children }: { label: React.ReactNode; button: React.ReactNode; resetIcon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
          {label}
          {resetIcon}
        </label>
        {button}
      </div>
      {children}
    </div>
  )
}

function ResetIcon({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-gray-300 hover:text-gray-500 transition-colors text-base leading-none"
    >
      ↺
    </button>
  )
}

function TagList<T extends number | string>({
  items, color, onRemove,
}: {
  items: { key: T; label: string }[]
  color: string
  onRemove: (key: T) => void
}) {
  const bgMap: Record<string, string> = {
    indigo: 'bg-indigo-100 text-indigo-800',
    green:  'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red:    'bg-red-100 text-red-800',
  }
  const cls = bgMap[color] ?? 'bg-gray-100 text-gray-800'
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(({ key, label }) => (
        <span key={String(key)} className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${cls}`}>
          {label}
          <button type="button" onClick={() => onRemove(key)} className="hover:text-red-600">×</button>
        </span>
      ))}
    </div>
  )
}
