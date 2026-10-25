// 《選舉人生》市長版：遊戲資料與狀態的型別定義。
// 史實證據（source）與遊戲權重（effects / model）分開維護。

/** 畫面上顯示的數值 */
export const VISIBLE_STATS = ["approval", "media", "treasury", "achievement", "council", "team", "party", "business"] as const;
/** 結局才揭曉的隱藏數值：原則不直接換成選票，但太低會出事 */
export const HIDDEN_STATS = ["integrity"] as const;
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
  media: "媒體聲量",
  team: "團隊",
  business: "政商關係",
};

/** 每個數值的用途說明（設定畫面與遊戲中顯示） */
export const STAT_HINTS: Record<StatKey, string> = {
  approval: "選票的主要來源。太低會有市民上街抗議。",
  media: "曝光度，會隨時間退燒；投票前夠高才有用。太低沒人記得你，太高會過度曝光。",
  treasury: "花錢的選項需要它。見底會觸發財政危機。",
  achievement: "連任時選民看的政績，也會解鎖展示成果的選項。",
  council: "政策要過議會。太低預算會被凍結。",
  team: "競選期是競選團隊，當選後是市府團隊。決定施政做不做得出成果；太低局處長會集體請辭。",
  business: "和企業、建商、地方派系的關係。越高政治獻金越多，但太高會被懷疑官商勾結。",
  party: "組織動員與輔選。太低黨內會逼宮。",
  integrity: "不直接換成選票，結局才揭曉。太低會出大事。",
};

/**
 * launch：依出身背景觸發的參選事件；platform：主打政見；campaign：選戰策略與其他競選事件；
 * incumbency：只有現任才會遇到的事件，現任優勢由此產生
 */
export type Phase = "launch" | "platform" | "campaign" | "eve" | "term" | "incumbency" | "reelection";

/** 事件或選項出現的條件；所有欄位皆須成立 */
export interface Condition {
  flags?: string[];
  /** 至少符合其中一個旗標（例如「白黨或無黨」） */
  anyFlags?: string[];
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
  /**
   * 當選後才兌現的效果：競選時提出的政策、承諾的花費，要真的當上市長才會影響施政成果與市庫。
   * 現任市長本來就在執政，選了立即生效；第一次投票落選則不會發生。
   */
  onElected?: { effects: StatDelta; text: string };
  /** 不符合時顯示為灰色；若有 unlockCost 可付出代價解鎖 */
  requires?: Condition;
  unlockCost?: StatDelta;
  /** 標示涉及違法風險的選項 */
  legalRisk?: string;
  /** 翻舊帳時引用的話：玩家選這個選項時「說出口」的那句話（特別篇） */
  recall?: string;
  /** 動用現任才有的行政資源（剪綵、市政廣告、加碼福利等），結局會統計其效果 */
  perk?: boolean;
  /** 選項池：符合條件才可能被抽到（例如只有素人會出現「不分藍綠」） */
  appearsIf?: Condition;
  /** 選項池抽選權重，預設 1 */
  weight?: number;
  /** 競選經費變化（萬元）：負數是花費，經費不足時鎖住；正數是募得 */
  funds?: number;
  /** 改換政黨（例如退黨以無黨籍參選）：換掉政黨旗標、撥款與小額捐款倍率 */
  switchParty?: PartyId;
  /** 這個選項用到的能力；擅長或不擅長的資質會加強或削弱效果，並補一句敘述 */
  skill?: Skill;
  /** 依資質改寫結果：第一個符合條件的變化會取代結果文字、額外加上效果（不再套用一般能力規則） */
  variants?: OptionVariant[];
  /** 對劇情鏈的影響：開啟、改變狀態或更新事實（見 story.ts） */
  arcs?: ArcEffect[];
}

export const SKILLS = [
  "debate",
  "policy",
  "grassroots",
  "media",
  "admin",
  "organize",
  "negotiate",
  "deal",
  "confront",
] as const;
export type Skill = (typeof SKILLS)[number];

export interface OptionVariant {
  /** 通常用資質旗標，例如 { flags: ["trait-debater"] } */
  when: Condition;
  outcome: string;
  /** 加在選項原本效果上的額外效果 */
  effects?: StatDelta;
  /** 取代選項原本的延遲後果 */
  delayed?: DelayedEffect;
}

/** 資質對某項能力的影響：level > 0 擅長、< 0 不擅長；line 是補在結果後面的敘述 */
export interface TraitSkill {
  skill: Skill;
  level: number;
  line: string;
}

/**
 * placeholder：虛構情境（沒有特定的真實原型）
 * real：改編自明確的真實事件，原型記在 realCase，來源待補
 * draft：已附來源與原文摘錄，待人工查核
 * verified：人工查核完成
 */
export type SourceStatus = "placeholder" | "real" | "draft" | "verified";

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
  /** 真實原型（年份、地點、事件），供補來源與查核用；遊戲中不顯示，不寫真實人名 */
  realCase?: string;
  refs: SourceRef[];
  /** 人工查核者與日期，verified 時必填 */
  reviewedBy?: string;
  reviewedAt?: string;
}

/** 自動觸發的突發事件（不是選項）：數值越過門檻時發生 */
export interface Crisis {
  id: string;
  title: string;
  text: string;
  tone: "bad" | "good";
  when: Condition;
  /** 只在這些階段的回合結束後檢查；省略則全程 */
  phases?: Phase[];
  effects: StatDelta;
  /** 數字小者優先；同一回合最多觸發一個 */
  priority: number;
  /** 條件持續成立時，冷卻後會再次發生（負面事件適用）；省略則每局一次 */
  repeat?: boolean;
  /** 競選經費變化（萬元），例如律師費 */
  funds?: number;
  /** 觸發後設定旗標，讓後續事件接續（例如被搜索後的起訴） */
  setFlags?: string[];
  /** 餘波：之後連續幾回合，每回合再套用一次 */
  aftermath?: { turns: number; effects: StatDelta; text: string };
}

export interface Notice {
  kind: "delayed" | "crisis" | "funds" | "story" | "fate";
  tone: "bad" | "good";
  title?: string;
  text: string;
  /** 這則通知實際造成的數值變化，與選項本身的效果分開顯示 */
  effects?: StatDelta;
  funds?: number;
}

/** 插曲類別：破局、放大、反噬、黑天鵝 */
export type InterludeKind = "opportunity" | "amplifier" | "backlash" | "wildcard";
export const INTERLUDE_LABELS: Record<InterludeKind, string> = {
  opportunity: "破局",
  amplifier: "放大",
  backlash: "反噬",
  wildcard: "黑天鵝",
};

/** FACT 可直接查證、CLAIM 某方說法、SIMULATION 遊戲虛構 */
export type FactLevel = "FACT" | "CLAIM" | "SIMULATION";

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
  /** 事件的議題；省略時由 tags 推斷（見 model.ts 的 ISSUE_TAGS） */
  issue?: Issue;
  /** 設定時為選項池事件：每次從符合 appearsIf 的選項中隨機抽出這麼多個 */
  drawOptions?: number;
  /** 劇情鏈節點：只由劇情排程安排出場，不會被隨機抽到 */
  arc?: string;
  /** 特別篇事件：只在這個特別篇出場，不會被一般局抽到 */
  special?: string;
  /** 特別篇的固定回合（1–12） */
  specialTurn?: number;
  /** 特別篇的替換事件：第二局起，可能取代這些回合的固定事件 */
  specialSlots?: number[];
  /** 翻舊帳卡：引用玩家前面真的選過的話（{said:旗標}），第一局只要條件符合也會出現 */
  specialCallback?: boolean;
  /** 特別篇的插曲（命運卡）：在第 3、6、9 回合後依條件插入，不佔回合 */
  interlude?: InterludeKind;
  /** 資料分級：事實、某方說法、遊戲虛構（見特別篇手冊） */
  fact?: FactLevel;
  /** 結局頁「真實世界的這一題」：發生了什麼、兩邊各自省略或扭曲了什麼（特別篇，遊戲中途不顯示） */
  reflection?: string[];
  source: EventSource;
}

// ---------- 劇情鏈（Story Arc）與政治帳本 ----------

/**
 * 劇情鏈狀態。帳本依劇情種類顯示不同的說法（例如人情債的「掩蓋中」顯示為「私下回報」）：
 * active 進行中、fulfilled 已兌現／已了結、broken 跳票／拒絕、concealed 掩蓋中、exposed 已曝光。
 * 掩蓋不等於兌現：concealed 的承諾在結局仍算沒做到。
 */
export type ArcStatus = "active" | "fulfilled" | "broken" | "concealed" | "exposed";

/** 帳本分類：政策承諾、政治人情債、重大爭議 */
export type ArcKind = "promise" | "debt" | "scandal";

export interface ArcNode {
  /** 這個節點出場的事件（事件的 arc 欄位要指回這條劇情） */
  event: string;
  /** 出場的階段；過了這個階段還沒排上，就以快報結算 */
  phase: Phase;
  /** 上一個節點之後至少隔幾回合 */
  delay: number;
  /** 只在劇情處於這些狀態時出場（分支）；不符合時直接略過 */
  when?: ArcStatus[];
  /** 沒排上議程時的快報文字 */
  missed: string;
}

export interface ArcDef {
  id: string;
  kind: ArcKind;
  title: string;
  /** 帳本裡的進度說明，可用 {事實名稱} 代入，例如「承諾 {promised} 戶」 */
  progress: string;
  /** 依狀態的帳本狀態文字 */
  statusLabels: Record<ArcStatus, string>;
  /** 有目標值的劇情：facts[value] ≥ facts[target] 時設定旗標 arc-<id>-met */
  goal?: { value: string; target: string };
  nodes: ArcNode[];
  /** 幕僚長依狀態的提醒（多個版本） */
  advisor: Partial<Record<ArcStatus, string[]>>;
  /** 後日談：lost 是第一次投票落選時（沒有機會執政），其餘依最後狀態 */
  epilogue: Partial<Record<ArcStatus | "lost", string[]>>;
  /** 會讓這段成為後日談大標的狀態 */
  headlines?: Partial<Record<ArcStatus, [number, string]>>;
}

export interface ArcEffect {
  id: string;
  /** 開啟劇情（已開啟時只更新事實與紀錄） */
  open?: boolean;
  status?: ArcStatus;
  /** 直接設定事實；值可以是數字，或另一個事實的名稱（例如 claimed = promised） */
  set?: Record<string, number | string>;
  /** 增減事實 */
  add?: Record<string, number>;
  /** 帳本紀錄：這一步發生了什麼 */
  note: string;
}

export interface ArcLogEntry {
  turn: number;
  text: string;
}

// ---------- 政治命運（Roguelite 三選一） ----------

/** 機運：立即機會或有限次加成；契約：較大的好處換之後的人情與後果；試煉：高風險，成敗由隨機決定 */
export type FateKind = "opportunity" | "contract" | "ordeal";

/** 命運牌出現的階段：選戰（第一階段）或任期（第二階段） */
export type FateStage = "campaign" | "term";

/** 一張牌選下去之後發生的事。文字是故事，數值在背後結算 */
export interface FateEffect {
  /** 結果文案（多個版本時依 seed 挑一個） */
  text: string | string[];
  effects?: StatDelta;
  funds?: number;
  setFlags?: string[];
  /** 開啟或更新政治帳本（沿用劇情鏈的效果格式） */
  arcs?: ArcEffect[];
  /** 之後才找上門的後果 */
  delayed?: DelayedEffect;
  /** 有次數的加成：接下來用到這些能力或議題的選項，正面效果放大 */
  boost?: { skills?: Skill[]; issues?: Issue[]; charges: number; turns: number; label: string };
  /** 持續效果：接下來每回合 */
  passive?: { effects: StatDelta; turns: number; label: string };
  /** 下一次突發事件的負面衝擊減半 */
  shield?: { turns: number; label: string };
}

export interface FateCard {
  id: string;
  kind: FateKind;
  title: string;
  /** 牌面情境：誰打電話來、發生了什麼 */
  scene: string;
  /** 牌面提示：好處與代價，用故事語言寫，不寫數字 */
  hint: string;
  stages: FateStage[];
  weight?: number;
  conditions?: Condition;
  /** 同一組的效果同時只能有一個 */
  stackGroup?: string;
  /** 機運與契約的效果 */
  effect?: FateEffect;
  /** 試煉：成功率在背後計算，不顯示給玩家 */
  ordeal?: { base: number; mods: { when: Condition; add: number }[]; success: FateEffect; failure: FateEffect };
  source?: Pick<EventSource, "prototype" | "realCase">;
}

export interface PendingFate {
  offerId: string;
  stage: FateStage;
  cards: string[];
}

/** 正在生效的命運效果（加成、持續、護盾） */
export interface ActiveFate {
  cardId: string;
  label: string;
  type: "boost" | "passive" | "shield";
  /** 還剩幾個主要回合 */
  turns: number;
  charges?: number;
  skills?: Skill[];
  issues?: Issue[];
  effects?: StatDelta;
  stackGroup?: string;
}

export interface FateHistoryEntry {
  turn: number;
  offerId: string;
  offered: string[];
  cardId: string;
  /** 試煉才有：成功或失敗 */
  success?: boolean;
  outcome: string;
  delta: Stats;
  funds: number;
}

export interface ArcState {
  id: string;
  status: ArcStatus;
  openedTurn: number;
  /** 下一個要出場的節點索引 */
  node: number;
  /** 下一個節點最早可以出場的回合 */
  nextTurn: number;
  facts: Record<string, number>;
  log: ArcLogEntry[];
}

/** 政黨或出身背景的共同欄位 */
interface CharacterTrait {
  id: string;
  name: string;
  description: string;
  advantages: string[];
  baggage: string[];
  /** 加在基礎數值上的調整 */
  startDelta: StatDelta;
  /** 每 3 回合的黨部撥款基數（萬元），只有政黨有 */
  funding?: number;
  /** 小額募款能力倍率，預設 1（素人、無黨籍較高） */
  fundraising?: number;
  /** 開局即設定的旗標，事件可據此觸發 */
  flags: string[];
}

export type PartyId = "blue" | "green" | "white" | "yellow" | "minor" | "independent";

export interface Party extends CharacterTrait {
  id: PartyId;
  funding: number;
  /** 隨機抽政黨的權重 */
  weight: number;
  /** 參考的現實政黨結構特性（不評價政策立場） */
  reference: string;
}

export type TraitCategory = "communication" | "policy" | "organization" | "personality";

/** 個人資質：與出身分離，可正可負；以標籤顯示，細部效果到結局才揭露 */
/** 資質品質：負面（紅）、普通（綠）、優秀（藍）、卓越（紫）；越好越難抽到 */
export type TraitTier = "negative" | "common" | "rare" | "epic";

export const TRAIT_TIER_LABELS: Record<TraitTier, string> = {
  negative: "負面",
  common: "普通",
  rare: "優秀",
  epic: "卓越",
};

export interface Trait {
  id: string;
  name: string;
  category: TraitCategory;
  tier: TraitTier;
  /** 人物介紹：「你最擅長___」 */
  strength?: string;
  /** 人物介紹：「但___一直是你的弱點」 */
  weakness?: string;
  /** 人物介紹：政治人格的整句描述 */
  line?: string;
  startDelta: StatDelta;
  /** 這些出身比較容易抽到 */
  affinity?: string[];
  /** 擅長或不擅長的能力 */
  skills?: TraitSkill[];
}

/** 先天包袱／資源背景：不等於能力，也不等於已有違法事實 */
export interface Burden {
  id: string;
  name: string;
  /** 人物介紹的開場句；沒有時改用出身的開場句 */
  origin?: string;
  /** 人物介紹的包袱句 */
  line: string;
  startDelta: StatDelta;
  /** 開局額外的競選經費（萬元） */
  funds?: number;
  affinity?: string[];
  partyAffinity?: string[];
}

export const ISSUES = [
  "housing",
  "transit",
  "environment",
  "economy",
  "welfare",
  "culture",
  "local",
  "safety",
] as const;
export type Issue = (typeof ISSUES)[number];

export const ISSUE_LABELS: Record<Issue, string> = {
  housing: "居住",
  transit: "交通",
  environment: "環境",
  economy: "經濟產業",
  welfare: "福利照顧",
  culture: "文化觀光",
  local: "地方人情",
  safety: "公共安全",
};

/** 六都架空城市：選民結構、在意的議題與選舉生態都不同 */
export interface City {
  id: string;
  name: string;
  /** 用在「參選天龍市長」這類句子 */
  mayorTitle: string;
  tagline: string;
  weight: number;
  /** 選民結構描述與主要族群（比例僅供顯示） */
  voters: string;
  voterGroups: { name: string; share: number }[];
  /** 開局數值調整（例如財政狀況、媒體密度） */
  startDelta: StatDelta;
  /** 選舉時各數值權重的倍率（例如天龍市媒體影響大、媽媽市組織動員影響大） */
  voteMods: StatDelta;
  /** 選民對各議題的在意程度：選項的民調效果乘上這個倍率 */
  issueWeights: Partial<Record<Issue, number>>;
  /** 議題特別重要或特別不重要時，補在結果後面的敘述 */
  issueNotes: Partial<Record<Issue, string>>;
}

/** 開局抽出的人設：城市、資質、包袱、開場句 */
export interface Profile {
  city: string;
  traits: string[];
  burden: string;
  /** 出身開場句的索引（包袱沒有開場句時使用） */
  origin: number;
  /** 兩個階段的對手：第一階段的對手，以及連任選舉時（對手沒有捲土重來時）的新挑戰者 */
  rivals?: { first: Opponent; second: Opponent };
}

/** 傳奇對手：以台灣歷史知名政治人物為原型，只用綽號影射 */
export interface Legend {
  id: string;
  nickname: string;
  /** 角色卡上的身分描述 */
  title: string;
  party: PartyId;
  traits: string[];
  burden?: string;
  intro: string;
  /** 只出現在這位對手面前的招牌事件 */
  signature: string;
  /** 原型（只寫在文件，不顯示在遊戲裡） */
  inspiredBy: string;
}

export interface Opponent {
  /** 虛構姓名，或傳奇對手的綽號 */
  name: string;
  legend?: string;
  party: PartyId;
  /** 身分描述，例如「現任立法委員」 */
  title: string;
  incumbent: boolean;
  traits: string[];
  burden?: string;
  /** 對手強度（logit），從玩家的勝選機率中扣除 */
  strength: number;
}

export interface Background extends CharacterTrait {
  /** 人物介紹的開場句候選 */
  origins: string[];
  /** 隨機抽出身背景時的權重 */
  weight: number;
  /** 帶有這些政黨旗標時比較少見（權重打折） */
  rareFor?: string[];
  /** 現任市長：第一次投票是爭取連任，最後一場是接班選舉 */
  incumbent?: boolean;
}

export interface Character {
  party: PartyId;
  background: string;
  /** 個人資質與先天包袱 */
  profile?: Profile;
  /** 遊戲中換過黨時，原本的政黨 */
  formerParty?: PartyId;
}

export interface Payout {
  turn: number;
  /** 黨部撥款：依政黨支持 */
  party: number;
  /** 政治獻金：依政商關係 */
  donations: number;
  /** 小額捐款：依民調支持 */
  small: number;
}

export interface Loan {
  principal: number;
  /** 本金加利息的應還總額 */
  total: number;
  remaining: number;
  installment: number;
  /** 必須在這個回合數之前還清（階段結束） */
  dueBy: number;
}

export interface ElectionSnapshot {
  won: boolean;
  probability: number;
  /** 投入選前動員的經費（萬元） */
  mobilization: number;
}

export interface HistoryEntry {
  turn: number;
  eventId: string;
  optionId: string;
  /** 當回合實際提供的選項 */
  offered: string[];
  /** 整回合的數值變化（選項 + 延遲後果 + 突發事件） */
  delta: Stats;
  /** 只有選項本身造成的變化 */
  optionDelta: Stats;
  /** 實際顯示的結果文字（可能被資質改寫或補充） */
  outcome: string;
  /** 影響這次結果的資質 id（結局揭露用） */
  traitsInvolved?: string[];
}

export interface PendingEffect extends DelayedEffect {
  dueTurn: number;
  fromEventId: string;
}

/** 競選規模：決定每回合的人事、廣告、活動開銷 */
export type CampaignScale = "lean" | "standard" | "full";

/** 每回合固定開銷的三個項目（萬元） */
export interface SpendingItems {
  staff: number;
  ads: number;
  events: number;
}

/** 整局累計的支出，結局頁的「錢花到哪裡去了」 */
export interface Spending extends SpendingItems {
  /** 任期中的服務處與幕僚開銷 */
  office: number;
  /** 選項裡的活動花費（造勢、廣告、律師費等） */
  options: number;
  /** 貸款還款 */
  loan: number;
}

export interface InterludeEntry {
  /** 插曲發生在這一回合結束之後 */
  turn: number;
  eventId: string;
  optionId: string;
  outcome: string;
  delta: Stats;
  funds: number;
}

export interface GameState {
  version: number;
  seed: number;
  character: Character;
  /** 競選經費（萬元） */
  funds: number;
  /** 入帳參數，開局時由政黨與出身決定 */
  income: { party: number; fundraising: number };
  /** 每次入帳紀錄 */
  payouts: Payout[];
  /** 個人貸款：整局只能借一次，借了之後每回合扣本金加利息，必須在該階段結束前還清 */
  loan?: Loan;
  loanTaken: boolean;
  /** 競選規模，玩家隨時可以調整 */
  scale: CampaignScale;
  /** 連續付不出最低開銷（欠薪）的回合數 */
  arrears: number;
  spending: Spending;
  /** 0-based，指向 deck 中目前的事件 */
  turn: number;
  stats: Stats;
  flags: string[];
  deck: string[];
  /** 目前事件提供的選項 id（選項池事件為抽出的子集） */
  offered: string[];
  history: HistoryEntry[];
  pending: PendingEffect[];
  /** 競選承諾：第一次投票當選後才兌現的效果 */
  afterElection?: { effects: StatDelta; text: string; fromEventId: string }[];
  /** 本回合觸發的延遲後果與突發事件，供 UI 顯示 */
  notices: Notice[];
  /** 已觸發的突發事件與回合 */
  crisisLog: { id: string; turn: number }[];
  /** 開局資質帶來的能力加減（由 newGame 從資質資料展開） */
  traitSkills: (TraitSkill & { trait: string })[];
  /** 城市的選民結構（由 newGame 從城市資料複製，讓引擎不必查內容檔） */
  cityMods?: { voteMods: StatDelta; issueWeights: Partial<Record<Issue, number>>; issueNotes: Partial<Record<Issue, string>> };
  /** 目前這一階段的對手 */
  opponent?: Opponent;
  /** 劇情鏈的狀態（政治帳本） */
  arcs: Record<string, ArcState>;
  /** 競選期結束後的第一次投票結果；落選則遊戲提前結束 */
  firstElection?: ElectionSnapshot;
  /** 這一局有沒有政治命運（開局決定，同一局不會中途改變） */
  fateOn?: boolean;
  /** 等待玩家三選一的命運；有值時不會出現下一個事件 */
  pendingFate?: PendingFate;
  fateEffects?: ActiveFate[];
  fateHistory?: FateHistoryEntry[];
  /** 特別篇 id：固定人設與對手、事件依劇本出場，第一次投票後結束 */
  special?: string;
  /** 特別篇的分支模式：部分回合可能換成替換事件（第二局起） */
  specialBranch?: boolean;
  /** 這一局不會發生的通用突發事件（特別篇用自己的插曲取代，例如「過度曝光」改由 F13 處理） */
  disabledCrises?: string[];
  /** 等待玩家回應的插曲事件 id；有值時不會出現下一個事件 */
  pendingInterlude?: string;
  interludes?: InterludeEntry[];
  finished: boolean;
}
