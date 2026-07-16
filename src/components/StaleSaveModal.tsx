import { useState } from "react";
import SeatMapPreview from "./SeatMapPreview";
import type { SavedVersion } from "../types";

const noop = () => {};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  versions: SavedVersion[]; // 오래된 순 — 구조가 바뀔 때마다 하나씩 쌓인 버전들
  onClose: () => void;
}

// 상영관 구조가 바뀌어 개인 데이터를 자동 병합하지 못했을 때, 예전 저장 내용을 읽기 전용으로 보여주는 모달.
// 구조가 여러 번 바뀌었다면 버전이 여러 개 쌓일 수 있어 select로 전환해가며 볼 수 있게 한다.
// 좌표가 지금 구조와 안 맞을 수 있어 "이 내용으로 되돌리기" 같은 복원 액션은 의도적으로 두지 않음(순수 열람용).
export function StaleSaveModal({ versions, onClose }: Props) {
  const [index, setIndex] = useState(versions.length - 1); // 기본: 가장 최근 버전
  const snapshot = versions[index];
  const theaterLabel = [snapshot.brand, snapshot.branch, snapshot.screen]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-full max-h-full overflow-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              예전 저장 내용 (읽기 전용)
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {theaterLabel} · 구조가 바뀌기 전에 저장된 모습이에요
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-lg leading-none shrink-0"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        {versions.length > 1 && (
          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            className="mb-3 w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            {versions.map((v, i) => (
              <option key={i} value={i}>
                {`${i + 1}. ${v.rows}행 × ${v.cols}열`}
                {v.savedAt ? ` (${formatDate(v.savedAt)})` : ""}
              </option>
            ))}
          </select>
        )}
        <SeatMapPreview
          config={snapshot}
          editMode={null}
          layoutPhase="edit"
          modeStartPos={null}
          onEnterModeFrom={noop}
          onCancelEditMode={noop}
          onCompleteEditMode={noop}
          onSetGridSize={noop}
          onAddPrimeRange={noop}
          onRemovePrimeRange={noop}
          onAddWatchedRange={noop}
          onToggleWatchedSeat={noop}
          onSetWatchedMemo={noop}
          onToggleSightRow={noop}
          onToggleAisle={noop}
          onToggleColAisle={noop}
          onToggleExcludedSeat={noop}
          onSetExcludedSeat={noop}
          onToggleExit={noop}
          isAdmin={false}
          viewOnly
        />
      </div>
    </div>
  );
}
