"use client";

// 結局頁的玩家統計：送出這一局的匿名紀錄（每局只送一次），再讀回所有玩家的彙整。
// 後端連不上時什麼都不顯示，不影響遊戲。

import { useEffect, useState } from "react";
import { buildPlay, type PlayerStats } from "@/game/stats";
import type { GameState } from "@/game/types";

const STATS_URL = process.env.NEXT_PUBLIC_STATS_URL ?? "https://api.beyondvote.com";

export function usePlayerStats(state: GameState, won: boolean, ending: string, sameAsReal: number, realTotal: number): PlayerStats | null {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  useEffect(() => {
    if (!state.special) return;
    let alive = true;
    // 用種子當這一局的記號：先記下這一局的 id 再送，重送（重新整理、重跑）都是同一個 id，後端會去重
    const idKey = `election-life:stats-id:${state.special}:${state.seed}`;
    const sentKey = `election-life:stats-sent:${state.special}:${state.seed}`;
    let id: string | null = null;
    let sent = false;
    try {
      id = localStorage.getItem(idKey);
      sent = localStorage.getItem(sentKey) === "1";
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(idKey, id);
      }
    } catch {
      // 記不住也沒關係，最多這一局之後重新整理會再送一次
    }
    const record = buildPlay(id ?? crypto.randomUUID(), state, won, ending, sameAsReal, realTotal);
    const send = sent
      ? Promise.resolve()
      : fetch(`${STATS_URL}/plays`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        }).then((r) => {
          if (!r.ok) return;
          try {
            localStorage.setItem(sentKey, "1");
          } catch {
            // 同上
          }
        });
    send
      .catch(() => {})
      .then(() => fetch(`${STATS_URL}/stats?scenario=${encodeURIComponent(state.special!)}`))
      .then((r) => (r.ok ? (r.json() as Promise<PlayerStats>) : null))
      .then((s) => alive && s && setStats(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [state, won, ending, sameAsReal, realTotal]);
  return stats;
}
