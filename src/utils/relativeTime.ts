// 상대 시각 표기 (계정 카드용)
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전 저장";
  if (m < 60) return `${m}분 전 저장`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전 저장`;
  const d = Math.floor(h / 24);
  if (d === 1) return "어제 저장";
  if (d < 7) return `${d}일 전 저장`;
  return new Date(ts).toLocaleDateString("ko-KR") + " 저장";
}
