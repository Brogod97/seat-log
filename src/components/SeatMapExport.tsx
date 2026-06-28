import { forwardRef } from 'react'
import type { SeatMapConfig } from '../types'
import { calcCenterCols } from '../utils/centerCols'
import { indexToLabel } from '../utils/rowLabel'

interface Props {
  config: SeatMapConfig
}

const SEAT = 32
const AISLE = 12

type Layer = 'watched' | 'prime' | 'sightRow' | 'center' | 'excluded'

function inRange(row: number, col: number, r: { rowStart: number; rowEnd: number; colStart: number; colEnd: number }) {
  return row >= r.rowStart && row <= r.rowEnd && col >= r.colStart && col <= r.colEnd
}

const LAYER_BG: Record<Layer, string> = {
  watched:  '#fde047',  // yellow-300
  prime:    '#fca5a5',  // red-300
  sightRow: '#86efac',  // green-300
  center:   '#93c5fd',  // blue-300
  excluded: '#f9fafb',  // gray-50
}

function getSeatBg(row: number, col: number, config: SeatMapConfig, centerCols: number[]): string {
  if (config.excludedSeats.some((s) => s.row === row && s.col === col)) return LAYER_BG.excluded
  if (config.watchedSeats.some((s) => s.row === row && s.col === col)) return LAYER_BG.watched
  if (config.primeRanges.some((r) => inRange(row, col, r))) return LAYER_BG.prime
  if (config.sightRows.includes(row)) return LAYER_BG.sightRow
  if (centerCols.includes(col)) return LAYER_BG.center
  return '#e5e7eb'  // gray-200
}

const SeatMapExport = forwardRef<HTMLDivElement, Props>(({ config }, ref) => {
  const { rows, cols, rowAisles, colAisles } = config

  const rowAisleSet = new Set(rowAisles)
  const colAisleSet = new Set(colAisles)
  const centerCols = calcCenterCols(cols, colAisles)

  const title = [config.brand, config.branch, config.screen].filter(Boolean).join(' ')

  const legend: { color: string; label: string }[] = [
    { color: LAYER_BG.center,   label: '중앙열' },
    { color: LAYER_BG.sightRow, label: '시선일치행' },
    { color: LAYER_BG.prime,    label: '명당' },
    { color: LAYER_BG.watched,  label: '실관람' },
  ].filter(({ color }) => {
    if (color === LAYER_BG.center)   return centerCols.length > 0
    if (color === LAYER_BG.sightRow) return config.sightRows.length > 0
    if (color === LAYER_BG.prime)    return config.primeRanges.length > 0
    if (color === LAYER_BG.watched)  return config.watchedSeats.length > 0
    return false
  })

  return (
    <div
      ref={ref}
      style={{
        display: 'inline-block',
        padding: 24,
        background: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* 제목 */}
      {title && (
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
          {title}
        </div>
      )}

      {/* 범례 */}
      {legend.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          {legend.map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#374151' }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: '1px solid rgba(0,0,0,0.08)' }} />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* 좌석 그리드 */}
      <div style={{ display: 'inline-block' }}>
        {Array.from({ length: rows }, (_, ri) => {
          const row = ri + 1
          const isAisleRow = rowAisleSet.has(row)
          return (
            <div key={ri}>
              <div style={{ display: 'flex', gap: 2 }}>
                {Array.from({ length: cols }, (_, ci) => {
                  const col = ci + 1
                  const isAisleCol = colAisleSet.has(col)
                  const bg = getSeatBg(row, col, config, centerCols)
                  const isExcluded = config.excludedSeats.some((s) => s.row === row && s.col === col)
                  return (
                    <>
                      <div
                        key={`seat-${ri}-${ci}`}
                        style={{
                          width: SEAT,
                          height: SEAT,
                          flexShrink: 0,
                          borderRadius: 4,
                          background: bg,
                          border: isExcluded ? '1px dashed #d1d5db' : '1px solid rgba(0,0,0,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          color: isExcluded ? '#d1d5db' : '#374151',
                          fontWeight: 500,
                        }}
                      >
                        {isExcluded ? '╳' : `${indexToLabel(ri)}${col}`}
                      </div>
                      {col < cols && (
                        <div
                          key={`ca-${ri}-${ci}`}
                          style={{ width: isAisleCol ? AISLE : 2, flexShrink: 0 }}
                        />
                      )}
                    </>
                  )
                })}
              </div>
              {row < rows && (
                <div key={`ra-${ri}`} style={{ height: isAisleRow ? AISLE : 2 }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default SeatMapExport
