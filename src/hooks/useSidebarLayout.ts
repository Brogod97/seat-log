import { useEffect, useRef, useState } from "react";
import {
  loadSidebarWidth,
  writeSidebarWidth,
  loadSidebarCollapsed,
  writeSidebarCollapsed,
} from "../utils/storage";

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;

function maxWidth() {
  return Math.min(560, window.innerWidth * 0.5);
}

function clamp(v: number) {
  return Math.min(Math.max(v, MIN_WIDTH), maxWidth());
}

// 데스크톱 사이드바 너비 조절(드래그) + 접기/펼치기, localStorage에 영속화
export function useSidebarLayout() {
  const [width, setWidth] = useState(() =>
    clamp(loadSidebarWidth(DEFAULT_WIDTH)),
  );
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    let latest = startWidth;

    function onMove(ev: MouseEvent) {
      latest = clamp(startWidth + (ev.clientX - startX));
      setWidth(latest);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      writeSidebarWidth(latest);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return { width, collapsed, toggleCollapsed, startResize };
}
