// 瀏覽器存檔：只用來續玩，讀寫失敗（隱私模式、被封鎖）時當作沒有存檔。

import { STATE_VERSION } from "./engine";
import type { GameState } from "./types";

const KEY = "election-life:mayor:v1";

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    return state.version === STATE_VERSION ? state : null;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 忽略：存檔只是便利功能
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 忽略
  }
}

/** 有存檔但版本不符（遊戲更新後舊存檔失效），開始畫面用來提示玩家開新局 */
export function hasStaleSave(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as GameState).version !== STATE_VERSION;
  } catch {
    return false;
  }
}
