// 숫자 인식 자연 정렬 비교자 — "1관 < 2관 < 10관"처럼 사람이 기대하는 순서로 정렬.
// 문자열 사전식 정렬("10관"이 "2관"보다 앞)을 피하려고 사용. 표시 라벨은 그대로 두고 순서만 바꾼다.
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" })
}

// 'N관'(일반관)이면 숫자를, 아니면 null. IMAX·4DX·Screen X 같은 특별관 판별용.
function numberedScreen(s: string): number | null {
  const m = s.trim().match(/^(\d+)\s*관$/)
  return m ? Number(m[1]) : null
}

// 상영관 정렬: 일반관(N관)을 숫자 오름차순으로 먼저, 특별관(IMAX/4DX/Screen X 등)은 뒤에 모아 자연 정렬.
export function screenCompare(a: string, b: string): number {
  const na = numberedScreen(a)
  const nb = numberedScreen(b)
  if (na != null && nb != null) return na - nb // 둘 다 일반관 → 숫자 비교
  if (na != null) return -1 // 일반관이 특별관보다 앞
  if (nb != null) return 1
  return naturalCompare(a, b) // 둘 다 특별관 → 자연 정렬
}

// 저장 목록 키('브랜드|지점|상영관') 정렬: 브랜드·지점은 자연 정렬, 마지막 상영관만 특별관 규칙 적용.
export function savedKeyCompare(a: string, b: string): number {
  const pa = a.split("|")
  const pb = b.split("|")
  const n = Math.min(pa.length, pb.length)
  for (let i = 0; i < n - 1; i++) {
    const c = naturalCompare(pa[i], pb[i])
    if (c !== 0) return c
  }
  const c = screenCompare(pa[n - 1], pb[n - 1])
  if (c !== 0) return c
  return pa.length - pb.length
}
