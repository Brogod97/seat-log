import { useState } from 'react'

// 공용 레이아웃 게시 버튼 — 사이드바(데스크톱)와 모바일 편집 오버레이 양쪽에서 재사용.
// 게시 중(스피너) → 성공 시 '게시 완료 ✓'(초록, 2초) → 원래 문구로 복귀.
export function PublishLayoutButton({
  presetExists,
  upToDate = false,
  onPublish,
}: {
  presetExists: boolean
  upToDate?: boolean // 게시본과 현재 구조가 동일 → 업데이트할 게 없어 비활성 (실사용 2차 ③)
  onPublish: () => Promise<boolean>
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const dimmed = upToDate && state === 'idle'
  return (
    <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">공용 레이아웃</span>
        {presetExists && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
            게시됨
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
        {upToDate
          ? '게시된 구조와 동일해요. 구조(행·열·복도·제외·출입구)를 변경하면 업데이트할 수 있어요.'
          : `현재 좌석 구조(행·열·복도·제외·출입구)를 이 상영관을 여는 모든 사용자에게 ${presetExists ? '공유 중이에요. 현재 구조로 갱신합니다.' : '기본 배치로 공유해요.'}`}
      </p>
      <button
        type="button"
        disabled={state !== 'idle' || upToDate}
        onClick={async () => {
          setState('loading')
          const ok = await onPublish()
          if (ok) {
            setState('done')
            window.setTimeout(() => setState('idle'), 2000)
          } else {
            setState('idle')
          }
        }}
        // idle=브랜드 base, loading/done=브랜드 hover 색 (초록 제거, 저장 버튼과 톤 통일)
        style={state === 'idle' ? undefined : { backgroundColor: 'var(--accent-hover)' }}
        className={`w-full text-xs px-3 py-2 rounded-lg font-medium text-white flex items-center justify-center gap-1.5 transition-colors ${state === 'idle' ? 'btn-accent' : ''} ${dimmed ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        {state === 'loading' && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-white/35 border-t-white rounded-full shrink-0" style={{ animation: 'spin 0.7s linear infinite' }} />
        )}
        {state === 'done' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path d="M4 12.5L9.5 18L20 6.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {state === 'loading'
          ? '게시 중…'
          : state === 'done'
            ? '게시 완료'
            : presetExists ? '이 구조로 업데이트' : '공용 레이아웃으로 게시'}
      </button>
    </div>
  )
}
