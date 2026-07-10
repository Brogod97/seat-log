import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { auth, googleProvider, db } from "../firebase";
import type { SeatMapConfig, EditMode } from "../types";
import {
  LAST_SAVED_KEY,
  DEFAULT_CONFIG,
  ANON_OWNER,
  configKey,
  loadSaves,
  writeSaves,
  loadOwner,
  writeOwner,
  clearLocalPersonalData,
} from "../utils/storage";

interface Params {
  config: SeatMapConfig;
  setConfig: Dispatch<SetStateAction<SeatMapConfig>>;
  setEditMode: Dispatch<SetStateAction<EditMode>>;
}

// 저장된 좌석표 목록 + 기기 간 Firebase 동기화 (로그인 시에만, local-first)
export function useSavedConfigs({ config, setConfig, setEditMode }: Params) {
  const [saves, setSaves] = useState<Record<string, SeatMapConfig>>(loadSaves);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(LAST_SAVED_KEY));
    return v > 0 ? v : null;
  });
  const unsubSnapRef = useRef<(() => void) | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const savesDoc = (uid: string) => doc(db, "users", uid, "state", "saves");

  async function pushSaves(next: Record<string, SeatMapConfig>) {
    const u = auth.currentUser;
    if (!u) return;
    try {
      await setDoc(savesDoc(u.uid), {
        saves: next,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("동기화 업로드 실패", e);
    }
  }

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      // 이전 구독 정리
      if (unsubSnapRef.current) {
        unsubSnapRef.current();
        unsubSnapRef.current = null;
      }
      if (!u) return;
      // 로그아웃 없이 다른 계정으로 전환 로그인한 경우(예: 로그인 팝업에서 다른 계정 선택)
      // 방어적으로 이전 계정의 로컬 개인 데이터를 정리 — 명시적 로그아웃은 logout()에서 처리
      const owner = loadOwner();
      if (owner && owner !== ANON_OWNER && owner !== u.uid) {
        clearLocalPersonalData();
        setSaves({});
        setConfig(DEFAULT_CONFIG);
        setEditMode(null);
        setLastSavedAt(null);
      }
      writeOwner(u.uid);
      const ref = savesDoc(u.uid);
      try {
        // 최초: 로컬 + 원격 병합 (원격 우선), 다시 업로드
        const snap = await getDoc(ref);
        const remote = (
          snap.exists() ? (snap.data().saves ?? {}) : {}
        ) as Record<string, SeatMapConfig>;
        const local = loadSaves();
        const merged = { ...local, ...remote };
        setSaves(merged);
        writeSaves(merged);
        await setDoc(ref, { saves: merged, updatedAt: serverTimestamp() });
        // 이후: 다른 기기 변경을 실시간 반영
        unsubSnapRef.current = onSnapshot(ref, (s) => {
          if (s.metadata.hasPendingWrites) return; // 내 쓰기는 무시(루프 방지)
          const rs = (s.data()?.saves ?? {}) as Record<string, SeatMapConfig>;
          setSaves(rs);
          writeSaves(rs);
        });
      } catch (e) {
        console.error("동기화 초기화 실패", e);
      }
    });
    return () => {
      unsubAuth();
      if (unsubSnapRef.current) unsubSnapRef.current();
    };
  }, [setConfig, setEditMode]);

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (
        err.code !== "auth/popup-closed-by-user" &&
        err.code !== "auth/cancelled-popup-request"
      ) {
        alert("로그인 실패: " + (err.message ?? err.code));
      }
    }
  }
  async function logout() {
    // 명시적 로그아웃 — 이 기기에 남은 개인 데이터를 확실히 정리(다음 사용자에게 안 새어나가게)
    clearLocalPersonalData();
    setSaves({});
    setConfig(DEFAULT_CONFIG);
    setEditMode(null);
    setLastSavedAt(null);
    writeOwner(ANON_OWNER);
    await signOut(auth);
  }

  function saveCurrentConfig() {
    const key = configKey(config);
    const next = { ...saves, [key]: config };
    setSaves(next);
    writeSaves(next);
    pushSaves(next);
    const now = Date.now();
    setLastSavedAt(now);
    try {
      localStorage.setItem(LAST_SAVED_KEY, String(now));
    } catch {}
  }

  function loadSavedConfig(key: string) {
    const saved = saves[key];
    if (saved) {
      setConfig({ ...DEFAULT_CONFIG, ...saved });
      setEditMode(null);
    }
  }

  function deleteSavedConfig(key: string) {
    if (!confirm(`'${key.replace(/\|/g, " ")}' 저장을 삭제할까요?`)) return;
    const next = { ...saves };
    delete next[key];
    setSaves(next);
    writeSaves(next);
    pushSaves(next);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(saves, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "seat-log.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (typeof parsed === "object" && parsed !== null) {
          const next = { ...saves, ...parsed };
          setSaves(next);
          writeSaves(next);
          pushSaves(next);
        }
      } catch {
        alert("파일을 읽을 수 없어요.");
      }
      if (importRef.current) importRef.current.value = "";
    };
    reader.readAsText(file);
  }

  return {
    saves,
    user,
    authReady,
    lastSavedAt,
    importRef,
    login,
    logout,
    saveCurrentConfig,
    loadSavedConfig,
    deleteSavedConfig,
    exportJson,
    importJson,
  };
}
