import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARCS, backgroundById, CRISES, EVENTS, PARTIES, partyById, specialSetup } from "@/content";
import { choose, chooseInterlude, currentEvent, interludeEvent, lacksFunds, newGame } from "./engine";
import { mulberry32 } from "./rng";
import { fillSaid, SPECIALS } from "./special";
import type { GameState } from "./types";

const def = SPECIALS[0];
const own = EVENTS.filter((e) => e.special === def.id);

function play(seed: number, branch = false, pick?: (ids: string[], r: () => number) => string): GameState {
  let s = newGame(EVENTS, seed, partyById(def.party), backgroundById(def.background), specialSetup(def), {
    special: def.id,
    specialBranch: branch,
    startDelta: def.startDelta,
  });
  const r = mulberry32(seed * 7 + 1);
  const choosePick = pick ?? ((ids: string[]) => ids[Math.floor(r() * ids.length)]);
  while (!s.finished) {
    const il = interludeEvent(s, EVENTS);
    if (il) {
      s = chooseInterlude(s, EVENTS, choosePick(il.options.filter((o) => !lacksFunds(s, o)).map((o) => o.id), r), ARCS);
      continue;
    }
    const e = currentEvent(s, EVENTS)!;
    const ids = e.options.filter((o) => s.offered.includes(o.id) && !lacksFunds(s, o)).map((o) => o.id);
    s = choose(s, EVENTS, choosePick(ids, r), CRISES, PARTIES, ARCS, []);
  }
  return s;
}

describe("特別篇：首都逆轉戰", () => {
  it("十二回合都有固定事件，第一局依序出場，投票後結束", () => {
    for (let t = 1; t <= 12; t++) expect(own.filter((e) => e.specialTurn === t)).toHaveLength(1);
    const g = play(1);
    expect(g.finished).toBe(true);
    expect(g.firstElection).toBeDefined();
    // 第一局：每一回合是該回合的固定事件，或引用玩家舊話的翻舊帳卡
    g.history.forEach((h, i) => {
      const e = EVENTS.find((x) => x.id === h.eventId)!;
      expect(e.specialTurn === i + 1 || (e.specialCallback && e.specialSlots?.includes(i + 1)), e.id).toBe(true);
    });
    expect(g.history).toHaveLength(12);
  });

  it("一般局抽不到特別篇的事件", () => {
    for (const e of own) expect(e.conditions?.flags).toContain(`special-${def.id}`);
  });

  it("替換只發生在第 4、6、7、8、10 回合，每局最多 3 次；第一局只會出現翻舊帳卡", () => {
    const swapped = new Set<number>();
    for (let seed = 1; seed <= 400; seed++) {
      for (const branch of [false, true]) {
        const g = play(seed, branch);
        let n = 0;
        g.history.forEach((h, i) => {
          const e = EVENTS.find((x) => x.id === h.eventId)!;
          if (e.specialTurn !== i + 1) {
            expect(e.specialSlots).toContain(i + 1);
            if (!branch) expect(e.specialCallback, e.id).toBe(true);
            swapped.add(i + 1);
            n++;
          }
        });
        expect(n).toBeLessThanOrEqual(3);
      }
    }
    expect([...swapped].sort((a, b) => a - b)).toEqual([4, 6, 7, 8, 10]);
  });

  it("翻舊帳只引用玩家真的選過的話", () => {
    for (const e of own) {
      for (const [, flag] of e.scenario.matchAll(/\{said:([\w-]+)\}/g)) {
        expect(e.conditions?.flags, `${e.id} 引用 ${flag}，但出場條件沒有要求這個旗標`).toContain(flag);
      }
    }
    const g = play(3);
    const typhoon = EVENTS.find((e) => e.id === "sp-capital-08")!.options.find((o) => o.id === "decouple")!;
    const said = { ...g, history: [...g.history.slice(0, 7), { ...g.history[7], eventId: "sp-capital-08", optionId: "decouple" }] };
    expect(fillSaid("{said:sp-typhoon}", said, EVENTS)).toContain(typhoon.label.slice(0, 8));
    expect(fillSaid("{said:sp-typhoon}", { ...g, history: [] }, EVENTS)).toBe("之前說過的話");
  });

  it("插曲每局最多 2 張、黑天鵝最多 1 張，同一個種子結果相同", () => {
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = play(seed);
      const kinds = g.interludes!.map((i) => EVENTS.find((e) => e.id === i.eventId)!.interlude);
      expect(kinds.length).toBeLessThanOrEqual(2);
      expect(kinds.filter((k) => k === "wildcard").length).toBeLessThanOrEqual(1);
      total += kinds.length;
    }
    expect(total).toBeGreaterThan(0);
    expect(play(42, true)).toEqual(play(42, true));
  });

  it("20 張命運插曲加上颱風舊帳都載入了，而且每一張都遇得到", () => {
    const cards = own.filter((e) => e.interlude);
    expect(cards.filter((e) => /-f\d+$/.test(e.id))).toHaveLength(20);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 3000; seed++) for (const i of play(seed, seed % 2 === 0).interludes!) seen.add(i.eventId);
    expect(cards.filter((c) => !seen.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  it("每個設定的旗標都有後續作用（事件條件、選項變化或結局）", () => {
    const set = new Set(own.flatMap((e) => e.options.flatMap((o) => o.setFlags ?? [])));
    const used = JSON.stringify(own.map((e) => [e.conditions, e.options.map((o) => [o.appearsIf, o.variants?.map((v) => v.when)])]));
    const endings = readFileSync(new URL("./special.ts", import.meta.url), "utf-8");
    for (const f of set) expect(used.includes(`"${f}"`) || endings.includes(`"${f}"`), f).toBe(true);
  });

  it("每個事件都標了資料分級；事實與某方說法都附來源", () => {
    for (const e of own) {
      expect(e.fact, e.id).toBeDefined();
      if (e.fact !== "SIMULATION") expect(e.source.refs.length, e.id).toBeGreaterThan(0);
    }
  });

  it("難度：隨便選很難翻盤，但不是必敗", () => {
    let wins = 0;
    const N = 600;
    for (let seed = 1; seed <= N; seed++) if (play(seed).firstElection!.won) wins++;
    expect(wins / N).toBeGreaterThan(0.03);
    expect(wins / N).toBeLessThan(0.25);
  });
});

describe("特別篇的替換事件都遇得到", () => {
  it("每個替換事件與翻舊帳卡，在隨機遊玩中至少出現一次", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 3000; seed++) for (const h of play(seed, seed % 3 !== 0).history) seen.add(h.eventId);
    const pool = own.filter((e) => e.specialSlots).map((e) => e.id);
    expect(pool.filter((id) => !seen.has(id))).toEqual([]);
  });
});
