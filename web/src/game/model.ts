// 選舉的模擬權重。這份檔案會公開在結局頁「這個遊戲怎麼算票」，
// 權重是可解釋的設計假設，不是真實得票預測。
// 平衡的目標是好玩、引人反思（「這真的是我們想要候選人做的事嗎？」），不是吻合史實；
// 中選會數字只是參考，用來讓難度的方向合理。

import type { Skill, StatDelta, StatKey, Stats } from "./types";

export const MODEL_VERSION = "2026.10-draft";

export const START_STATS: Stats = {
  approval: 50,
  treasury: 60,
  achievement: 20,
  council: 50,
  integrity: 70,
  party: 50,
  media: 40,
  team: 50,
  business: 30,
};

/** 每個數值相對於基準 50 的影響力（logit 尺度，每 10 點） */
export const VOTE_WEIGHTS: Record<StatKey, number> = {
  approval: 0.45,
  media: 0.15,
  team: 0,
  business: 0,
  achievement: 0.25,
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
  media: "投票前的曝光度。聲量會退燒，太早衝高沒有用。",
  integrity: "本模型假設原則本身不直接換到選票，這正是遊戲想讓你思考的地方。",
};

/**
 * 基準截距：代表對手陣營的基本盤，所有候選人一視同仁（不依政黨或出身調整）。
 * 難度差異來自政黨與出身的起始數值（content/parties.json、backgrounds.json）。
 * 現任優勢不寫成固定加分，而是由現任才有的選項（option.perk）產生：
 * 現任背景在競選期、所有當選者在任期尾聲，都能動用剪綵、市政廣告、加碼福利等行政資源。
 * 設計目標（隨機策略，npm test 會檢查）：
 * - 現任有優勢但不保證連任：約 55–90%（史實參考：縣市長以上現任連任率約 73%）
 * - 大黨挑戰者約 35–45%；小黨與無黨籍挑戰者很難贏，約 10%（史實參考 4–6%）
 */
export const VOTE_BIAS = -0.4;

/**
 * 連任選舉的對手基準，與第一次投票分開：第二階段經過 8 回合任期，數值與危機的累積和競選期不同。
 * 一樣對所有角色一視同仁。
 */
export const REELECTION_BIAS = 0.3;

/**
 * 選民疲乏：每多動用一次現任資源，該次的民調加分乘上此係數（第 n 次為 PERK_DECAY^(n-1)）。
 * 避免「每次都動用」變成必勝公式。
 */
export const PERK_DECAY = 0.5;

/**
 * 民調邊際效益遞減：民調超過 50 後，選項帶來的民調加分打折（80 時剩七成、100 時剩一半），
 * 讓「只衝民調」不是最佳解。
 */
export const approvalGainMultiplier = (approval: number) => (approval <= 50 ? 1 : 1 - (approval - 50) / 100);

/** 負面突發事件在數值持續低於門檻時，每隔幾回合會再發生一次 */
export const CRISIS_COOLDOWN = 3;

/** 每個階段 12 回合：第一階段競選，當選後第二階段是任期加連任選戰 */
export const STAGE_LENGTH = 12;

/** 每 3 回合入帳一次 */
export const BIG_ROUND = 3;

/** 政治獻金：每 1 點政商關係帶來的獻金（萬元） */
export const DONATION_RATE = 10;

/**
 * 每 3 回合入帳（萬元）：
 * - 黨部撥款：政黨基數 ×（政黨支持 / 50），跟黨關係越好拿越多
 * - 政治獻金：政商關係 × DONATION_RATE
 * - 小額捐款：民調支持超過 35 的部分 × 12，乘上募款能力倍率（素人、無黨籍較高）
 */
export function payout(stats: Stats, income: { party: number; fundraising: number }) {
  const round10 = (n: number) => Math.max(0, Math.round(n / 10) * 10);
  return {
    party: round10((income.party * stats.party) / 50),
    donations: round10(stats.business * DONATION_RATE),
    small: round10((stats.approval - 35) * 12 * income.fundraising),
  };
}

/** 個人貸款：固定金額與總利息 */
export const LOAN_AMOUNT = 3000;
export const LOAN_INTEREST = 0.15;

/** 競選期與任期尾聲，每回合的競選總部開銷（萬元）；付不出來文宣就停擺 */
export const CAMPAIGN_UPKEEP = 300;

/**
 * 選前動員：投票前，剩下的競選經費自動投入動員（宣傳車、文宣、交通接駁、拜票人力），
 * 最多投入 MOBILIZATION_CAP 萬，每 1,000 萬約加 MOBILIZATION_WEIGHT（logit）。
 * 錢存到最後才有用，但太早花光就沒有動員。
 */
export const MOBILIZATION_CAP = 4000;
export const MOBILIZATION_WEIGHT = 0.15;

/** 媒體聲量每回合退燒的幅度，退到 MEDIA_FLOOR 為止 */
export const MEDIA_DECAY = 3;
export const MEDIA_FLOOR = 20;

/**
 * 行政團隊決定施政成果的實現程度：正向的施政成果乘上 (0.5 + 行政團隊/100)。
 * 團隊 50 時照原值，團隊 100 時 1.5 倍，團隊 0 時只剩一半。
 */
export const teamMultiplier = (team: number) => 0.5 + team / 100;

/**
 * 能力規則：選項標記了某項能力時，擅長的資質（level > 0）額外加上這些效果，
 * 不擅長的（level < 0）則反過來扣。多個資質的 level 會相加。
 */
export const SKILL_EFFECTS: Record<Skill, StatDelta> = {
  debate: { approval: 4, media: 2 },
  policy: { approval: 2, integrity: 2, achievement: 1 },
  grassroots: { approval: 3, party: 2 },
  media: { media: 6, approval: 1 },
  admin: { achievement: 3, team: 2 },
  organize: { party: 4, team: 2 },
  negotiate: { council: 4, team: 1 },
  deal: { business: 3, council: 2 },
  confront: { approval: 3, media: 2 },
};

/** 隨機擾動幅度（logit，均勻分布 ±此值），代表對手實力、時事與投票率等不可控因素 */
export const VOTE_NOISE = 1.0;
