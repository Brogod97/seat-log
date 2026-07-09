import { useEffect, useState } from "react";
import { THEME_KEY, loadTheme } from "../utils/storage";

// 라이트/다크 테마 상태 + <html> 클래스 토글 & localStorage 영속화
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(loadTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  return { theme, setTheme };
}
