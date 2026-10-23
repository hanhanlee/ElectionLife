// 結局判定：選舉結果 × 施政表現 → 有限種結局（方便預先產生分享卡圖片）。

import { runElection, totalDelta, type ElectionResult } from "./engine";
import { ALL_STATS, STAT_LABELS, type GameState, type StatKey } from "./types";

export interface Ending {
  id: string;
  title: string;
  tagline: string;
}

// 文案皆為草稿，待遊戲設計定稿
const ENDINGS: Record<string, Ending> = {
  "won-builder": { id: "won-builder", title: "罕見的雙贏", tagline: "你做了事，選民也剛好看見了。請珍惜這個機率。" },
  "won-showman": { id: "won-showman", title: "剪綵之王", tagline: "任內剪斷的彩帶，接起來可以繞市區一圈。" },
  "won-machine": { id: "won-machine", title: "組織的勝利", tagline: "你不一定被喜歡，但你的樁腳很準時。" },
  "lost-builder": { id: "lost-builder", title: "被遺忘的建設者", tagline: "下一任市長剪綵的，是你蓋的東西。" },
  "lost-broke": { id: "lost-broke", title: "金庫見底", tagline: "煙火很美，帳單更長。" },
  "lost-generic": { id: "lost-generic", title: "一任市長", tagline: "四年很長，選民的記憶很短。" },
};

export interface GameSummary {
  election: ElectionResult;
  ending: Ending;
  protected: StatKey;
  sacrificed: StatKey;
  persona: string;
  /** 任期結束時尚未爆發的延遲後果：留給下一任的帳單 */
  leftovers: string[];
}

function pickEnding(state: GameState, election: ElectionResult): Ending {
  const s = state.stats;
  if (election.won) {
    if (s.achievement >= 55 && s.approval >= 55) return ENDINGS["won-builder"];
    if (s.party >= 60 && s.approval < 55) return ENDINGS["won-machine"];
    return ENDINGS["won-showman"];
  }
  if (s.achievement >= 50) return ENDINGS["lost-builder"];
  if (s.treasury <= 25) return ENDINGS["lost-broke"];
  return ENDINGS["lost-generic"];
}

export function summarize(state: GameState): GameSummary {
  const election = runElection(state);
  const delta = totalDelta(state);
  const ranked = [...ALL_STATS].sort((a, b) => delta[b] - delta[a]);
  const protectedStat = ranked[0];
  const sacrificed = ranked[ranked.length - 1];
  return {
    election,
    ending: pickEnding(state, election),
    protected: protectedStat,
    sacrificed,
    persona: `你最常守護「${STAT_LABELS[protectedStat]}」，最常犧牲「${STAT_LABELS[sacrificed]}」。`,
    leftovers: state.pending.map((p) => p.text),
  };
}

export const ALL_ENDINGS = Object.values(ENDINGS);
