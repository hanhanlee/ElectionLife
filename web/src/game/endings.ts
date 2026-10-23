// 結局判定：選舉結果 × 施政表現 → 有限種結局（方便預先產生分享卡圖片）。

import { isPerk, runElection, totalDelta, type ElectionResult } from "./engine";
import { ALL_STATS, STAT_LABELS, type GameEvent, type GameState, type StatKey } from "./types";

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
  "first-lost-close": { id: "first-lost-close", title: "差一點", tagline: "只差幾個百分點。四年後，你還會再來嗎？" },
  "first-lost": { id: "first-lost", title: "落選", tagline: "這座城市選擇了別人。你的政見，對手可能會拿去用。" },
  "successor-won": { id: "successor-won", title: "交棒成功", tagline: "接班人致詞時感謝了你三次。四年後，他會說那些都是自己做的。" },
  "successor-lost": { id: "successor-lost", title: "江山易主", tagline: "你蓋的東西，現在是別人的政績了。" },
};

/** 遊戲在哪一場選舉結束：第一次投票、連任選舉、或現任市長任期屆滿後的接班選舉 */
export type FinalStage = "first" | "reelection" | "successor";

export function finalStage(state: GameState): FinalStage {
  if (state.firstElection && !state.firstElection.won) return "first";
  return state.flags.includes("bg-incumbent") ? "successor" : "reelection";
}

export interface GameSummary {
  stage: FinalStage;
  election: ElectionResult;
  ending: Ending;
  protected: StatKey;
  sacrificed: StatKey;
  persona: string;
  /** 任期結束時尚未爆發的延遲後果：留給下一任的帳單 */
  leftovers: string[];
  /** 動用現任資源的次數與換到的民調 */
  perks: { count: number; available: number; approval: number; treasury: number };
  /** 「換你當選民」：讓玩家從選民角度重新檢視自己的選擇 */
  reflection: ReflectionItem[];
}

export interface ReflectionItem {
  id: string;
  /** tempting：拿原則或公家資源換到選票；principled：為了原則放棄選票；popular：沒有前兩者時，最受歡迎的一招 */
  kind: "tempting" | "principled" | "popular";
  eventTitle: string;
  optionLabel: string;
  approval: number;
  integrity: number;
  perk: boolean;
}

/**
 * 挑出最值得反問的選擇：換到最多民調、但傷了原則或動用了公家資源的（最多 3 個），
 * 以及一個為了原則放棄民調的選擇。
 */
function reflectionItems(state: GameState, events: GameEvent[]): ReflectionItem[] {
  const items = state.history.map((h) => {
    const event = events.find((e) => e.id === h.eventId)!;
    const option = event.options.find((o) => o.id === h.optionId)!;
    return {
      id: String(h.turn),
      eventTitle: event.title,
      optionLabel: option.label,
      approval: h.optionDelta.approval,
      integrity: h.optionDelta.integrity,
      perk: !!option.perk,
    };
  });
  const tempting = items
    .filter((i) => i.approval > 0 && (i.integrity < 0 || i.perk))
    .sort((a, b) => b.approval - a.approval)
    .slice(0, 3)
    .map((i) => ({ ...i, kind: "tempting" as const }));
  const principled = items
    .filter((i) => i.integrity > 0 && i.approval < 0)
    .sort((a, b) => b.integrity - a.integrity - (a.approval - b.approval))
    .slice(0, 1)
    .map((i) => ({ ...i, kind: "principled" as const }));
  if (tempting.length + principled.length > 0) return [...tempting, ...principled];
  const popular = [...items].sort((a, b) => b.approval - a.approval)[0];
  return popular && popular.approval > 0 ? [{ ...popular, kind: "popular" as const }] : [];
}

function pickEnding(state: GameState, stage: FinalStage, election: ElectionResult): Ending {
  const s = state.stats;
  if (stage === "first") return ENDINGS[election.probability >= 0.4 ? "first-lost-close" : "first-lost"];
  if (stage === "successor") return ENDINGS[election.won ? "successor-won" : "successor-lost"];
  if (election.won) {
    if (s.achievement >= 55 && s.approval >= 55) return ENDINGS["won-builder"];
    if (s.party >= 60 && s.approval < 55) return ENDINGS["won-machine"];
    return ENDINGS["won-showman"];
  }
  if (s.achievement >= 50) return ENDINGS["lost-builder"];
  if (s.treasury <= 25) return ENDINGS["lost-broke"];
  return ENDINGS["lost-generic"];
}

function perkUsage(state: GameState, events: GameEvent[]): GameSummary["perks"] {
  const perks = { count: 0, available: 0, approval: 0, treasury: 0 };
  for (const h of state.history) {
    // 只計算當回合實際出現過現任資源選項的事件
    const options = events.find((e) => e.id === h.eventId)?.options ?? [];
    if (options.some((o) => o.perk && h.offered.includes(o.id))) perks.available++;
    if (isPerk(events, h.eventId, h.optionId)) {
      perks.count++;
      perks.approval += h.optionDelta.approval;
      perks.treasury += Math.min(0, h.optionDelta.treasury);
    }
  }
  return perks;
}

export function summarize(state: GameState, events: GameEvent[]): GameSummary {
  const stage = finalStage(state);
  // 第一次投票後經費已扣掉動員費用，重算時要還原當時的經費
  const atVote = stage === "first" ? { ...state, funds: state.funds + state.firstElection!.mobilization } : state;
  const election = runElection(atVote, stage === "first" ? "first" : "final");
  const delta = totalDelta(state);
  const ranked = [...ALL_STATS].sort((a, b) => delta[b] - delta[a]);
  const protectedStat = ranked[0];
  const sacrificed = ranked[ranked.length - 1];
  return {
    stage,
    election,
    ending: pickEnding(state, stage, election),
    protected: protectedStat,
    sacrificed,
    persona: `你最常守護「${STAT_LABELS[protectedStat]}」，最常犧牲「${STAT_LABELS[sacrificed]}」。`,
    leftovers: state.pending.map((p) => p.text),
    perks: perkUsage(state, events),
    reflection: reflectionItems(state, events),
  };
}

export const ALL_ENDINGS = Object.values(ENDINGS);
