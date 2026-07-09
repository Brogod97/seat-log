import type { User } from "firebase/auth";
import { SyncedCheckIcon, GoogleGIcon } from "../icons";
import { relativeTime } from "../../utils/relativeTime";

interface Props {
  user: User | null;
  authReady: boolean;
  lastSavedAt: number | null;
  onLogin: () => void;
  onLogout: () => void;
}

// 기기 간 동기화 (Google 로그인) 계정 카드
export function AccountCard({
  user,
  authReady,
  lastSavedAt,
  onLogin,
  onLogout,
}: Props) {
  return (
    <div className="mb-3">
      {user ? (
        (() => {
          const name = user.displayName || (user.email ?? "").split("@")[0];
          const initial = (name || "?").trim().charAt(0).toUpperCase();
          return (
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-600">
              <div
                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{
                  background: "linear-gradient(135deg, #ffd06e, #ea9430)",
                }}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                    {name}
                  </span>
                  <span className="inline-flex items-center gap-0.5 shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                    <SyncedCheckIcon size={11} /> 동기화됨
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                  {user.email}
                  {lastSavedAt ? ` · ${relativeTime(lastSavedAt)}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="shrink-0 text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                로그아웃
              </button>
            </div>
          );
        })()
      ) : (
        <button
          type="button"
          onClick={onLogin}
          disabled={!authReady}
          className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          title="로그인하면 여러 기기에서 저장 목록이 동기화돼요"
        >
          <GoogleGIcon size={15} />
          Google 로그인
        </button>
      )}
    </div>
  );
}
