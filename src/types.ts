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
  watchedSeats: Seat[]  // 실관람 칸
  excludedSeats: Seat[] // 제외 영역
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
