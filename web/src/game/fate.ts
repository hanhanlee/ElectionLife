// 政治命運：每個階段的第 3、6、9 回合結束後，從三張命運牌中選一張。
//
// 機運是立即的機會或有次數的加成，契約用較大的好處換之後的人情與後果，試煉是高風險的擲骰。
// 命運頁不算回合：不入帳、不扣開銷、不觸發突發事件；選完才抽下一個事件，讓牌的效果能影響接下來發生的事。
// 所有函式都是純函式；抽牌與擲骰用各自的 seed，不會打亂原本的事件順序。

import type { ActiveFate, Condition, FateCard, FateEffect, FateStage, GameState, Issue, PendingFate, Skill, StatDelta } from "./types";

/** 每個階段完成第幾個回合後出現命運牌 */
export const FATE_TURNS = [3, 6, 9];

/** 加成：用到對應能力或議題的選項，正面效果放大的倍率 */
export const FATE_BOOST = 1.3;

/**
 * 命運牌立即效果的平衡係數：好處打折、代價加重，讓「有命運牌」不會整體比「沒有」容易，只是讓局面起伏更大。
 * 大部分玩家處在落後的局面，起伏本身就對落後的人有利，所以試煉失敗要比成功稍微痛一點。
 */
export const FATE_SCALE = {
  gain: 0.4,
  cost: 1.5,
  ordealSuccess: 0.75,
  ordealFailure: 1.35,
  /** 拿到的經費打折（花掉的照算） */
  fundsGain: 0.6,
};

/** 同時生效的正向效果（加成、持續、護盾）上限；第三個會取代最舊的 */
export const MAX_ACTIVE_FATES = 2;

/** 試煉成功率的上下限：再有利也可能失敗，再不利也有機會 */
export const ORDEAL_CHANCE = { min: 0.2, max: 0.8 };

/** 同一手牌裡已經有這種類型時，再抽到同類型的權重倍率（讓三張盡量是不同類型，但不強制） */
const SAME_KIND_WEIGHT = 0.3;

/** 卡池不夠、不得不讓舊牌回來時，出現過的牌的權重倍率 */
const SEEN_WEIGHT = 0.5;

type Meets = (cond?: Condition) => boolean;

/** 完成這一回合後（turn 為已完成的回合數）是否該出現命運牌 */
export function isFateTurn(turn: number, stageLength: number): boolean {
  return FATE_TURNS.includes(turn % stageLength);
}

export const fateStage = (turn: number, stageLength: number): FateStage => (turn < stageLength ? "campaign" : "term");

function weightedPick<T>(items: T[], weight: (t: T) => number, r: number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let x = r * total;
  for (const t of items) {
    x -= weight(t);
    if (x < 0) return t;
  }
  return items[items.length - 1];
}

/**
 * 抽出三張不同的命運牌。同一局出現過的牌（包括沒被選的）不會再出現；
 * 只有在符合條件的牌不夠時，才讓沒被選過的舊牌回來。
 * 盡量湊齊不同類型，但某類不夠時由其他類型補上。
 */
export function drawFateOffer(state: GameState, cards: FateCard[], turn: number, stageLength: number, meets: Meets, rng: () => number): PendingFate | undefined {
  const stage = fateStage(turn, stageLength);
  const history = state.fateHistory ?? [];
  const chosen = new Set(history.map((h) => h.cardId));
  const seen = new Set(history.flatMap((h) => h.offered));
  const eligible = cards.filter((c) => c.stages.includes(stage) && !chosen.has(c.id) && meets(c.conditions));
  const fresh = eligible.filter((c) => !seen.has(c.id));
  const pool = fresh.length >= 3 ? fresh : eligible;
  if (pool.length < 3) return undefined;
  const hand: FateCard[] = [];
  while (hand.length < 3) {
    const rest = pool.filter((c) => !hand.includes(c));
    const pick = weightedPick(
      rest,
      (c) => (c.weight ?? 1) * (hand.some((h) => h.kind === c.kind) ? SAME_KIND_WEIGHT : 1) * (seen.has(c.id) ? SEEN_WEIGHT : 1),
      rng(),
    );
    hand.push(pick);
  }
  return { offerId: `fate-${turn}`, stage, cards: hand.map((c) => c.id) };
}

/** 立即效果套上平衡係數；試煉依成敗整體縮放 */
export function scaleFateEffects(effects: StatDelta, kind: FateCard["kind"], success?: boolean): StatDelta {
  const out: StatDelta = {};
  for (const [k, v] of Object.entries(effects) as [keyof StatDelta, number][]) {
    const f = kind === "ordeal" ? (success ? FATE_SCALE.ordealSuccess : FATE_SCALE.ordealFailure) : v > 0 ? FATE_SCALE.gain : FATE_SCALE.cost;
    out[k] = Math.round(v * f);
  }
  return out;
}

/** 試煉的成功率（不顯示給玩家） */
export function ordealChance(card: FateCard, meets: Meets): number {
  if (!card.ordeal) return 1;
  const p = card.ordeal.mods.reduce((s, m) => s + (meets(m.when) ? m.add : 0), card.ordeal.base);
  return Math.min(ORDEAL_CHANCE.max, Math.max(ORDEAL_CHANCE.min, p));
}

export function pickText(text: string | string[], r: number): string {
  return typeof text === "string" ? text : text[Math.floor(r * text.length)];
}

/** 把一張牌帶來的加成、持續效果、護盾加進生效清單；超過上限時取代最舊的 */
export function addActiveFates(active: ActiveFate[], card: FateCard, effect: FateEffect): { active: ActiveFate[]; replaced: string[] } {
  const added: ActiveFate[] = [];
  const base = { cardId: card.id, stackGroup: card.stackGroup };
  if (effect.boost) {
    const b = effect.boost;
    added.push({ ...base, type: "boost", label: b.label, turns: b.turns, charges: b.charges, skills: b.skills, issues: b.issues });
  }
  if (effect.passive) added.push({ ...base, type: "passive", label: effect.passive.label, turns: effect.passive.turns, effects: effect.passive.effects });
  if (effect.shield) added.push({ ...base, type: "shield", label: effect.shield.label, turns: effect.shield.turns, charges: 1 });
  if (!added.length) return { active, replaced: [] };

  let next = active.filter((a) => !(card.stackGroup && a.stackGroup === card.stackGroup));
  const replaced = active.filter((a) => !next.includes(a)).map((a) => a.label);
  next = [...next, ...added];
  while (next.length > MAX_ACTIVE_FATES) {
    replaced.push(next[0].label);
    next = next.slice(1);
  }
  return { active: next, replaced };
}

/** 正面效果放大（負面效果不變） */
function amplify(effects: StatDelta): StatDelta {
  const out: StatDelta = {};
  for (const [k, v] of Object.entries(effects) as [keyof StatDelta, number][]) {
    out[k] = v > 0 ? Math.max(v + 1, Math.round(v * FATE_BOOST)) : v;
  }
  return out;
}

/** 選項用到加成對應的能力或議題時，放大正面效果並用掉一次 */
export function applyBoost(
  active: ActiveFate[],
  skill: Skill | undefined,
  issue: Issue | undefined,
  effects: StatDelta,
): { effects: StatDelta; active: ActiveFate[]; used?: ActiveFate } {
  const hit = active.find(
    (a) => a.type === "boost" && (a.charges ?? 0) > 0 && ((skill && a.skills?.includes(skill)) || (issue && a.issues?.includes(issue))),
  );
  if (!hit || !Object.values(effects).some((v) => (v ?? 0) > 0)) return { effects, active };
  const charges = (hit.charges ?? 1) - 1;
  const next = charges > 0 ? active.map((a) => (a === hit ? { ...a, charges } : a)) : active.filter((a) => a !== hit);
  return { effects: amplify(effects), active: next, used: hit };
}

/** 突發事件的負面衝擊減半（有護盾時），用掉護盾 */
export function applyShield(active: ActiveFate[], effects: StatDelta): { effects: StatDelta; active: ActiveFate[]; used?: ActiveFate } {
  const hit = active.find((a) => a.type === "shield");
  if (!hit) return { effects, active };
  const out: StatDelta = {};
  for (const [k, v] of Object.entries(effects) as [keyof StatDelta, number][]) out[k] = v < 0 ? Math.round(v / 2) : v;
  return { effects: out, active: active.filter((a) => a !== hit), used: hit };
}

/** 持續效果這一回合的總和 */
export function passiveEffects(active: ActiveFate[]): StatDelta {
  const sum: StatDelta = {};
  for (const a of active) {
    if (a.type !== "passive" || !a.effects) continue;
    for (const [k, v] of Object.entries(a.effects) as [keyof StatDelta, number][]) sum[k] = (sum[k] ?? 0) + v;
  }
  return sum;
}

/** 主要回合結束：所有效果倒數一回合，到期的移除 */
export function tickFates(active: ActiveFate[]): ActiveFate[] {
  return active.map((a) => ({ ...a, turns: a.turns - 1 })).filter((a) => a.turns > 0);
}
