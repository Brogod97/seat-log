import type { SeatMapConfig } from "../../types";
import { savedKeyCompare } from "../../utils/sort";

interface Props {
  saves: Record<string, SeatMapConfig>;
  onLoad: (key: string) => void;
  onDelete: (key: string) => void;
}

// 저장된 좌석표 목록 (불러오기 / 삭제)
export function SavedList({ saves, onLoad, onDelete }: Props) {
  // 브랜드·지점 자연 정렬, 상영관은 일반관(숫자순) 뒤에 특별관(IMAX/4DX 등)
  const keys = Object.keys(saves).sort(savedKeyCompare);
  if (keys.length === 0) return null;
  return (
    <div className="mb-2">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
        저장된 좌석표
      </p>
      <div className="flex flex-col gap-1">
        {keys.map((key) => (
          <div
            key={key}
            className="flex items-center gap-1 rounded border border-gray-200 dark:border-gray-600"
          >
            <button
              type="button"
              onClick={() => onLoad(key)}
              className="flex-1 text-left text-xs px-2 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-l truncate"
              title="불러오기"
            >
              {key.replace(/\|/g, " ")}
            </button>
            <button
              type="button"
              onClick={() => onDelete(key)}
              className="px-2 py-1.5 text-gray-400 hover:text-red-500 text-sm"
              title="삭제"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
