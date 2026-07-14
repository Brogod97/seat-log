// 좌석표 순수 기하/판정 (React 무관 순수 함수)
import type { CSSProperties } from 'react'
import type { Range, ExitSide } from '../types'

export interface SeatPos { row: number; col: number }

export function normalizeRange(a: SeatPos, b: SeatPos): Range {
  return {
    rowStart: Math.min(a.row, b.row),
    rowEnd: Math.max(a.row, b.row),
    colStart: Math.min(a.col, b.col),
    colEnd: Math.max(a.col, b.col),
  }
}

export function inRange(row: number, col: number, r: Range) {
  return row >= r.rowStart && row <= r.rowEnd && col >= r.colStart && col <= r.colEnd
}

// 출입구 선: 좌석의 바깥 변에 문 위치를 표시
export function exitLineStyle(side: ExitSide): CSSProperties {
  // 출입구는 핵심 정보가 아니므로 강세를 낮춤 (연한 회색·얇게)
  const C = '#9ca3af', T = 3, OUT = -5
  const base: CSSProperties = { position: 'absolute', background: C, borderRadius: 2, zIndex: 5 }
  if (side === 'left') return { ...base, left: OUT, top: 2, bottom: 2, width: T }
  if (side === 'right') return { ...base, right: OUT, top: 2, bottom: 2, width: T }
  if (side === 'top') return { ...base, top: OUT, left: 2, right: 2, height: T }
  return { ...base, bottom: OUT, left: 2, right: 2, height: T }  // bottom
}

// 좌석 픽셀 좌표 계산기 (런타임 값 의존 → 팩토리로 생성)
// 열: 행이 flex(gap:2)라 gap div 양쪽에 2px씩 붙음 → COL_STEP = seat + 2 + gap_div + 2
//     layout edit 모드에서는 gap div가 8px으로 확장됨(normalGap)
// 행: 바깥 div는 flex gap이 없어 ROW_STEP = seat + gap_div
export function makeSeatGeometry(params: {
  rows: number
  cols: number
  rowAisles: number[]
  colAisles: number[]
  seat: number
  aisle: number
  normalGap: number
}) {
  const { rows, cols, rowAisles, colAisles, seat, aisle, normalGap } = params
  const COL_STEP = seat + 2 + normalGap + 2
  const ROW_STEP = seat + normalGap
  const AISLE_EXTRA = aisle - normalGap
  const rowAisleSet = new Set(rowAisles)
  const colAisleSet = new Set(colAisles)

  // 좌석 픽셀 중심 계산 (SVG 오버레이·복도 띠용)
  function seatPixelCenter(row: number, col: number): { x: number; y: number } {
    let x = (col - 1) * COL_STEP + seat / 2
    for (let c = 1; c < col; c++) {
      if (colAisleSet.has(c)) x += AISLE_EXTRA
    }
    let y = (row - 1) * ROW_STEP + seat / 2
    for (let r = 1; r < row; r++) {
      if (rowAisleSet.has(r)) y += AISLE_EXTRA
    }
    return { x, y }
  }

  // 전체 그리드 픽셀 크기 (스텝과 동일 기준으로 계산)
  const gridPixelWidth = (() => {
    let w = (cols - 1) * COL_STEP + seat
    colAisles.forEach((c) => { if (c < cols) w += AISLE_EXTRA })
    return w
  })()
  const gridPixelHeight = (() => {
    let h = (rows - 1) * ROW_STEP + seat
    rowAisles.forEach((r) => { if (r < rows) h += AISLE_EXTRA })
    return h
  })()

  return { seatPixelCenter, gridPixelWidth, gridPixelHeight }
}
