// 좌석표 표시용 상수·스타일 맵 (순수 데이터)
import type { SeatMapConfig, EditMode } from '../types'
import { inRange } from './seatGeometry'

// 고스트 그리드(크기 선택) 크기 한계·셀 크기
export const GHOST_MAX_ROWS = 26
export const GHOST_MAX_COLS = 36
export const GHOST_CELL = 18

// 우선순위: watched > prime > sightRow > center
export type Layer = 'watched' | 'prime' | 'sightRow' | 'center'
export const LAYER_BG: Record<Layer, string> = {
  watched:  'bg-yellow-300',
  prime:    'bg-red-300',
  sightRow: 'bg-green-300',
  center:   'bg-blue-300',
}
export const LAYER_RING: Record<Layer, string> = {
  watched:  'ring-yellow-400',
  prime:    'ring-red-400',
  sightRow: 'ring-green-400',
  center:   'ring-blue-400',
}

export function getAppliedLayers(
  row: number, col: number,
  config: SeatMapConfig,
  centerCols: number[]
): Layer[] {
  const layers: Layer[] = []
  if (config.watchedSeats.some((s) => s.row === row && s.col === col)) layers.push('watched')
  if (config.primeRanges.some((r) => inRange(row, col, r))) layers.push('prime')
  if (config.sightRows.includes(row)) layers.push('sightRow')
  if (centerCols.includes(col)) layers.push('center')
  return layers
}

export const MODE_STATUS: Record<NonNullable<EditMode>, (arg: boolean | number) => string> = {
  layout:  () => '',  // phase별로 직접 표시
  prime:   (f) => f ? '끝 좌석을 클릭 또는 드래그해 범위 확정' : '시작 좌석 클릭 또는 드래그 시작',
  watched: (f) => f ? '끝 좌석 클릭 (같은 좌석 = 1칸)' : '시작 좌석 클릭',
}

export const MODE_RING: Record<NonNullable<EditMode>, string> = {
  layout:  'ring-indigo-400 bg-indigo-50',
  prime:   'ring-red-400 bg-red-50',
  watched: 'ring-yellow-400 bg-yellow-50',
}
