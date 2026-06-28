import type { SeatMapConfig } from '../types'

interface Props {
  config: SeatMapConfig
}

function rowLabel(rowIndex: number): string {
  // 0-based index → A, B, C, ..., Z, AA, AB, ...
  let label = ''
  let n = rowIndex
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

export default function SeatMapPreview({ config }: Props) {
  const { rows, cols, rowAisles, colAisles } = config

  const SEAT_SIZE = 32
  const AISLE_SIZE = 12

  // 각 행/열에 대해 "이 위치 다음에 복도가 있나" 세트
  const rowAisleSet = new Set(rowAisles)
  const colAisleSet = new Set(colAisles)

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {rows}행 × {cols}열
      </p>
      <div className="overflow-auto">
        <div
          style={{ display: 'inline-grid' }}
        >
          {Array.from({ length: rows }, (_, ri) => (
            <>
              <div
                key={`row-${ri}`}
                style={{
                  display: 'flex',
                  gap: 2,
                }}
              >
                {Array.from({ length: cols }, (_, ci) => (
                  <>
                    <div
                      key={`seat-${ri}-${ci}`}
                      style={{
                        width: SEAT_SIZE,
                        height: SEAT_SIZE,
                        flexShrink: 0,
                      }}
                      className="bg-gray-200 rounded flex items-center justify-center text-gray-600"
                    >
                      <span style={{ fontSize: 9, lineHeight: 1 }}>
                        {rowLabel(ri)}{ci + 1}
                      </span>
                    </div>
                    {colAisleSet.has(ci + 1) && (
                      <div
                        key={`col-aisle-${ri}-${ci}`}
                        style={{ width: AISLE_SIZE, flexShrink: 0 }}
                      />
                    )}
                  </>
                ))}
              </div>
              {rowAisleSet.has(ri + 1) && (
                <div key={`row-aisle-${ri}`} style={{ height: AISLE_SIZE }} />
              )}
            </>
          ))}
        </div>
      </div>
    </div>
  )
}
