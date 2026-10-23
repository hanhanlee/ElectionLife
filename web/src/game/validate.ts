// 事件庫檢查：給 agent 與 CI 用，任何錯誤都應阻止上線。

import { TURN_PLAN } from "./engine";
import { ALL_STATS, type GameEvent, type Phase } from "./types";

export interface ValidationOptions {
  /** 上線模式：所有事件都必須是人工查核過的 verified */
  release?: boolean;
}

export function validateEvents(events: GameEvent[], opts: ValidationOptions = {}): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const statKeys = new Set<string>(ALL_STATS);

  for (const e of events) {
    const at = `事件 ${e.id}`;
    if (ids.has(e.id)) errors.push(`${at}：id 重複`);
    ids.add(e.id);

    if (e.options.length < 2 || e.options.length > 4) errors.push(`${at}：選項數應為 2–4`);
    const optIds = new Set<string>();
    for (const o of e.options) {
      if (optIds.has(o.id)) errors.push(`${at}：選項 id 重複 ${o.id}`);
      optIds.add(o.id);
      const deltas = [o.effects, o.unlockCost, o.delayed?.effects].filter(Boolean);
      for (const d of deltas) {
        for (const k of Object.keys(d!)) if (!statKeys.has(k)) errors.push(`${at}/${o.id}：未知數值 ${k}`);
      }
    }
    if (!e.options.some((o) => !o.requires)) errors.push(`${at}：至少要有一個不需條件的選項`);

    const src = e.source;
    if (src.status !== "placeholder" && src.refs.length === 0) {
      errors.push(`${at}：非 placeholder 事件必須附來源`);
    }
    for (const r of src.refs) {
      if (!/^https?:\/\//.test(r.url)) errors.push(`${at}：來源網址無效 ${r.url}`);
      if (!r.quote.trim()) errors.push(`${at}：來源缺少原文摘錄`);
    }
    if (src.status === "verified" && (!src.reviewedBy || !src.reviewedAt)) {
      errors.push(`${at}：verified 事件須記錄查核者與日期`);
    }
    if (opts.release && src.status !== "verified") errors.push(`${at}：尚未完成人工查核`);
  }

  const need = new Map<Phase, number>();
  for (const p of TURN_PLAN) need.set(p, (need.get(p) ?? 0) + 1);
  for (const [phase, n] of need) {
    const have = events.filter((e) => e.phase === phase).length;
    if (have < n) errors.push(`${phase} 事件不足：需要 ${n}，目前 ${have}`);
  }
  return errors;
}
