// 0-based index → "A", "B", ..., "Z", "AA", ...
export function indexToLabel(index: number): string {
  let label = ''
  let n = index
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

// "A" → 1, "B" → 2, ..., "Z" → 26, "AA" → 27 (1-based)
// 유효하지 않으면 null 반환
export function labelToIndex(label: string): number | null {
  const upper = label.trim().toUpperCase()
  if (!/^[A-Z]+$/.test(upper)) return null
  let result = 0
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64)
  }
  return result
}
