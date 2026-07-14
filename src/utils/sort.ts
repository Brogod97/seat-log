// 숫자 인식 자연 정렬 비교자 — "1관 < 2관 < 10관"처럼 사람이 기대하는 순서로 정렬.
// 문자열 사전식 정렬("10관"이 "2관"보다 앞)을 피하려고 사용. 표시 라벨은 그대로 두고 순서만 바꾼다.
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" })
}
