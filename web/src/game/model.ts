// 連任選舉的模擬權重。這份檔案會公開在結局頁「這個遊戲怎麼算票」，
// 權重是可解釋的設計假設，不是真實得票預測。

import type { StatKey, Stats } from "./types";

export const MODEL_VERSION = "2026.10-draft";

export const START_STATS: Stats = {
  approval: 50,
  treasury: 60,
  achievement: 20,
  council: 50,
  integrity: 70,
  party: 50,
};

/** 每個數值相對於基準 50 的影響力（logit 尺度，每 10 點） */
export const VOTE_WEIGHTS: Record<StatKey, number> = {
  approval: 0.55,
  achievement: 0.15,
  party: 0.2,
  council: 0.05,
  treasury: 0.05,
  integrity: 0,
};

/** 設計假設的說明，與權重一起公開 */
export const WEIGHT_NOTES: Partial<Record<StatKey, string>> = {
  approval: "選民在投票當下的感受影響最大。",
  achievement: "長期建設的成果，選民不一定在任期內感受到。",
  party: "政黨組織動員與基本盤。",
  integrity: "本模型假設原則本身不直接換到選票，這正是遊戲想讓你思考的地方。",
};

/** 基準截距：所有數值皆為 50 時的連任機率約 50% */
export const VOTE_BIAS = 0;

/** 隨機擾動幅度（logit），代表對手、時事與投票率等不可控因素 */
export const VOTE_NOISE = 0.6;
