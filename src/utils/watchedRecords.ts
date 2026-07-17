// 관람 기록 정렬·표시 헬퍼 (React 무관 순수 함수)
import type { WatchedRecord } from '../types'

// 정렬용 일시 키 — 날짜는 시작 시각의 실제 달력 날짜이므로 그대로 붙이면 됨
function sortKey(r: WatchedRecord): string | null {
  if (!r.date) return null
  return `${r.date}T${r.time ?? '00:00'}`
}

// 최신순 비교 (날짜 없는 기록은 맨 아래, 그 안에선 입력 순서 유지)
export function compareRecordsDesc(a: WatchedRecord, b: WatchedRecord): number {
  const ka = sortKey(a)
  const kb = sortKey(b)
  if (ka && kb) return kb.localeCompare(ka)
  if (ka) return -1
  if (kb) return 1
  return 0
}

// 표시용 시간: "10:35" / "01:30 ~ 03:40" / 종료가 자정을 넘기면 "23:30 ~ 익일 01:50" (자동 판별)
// 영화는 하루를 통째로 넘기지 않으므로 "종료 < 시작 = 자정 넘김" 추론이 항상 안전하다.
export function formatRecordTime(r: WatchedRecord): string | null {
  if (!r.time) return null
  if (!r.timeEnd) return r.time
  const crossesMidnight = r.timeEnd < r.time
  return `${r.time} ~ ${crossesMidnight ? '익일 ' : ''}${r.timeEnd}`
}
