// 事件庫檢查：給 agent 與 CI 用，任何錯誤都應阻止上線。

import { TURN_PLAN } from "./engine";
import { ALL_STATS, ISSUES, SKILLS, type ArcDef, type FateCard, type FateEffect, type GameEvent, type Phase } from "./types";

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

/** 第一階段（競選期）的事件階段 */
const CAMPAIGN_PHASES: Phase[] = ["launch", "platform", "campaign", "eve"];

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
    } else if (e.options.length < 2 || e.options.length > (e.options.some((o) => o.appearsIf) ? 6 : 4)) {
      errors.push(`${at}：選項數應為 2–4`);
    }
    const optIds = new Set<string>();
    for (const o of e.options) {
      if (optIds.has(o.id)) errors.push(`${at}：選項 id 重複 ${o.id}`);
      optIds.add(o.id);
      if (o.skill && !(SKILLS as readonly string[]).includes(o.skill)) errors.push(`${at}/${o.id}：未知能力 ${o.skill}`);
      // 競選期只是提出政策與承諾：挑戰者還沒執政，施政成果與市庫要當選後才變（onElected）
      const incumbentOnly = [e.conditions?.flags, o.appearsIf?.flags].some((f) => f?.includes("bg-incumbent"));
      if (CAMPAIGN_PHASES.includes(e.phase) && !o.perk && !incumbentOnly) {
        for (const k of ["achievement", "treasury"] as const) {
          if (o.effects[k]) errors.push(`${at}/${o.id}：競選期的選項不能直接改「${k}」，請改用 onElected（當選後才兌現）`);
        }
      }
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
    if (e.phase === "incumbency" && !e.arc && !e.options.some((o) => o.perk)) {
      errors.push(`${at}：現任限定事件至少要有一個動用現任資源（perk）的選項`);
    }
    if (e.phase === "incumbency" && e.options.every((o) => o.perk)) {
      errors.push(`${at}：現任限定事件要保留不動用資源的選項`);
    }

    const src = e.source;
    if (src.status === "real" && !src.realCase?.trim()) errors.push(`${at}：改編自真實事件，但沒有記錄原型（realCase）`);
    if ((src.status === "draft" || src.status === "verified") && src.refs.length === 0) {
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

/** 劇情鏈檢查：節點事件存在且指回同一條劇情、選項引用的劇情存在、每個劇情節點事件都有劇情收留 */
export function validateArcs(arcs: ArcDef[], events: GameEvent[]): string[] {
  const errors: string[] = [];
  const arcIds = new Set(arcs.map((a) => a.id));
  for (const a of arcs) {
    if (a.nodes.length === 0) errors.push(`劇情 ${a.id}：沒有節點`);
    for (const n of a.nodes) {
      const e = events.find((x) => x.id === n.event);
      if (!e) errors.push(`劇情 ${a.id}：節點事件 ${n.event} 不存在`);
      else {
        if (e.arc !== a.id) errors.push(`劇情 ${a.id}：事件 ${n.event} 的 arc 欄位不是 ${a.id}`);
        if (e.phase !== n.phase) errors.push(`劇情 ${a.id}：事件 ${n.event} 的階段 ${e.phase} 與節點 ${n.phase} 不同`);
      }
    }
    for (const s of ["active", "fulfilled", "broken", "concealed", "exposed"] as const) {
      if (!a.statusLabels[s]) errors.push(`劇情 ${a.id}：缺少狀態文字 ${s}`);
    }
    if (!a.epilogue.lost?.length) errors.push(`劇情 ${a.id}：缺少落選時的後日談`);
  }
  for (const e of events) {
    if (e.arc && !arcs.some((a) => a.nodes.some((n) => n.event === e.id))) errors.push(`事件 ${e.id}：標記為劇情 ${e.arc} 但不是任何節點`);
    for (const o of e.options) {
      for (const eff of o.arcs ?? []) if (!arcIds.has(eff.id)) errors.push(`事件 ${e.id}／${o.id}：劇情 ${eff.id} 不存在`);
    }
  }
  return errors;
}

/** 命運牌檢查：效果完整、引用的能力／議題／劇情存在、牌面提示不寫數字、每個階段都湊得出三張不同類型 */
export function validateFates(cards: FateCard[], arcs: ArcDef[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const arcIds = new Set(arcs.map((a) => a.id));
  const checkEffect = (id: string, e: FateEffect | undefined, what: string) => {
    if (!e) return errors.push(`命運 ${id}：缺少${what}`);
    if (!e.text || (Array.isArray(e.text) && !e.text.length)) errors.push(`命運 ${id}：${what}沒有結果文字`);
    for (const s of e.boost?.skills ?? []) if (!(SKILLS as readonly string[]).includes(s)) errors.push(`命運 ${id}：能力 ${s} 不存在`);
    for (const i of e.boost?.issues ?? []) if (!(ISSUES as readonly string[]).includes(i)) errors.push(`命運 ${id}：議題 ${i} 不存在`);
    for (const a of e.arcs ?? []) if (!arcIds.has(a.id)) errors.push(`命運 ${id}：劇情 ${a.id} 不存在`);
  };
  for (const c of cards) {
    if (ids.has(c.id)) errors.push(`命運 ${c.id}：id 重複`);
    ids.add(c.id);
    if (!c.stages.length) errors.push(`命運 ${c.id}：沒有指定階段`);
    if (/[0-9０-９]/.test(c.hint)) errors.push(`命運 ${c.id}：牌面提示不寫數字`);
    if (c.kind === "ordeal") {
      if (!c.ordeal) errors.push(`命運 ${c.id}：試煉缺少成功與失敗`);
      else {
        checkEffect(c.id, c.ordeal.success, "成功結果");
        checkEffect(c.id, c.ordeal.failure, "失敗結果");
      }
    } else checkEffect(c.id, c.effect, "效果");
    // 選戰期的牌：挑戰者還沒執政，不能直接改施政成果與市庫
    if (c.stages.includes("campaign")) {
      const effects = [c.effect, c.ordeal?.success, c.ordeal?.failure].map((e) => e?.effects ?? {});
      for (const k of ["achievement", "treasury"] as const) {
        if (effects.some((e) => e[k])) errors.push(`命運 ${c.id}：選戰期可抽到的牌不能直接改「${k}」`);
      }
    }
  }
  for (const stage of ["campaign", "term"] as const) {
    const pool = cards.filter((c) => c.stages.includes(stage) && !c.conditions);
    for (const kind of ["opportunity", "contract", "ordeal"] as const) {
      if (pool.filter((c) => c.kind === kind).length < 3) errors.push(`命運：${stage} 階段沒有條件限制的 ${kind} 少於 3 張`);
    }
  }
  return errors;
}
