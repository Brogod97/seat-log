export interface SeatMapConfig {
  rows: number
  cols: number
  rowAisles: number[]  // 이 행 번호 다음에 복도 (1-based)
  colAisles: number[]  // 이 열 번호 다음에 복도 (1-based)
}
