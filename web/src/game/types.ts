// 《選舉人生》市長版：遊戲資料與狀態的型別定義。
// 史實證據（source）與遊戲權重（effects / model）分開維護。

/** 畫面上顯示的數值 */
export const VISIBLE_STATS = ["approval", "treasury", "achievement", "council"] as const;
/** 結局才揭曉的隱藏數值 */
export const HIDDEN_STATS = ["integrity", "party"] as const;
export const ALL_STATS = [...VISIBLE_STATS, ...HIDDEN_STATS] as const;

export type StatKey = (typeof ALL_STATS)[number];
export type Stats = Record<StatKey, number>;
export type StatDelta = Partial<Stats>;

export const STAT_LABELS: Record<StatKey, string> = {
  approval: "民調支持",
  treasury: "市庫財政",
  achievement: "施政成果",
  council: "議會關係",
  integrity: "原則",
  party: "政黨支持",
};

export type Phase = "campaign" | "term" | "reelection";

/** 事件或選項出現的條件；所有欄位皆須成立 */
export interface Condition {
  flags?: string[];
  notFlags?: string[];
  min?: StatDelta;
  max?: StatDelta;
}

/** 數回合後才發生的後果（例如工程追加預算、弊案爆發） */
export interface DelayedEffect {
  afterTurns: number;
  effects: StatDelta;
  text: string;
}

export interface GameOption {
  id: string;
  label: string;
  /** 選擇後立即顯示的結果文案 */
  outcome: string;
  effects: StatDelta;
  setFlags?: string[];
  delayed?: DelayedEffect;
  /** 不符合時顯示為灰色；若有 unlockCost 可付出代價解鎖 */
  requires?: Condition;
  unlockCost?: StatDelta;
  /** 標示涉及違法風險的選項 */
  legalRisk?: string;
}

export type SourceStatus = "placeholder" | "draft" | "verified";

export interface SourceRef {
  title: string;
  url: string;
  /** 原文摘錄，供查核比對 */
  quote: string;
  accessed: string; // YYYY-MM-DD
}

export interface EventSource {
  status: SourceStatus;
  /** 真實事件原型的中性描述（不點名個人） */
  prototype: string;
  /** 改編說明：哪些地方被虛構化或簡化 */
  adaptation: string;
  refs: SourceRef[];
  /** 人工查核者與日期，verified 時必填 */
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface GameEvent {
  id: string;
  phase: Phase;
  title: string;
  scenario: string;
  tags: string[];
  options: GameOption[];
  conditions?: Condition;
  /** 抽選權重，預設 1 */
  weight?: number;
  source: EventSource;
}

export interface HistoryEntry {
  turn: number;
  eventId: string;
  optionId: string;
  delta: Stats;
}

export interface PendingEffect extends DelayedEffect {
  dueTurn: number;
  fromEventId: string;
}

export interface GameState {
  version: number;
  seed: number;
  /** 0-based，指向 deck 中目前的事件 */
  turn: number;
  stats: Stats;
  flags: string[];
  deck: string[];
  history: HistoryEntry[];
  pending: PendingEffect[];
  /** 本回合觸發的延遲後果文案，供 UI 顯示 */
  notices: string[];
  finished: boolean;
}
