// 劇情鏈（Story Arc）與政治帳本：讓一個決定在之後的回合回來找你。
//
// 一條劇情由選項開啟（例如收下建商的支票），之後依節點在指定階段出場（例如任期中的「金主的請託」）。
// 節點事件只由劇情排程安排，不會被隨機抽到；到期沒排上議程的節點，以快報結算並記入帳本，不會無聲消失。
// 所有函式都是純函式，同一個 seed 與同一串選擇會得到同一本帳本。

import { ARC_QUOTA_STAGE2 } from "./model";
import type { ArcDef, ArcEffect, ArcState, ArcStatus, GameEvent, GameState, Notice, Phase } from "./types";

/** 第二階段中算進「主要劇情回合」配額的階段（連任選戰另計，只會出場一個節點） */
const QUOTA_PHASES: Phase[] = ["term", "incumbency"];

/** 多條劇情同時到期時，越需要處理的越先出場 */
const URGENCY: Record<ArcStatus, number> = { concealed: 0, broken: 1, active: 2, exposed: 3, fulfilled: 4 };

const defOf = (defs: ArcDef[], id: string) => defs.find((d) => d.id === id);

/** 略過不符合目前狀態的分支節點 */
function skipBranches(a: ArcState, def: ArcDef): ArcState {
  let node = a.node;
  while (node < def.nodes.length && def.nodes[node].when && !def.nodes[node].when!.includes(a.status)) node++;
  return node === a.node ? a : { ...a, node };
}

/** 套用選項對劇情的影響：開啟劇情、更新事實與狀態，並寫進帳本 */
export function applyArcEffects(
  arcs: Record<string, ArcState>,
  effects: ArcEffect[] | undefined,
  turn: number,
  defs: ArcDef[],
): { arcs: Record<string, ArcState>; notices: Notice[] } {
  if (!effects?.length) return { arcs, notices: [] };
  const next = { ...arcs };
  const notices: Notice[] = [];
  for (const e of effects) {
    const def = defOf(defs, e.id);
    if (!def) continue;
    let a = next[e.id];
    if (!a) {
      if (!e.open) continue;
      a = { id: e.id, status: "active", openedTurn: turn, node: 0, nextTurn: turn + 1 + (def.nodes[0]?.delay ?? 0), facts: {}, log: [] };
      notices.push({ kind: "story", tone: "bad", text: `記入政治帳本：${def.title}` });
    }
    const facts = { ...a.facts };
    for (const [k, v] of Object.entries(e.set ?? {})) facts[k] = typeof v === "number" ? v : (facts[v] ?? 0);
    for (const [k, v] of Object.entries(e.add ?? {})) facts[k] = (facts[k] ?? 0) + v;
    const status = e.status ?? a.status;
    if (status === "exposed" && a.status !== "exposed") {
      notices.push({ kind: "story", tone: "bad", text: `${def.title}：事情曝光了。` });
    }
    // 分支在推進節點時才略過（advanceArc），避免把正在出場的節點也跳過
    next[e.id] = { ...a, facts, status, log: [...a.log, { turn, text: e.note }] };
  }
  return { arcs: next, notices };
}

/** 劇情節點事件出場後，推進到下一個節點 */
export function advanceArc(arcs: Record<string, ArcState>, event: GameEvent, turn: number, defs: ArcDef[]) {
  if (!event.arc || !arcs[event.arc]) return arcs;
  const def = defOf(defs, event.arc)!;
  const a = arcs[event.arc];
  const moved = skipBranches({ ...a, node: a.node + 1 }, def);
  const delay = def.nodes[moved.node]?.delay ?? 0;
  return { ...arcs, [event.arc]: { ...moved, nextTurn: turn + 1 + delay } };
}

/**
 * 結算過期的節點：節點的階段在接下來的回合裡已經不會出現（或最早出場回合已超過該階段），
 * 就以快報結算、寫進帳本，再看下一個節點。
 */
export function expireArcs(
  arcs: Record<string, ArcState>,
  nextTurn: number,
  turnPlan: Phase[],
  defs: ArcDef[],
): { arcs: Record<string, ArcState>; notices: Notice[] } {
  const notices: Notice[] = [];
  const next = { ...arcs };
  for (const id of Object.keys(next)) {
    const def = defOf(defs, id);
    if (!def) continue;
    let a = skipBranches(next[id], def);
    while (a.node < def.nodes.length) {
      const node = def.nodes[a.node];
      const lastTurn = turnPlan.lastIndexOf(node.phase);
      if (lastTurn >= Math.max(nextTurn, a.nextTurn)) break;
      notices.push({ kind: "story", tone: "bad", title: def.title, text: node.missed });
      a = skipBranches({ ...a, node: a.node + 1, log: [...a.log, { turn: nextTurn - 1, text: node.missed }] }, def);
    }
    next[id] = a;
  }
  return { arcs: next, notices };
}

/** 劇情狀態轉成旗標，讓事件與選項可以用既有的條件語法判斷 */
export function withArcFlags(flags: string[], arcs: Record<string, ArcState>, defs: ArcDef[]): string[] {
  const base = flags.filter((f) => !f.startsWith("arc-"));
  for (const a of Object.values(arcs)) {
    base.push(`arc-${a.id}`, `arc-${a.id}-${a.status}`);
    const goal = defOf(defs, a.id)?.goal;
    if (goal && (a.facts[goal.value] ?? 0) >= (a.facts[goal.target] ?? 0)) base.push(`arc-${a.id}-met`);
  }
  return base;
}

/** 第二階段已經用掉的主要劇情回合 */
function quotaUsed(state: GameState, events: GameEvent[], turnPlan: Phase[]): number {
  return state.deck.filter((id, turn) => QUOTA_PHASES.includes(turnPlan[turn]) && events.find((e) => e.id === id)?.arc).length;
}

/** 這一回合到期、應該優先出場的劇情節點事件 */
export function dueArcEvent(
  state: GameState,
  events: GameEvent[],
  turn: number,
  turnPlan: Phase[],
  defs: ArcDef[],
): GameEvent | undefined {
  const phase = turnPlan[turn];
  if (QUOTA_PHASES.includes(phase) && quotaUsed(state, events, turnPlan) >= ARC_QUOTA_STAGE2) return undefined;
  const due = Object.values(state.arcs)
    .map((a) => {
      const def = defOf(defs, a.id);
      return { a, node: def ? def.nodes[skipBranches(a, def).node] : undefined };
    })
    .filter(({ a, node }) => node && node.phase === phase && turn >= a.nextTurn && !state.deck.includes(node.event))
    .sort((x, y) => URGENCY[x.a.status] - URGENCY[y.a.status] || x.a.openedTurn - y.a.openedTurn);
  const pick = due[0];
  return pick ? events.find((e) => e.id === pick.node!.event) : undefined;
}

/** 把文字裡的 {劇情.事實} 換成目前的數字，例如「承諾 {housing.promised} 戶」 */
export function fillArcText(text: string, arcs: Record<string, ArcState>): string {
  return text.replace(/\{(\w+)\.(\w+)\}/g, (_, id: string, fact: string) =>
    (arcs[id]?.facts[fact] ?? 0).toLocaleString(),
  );
}

/** 帳本進度說明：把 {事實} 換成數字 */
export function arcProgress(def: ArcDef, a: ArcState): string {
  return def.progress.replace(/\{(\w+)\}/g, (_, fact: string) => (a.facts[fact] ?? 0).toLocaleString());
}

/** 還有後續、需要玩家留意的劇情（帳本上的「待處理」） */
export function openArcs(state: GameState, defs: ArcDef[]): ArcState[] {
  return Object.values(state.arcs).filter((a) => {
    const def = defOf(defs, a.id);
    return def && (a.status === "active" || a.status === "concealed") && a.node < def.nodes.length;
  });
}
