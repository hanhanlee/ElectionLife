// 事件庫檢查：給 agent 與 CI 用，任何錯誤都應阻止上線。

import { TURN_PLAN } from "./engine";
import { ALL_STATS, SKILLS, type GameEvent, type Phase } from "./types";

/**
 * 要花競選經費的選項，文字必須看得出錢花在哪裡。
 * 程式無法真正理解語意，這裡用「明確的花費用語」判斷；新增花錢選項時，請讓選項文字包含其中之一。
 */
export const SPENDING_WORDS =
  /花錢|砸錢|出錢|自己花|撥出|撥一筆|經費|買|投放|廣告|租|包下|請律師|律師|專業選戰團隊|紅包|白包|香油錢|花籃|造勢|車隊|宣傳車|退還/;

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

    if (e.drawOptions) {
      if (e.options.length < e.drawOptions) errors.push(`${at}：選項池的選項少於 drawOptions`);
    } else if (e.options.length < 2 || e.options.length > 4) {
      errors.push(`${at}：選項數應為 2–4`);
    }
    const optIds = new Set<string>();
    for (const o of e.options) {
      if (optIds.has(o.id)) errors.push(`${at}：選項 id 重複 ${o.id}`);
      optIds.add(o.id);
      if (o.skill && !(SKILLS as readonly string[]).includes(o.skill)) errors.push(`${at}/${o.id}：未知能力 ${o.skill}`);
      if ((o.funds ?? 0) < 0 && !SPENDING_WORDS.test(o.label)) {
        errors.push(`${at}/${o.id}：要花經費 ${-o.funds!} 萬，但選項文字「${o.label}」看不出錢花在哪裡`);
      }
      for (const v of o.variants ?? []) {
        if (!v.outcome.trim()) errors.push(`${at}/${o.id}：資質變化缺少結果文字`);
      }
      const deltas = [
        o.effects,
        o.unlockCost,
        o.delayed?.effects,
        ...(o.variants ?? []).flatMap((v) => [v.effects, v.delayed?.effects]),
      ].filter(Boolean);
      for (const d of deltas) {
        for (const k of Object.keys(d!)) if (!statKeys.has(k)) errors.push(`${at}/${o.id}：未知數值 ${k}`);
      }
    }
    const free = e.options.filter((o) => !o.requires && !o.appearsIf && (o.funds ?? 0) >= 0 && !o.perk);
    if (free.length === 0) errors.push(`${at}：至少要有一個不需條件、不花經費、不動用公家資源的選項`);
    if (e.phase === "incumbency" && !e.options.some((o) => o.perk)) {
      errors.push(`${at}：現任限定事件至少要有一個動用現任資源（perk）的選項`);
    }
    if (e.phase === "incumbency" && e.options.every((o) => o.perk)) {
      errors.push(`${at}：現任限定事件要保留不動用資源的選項`);
    }

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

  for (const e of events.filter((e) => e.drawOptions)) {
    if (e.options.filter((o) => !o.appearsIf).length < e.drawOptions!) {
      errors.push(`事件 ${e.id}：不設條件的選項少於 drawOptions，部分角色可能抽不滿`);
    }
  }

  const need = new Map<Phase, number>();
  for (const p of TURN_PLAN) need.set(p, (need.get(p) ?? 0) + 1);
  for (const [phase, n] of need) {
    const have = events.filter((e) => e.phase === phase).length;
    if (have < n) errors.push(`${phase} 事件不足：需要 ${n}，目前 ${have}`);
  }
  return errors;
}
