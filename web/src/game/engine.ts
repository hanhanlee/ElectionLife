// 回合引擎：純函式，不碰 DOM 與儲存，方便測試與重現。

import { mulberry32 } from "./rng";
import { START_STATS, VOTE_BIAS, VOTE_NOISE, VOTE_WEIGHTS } from "./model";
import {
  ALL_STATS,
  type Condition,
  type GameEvent,
  type GameOption,
  type GameState,
  type Phase,
  type StatDelta,
  type StatKey,
  type Stats,
} from "./types";

export const STATE_VERSION = 1;

/** 12 回合：2 競選、9 任期、1 連任選戰 */
export const TURN_PLAN: Phase[] = [
  "campaign",
  "campaign",
  ...Array<Phase>(9).fill("term"),
  "reelection",
];

const clamp = (n: number) => Math.max(0, Math.min(100, n));

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

export function meetsCondition(state: GameState, cond?: Condition): boolean {
  if (!cond) return true;
  if (cond.flags?.some((f) => !state.flags.includes(f))) return false;
  if (cond.notFlags?.some((f) => state.flags.includes(f))) return false;
  for (const k of ALL_STATS) {
    if (cond.min?.[k] !== undefined && state.stats[k] < cond.min[k]!) return false;
    if (cond.max?.[k] !== undefined && state.stats[k] > cond.max[k]!) return false;
  }
  return true;
}

export type Availability = "open" | "unlockable" | "locked";

export function optionAvailability(state: GameState, option: GameOption): Availability {
  if (meetsCondition(state, option.requires)) return "open";
  return option.unlockCost ? "unlockable" : "locked";
}

function turnRng(seed: number, turn: number, salt = 0) {
  return mulberry32((seed ^ Math.imul(turn + 1, 0x9e3779b9) ^ salt) >>> 0);
}

function drawEvent(state: GameState, events: GameEvent[], turn: number): string {
  const phase = TURN_PLAN[turn];
  const unused = events.filter((e) => e.phase === phase && !state.deck.includes(e.id));
  const eligible = unused.filter((e) => meetsCondition(state, e.conditions));
  const pool = eligible.length > 0 ? eligible : unused;
  if (pool.length === 0) throw new Error(`事件池不足：phase=${phase}, turn=${turn}`);

  const total = pool.reduce((s, e) => s + (e.weight ?? 1), 0);
  let r = turnRng(state.seed, turn)() * total;
  for (const e of pool) {
    r -= e.weight ?? 1;
    if (r < 0) return e.id;
  }
  return pool[pool.length - 1].id;
}

export function newGame(events: GameEvent[], seed: number): GameState {
  const base: GameState = {
    version: STATE_VERSION,
    seed,
    turn: 0,
    stats: { ...START_STATS },
    flags: [],
    deck: [],
    history: [],
    pending: [],
    notices: [],
    finished: false,
  };
  return { ...base, deck: [drawEvent(base, events, 0)] };
}

export function currentEvent(state: GameState, events: GameEvent[]): GameEvent | undefined {
  if (state.finished) return undefined;
  return events.find((e) => e.id === state.deck[state.turn]);
}

export function choose(state: GameState, events: GameEvent[], optionId: string): GameState {
  const event = currentEvent(state, events);
  if (!event) throw new Error("遊戲已結束或事件不存在");
  const option = event.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`選項不存在：${optionId}`);

  const availability = optionAvailability(state, option);
  if (availability === "locked") throw new Error(`選項未解鎖：${optionId}`);

  let stats = state.stats;
  if (availability === "unlockable") stats = addDelta(stats, option.unlockCost!);
  stats = addDelta(stats, option.effects);

  const flags = [...new Set([...state.flags, ...(option.setFlags ?? [])])];
  const turn = state.turn + 1;

  let pending = [...state.pending];
  if (option.delayed) {
    pending.push({ ...option.delayed, dueTurn: turn + option.delayed.afterTurns, fromEventId: event.id });
  }

  // 結算到期的延遲後果
  const notices: string[] = [];
  for (const p of pending.filter((p) => p.dueTurn <= turn && turn < TURN_PLAN.length)) {
    stats = addDelta(stats, p.effects);
    notices.push(p.text);
  }
  pending = pending.filter((p) => !(p.dueTurn <= turn && turn < TURN_PLAN.length));

  const delta = zeroStats();
  for (const k of ALL_STATS) delta[k] = stats[k] - state.stats[k];

  const next: GameState = {
    ...state,
    turn,
    stats,
    flags,
    pending,
    notices,
    history: [...state.history, { turn: state.turn, eventId: event.id, optionId, delta }],
  };

  if (turn >= TURN_PLAN.length) return { ...next, finished: true };
  return { ...next, deck: [...state.deck, drawEvent(next, events, turn)] };
}

export interface ElectionResult {
  won: boolean;
  probability: number;
  /** 各數值對得票的貢獻（logit），由大到小 */
  contributions: { stat: StatKey; value: number }[];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function runElection(state: GameState): ElectionResult {
  const contributions = ALL_STATS.map((stat) => ({
    stat,
    value: (VOTE_WEIGHTS[stat] * (state.stats[stat] - 50)) / 10,
  })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const logit = VOTE_BIAS + contributions.reduce((s, c) => s + c.value, 0);
  const rng = turnRng(state.seed, TURN_PLAN.length, 0xe1ec);
  const noise = (rng() * 2 - 1) * VOTE_NOISE;
  return {
    won: sigmoid(logit + noise) >= 0.5,
    probability: sigmoid(logit),
    contributions,
  };
}

/** 整局累積變化，用來判斷玩家最常保護與最常犧牲的東西 */
export function totalDelta(state: GameState): Stats {
  const sum = zeroStats();
  for (const h of state.history) for (const k of ALL_STATS) sum[k] += h.delta[k];
  return sum;
}
