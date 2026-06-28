import type { SeatMapConfig } from '../types'

interface Props {
  config: SeatMapConfig
  onChange: (config: SeatMapConfig) => void
}

function AisleInput({
  label,
  max,
  values,
  onChange,
}: {
  label: string
  max: number
  values: number[]
  onChange: (values: number[]) => void
}) {
  const [input, setInput] = useState('')

  function add() {
    const n = parseInt(input)
    if (!isNaN(n) && n >= 1 && n < max && !values.includes(n)) {
      onChange([...values, n].sort((a, b) => a - b))
    }
    setInput('')
  }

  function remove(v: number) {
    onChange(values.filter((x) => x !== v))
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          type="number"
          min={1}
          max={max - 1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
          placeholder="번호"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
        >
          추가
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded"
          >
            {v}번 후
            <button type="button" onClick={() => remove(v)} className="hover:text-red-600">
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

import { useState } from 'react'

export default function SeatMapForm({ config, onChange }: Props) {
  function update(partial: Partial<SeatMapConfig>) {
    onChange({ ...config, ...partial })
  }

  return (
    <div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">행 수</label>
        <input
          type="number"
          min={1}
          max={50}
          value={config.rows}
          onChange={(e) => update({ rows: Math.max(1, parseInt(e.target.value) || 1) })}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">열 수</label>
        <input
          type="number"
          min={1}
          max={50}
          value={config.cols}
          onChange={(e) => update({ cols: Math.max(1, parseInt(e.target.value) || 1) })}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
        />
      </div>
      <hr className="my-4 border-gray-200" />
      <p className="text-xs text-gray-500 mb-3">복도: 해당 번호 <strong>다음</strong>에 통로 삽입</p>
      <AisleInput
        label="가로 복도 (행 기준)"
        max={config.rows}
        values={config.rowAisles}
        onChange={(v) => update({ rowAisles: v })}
      />
      <AisleInput
        label="세로 복도 (열 기준)"
        max={config.cols}
        values={config.colAisles}
        onChange={(v) => update({ colAisles: v })}
      />
    </div>
  )
}
