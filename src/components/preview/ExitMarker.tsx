import type { CSSProperties } from 'react'
import type { ExitSide } from '../../types'

// 출입구(문) 마커 — F안 '엣지 게이지': 짧은 선 + 양 끝 수직 캡(⊢–⊣).
// 좌석 박스에 의존하지 않고 좌표만으로 그려지므로, 제외된(투명 빈 칸) 좌석 옆에도 동일하게 표시된다.
// 좌석표 카드는 다크 모드에서도 흰 배경을 유지하므로(=PNG도 항상 흰 배경) 색은 라이트 톤 하나만 쓴다.
const COLOR = 'rgba(107,116,128,0.5)'
const LINE = 15            // 게이지 선 길이
const CAP = 6              // 양 끝 캡 길이
const GAP = 13             // 좌석 변에서 바깥으로 띄우는 거리 (심볼 중심 기준)
const SPAN = LINE + 1      // 긴 축 SVG 크기 (stroke 0.5 인셋 포함)
const OFF = GAP + CAP / 2  // 변에서 SVG 바깥 모서리까지 = 16

// 게이지 심볼 자체 (위치 없음) — 범례에서도 재사용
export function ExitGauge({ vertical = false }: { vertical?: boolean }) {
  const s = { stroke: COLOR, strokeWidth: 1 }
  if (vertical) {
    return (
      <svg width={CAP} height={SPAN} viewBox={`0 0 ${CAP} ${SPAN}`} fill="none" style={{ display: 'block' }}>
        <line x1={CAP / 2} y1={0.5} x2={CAP / 2} y2={SPAN - 0.5} {...s} />
        <line x1={0} y1={0.5} x2={CAP} y2={0.5} {...s} />
        <line x1={0} y1={SPAN - 0.5} x2={CAP} y2={SPAN - 0.5} {...s} />
      </svg>
    )
  }
  return (
    <svg width={SPAN} height={CAP} viewBox={`0 0 ${SPAN} ${CAP}`} fill="none" style={{ display: 'block' }}>
      <line x1={0.5} y1={CAP / 2} x2={SPAN - 0.5} y2={CAP / 2} {...s} />
      <line x1={0.5} y1={0} x2={0.5} y2={CAP} {...s} />
      <line x1={SPAN - 0.5} y1={0} x2={SPAN - 0.5} y2={CAP} {...s} />
    </svg>
  )
}

// 좌석 변 바깥 여백에 배치되는 마커 (전용 슬롯/배경 박스 없음)
export function ExitMarker({ side, seat }: { side: ExitSide; seat: number }) {
  const vertical = side === 'left' || side === 'right'
  const center = (seat - SPAN) / 2 // 변 중앙 정렬
  const style: CSSProperties = {
    position: 'absolute',
    lineHeight: 0,
    zIndex: 5,
    ...(vertical ? { top: center } : { left: center }),
    ...(side === 'left'
      ? { left: -OFF }
      : side === 'right'
        ? { right: -OFF }
        : side === 'top'
          ? { top: -OFF }
          : { bottom: -OFF }),
  }
  return (
    <span style={style}>
      <ExitGauge vertical={vertical} />
    </span>
  )
}
