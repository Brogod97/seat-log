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
import type { SeatMapConfig, EditMode, SavedVersion } from "../types";
import { sameStructure } from "../utils/configCompare";
import {
  LAST_SAVED_KEY,
  DEFAULT_CONFIG,
  ANON_OWNER,
  configKey,
  loadSaves,
  writeSaves,
  normalizeSaves,
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
  const [saves, setSaves] = useState<Record<string, SavedVersion[]>>(loadSaves);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(LAST_SAVED_KEY));
    return v > 0 ? v : null;
  });
  const unsubSnapRef = useRef<(() => void) | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const savesDoc = (uid: string) => doc(db, "users", uid, "state", "saves");

  async function pushSaves(next: Record<string, SavedVersion[]>) {
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
    // StrictMode(dev)는 이 effect를 mount→cleanup→mount로 두 번 실행한다. onAuthStateChanged 콜백은
    // 비동기라 정리(cleanup)가 먼저 끝나버리면, 정리된 인스턴스의 getDoc/setDoc 체인이 뒤늦게 이어져
    // 방금 사용자가 저장한 최신 saves를 마운트 시점의 오래된 병합 결과로 덮어쓸 수 있다.
    // ignore 플래그로 정리된 인스턴스의 이후 작업(state 반영·구독 등록)을 무효화해 이 레이스를 막는다.
    let ignore = false;
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (ignore) return;
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
        if (ignore) return;
        const remote = normalizeSaves(
          snap.exists() ? (snap.data().saves ?? {}) : {},
        );
        const local = loadSaves();
        const merged = { ...local, ...remote };
        setSaves(merged);
        writeSaves(merged);
        await setDoc(ref, { saves: merged, updatedAt: serverTimestamp() });
        if (ignore) return;
        // 이후: 다른 기기 변경을 실시간 반영
        unsubSnapRef.current = onSnapshot(ref, (s) => {
          if (s.metadata.hasPendingWrites) return; // 내 쓰기는 무시(루프 방지)
          const rs = normalizeSaves(s.data()?.saves ?? {});
          setSaves(rs);
          writeSaves(rs);
        });
      } catch (e) {
        console.error("동기화 초기화 실패", e);
      }
    });
    return () => {
      ignore = true;
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
    const versions = saves[key] ?? [];
    // 지금 구조와 일치하는 버전이 있으면 그 버전만 갱신, 없으면 새 버전으로 추가(기존 버전은 보존)
    const matchIdx = versions.findIndex((v) => sameStructure(config, v));
    const savedVersion: SavedVersion = { ...config, savedAt: Date.now() };
    const nextVersions =
      matchIdx >= 0
        ? versions.map((v, i) => (i === matchIdx ? savedVersion : v))
        : [...versions, savedVersion];
    const next = { ...saves, [key]: nextVersions };
    setSaves(next);
    writeSaves(next);
    pushSaves(next);
    const now = Date.now();
    setLastSavedAt(now);
    try {
      localStorage.setItem(LAST_SAVED_KEY, String(now));
    } catch {}
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
          const next = { ...saves, ...normalizeSaves(parsed) };
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
    deleteSavedConfig,
    exportJson,
    importJson,
  };
}
