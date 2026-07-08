// 얇은 라인 아이콘 (currentColor로 색 상속) + 구글 G (멀티컬러 고정)
// 원본: assets/icon/*.svg (디자인 소스)

type IconProps = { size?: number; className?: string }

export function SunIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4.3" stroke="currentColor" strokeWidth="1.8" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7" />
      </g>
    </svg>
  )
}

export function MoonIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M20 14.2 A8.2 8.2 0 1 1 9.8 4 A6.4 6.4 0 0 0 20 14.2 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export function ResetIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 5v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 10a8 8 0 1 1-1.2 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SyncedCheckIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function GoogleGIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 27.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.5C3 16.1 2 19.9 2 23s1 6.9 2.5 10l7.3-5.7z" />
      <path fill="#EA4335" d="M24 9.9c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.3 29.9 1 24 1 15.4 1 8.1 5.9 4.5 12.9l7.3 5.7c1.7-5.1 6.5-8.7 12.2-8.7z" />
    </svg>
  )
}
