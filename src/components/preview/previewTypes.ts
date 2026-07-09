// 프리뷰 상호작용 공용 타입
import type { Range } from '../../types'

export interface PopupState { x: number; y: number; row: number; col: number }

export type HighlightHint =
  | { type: 'prime'; range: Range }
  | { type: 'watched'; row: number; col: number }
  | { type: 'sightRow'; row: number }
  | null
