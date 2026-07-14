/**
 * 좌석표의 물리적 중심(복도 폭 포함)에 가장 가까운 열(들)을 중앙열로 반환.
 *
 * 각 열의 픽셀 중심을 복도 폭까지 반영해 계산한 뒤, 전체 폭의 중심에 가장 가까운 열을 찾는다.
 * - 중심이 한 열 위에 오면(홀수 대칭) 1열
 * - 중심이 두 열 사이(복도/대칭축)에 오면 좌우 2열
 *
 * 예) 16열, 4열마다 복도(colAisles=[4,8,12])는 좌우 대칭이라 중심이 8·9열 사이 복도에 걸려 [8, 9] 반환.
 * (좌석 크기는 렌더와 동일 비율만 맞으면 대칭 계산엔 충분 — 아래 상수는 SeatMapPreview와 동일)
 *
 * 반환값: 1-based 열 번호 배열
 */
const SEAT = 32
const GAP = 2
const AISLE = 20

export function calcCenterCols(cols: number, colAisles: number[]): number[] {
  if (cols <= 0) return []
  const aisleSet = new Set(colAisles)

  // 각 열의 중심 x 좌표 (열 상자 폭 SEAT, 열 사이 간격은 복도면 AISLE, 아니면 GAP)
  const centerX: number[] = []
  let x = 0
  for (let c = 1; c <= cols; c++) {
    centerX.push(x + SEAT / 2)
    x += SEAT + (aisleSet.has(c) ? AISLE : GAP)
  }

  const gridWidth = centerX[cols - 1] + SEAT / 2
  const mid = gridWidth / 2

  // 중심에 가장 가까운 거리
  let minDist = Infinity
  for (const cx of centerX) minDist = Math.min(minDist, Math.abs(cx - mid))

  // 그 거리와 (부동소수 오차 범위 내) 같은 열들 — 대칭축이 두 열 사이면 2열이 함께 뽑힘
  const EPS = 0.5
  const result: number[] = []
  for (let c = 1; c <= cols; c++) {
    if (Math.abs(centerX[c - 1] - mid) <= minDist + EPS) result.push(c)
  }
  return result
}
