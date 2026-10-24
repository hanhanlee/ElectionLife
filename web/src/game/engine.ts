// 回合引擎：純函式，不碰 DOM 與儲存，方便測試與重現。

import { mulberry32 } from "./rng";
import { advanceArc, applyArcEffects, dueArcEvent, expireArcs, fillArcText, withArcFlags } from "./story";
import {
  approvalGainMultiplier,
  BIG_ROUND,
  LOAN_AMOUNT,
  LOAN_INTEREST,
  STAGE_LENGTH,
  ARREARS_EFFECTS,
  ARREARS_SCANDAL_AFTER,
  CAMPAIGN_SCALES,
  OFFICE_UPKEEP,
  OPPONENT_INCUMBENT_STRENGTH,
  REMATCH_STRENGTH,
  REMATCH_THRESHOLD,
  scaleCost,
  MOBILIZATION_CAP,
  MOBILIZATION_WEIGHT,
  ISSUE_NOTE_THRESHOLD,
  ISSUE_TAGS,
  REELECTION_BIAS,
  SKILL_EFFECTS,
  payout,
  CRISIS_COOLDOWN,
  MEDIA_DECAY,
  MEDIA_FLOOR,
  PERK_DECAY,
  START_STATS,
  teamMultiplier,
  VOTE_BIAS,
  VOTE_NOISE,
  VOTE_WEIGHTS,
} from "./model";
import {
  ALL_STATS,
  type Background,
  type Burden,
  type City,
  type Condition,
  type Crisis,
  type GameEvent,
  type GameOption,
  type GameState,
  type Notice,
  type Opponent,
  type Party,
  type Issue,
  type Phase,
  type Profile,
  type StatDelta,
  type StatKey,
  type Stats,
  type Trait,
  type ArcDef,
  type CampaignScale,
} from "./types";

export const STATE_VERSION = 15;

/**
 * 兩個階段，各 12 回合：
 * - 第一階段（競選）：參選、政見、9 回合選戰、選前之夜 → 第一次投票，落選則遊戲結束
 * - 第二階段（任期與連任）：8 回合任期、3 回合現任限定、連任選戰 → 第二次投票
 */
export const TURN_PLAN: Phase[] = [
  "launch",
  "platform",
  ...Array<Phase>(9).fill("campaign"),
  "eve",
  ...Array<Phase>(8).fill("term"),
  ...Array<Phase>(3).fill("incumbency"),
  "reelection",
];

/** 完成這麼多回合後舉行第一次投票 */
export const FIRST_ELECTION_TURN = STAGE_LENGTH;

/** 這個回合所在階段的結束回合（不含） */
export const stageEnd = (turn: number) => (turn < STAGE_LENGTH ? STAGE_LENGTH : TURN_PLAN.length);

const FIRST_ELECTION_SALT = 0xf1257;
const FINAL_ELECTION_SALT = 0xe1ec;
const OPTION_DRAW_SALT = 0x0b7;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** 這些階段的回合要付競選總部開銷 */
const UPKEEP_PHASES: Phase[] = ["launch", "platform", "campaign", "eve", "incumbency", "reelection"];

function diff(after: Stats, before: Stats): Stats {
  return Object.fromEntries(ALL_STATS.map((k) => [k, after[k] - before[k]])) as Stats;
}

function zeroStats(): Stats {
  return Object.fromEntries(ALL_STATS.map((k) => [k, 0])) as Stats;
}

function addDelta(stats: Stats, delta: StatDelta, sign = 1): Stats {
  const next = { ...stats };
  for (const k of ALL_STATS) {
    if (delta[k] !== undefined) next[k] = clamp(next[k] + sign * delta[k]!);
  }
  return next;
}

export function meetsCondition(state: Pick<GameState, "flags" | "stats">, cond?: Condition): boolean {
  if (!cond) return true;
  if (cond.flags?.some((f) => !state.flags.includes(f))) return false;
  if (cond.anyFlags && !cond.anyFlags.some((f) => state.flags.includes(f))) return false;
  if (cond.notFlags?.some((f) => state.flags.includes(f))) return false;
  for (const k of ALL_STATS) {
    if (cond.min?.[k] !== undefined && state.stats[k] < cond.min[k]!) return false;
    if (cond.max?.[k] !== undefined && state.stats[k] > cond.max[k]!) return false;
  }
  return true;
}

export type Availability = "open" | "unlockable" | "locked";

/** 經費不足以支付這個選項 */
export function lacksFunds(state: GameState, option: GameOption): boolean {
  return (option.funds ?? 0) < 0 && state.funds + option.funds! < 0;
}

export function optionAvailability(state: GameState, option: GameOption): Availability {
  if (lacksFunds(state, option)) return "locked";
  if (meetsCondition(state, option.requires)) return "open";
  return option.unlockCost ? "unlockable" : "locked";
}

/** 每 3 回合入帳：黨部撥款、政治獻金、小額捐款 */
function withPayout(state: GameState): GameState {
  const p = payout(state.stats, state.income);
  const fmt = (n: number) => `${n.toLocaleString()} 萬`;
  const text = `黨部撥款：${fmt(p.party)}｜政治獻金：${fmt(p.donations)}｜小額捐款：${fmt(p.small)}`;
  return {
    ...state,
    funds: state.funds + p.party + p.donations + p.small,
    payouts: [...state.payouts, { turn: state.turn, ...p }],
    notices: [...state.notices, { kind: "funds", tone: "good", text }],
  };
}

/** 可以申請個人貸款：整局一次，且這個階段還有回合可以分期還 */
export function canTakeLoan(state: GameState): boolean {
  return !state.finished && !state.loanTaken && stageEnd(state.turn) - state.turn >= 2;
}

/** 申請個人貸款：拿到固定金額，之後每回合結束扣一期，在階段結束前還清 */
export function takeLoan(state: GameState): GameState {
  if (!canTakeLoan(state)) throw new Error("不能再貸款");
  const total = Math.round(LOAN_AMOUNT * (1 + LOAN_INTEREST));
  const turns = stageEnd(state.turn) - state.turn;
  const installment = Math.ceil(total / turns / 10) * 10;
  return {
    ...state,
    funds: state.funds + LOAN_AMOUNT,
    loanTaken: true,
    loan: { principal: LOAN_AMOUNT, total, remaining: total, installment, dueBy: stageEnd(state.turn) },
  };
}

function turnRng(seed: number, turn: number, salt = 0) {
  return mulberry32((seed ^ Math.imul(turn + 1, 0x9e3779b9) ^ salt) >>> 0);
}

/** 依權重抽一個 */
function weightedPick<T>(items: T[], weight: (t: T) => number, r: number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let x = r * total;
  for (const t of items) {
    x -= weight(t);
    if (x < 0) return t;
  }
  return items[items.length - 1];
}

function drawEvent(state: GameState, events: GameEvent[], turn: number, arcs: ArcDef[] = []): GameEvent {
  // 到期的劇情節點優先出場；劇情節點事件不會被隨機抽到
  const due = dueArcEvent(state, events, turn, TURN_PLAN, arcs);
  if (due) return due;
  const phase = TURN_PLAN[turn];
  const unused = events.filter((e) => e.phase === phase && !e.arc && !state.deck.includes(e.id));
  const eligible = unused.filter((e) => meetsCondition(state, e.conditions));
  const pool = eligible.length > 0 ? eligible : unused;
  if (pool.length === 0) throw new Error(`事件池不足：phase=${phase}, turn=${turn}`);
  return weightedPick(pool, (e) => e.weight ?? 1, turnRng(state.seed, turn)());
}

/** 不花經費、沒有數值門檻、也不動用公家資源的選項：保證玩家永遠有一條乾淨的路可走 */
const isFree = (o: GameOption) => !o.requires && (o.funds ?? 0) >= 0 && !o.perk;

/**
 * 選項池事件：從符合條件的選項中不重複抽出 drawOptions 個，並保持原本順序。
 * 若抽到的全都要花錢或有門檻，把最後一個換成免費選項，避免玩家卡住。
 */
function drawOptions(state: GameState, event: GameEvent, turn: number): string[] {
  const visible = event.options.filter((o) => meetsCondition(state, o.appearsIf));
  if (!event.drawOptions || visible.length <= event.drawOptions) return visible.map((o) => o.id);

  const rng = turnRng(state.seed, turn, OPTION_DRAW_SALT);
  const picked = new Set<string>();
  let rest = visible;
  while (picked.size < event.drawOptions) {
    const o = weightedPick(rest, (x) => x.weight ?? 1, rng());
    picked.add(o.id);
    rest = rest.filter((x) => x !== o);
  }
  if (!visible.some((o) => picked.has(o.id) && isFree(o))) {
    const free = rest.filter(isFree);
    if (free.length > 0) {
      picked.delete([...picked].at(-1)!);
      picked.add(weightedPick(free, (x) => x.weight ?? 1, rng()).id);
    }
  }
  return visible.filter((o) => picked.has(o.id)).map((o) => o.id);
}

function withNextEvent(state: GameState, events: GameEvent[], arcs: ArcDef[] = []): GameState {
  const event = drawEvent(state, events, state.turn, arcs);
  return { ...state, deck: [...state.deck, event.id], offered: drawOptions(state, event, state.turn) };
}

/** 開局人設：抽出的資質與包袱（由 profile.ts 的 drawProfile 產生） */
export interface ProfileSetup {
  profile: Profile;
  city: City;
  traits: Trait[];
  burden: Burden;
}

export function newGame(
  events: GameEvent[],
  seed: number,
  party: Party,
  background: Background,
  setup?: ProfileSetup,
): GameState {
  let stats = addDelta(addDelta({ ...START_STATS }, party.startDelta), background.startDelta);
  if (setup) stats = addDelta(stats, setup.city.startDelta);
  const flags = [...party.flags, ...background.flags];
  if (setup) {
    for (const t of setup.traits) stats = addDelta(stats, t.startDelta);
    stats = addDelta(stats, setup.burden.startDelta);
    flags.push(...setup.traits.map((t) => `trait-${t.id}`), `burden-${setup.burden.id}`, `city-${setup.city.id}`);
  }
  const opponent = setup?.profile.rivals?.first;
  if (opponent) flags.push(...opponentFlags(opponent));
  const traitSkills = (setup?.traits ?? []).flatMap((t) => (t.skills ?? []).map((s) => ({ ...s, trait: t.id })));
  const base: GameState = {
    version: STATE_VERSION,
    seed,
    character: { party: party.id, background: background.id, profile: setup?.profile },
    funds: setup?.burden.funds ?? 0,
    income: {
      party: party.funding,
      fundraising: Math.max(party.fundraising ?? 1, background.fundraising ?? 1),
    },
    payouts: [],
    loanTaken: false,
    // 大黨的黨部撥款撐得起標準規模，其他人從精簡開始
    scale: party.funding >= 700 ? "standard" : "lean",
    arrears: 0,
    spending: { staff: 0, ads: 0, events: 0, office: 0, options: 0, loan: 0 },
    turn: 0,
    stats,
    flags,
    deck: [],
    offered: [],
    history: [],
    pending: [],
    notices: [],
    crisisLog: [],
    traitSkills,
    cityMods: setup
      ? { voteMods: setup.city.voteMods, issueWeights: setup.city.issueWeights, issueNotes: setup.city.issueNotes }
      : undefined,
    opponent,
    arcs: {},
    finished: false,
  };
  return withNextEvent(withPayout(base), events);
}

export function currentEvent(state: GameState, events: GameEvent[]): GameEvent | undefined {
  if (state.finished) return undefined;
  return events.find((e) => e.id === state.deck[state.turn]);
}

/** 目前事件實際提供給玩家的選項 */
export function offeredOptions(state: GameState, event: GameEvent): GameOption[] {
  return event.options.filter((o) => state.offered.includes(o.id));
}

export function isPerk(events: GameEvent[], eventId: string, optionId: string): boolean {
  return !!events.find((e) => e.id === eventId)?.options.find((o) => o.id === optionId)?.perk;
}

/** 選民疲乏：依先前動用現任資源的次數，遞減本次的民調加分 */
function withPerkDecay(state: GameState, events: GameEvent[], effects: StatDelta): StatDelta {
  const used = state.history.filter((h) => isPerk(events, h.eventId, h.optionId)).length;
  if (!effects.approval || effects.approval <= 0) return effects;
  return { ...effects, approval: Math.round(effects.approval * PERK_DECAY ** used) };
}

function sumDelta(a: StatDelta, b?: StatDelta, sign = 1): StatDelta {
  if (!b) return a;
  const out: StatDelta = { ...a };
  for (const k of ALL_STATS) if (b[k] !== undefined) out[k] = (out[k] ?? 0) + sign * b[k]!;
  return out;
}

/** 事件的議題：明確設定的 issue，否則用標籤推斷 */
export function eventIssue(event: GameEvent): Issue | undefined {
  return event.issue ?? event.tags.map((t) => ISSUE_TAGS[t]).find(Boolean);
}

/**
 * 城市的選民結構：選民越在意這個議題，選項的民調效果（加分或扣分）越大，
 * 差距明顯時補上城市的敘述。
 */
function withCityIssue(state: GameState, event: GameEvent | undefined, r: ReturnType<typeof resolveTraits>) {
  const issue = event && eventIssue(event);
  const weight = issue ? state.cityMods?.issueWeights[issue] ?? 1 : 1;
  if (!issue || weight === 1 || !r.effects.approval) return r;
  const note = Math.abs(weight - 1) >= ISSUE_NOTE_THRESHOLD ? state.cityMods?.issueNotes[issue] : undefined;
  return {
    ...r,
    outcome: note ? r.outcome + note : r.outcome,
    effects: { ...r.effects, approval: Math.round(r.effects.approval * weight) },
  };
}

/** 資質與城市如何改變這個選項（見 resolveTraits 與 withCityIssue） */
export function resolveOption(state: GameState, option: GameOption, event?: GameEvent) {
  return withCityIssue(state, event, resolveTraits(state, option));
}

/**
 * 資質如何改變這個選項：
 * - 有符合的手寫變化（variants）就用它：換掉結果文字、加上額外效果
 * - 否則套用一般能力規則：擅長加分、不擅長扣分，並補上資質的敘述
 */
function resolveTraits(state: GameState, option: GameOption) {
  const variant = option.variants?.find((v) => meetsCondition(state, v.when));
  if (variant) {
    const involved = [...(variant.when.flags ?? []), ...(variant.when.anyFlags ?? [])]
      .filter((f) => f.startsWith("trait-") && state.flags.includes(f))
      .map((f) => f.slice("trait-".length));
    return {
      outcome: variant.outcome,
      effects: sumDelta(option.effects, variant.effects),
      delayed: variant.delayed ?? option.delayed,
      traitsInvolved: involved,
    };
  }
  const related = option.skill ? state.traitSkills.filter((s) => s.skill === option.skill) : [];
  const level = related.reduce((n, s) => n + s.level, 0);
  if (!option.skill || level === 0) {
    return { outcome: option.outcome, effects: option.effects, delayed: option.delayed, traitsInvolved: [] };
  }
  return {
    outcome: [option.outcome, ...related.map((s) => s.line)].join(""),
    effects: sumDelta(option.effects, SKILL_EFFECTS[option.skill], Math.sign(level)),
    delayed: option.delayed,
    traitsInvolved: related.map((s) => s.trait),
  };
}

/** 行政團隊決定施政成果能實現多少；民調越高越難再漲 */
function withStatScaling(state: GameState, effects: StatDelta): StatDelta {
  const scaled = { ...effects };
  if (scaled.achievement && scaled.achievement > 0) {
    scaled.achievement = Math.round(scaled.achievement * teamMultiplier(state.stats.team));
  }
  if (scaled.approval && scaled.approval > 0) {
    scaled.approval = Math.round(scaled.approval * approvalGainMultiplier(state.stats.approval));
  }
  return scaled;
}

/** 突發事件是否可以發生：沒發生過，或可重複且已過冷卻期 */
function crisisReady(state: GameState, crisis: Crisis): boolean {
  const last = state.crisisLog.filter((l) => l.id === crisis.id).at(-1);
  if (!last) return true;
  return !!crisis.repeat && state.turn - last.turn >= CRISIS_COOLDOWN;
}

/** 回合結束後檢查突發事件：依優先順序，觸發第一個符合條件且可以發生的 */
export function checkCrisis(state: GameState, crises: Crisis[], phase: Phase): Crisis | undefined {
  return [...crises]
    .sort((a, b) => a.priority - b.priority)
    .find((c) => crisisReady(state, c) && (!c.phases || c.phases.includes(phase)) && meetsCondition(state, c.when));
}

export function choose(
  state: GameState,
  events: GameEvent[],
  optionId: string,
  crises: Crisis[] = [],
  parties: Party[] = [],
  arcDefs: ArcDef[] = [],
): GameState {
  const event = currentEvent(state, events);
  if (!event) throw new Error("遊戲已結束或事件不存在");
  const option = event.options.find((o) => o.id === optionId);
  if (!option || !state.offered.includes(optionId)) throw new Error(`選項不存在：${optionId}`);

  const availability = optionAvailability(state, option);
  if (availability === "locked") throw new Error(`選項未解鎖：${optionId}`);

  let stats = state.stats;
  if (availability === "unlockable") stats = addDelta(stats, option.unlockCost!);
  const resolved = resolveOption(state, option, event);
  const effects = withStatScaling(state, option.perk ? withPerkDecay(state, events, resolved.effects) : resolved.effects);
  stats = addDelta(stats, effects);

  let flags = [...new Set([...state.flags, ...(option.setFlags ?? [])])];
  let { character, income } = state;
  if (option.switchParty && option.switchParty !== character.party) {
    const next = parties.find((p) => p.id === option.switchParty);
    if (!next) throw new Error(`找不到政黨：${option.switchParty}`);
    flags = [...flags.filter((f) => !f.startsWith("party-")), ...next.flags];
    income = { party: next.funding, fundraising: Math.max(income.fundraising, next.fundraising ?? 1) };
    character = { ...character, party: next.id, formerParty: character.formerParty ?? character.party };
  }
  const turn = state.turn + 1;
  let funds = state.funds + (option.funds ?? 0);

  // 劇情鏈：先套用選項對劇情的影響，再推進這個節點所屬的劇情
  const arcResult = applyArcEffects(state.arcs, option.arcs, state.turn, arcDefs);
  const arcs = advanceArc(arcResult.arcs, event, state.turn, arcDefs);
  const optionDelta = diff(stats, state.stats);

  let pending = [...state.pending];
  if (resolved.delayed) {
    pending.push({ ...resolved.delayed, dueTurn: turn + resolved.delayed.afterTurns, fromEventId: event.id });
  }

  // 結算到期的延遲後果
  const notices: Notice[] = [...arcResult.notices];
  for (const p of pending.filter((p) => p.dueTurn <= turn && turn < TURN_PLAN.length)) {
    const before = stats;
    stats = addDelta(stats, p.effects);
    notices.push({ kind: "delayed", tone: "bad", text: p.text, effects: diff(stats, before) });
  }
  pending = pending.filter((p) => !(p.dueTurn <= turn && turn < TURN_PLAN.length));

  // 媒體聲量退燒
  if (stats.media > MEDIA_FLOOR) stats = { ...stats, media: Math.max(MEDIA_FLOOR, stats.media - MEDIA_DECAY) };

  // 每回合開銷：競選回合依競選規模付人事、廣告、活動；任期中付服務處開銷。
  // 付不起選定的規模就自動縮編，連精簡都付不起就是欠薪。
  let scale = state.scale;
  let arrears = state.arrears;
  let spending = { ...state.spending, options: state.spending.options + Math.max(0, -(option.funds ?? 0)) };
  if (UPKEEP_PHASES.includes(TURN_PLAN[state.turn])) {
    if (funds < scaleCost(scale) && scale !== "lean") {
      const fallback: CampaignScale = scale === "full" && funds >= scaleCost("standard") ? "standard" : "lean";
      notices.push({
        kind: "funds",
        tone: "bad",
        text: `經費付不起「${CAMPAIGN_SCALES[scale].label}」規模，競選總部被迫縮編為「${CAMPAIGN_SCALES[fallback].label}」。`,
      });
      scale = fallback;
    }
    const plan = CAMPAIGN_SCALES[scale];
    if (funds >= scaleCost(scale)) {
      const before = stats;
      funds -= scaleCost(scale);
      spending = {
        ...spending,
        staff: spending.staff + plan.costs.staff,
        ads: spending.ads + plan.costs.ads,
        events: spending.events + plan.costs.events,
      };
      stats = addDelta(stats, plan.effects);
      arrears = 0;
      const c = plan.costs;
      notices.push({
        kind: "funds",
        tone: "bad",
        text: `競選總部開銷（${plan.label}）：人事 ${c.staff} 萬｜廣告 ${c.ads} 萬｜活動 ${c.events} 萬`,
        effects: diff(stats, before),
        funds: -scaleCost(scale),
      });
    } else {
      const before = stats;
      spending = { ...spending, staff: spending.staff + funds };
      funds = 0;
      arrears += 1;
      stats = addDelta(stats, ARREARS_EFFECTS);
      notices.push({
        kind: "delayed",
        tone: "bad",
        text:
          arrears >= ARREARS_SCANDAL_AFTER
            ? `連續 ${arrears} 回合發不出薪水。幕僚在網路上爆料「候選人欠薪」，志工也開始請假。`
            : "競選總部發不出這回合的薪水，幕僚們開始私下找工作。",
        effects: diff(stats, before),
      });
      if (arrears >= ARREARS_SCANDAL_AFTER) flags = [...new Set([...flags, "unpaid-staff"])];
    }
  } else {
    const paid = Math.min(funds, OFFICE_UPKEEP);
    funds -= paid;
    spending = { ...spending, office: spending.office + paid };
    if (paid) notices.push({ kind: "funds", tone: "bad", text: `服務處與政治幕僚開銷：${paid} 萬`, funds: -paid });
  }

  // 貸款還款：每回合扣一期；付不出來就逾期上新聞，階段結束還沒還清就違約
  let loan = state.loan;
  if (loan && loan.remaining > 0) {
    // 本期應繳：至少一期；之前漏繳的要補上，讓剩下的回合每期都繳得完；最後一回合繳清
    const turnsAfter = Math.max(0, loan.dueBy - turn);
    const due = Math.min(loan.remaining, Math.max(loan.installment, loan.remaining - loan.installment * turnsAfter));
    const paid = Math.min(due, funds);
    funds -= paid;
    spending = { ...spending, loan: spending.loan + paid };
    loan = { ...loan, remaining: loan.remaining - paid };
    if (paid < due) {
      const before = stats;
      stats = addDelta(stats, { approval: -4, media: 5 });
      notices.push({
        kind: "delayed",
        tone: "bad",
        text: `貸款還款逾期：這期只還了 ${paid.toLocaleString()} 萬，銀行催收的消息上了新聞。`,
        effects: diff(stats, before),
        funds: -paid || undefined,
      });
    } else {
      notices.push({
        kind: "funds",
        tone: "bad",
        text: `個人貸款還款：${paid.toLocaleString()} 萬（還剩 ${loan.remaining.toLocaleString()} 萬）`,
      });
    }
    if (turn >= loan.dueBy && loan.remaining > 0) {
      const before = stats;
      stats = addDelta(stats, { approval: -10, integrity: -5 });
      notices.push({
        kind: "crisis",
        tone: "bad",
        title: "貸款違約",
        text: `還款期限到了，還欠銀行 ${loan.remaining.toLocaleString()} 萬。你的房子被假扣押，對手說「連自己的錢都管不好」。`,
        effects: diff(stats, before),
      });
      loan = { ...loan, remaining: 0 };
      flags = [...new Set([...flags, "loan-defaulted"])];
    }
  }

  // 突發事件
  let crisisLog = state.crisisLog;
  const crisis = checkCrisis({ ...state, stats, flags }, crises, TURN_PLAN[state.turn]);
  if (crisis) {
    const before = stats;
    stats = addDelta(stats, crisis.effects);
    const paid = Math.max(-funds, crisis.funds ?? 0);
    funds += paid;
    flags = [...new Set([...flags, ...(crisis.setFlags ?? [])])];
    crisisLog = [...crisisLog, { id: crisis.id, turn: state.turn }];
    notices.push({
      kind: "crisis",
      tone: crisis.tone,
      title: crisis.title,
      text: crisis.text,
      effects: diff(stats, before),
      funds: paid || undefined,
    });
    if (crisis.aftermath) {
      for (let i = 1; i <= crisis.aftermath.turns; i++) {
        pending.push({ ...crisis.aftermath, afterTurns: i, dueTurn: turn + i, fromEventId: crisis.id });
      }
    }
  }

  const delta = zeroStats();
  for (const k of ALL_STATS) delta[k] = stats[k] - state.stats[k];

  let next: GameState = {
    ...state,
    character,
    income,
    turn,
    funds,
    stats,
    flags,
    pending,
    notices,
    crisisLog,
    loan,
    arcs,
    scale,
    arrears,
    spending,
    offered: [],
    history: [
      ...state.history,
      {
        turn: state.turn,
        eventId: event.id,
        optionId,
        offered: state.offered,
        delta,
        optionDelta,
        outcome: fillArcText(resolved.outcome, arcs),
        traitsInvolved: resolved.traitsInvolved.length ? resolved.traitsInvolved : undefined,
      },
    ],
  };

  if (turn === FIRST_ELECTION_TURN) {
    const { won, probability, mobilization } = runElection(next, "first");
    next = { ...next, funds: next.funds - mobilization, firstElection: { won, probability, mobilization } };
    if (!won) return { ...next, flags: withArcFlags(next.flags, next.arcs, arcDefs), finished: true };
    next = withSecondOpponent(next, probability);
  }
  // 過了階段還沒排上議程的劇情節點，以快報結算（第一次投票落選時不結算任期劇情，留給後日談）
  const expired = expireArcs(next.arcs, turn, TURN_PLAN, arcDefs);
  next = {
    ...next,
    arcs: expired.arcs,
    flags: withArcFlags(next.flags, expired.arcs, arcDefs),
    notices: [...next.notices, ...expired.notices],
  };
  if (turn >= TURN_PLAN.length) return { ...next, finished: true };
  if (turn % BIG_ROUND === 0) next = withPayout(next);
  return withNextEvent(next, events, arcDefs);
}

export interface ElectionResult {
  won: boolean;
  probability: number;
  /** 各數值對得票的貢獻（logit），由大到小 */
  contributions: { stat: StatKey; value: number }[];
  /** 投入選前動員的經費（萬元）與其貢獻（logit） */
  mobilization: number;
  mobilizationValue: number;
  /** 對手強度（logit，已從勝選機率扣除） */
  opponentStrength: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** 數值換算的連任／當選機率，不含隨機擾動（設定畫面估算難度用） */
export function baseProbability(stats: Stats): number {
  const logit = VOTE_BIAS + ALL_STATS.reduce((s, k) => s + (VOTE_WEIGHTS[k] * (stats[k] - 50)) / 10, 0);
  return sigmoid(logit);
}

export function runElection(state: GameState, which: "first" | "final" = "final"): ElectionResult {
  const voteMods = state.cityMods?.voteMods ?? {};
  const contributions = ALL_STATS.map((stat) => ({
    stat,
    value: (VOTE_WEIGHTS[stat] * (voteMods[stat] ?? 1) * (state.stats[stat] - 50)) / 10,
  })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const mobilization = Math.min(state.funds, MOBILIZATION_CAP);
  const mobilizationValue = (MOBILIZATION_WEIGHT * mobilization) / 1000;
  const bias = which === "first" ? VOTE_BIAS : REELECTION_BIAS;
  const opponentStrength = state.opponent?.strength ?? 0;
  const logit = bias - opponentStrength + mobilizationValue + contributions.reduce((s, c) => s + c.value, 0);
  const salt = which === "first" ? FIRST_ELECTION_SALT : FINAL_ELECTION_SALT;
  const rng = turnRng(state.seed, TURN_PLAN.length, salt);
  const noise = (rng() * 2 - 1) * VOTE_NOISE;
  return {
    won: sigmoid(logit + noise) >= 0.5,
    probability: sigmoid(logit),
    contributions,
    mobilization,
    mobilizationValue,
    opponentStrength,
  };
}

/** 整局累積變化，用來判斷玩家最常保護與最常犧牲的東西 */
export function totalDelta(state: GameState): Stats {
  const sum = zeroStats();
  for (const h of state.history) for (const k of ALL_STATS) sum[k] += h.delta[k];
  return sum;
}

/** 調整競選規模：從下一次開銷開始生效 */
export function setScale(state: GameState, scale: CampaignScale): GameState {
  return { ...state, scale };
}

/** 這一回合結束時要付競選規模開銷（競選期與任期尾聲），否則付任期中的服務處開銷 */
export function isCampaignTurn(turn: number): boolean {
  return UPKEEP_PHASES.includes(TURN_PLAN[turn]);
}

/** 下一次入帳還有幾回合，以及照目前數值估計的金額 */
export function nextPayout(state: GameState): { inTurns: number; estimate: number } {
  const inTurns = BIG_ROUND - (state.turn % BIG_ROUND);
  const p = payout(state.stats, state.income);
  return { inTurns, estimate: p.party + p.donations + p.small };
}

/** 對手的旗標：讓對手的招牌事件與「對手出招」事件只在遇到對應對手時出現 */
export function opponentFlags(o: Opponent): string[] {
  return [
    ...(o.legend ? [`opp-legend-${o.legend}`] : []),
    ...o.traits.map((t) => `opp-trait-${t}`),
    `opp-party-${o.party}`,
    ...(o.incumbent ? ["opp-incumbent"] : []),
  ];
}

/**
 * 第一次投票後決定連任選舉的對手：贏得不多（模型勝率 ≤ REMATCH_THRESHOLD），
 * 原本的對手捲土重來（更有準備）；贏很多就換一位新的挑戰者。
 */
function withSecondOpponent(state: GameState, probability: number): GameState {
  const first = state.opponent;
  const second = state.character.profile?.rivals?.second;
  if (!first || !second) return state;
  const rematch = probability <= REMATCH_THRESHOLD;
  const opponent: Opponent = rematch
    ? { ...first, incumbent: false, strength: first.strength - (first.incumbent ? OPPONENT_INCUMBENT_STRENGTH : 0) + REMATCH_STRENGTH }
    : second;
  const flags = [...state.flags.filter((f) => !f.startsWith("opp-")), ...opponentFlags(opponent), ...(rematch ? ["opp-rematch"] : [])];
  return { ...state, opponent, flags };
}
