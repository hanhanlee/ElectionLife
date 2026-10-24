"use client";

// 頁尾：深色模式開關與「關於與聲明」。
// 沒動過開關時跟隨系統；切換後記在瀏覽器裡，layout 的小腳本會在畫面出來前套用，避免閃一下。

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

export const THEME_KEY = "election-life:theme";

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

function ThemeSwitch() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // 外觀只存在瀏覽器端：讀玩家選過的，沒選過就看系統，並跟著系統切換
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      // 讀不到就跟隨系統
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(saved ? saved === "dark" : systemDark());
    if (saved) return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const follow = (e: MediaQueryListEvent) => setDark(e.matches);
    media?.addEventListener("change", follow);
    return () => media?.removeEventListener("change", follow);
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // 無痕模式或封鎖儲存時，這次瀏覽仍然有效，只是不會記住
    }
    setDark(next);
  }

  return (
    <button role="switch" aria-checked={dark} aria-label="深色模式" className={styles.themeSwitch} onClick={toggle}>
      <span aria-hidden className={styles.themeTrack}>
        <span>☀️</span>
        <span>🌙</span>
        <span className={styles.themeKnob} data-dark={dark} />
      </span>
      <span>{dark ? "深色" : "淺色"}</span>
    </button>
  );
}

export default function SiteFooter() {
  return (
    <footer className={styles.siteFooter}>
      <Link href="/about">關於與聲明</Link>
      <ThemeSwitch />
    </footer>
  );
}
