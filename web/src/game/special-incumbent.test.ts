import { describe, expect, it } from "vitest";
import { ARCS, backgroundById, CRISES, EVENTS, PARTIES, partyById, specialSetup } from "@/content";
import { choose, chooseInterlude, currentEvent, interludeEvent, newGame } from "./engine";
import { VOTE_WEIGHTS } from "./model";
import { mulberry32 } from "./rng";
import { realityCheck, specialById, specialEnding } from "./special";
import type { GameState } from "./types";

const def = specialById("capital-2026-incumbent")!;
const own = EVENTS.filter((e) => e.special === def.id);

function play(seed: number, pick: (ids: string[], s: GameState, r: () => number) => string): GameState {
  let s = newGame(EVENTS, seed, partyById(def.party), backgroundById(def.background), specialSetup(def), {
    special: def.id,
    startDelta: def.startDelta,
    disabledCrises: def.disabledCrises,
  });
  const r = mulberry32(seed * 7 + 1);
  while (!s.finished) {
    const il = interludeEvent(s, EVENTS);
    if (il) {
      s = chooseInterlude(s, EVENTS, pick(il.options.map((o) => o.id), s, r), ARCS);
      continue;
    }
    const e = currentEvent(s, EVENTS)!;
    s = choose(s, EVENTS, pick(e.options.filter((o) => s.offered.includes(o.id)).map((o) => o.id), s, r), CRISES, PARTIES, ARCS, []);
  }
  return s;
}
const random = (ids: string[], _s: GameState, r: () => number) => ids[Math.floor(r() * ids.length)];
/** 照現實選；沒有現實對照的回合與插曲，選對選票最有利的（和平衡模擬的「現實路線」相同） */
const real = (ids: string[], s: GameState) => {
  const id = def.realChoices[s.pendingInterlude ?? s.deck[s.turn]];
  if (id && ids.includes(id)) return id;
  const e = EVENTS.find((x) => x.id === (s.pendingInterlude ?? s.deck[s.turn]))!;
  const score = (oid: string) =>
    Object.entries(e.options.find((o) => o.id === oid)!.effects).reduce((a, [k, v]) => a + (VOTE_WEIGHTS[k as keyof typeof VOTE_WEIGHTS] ?? 0) * (v as number), 0);
  return [...ids].sort((a, b) => score(b) - score(a))[0];
};

describe("特別篇：首都保衛戰（萬安守城）", () => {
  it("十二回合各有一個固定事件，依序出場，投票後結束", () => {
    for (let t = 1; t <= 12; t++) expect(own.filter((e) => e.specialTurn === t)).toHaveLength(1);
    const g = play(1, random);
    expect(g.finished).toBe(true);
    expect(g.history.map((h) => own.find((e) => e.id === h.eventId)?.specialTurn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("遊戲中途不出現真人姓名（只有結局頁的反思與來源可以）", () => {
    const names = /沈伯洋|蔣萬安|徐巧芯|蔡康永|韓國瑜|盧秀燕|侯友宜|卓榮泰|趙少康|邱議瑩|蔡詩萍|戴立安|鄭麗文|王開武|[沈蔣]稿機/;
    for (const e of own) {
      const text = [e.title, e.scenario, ...e.options.flatMap((o) => [o.label, o.outcome, o.delayed?.text ?? "", ...(o.variants ?? []).map((v) => v.outcome)])].join("\n");
      expect(text, e.id).not.toMatch(names);
    }
    expect([...def.intro, def.opponentIntro, def.opponent.name, def.voteNote].join("\n")).not.toMatch(names);
  });

  it("現實的選擇都對得到選項；照現實選，每一題都和現實一樣", () => {
    for (const [eventId, optionId] of Object.entries(def.realChoices)) {
      const e = own.find((x) => x.id === eventId);
      expect(e, eventId).toBeDefined();
      expect(e!.options.some((o) => o.id === optionId), `${eventId}/${optionId}`).toBe(true);
    }
    const g = play(3, real);
    const check = realityCheck(def, g, EVENTS, true);
    // 只對照這一局遇到的回合（替換事件與插曲不一定出現；插曲不列入對照）
    expect(check.rows.length).toBe(g.history.filter((h) => def.realChoices[h.eventId]).length);
    expect(check.rows.length).toBeGreaterThanOrEqual(8);
    expect(check.same).toBe(check.rows.length);
    expect(check.closing[1]).toBe("他的選擇裡，有哪些是你不會做的？");
  });

  it("每個選項的效果只動用顯示的數值與原則；架空以外的事件都有來源或標明待補", () => {
    const allowed = [...def.visibleStats, "integrity"];
    for (const e of own) {
      for (const o of e.options) {
        for (const k of Object.keys(o.effects)) expect(allowed, `${e.id}/${o.id}`).toContain(k);
        expect(o.funds).toBeUndefined();
      }
      if (e.fact !== "SIMULATION") expect(e.source.refs.length > 0 || /待補/.test(e.source.prototype), e.id).toBe(true);
    }
  });

  it("延伸插曲：第 9 回合選了搬樹枝，之後一定出現〈隔天的掃把〉，而且不佔插曲上限；沒選就不會出現", () => {
    const followUp = own.find((e) => e.interludeFollowUp)!;
    for (let seed = 1; seed <= 60; seed++) {
      const withIt = play(seed, (ids, s, r) => (s.deck[s.turn] === "sp-incumbent-09" ? "experience" : random(ids, s, r)));
      const ids = withIt.interludes!.map((i) => i.eventId);
      expect(ids, `seed ${seed}`).toContain(followUp.id);
      expect(ids.filter((id) => id !== followUp.id).length).toBeLessThanOrEqual(2);
      const without = play(seed, (ids, s, r) => (s.deck[s.turn] === "sp-incumbent-09" ? "eoc" : random(ids, s, r)));
      expect(without.interludes!.map((i) => i.eventId)).not.toContain(followUp.id);
    }
  });

  it("後日談依選擇變化：回響都對得到選項；不同選擇的同一種結局，內容不一樣", () => {
    for (const d of [def, specialById("capital-2026")!]) {
      for (const r of d.recaps) {
        const e = EVENTS.find((x) => x.id === r.eventId);
        expect(e, r.eventId).toBeDefined();
        expect(e!.options.some((o) => o.id === r.optionId), `${r.eventId}/${r.optionId}`).toBe(true);
      }
    }
    const byEnding = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 200; seed++) {
      const g = play(seed, random);
      const end = specialEnding(def, g, g.firstElection!.won, g.firstElection!.probability, EVENTS);
      if (!byEnding.has(end.title)) byEnding.set(end.title, new Set());
      byEnding.get(end.title)!.add(end.paragraphs.join("|"));
    }
    // 每一種結局都至少出現兩種不同的後日談
    for (const [title, texts] of byEnding) expect(texts.size, title).toBeGreaterThan(1);
  });

  it("結局：五種都遇得到", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const g = play(seed, seed % 2 ? random : real);
      seen.add(specialEnding(def, g, g.firstElection!.won, g.firstElection!.probability, EVENTS).title);
    }
    expect([...seen].sort()).toEqual(def.endings.map((e) => e.title).sort());
  });

  it("難度：照現實選會選成拉鋸，隨便選也多半守得住", () => {
    const N = 600;
    let randomWins = 0;
    let realWins = 0;
    for (let seed = 1; seed <= N; seed++) {
      if (play(seed, random).firstElection!.won) randomWins++;
      if (play(seed, real).firstElection!.won) realWins++;
    }
    expect(randomWins / N).toBeGreaterThan(0.45);
    expect(randomWins / N).toBeLessThan(0.75);
    expect(realWins / N).toBeGreaterThan(0.2);
    expect(realWins / N).toBeLessThan(randomWins / N);
  });
});
