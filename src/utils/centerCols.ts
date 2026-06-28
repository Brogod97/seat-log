/**
 * 복도(colAisles)로 나뉜 열 블럭 중 가운데 블럭의 중앙 열을 반환.
 * 블럭 좌석 수가 짝수면 중앙 2열, 홀수면 1열.
 * 반환값: 1-based 열 번호 배열
 */
export function calcCenterCols(cols: number, colAisles: number[]): number[] {
  // 블럭 분리: colAisles는 정렬된 1-based 번호
  const sorted = [...colAisles].sort((a, b) => a - b)
  const boundaries = [0, ...sorted, cols]
  const blocks: { start: number; end: number }[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    blocks.push({ start: boundaries[i] + 1, end: boundaries[i + 1] })
  }

  if (blocks.length === 0) return []

  // 전체 열의 물리적 중심이 포함된 블럭을 중앙 블럭으로 선택
  const overallCenter = (cols + 1) / 2
  const midIdx = (() => {
    const found = blocks.findIndex((b) => b.start <= overallCenter && b.end >= overallCenter)
    // 중심이 복도에 걸쳐 있으면 오른쪽 블럭 선택
    if (found !== -1) return found
    return blocks.findIndex((b) => b.start > overallCenter) ?? Math.floor((blocks.length - 1) / 2)
  })()
  const midBlock = blocks[midIdx]
  const blockSize = midBlock.end - midBlock.start + 1

  if (blockSize % 2 === 1) {
    // 홀수: 정중앙 1열
    const center = midBlock.start + Math.floor(blockSize / 2)
    return [center]
  } else {
    // 짝수: 중앙 2열
    const left = midBlock.start + blockSize / 2 - 1
    const right = midBlock.start + blockSize / 2
    return [left, right]
  }
}
