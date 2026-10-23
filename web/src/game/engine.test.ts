import { describe, expect, it } from "vitest";
import { EVENTS } from "@/content";
import { choose, currentEvent, newGame, optionAvailability, TURN_PLAN } from "./engine";
import { summarize } from "./endings";
import { mulberry32 } from "./rng";
import { validateEvents } from "./validate";
import type { GameState } from "./types";

/** 用隨機策略玩完一局 */
function playRandom(seed: number, pickSeed = seed): GameState {
  const rand = mulberry32(pickSeed);
  let s = newGame(EVENTS, seed);
  while (!s.finished) {
    const e = currentEvent(s, EVENTS)!;
    const open = e.options.filter((o) => optionAvailability(s, o) !== "locked");
    s = choose(s, EVENTS, open[Math.floor(rand() * open.length)].id);
  }
  return s;
}

describe("事件庫", () => {
  it("通過開發模式檢查", () => {
    expect(validateEvents(EVENTS)).toEqual([]);
  });

  it("上線模式會擋下未查核事件", () => {
    expect(validateEvents(EVENTS, { release: true }).length).toBeGreaterThan(0);
  });
});

describe("回合引擎", () => {
  it("一局剛好 12 回合，且事件不重複", () => {
    const s = playRandom(1);
    expect(s.history).toHaveLength(TURN_PLAN.length);
    expect(new Set(s.deck).size).toBe(s.deck.length);
    s.history.forEach((h, i) => {
      expect(EVENTS.find((e) => e.id === h.eventId)!.phase).toBe(TURN_PLAN[i]);
    });
  });

  it("同一個 seed 與選擇可重現", () => {
    expect(playRandom(42)).toEqual(playRandom(42));
    expect(summarize(playRandom(42))).toEqual(summarize(playRandom(42)));
  });

  it("數值維持在 0–100", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const v of Object.values(playRandom(seed).stats)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("條件事件只在對應承諾後出現", () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = playRandom(seed);
      if (s.deck.includes("t-housing-progress")) expect(s.flags).toContain("promise-housing-big");
      if (s.deck.includes("t-cash-due")) expect(s.flags).toContain("promise-cash");
    }
  });

  it("延遲後果在任期內到期會結算，超出任期則留給下一任", () => {
    const s = playRandom(7);
    for (const p of s.pending) expect(p.dueTurn).toBeGreaterThanOrEqual(TURN_PLAN.length);
  });

  it("結束後不能再選", () => {
    const s = playRandom(3);
    expect(() => choose(s, EVENTS, "any")).toThrow();
  });
});

describe("平衡（隨機策略）", () => {
  it("連任率不會一面倒", () => {
    let wins = 0;
    const n = 500;
    for (let seed = 0; seed < n; seed++) if (summarize(playRandom(seed)).election.won) wins++;
    const rate = wins / n;
    console.log(`隨機策略連任率：${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.85);
  });
});
