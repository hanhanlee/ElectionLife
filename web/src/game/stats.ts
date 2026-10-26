// 玩家統計：玩完一局送出一筆匿名紀錄，結局頁顯示「其他玩家」的統計。
// 前後端共用：遊戲端用 buildPlay 產生紀錄，統計後端（worker/）用 validatePlay 檢查。
// 只記遊戲裡的選擇與結果，不記任何個人資料。

import type { GameState } from "./types";

/** 收統計的特別篇 */
export const STATS_SCENARIOS = ["capital-2026", "capital-2026-incumbent"] as const;
/** 樣本少於這個數字時不顯示比例，避免「100% 的玩家都選了這個」 */
export const STATS_MIN_SAMPLE = 30;

export interface PlayRecord {
  /** 這一局的隨機 id：重新整理也不會重複送 */
  id: string;
  scenario: string;
  /** 第二局起的分支模式 */
  branch: boolean;
  won: boolean;
  /** 結局標題 */
  ending: string;
  /** 和現實選擇一樣的題數／這一局可以對照的題數 */
  sameAsReal: number;
  realTotal: number;
  /** 每一回合的事件與選項 */
  picks: [string, string][];
  /** 插曲的事件與選項 */
  interludes: [string, string][];
}

/** 統計後端回傳的彙整 */
export interface PlayerStats {
  plays: number;
  wins: number;
  /** 其中電腦模擬的基礎樣本局數（真人局數夠多之後為 0） */
  simulated: number;
  endings: Record<string, number>;
  /** 和現實選擇一樣的題數：加總與局數 */
  sameAsReal: { sum: number; plays: number };
  /** 事件 → 選項 → 局數 */
  choices: Record<string, Record<string, number>>;
}

export function buildPlay(id: string, state: GameState, won: boolean, ending: string, sameAsReal: number, realTotal: number): PlayRecord {
  return {
    id,
    scenario: state.special ?? "",
    branch: !!state.specialBranch,
    won,
    ending,
    sameAsReal,
    realTotal,
    picks: state.history.map((h) => [h.eventId, h.optionId]),
    interludes: (state.interludes ?? []).map((i) => [i.eventId, i.optionId]),
  };
}

const ID = /^[a-z0-9-]{1,40}$/;
const PLAY_ID = /^[a-zA-Z0-9-]{8,64}$/;
const isPair = (p: unknown): p is [string, string] =>
  Array.isArray(p) && p.length === 2 && typeof p[0] === "string" && typeof p[1] === "string" && ID.test(p[0]) && ID.test(p[1]);
const isCount = (n: unknown, max: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;

/** 後端收到的資料不可信：格式不對就整筆丟掉 */
export function validatePlay(body: unknown): PlayRecord | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !PLAY_ID.test(b.id)) return null;
  if (typeof b.scenario !== "string" || !(STATS_SCENARIOS as readonly string[]).includes(b.scenario)) return null;
  if (typeof b.branch !== "boolean" || typeof b.won !== "boolean") return null;
  if (typeof b.ending !== "string" || b.ending.length === 0 || b.ending.length > 30 || /[\u0000-\u001f<>]/.test(b.ending)) return null;
  if (!isCount(b.realTotal, 30) || !isCount(b.sameAsReal, b.realTotal as number)) return null;
  if (!Array.isArray(b.picks) || b.picks.length === 0 || b.picks.length > 30 || !b.picks.every(isPair)) return null;
  if (!Array.isArray(b.interludes) || b.interludes.length > 10 || !b.interludes.every(isPair)) return null;
  const events = [...b.picks, ...b.interludes].map((p) => (p as [string, string])[0]);
  if (new Set(events).size !== events.length) return null;
  return {
    id: b.id,
    scenario: b.scenario,
    branch: b.branch,
    won: b.won,
    ending: b.ending,
    sameAsReal: b.sameAsReal as number,
    realTotal: b.realTotal as number,
    picks: b.picks as [string, string][],
    interludes: b.interludes as [string, string][],
  };
}

/** 這一題有多少玩家選了這個選項；樣本不夠時回傳 undefined */
export function choiceShare(stats: PlayerStats, eventId: string, optionId: string): number | undefined {
  const counts = stats.choices[eventId];
  if (!counts) return undefined;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < STATS_MIN_SAMPLE) return undefined;
  return Math.round(((counts[optionId] ?? 0) / total) * 100);
}

export const percent = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
