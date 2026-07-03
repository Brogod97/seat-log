// 영화관 브랜드별 액센트 테마 (시안 2b)
// 액센트는 헤더·버튼·강조 텍스트에만 적용, 4색 레이어(중앙열·시선일치행·명당·실관람)는 고정
export interface BrandTheme {
  accent: string
  accentHover: string
}

const BRAND_THEMES: Record<string, BrandTheme> = {
  CGV: { accent: '#e02020', accentHover: '#b91c1c' },
  메가박스: { accent: '#6d28d9', accentHover: '#5b21b6' },
  롯데시네마: { accent: '#c81e2e', accentHover: '#a3182a' },
}

// 브랜드 미선택 시 기본값 (블루)
export const DEFAULT_THEME: BrandTheme = { accent: '#2563eb', accentHover: '#1d4ed8' }

export function themeFor(brand: string): BrandTheme {
  return BRAND_THEMES[brand] ?? DEFAULT_THEME
}
