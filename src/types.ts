export interface SeatMapConfig {
  brand: string
  branch: string
  screen: string
  rows: number
  cols: number
  rowAisles: number[]  // 이 행 번호 다음에 복도 (1-based)
  colAisles: number[]  // 이 열 번호 다음에 복도 (1-based)
  sightRows: number[]    // 시선일치행 (1-based)
  primeRanges: Range[]  // 명당 범위
  watchedSeats: WatchedSeat[]  // 실관람 칸 (좌석당 관람 기록 배열)
  excludedSeats: Seat[] // 제외 영역
  exits: ExitMarker[]   // 출입구 (좌석 가장자리 선)
}

export type ExitSide = 'left' | 'right' | 'top' | 'bottom'

export interface ExitMarker {
  row: number
  col: number
  side: ExitSide  // 좌석의 어느 변에 문을 표시할지
}

export interface Range {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

export interface Seat {
  row: number
  col: number
}

// 실관람 좌석의 관람 기록 1건 — 전부 선택 입력 (기억 안 나는 필드는 비워둘 수 있게)
export interface WatchedRecord {
  date?: string    // 'YYYY-MM-DD' — 시작 시각의 실제 달력 날짜 (새벽 심야 상영이면 그 새벽의 날짜)
  time?: string    // 'HH:MM' — 상영 시작 시간
  timeEnd?: string // 'HH:MM' — 상영 종료 시간. 시작보다 이르면 자정을 넘긴 것으로 해석해 "익일" 표기 (자동)
  movie?: string   // 영화명
  memo?: string    // 자유 메모
}

// 실관람 좌석 — 같은 좌석에서 여러 번 관람할 수 있으므로 기록을 배열로 쌓는다(1:N).
// records가 비어 있어도 좌석 자체는 실관람(노랑) 표시 유지 — "앉아봤다"와 "기록"을 분리.
export interface WatchedSeat {
  row: number
  col: number
  records: WatchedRecord[]
}

export type EditMode = 'layout' | 'prime' | 'watched' | null

// 레이아웃 편집(2단계) 안의 구역 지정 모드: 복도 / 제외구역 / 출입구
export type ZoneMode = 'aisle' | 'excluded' | 'exit'

// 사용자가 "현재 저장"으로 남긴 개인 저장 버전. 구조가 다르면 별도 버전으로 쌓이므로
// savedAt(마지막으로 이 버전을 저장한 시각)으로 여러 버전을 구분한다. 마이그레이션된 예전 데이터는 없을 수 있음.
export interface SavedVersion extends SeatMapConfig {
  savedAt?: number // epoch ms
}

// 관리자가 게시하는 지점 공용 좌석 레이아웃 (물리 구조만, 개인 리뷰 데이터 제외)
export interface TheaterLayoutPreset {
  brand: string
  branch: string
  screen: string
  rows: number
  cols: number
  rowAisles: number[]
  colAisles: number[]
  excludedSeats: Seat[]
  exits: ExitMarker[]
}
