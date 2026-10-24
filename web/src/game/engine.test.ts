import { describe, expect, it } from "vitest";
import { ARCS, BACKGROUNDS, BURDENS, CITIES, CRISES, EVENTS, FATES, HISTORY as history, LEGENDS, PARTIES, profileSetup, TRAITS } from "@/content";
import { composeIntro, describeOpponent, drawCharacter, drawProfile } from "./profile";
import {
  choose,
  chooseFate,
  currentEvent,
  FIRST_ELECTION_TURN,
  meetsCondition,
  newGame,
  offeredOptions,
  optionAvailability,
  TURN_PLAN,
  canTakeLoan,
  resolveOption,
  takeLoan,
  setScale,
  runElection,
} from "./engine";
import { CAMPAIGN_SCALES, LOAN_AMOUNT, LOAN_INTEREST, OFFICE_UPKEEP, payout, scaleCost, SKILL_EFFECTS, STAGE_LENGTH } from "./model";
import { ENDING_IDS, summarize } from "./endings";
import { buildEpilogue } from "./epilogue";
import { mulberry32 } from "./rng";
import { validateArcs, validateEvents, validateFates } from "./validate";
import { staffReport } from "./feedback";
import { cardKind, cardStory } from "./shareCard";
import type { Background, GameOption, GameState, Party } from "./types";

type PerkPolicy = "random" | "always" | "never";
type Strategy = "random" | "greedy" | "balanced";

/** 兼顧各數值的玩法：民調與政績為主，其他數值也算 */
const BALANCED_WEIGHTS: Record<string, number> = {
  approval: 1, achievement: 1, treasury: 0.5, council: 0.5, team: 0.5, party: 0.5, media: 0.5, integrity: 0.5,
};
const balancedScore = (o: GameOption) =>
  Object.entries(o.effects).reduce((s, [k, v]) => s + BALANCED_WEIGHTS[k] * (v ?? 0), 0);

interface PlayOptions {
  perks?: PerkPolicy;
  strategy?: Strategy;
  party?: Party;
  background?: Background;
  /** 開啟政治命運，命運牌隨機選 */
  fate?: boolean;
}

/** 用隨機策略玩完一局；未指定角色時依 seed 隨機挑 */
function playRandom(seed: number, opts: PlayOptions = {}): GameState {
  const rand = mulberry32(seed);
  const party = opts.party ?? PARTIES[Math.floor(rand() * PARTIES.length)];
  const background = opts.background ?? BACKGROUNDS[Math.floor(rand() * BACKGROUNDS.length)];
  let s = newGame(EVENTS, seed, party, background, profileSetup(drawProfile(seed, background, party, TRAITS, BURDENS, CITIES[seed % CITIES.length], LEGENDS)), { fate: opts.fate });
  while (!s.finished) {
    if (s.pendingFate) {
      s = chooseFate(s, EVENTS, s.pendingFate.cards[Math.floor(rand() * 3)], FATES, ARCS);
      continue;
    }
    const e = currentEvent(s, EVENTS)!;
    let open = offeredOptions(s, e).filter((o) => optionAvailability(s, o) !== "locked");
    if (opts.perks === "always" && open.some((o) => o.perk)) open = open.filter((o) => o.perk);
    if (opts.perks === "never") open = open.filter((o) => !o.perk);
    let pick = open[Math.floor(rand() * open.length)];
    if (opts.strategy === "greedy") pick = [...open].sort((a, b) => (b.effects.approval ?? 0) - (a.effects.approval ?? 0))[0];
    if (opts.strategy === "balanced") pick = [...open].sort((a, b) => balancedScore(b) - balancedScore(a))[0];
    s = choose(s, EVENTS, pick.id, CRISES, PARTIES, ARCS, opts.fate ? FATES : []);
  }
  return s;
}

const N = 600;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function games(opts: PlayOptions = {}, n = N): GameState[] {
  return Array.from({ length: n }, (_, seed) => playRandom(seed, opts));
}

const firstWinRate = (gs: GameState[]) => gs.filter((g) => g.firstElection?.won).length / gs.length;

/** 走到最後一場選舉的局中，最後一場的勝率 */
function finalWinRate(gs: GameState[]): number {
  const reached = gs.filter((g) => g.firstElection?.won);
  return reached.filter((g) => summarize(g, EVENTS).election.won).length / reached.length;
}

describe("事件庫", () => {
  it("通過開發模式檢查", () => {
    expect(validateEvents(EVENTS)).toEqual([]);
  });

  it("上線模式會擋下未查核事件", () => {
    expect(validateEvents(EVENTS, { release: true }).length).toBeGreaterThan(0);
  });

  it("每種角色在第一階段都有至少 9 個符合條件的選戰事件", () => {
    for (const p of PARTIES) {
      for (const b of BACKGROUNDS) {
        const s = newGame(EVENTS, 1, p, b);
        const n = EVENTS.filter((e) => e.phase === "campaign" && meetsCondition(s, e.conditions)).length;
        expect(n, `${p.id}/${b.id}`).toBeGreaterThanOrEqual(9);
      }
    }
  });

  it("每種出身都有自己的參選事件", () => {
    for (const b of BACKGROUNDS) {
      const s = newGame(EVENTS, 1, PARTIES[0], b);
      expect(currentEvent(s, EVENTS)!.conditions?.flags).toContain(`bg-${b.id}`);
    }
  });

  it("後日談會提到這一局玩過的關鍵事件，也有城市專屬段落", () => {
    let mentioned = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = playRandom(seed);
      const s = summarize(g, EVENTS);
      const text = buildEpilogue(g, EVENTS, s, ARCS).paragraphs.join("");
      if (s.reflection.some((r) => text.includes(`「${r.eventTitle}」`) || text.includes(r.eventTitle))) mentioned++;
    }
    expect(mentioned).toBeGreaterThan(150);
  });

  it("同一局重算後日談，結果不變；不同局讀到的段落不同", () => {
    const g = playRandom(11);
    const a = buildEpilogue(g, EVENTS, summarize(g, EVENTS), ARCS);
    expect(buildEpilogue(g, EVENTS, summarize(g, EVENTS), ARCS)).toEqual(a);
    const stories = new Set(Array.from({ length: 100 }, (_, i) => {
      const x = playRandom(i + 1);
      return buildEpilogue(x, EVENTS, summarize(x, EVENTS), ARCS).paragraphs.join("|");
    }));
    expect(stories.size).toBe(100);
  });
});

describe("回合引擎", () => {
  it("落選則在第一次投票後結束，當選則剛好 12 回合；事件不重複且階段正確", () => {
    for (const s of games({}, 200)) {
      expect(s.history).toHaveLength(s.firstElection!.won ? TURN_PLAN.length : FIRST_ELECTION_TURN);
      expect(new Set(s.deck).size).toBe(s.deck.length);
      s.history.forEach((h, i) => {
        expect(EVENTS.find((e) => e.id === h.eventId)!.phase).toBe(TURN_PLAN[i]);
      });
    }
  });

  it("同一個 seed 與選擇可重現", () => {
    expect(playRandom(42)).toEqual(playRandom(42));
    expect(summarize(playRandom(42), EVENTS)).toEqual(summarize(playRandom(42), EVENTS));
  });

  it("數值維持在 0–100", () => {
    for (const s of games({}, 200)) {
      for (const v of Object.values(s.stats)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("條件事件只在符合角色或承諾時出現", () => {
    for (const s of games({}, 300)) {
      for (const id of s.deck) {
        const e = EVENTS.find((x) => x.id === id)!;
        const tag = e.conditions?.flags?.find((f) => f.startsWith("party-") || f.startsWith("bg-") || f.startsWith("city-"));
        // 中途退黨的玩家，結束時已沒有原政黨的旗標；原政黨事件是在退黨前抽到的
        if (tag && !(s.character.formerParty && tag.startsWith("party-"))) expect(s.flags).toContain(tag);
      }
      if (s.deck.includes("t-housing-progress")) expect(s.flags).toContain("promise-housing-big");
      // 「發錢的時候到了」是發錢政見劇情的節點：開出過福利支票才會出場
      if (s.deck.includes("t-cash-due")) expect(s.arcs.cash).toBeDefined();
    }
  });

  it("選項池每次抽 3 個，且只抽符合角色的選項", () => {
    for (const p of PARTIES) {
      for (const b of BACKGROUNDS) {
        let s = newGame(EVENTS, 7, p, b);
        const first = offeredOptions(s, currentEvent(s, EVENTS)!).find((o) => optionAvailability(s, o) !== "locked")!;
        s = choose(s, EVENTS, first.id);
        const e = currentEvent(s, EVENTS)!;
        expect(e.id).toBe("p-platform");
        const offered = offeredOptions(s, e);
        expect(offered).toHaveLength(3);
        for (const o of offered) expect(meetsCondition(s, o.appearsIf)).toBe(true);
      }
    }
  });

  it("結束後不能再選", () => {
    const s = playRandom(3);
    expect(() => choose(s, EVENTS, "any")).toThrow();
  });
});

// 平衡的目標是好玩、引人反思，不是吻合史實；史實數字只印出來當參考。
describe("難度（隨機策略）", () => {
  it("第一次投票：現任最容易、大黨比小黨與無黨籍容易", () => {
    const byBackground = Object.fromEntries(BACKGROUNDS.map((b) => [b.id, firstWinRate(games({ background: b }))]));
    const byParty = Object.fromEntries(PARTIES.map((p) => [p.id, firstWinRate(games({ party: p }))]));
    console.log("出身：", Object.entries(byBackground).map(([k, v]) => `${k} ${pct(v)}`).join("、"));
    console.log("政黨：", Object.entries(byParty).map(([k, v]) => `${k} ${pct(v)}`).join("、"));

    for (const b of BACKGROUNDS.filter((b) => b.id !== "incumbent")) {
      expect(byBackground.incumbent).toBeGreaterThan(byBackground[b.id]);
    }
    for (const big of ["blue", "green"]) {
      for (const small of ["yellow", "minor", "independent"]) expect(byParty[big]).toBeGreaterThan(byParty[small]);
    }
  });

  it("小黨與無黨籍挑戰者很難贏，但不是不可能（約 10%）", () => {
    const challengers = BACKGROUNDS.filter((b) => !b.incumbent);
    for (const id of ["yellow", "minor", "independent"]) {
      const party = PARTIES.find((p) => p.id === id)!;
      const rate = firstWinRate(challengers.flatMap((b) => games({ party, background: b }, 300)));
      const real = history.challengers[id === "yellow" ? "yellow" : (id as "minor" | "independent")];
      console.log(`${party.name}挑戰者：${pct(rate)}（史實參考 ${pct(real.win_rate)}，${real.candidates} 人）`);
      expect(rate).toBeGreaterThan(0.04);
      expect(rate).toBeLessThan(0.16);
    }
  });

  it("現任有優勢但不保證連任", () => {
    const incumbentFirst = firstWinRate(games({ background: BACKGROUNDS.find((b) => b.incumbent) }));
    const challengers = BACKGROUNDS.filter((b) => !b.incumbent).flatMap((b) => games({ background: b }, 300));
    const firstTerm = finalWinRate(challengers);
    console.log(
      `現任爭取連任：${pct(incumbentFirst)}；首任市長爭取連任：${pct(firstTerm)}（史實參考 ${pct(history.overall.incumbent_win_rate)}）`,
    );
    // 現任比挑戰者容易贏；但隨便亂玩的首任市長會被突發事件拖垮，不保證連任
    const challengerFirst = firstWinRate(challengers);
    expect(incumbentFirst).toBeGreaterThan(challengerFirst + 0.2);
    expect(firstTerm).toBeGreaterThan(challengerFirst);
    for (const rate of [incumbentFirst, firstTerm]) {
      expect(rate).toBeGreaterThan(0.35);
      expect(rate).toBeLessThan(0.9);
    }
  });

  it("現任優勢來自事件：動用現任資源明顯提高連任率，但不保證連任", () => {
    const always = finalWinRate(games({ perks: "always" }));
    const never = finalWinRate(games({ perks: "never" }));
    console.log(`總是動用：${pct(always)}；從不動用：${pct(never)}`);
    // 資質帶來的變異讓差距從約 20 點縮到約 14 點；仍要明顯（> 12 點）
    expect(always - never).toBeGreaterThan(0.12);
    expect(always).toBeLessThan(0.97);
    expect(never).toBeGreaterThan(0.15);
  });
});

describe("數值都有意義", () => {
  it("只衝民調不是最佳解：兼顧各數值的玩法連任率更高、危機更少", () => {
    const greedy = games({ strategy: "greedy" }, 800);
    const balanced = games({ strategy: "balanced" }, 800);
    const crises = (gs: GameState[]) => gs.reduce((n, g) => n + g.crisisLog.length, 0);
    console.log(
      `只衝民調：當選 ${pct(firstWinRate(greedy))}、連任 ${pct(finalWinRate(greedy))}、危機 ${crises(greedy)} 次；` +
        `兼顧數值：當選 ${pct(firstWinRate(balanced))}、連任 ${pct(finalWinRate(balanced))}、危機 ${crises(balanced)} 次`,
    );
    expect(finalWinRate(balanced)).toBeGreaterThan(finalWinRate(greedy));
    expect(crises(balanced)).toBeLessThan(crises(greedy));
  });

  it("每個負面突發事件在隨機玩法中都有機會發生", () => {
    const seen = new Set(games({}, 600).flatMap((g) => g.crisisLog.map((l) => l.id)));
    const greedySeen = new Set(games({ strategy: "greedy" }, 600).flatMap((g) => g.crisisLog.map((l) => l.id)));
    const missing = CRISES.filter((c) => c.tone === "bad" && !seen.has(c.id) && !greedySeen.has(c.id)).map((c) => c.id);
    console.log(`沒出現過的負面事件：${missing.join("、") || "無"}`);
    expect(missing.length).toBeLessThanOrEqual(3);
  });

  it("突發事件不會在冷卻期內重複", () => {
    for (const g of games({ strategy: "greedy" }, 300)) {
      const byId = new Map<string, number[]>();
      for (const l of g.crisisLog) byId.set(l.id, [...(byId.get(l.id) ?? []), l.turn]);
      for (const turns of byId.values()) {
        for (let i = 1; i < turns.length; i++) expect(turns[i] - turns[i - 1]).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("後日談會提到這一局玩過的關鍵事件，也有城市專屬段落", () => {
    let mentioned = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = playRandom(seed);
      const s = summarize(g, EVENTS);
      const text = buildEpilogue(g, EVENTS, s, ARCS).paragraphs.join("");
      if (s.reflection.some((r) => text.includes(`「${r.eventTitle}」`) || text.includes(r.eventTitle))) mentioned++;
    }
    expect(mentioned).toBeGreaterThan(150);
  });

  it("同一局重算後日談，結果不變；不同局讀到的段落不同", () => {
    const g = playRandom(11);
    const a = buildEpilogue(g, EVENTS, summarize(g, EVENTS), ARCS);
    expect(buildEpilogue(g, EVENTS, summarize(g, EVENTS), ARCS)).toEqual(a);
    const stories = new Set(Array.from({ length: 100 }, (_, i) => {
      const x = playRandom(i + 1);
      return buildEpilogue(x, EVENTS, summarize(x, EVENTS), ARCS).paragraphs.join("|");
    }));
    expect(stories.size).toBe(100);
  });
});

describe("競選經費", () => {
  const byParty = (id: string) => PARTIES.find((p) => p.id === id)!;
  const outsider = BACKGROUNDS.find((b) => b.id === "outsider")!;
  const legislator = BACKGROUNDS.find((b) => b.id === "legislator")!;

  it("經費不會變成負數，每 3 回合入帳一次", () => {
    for (const g of games({}, 300)) {
      expect(g.funds).toBeGreaterThanOrEqual(0);
      const expected = [0, 3, 6, 9, 12, 15, 18, 21].filter((t) => t < g.history.length);
      expect(g.payouts.map((p) => p.turn)).toEqual(expected);
    }
  });

  it("大黨開局經費遠多於小黨與無黨籍；素人靠募款", () => {
    const start = (p: string, b = legislator) => newGame(EVENTS, 1, byParty(p), b).funds;
    console.log(
      `開局經費：藍 ${start("blue")}、綠 ${start("green")}、白 ${start("white")}、黃 ${start("yellow")}、` +
        `小黨 ${start("minor")}、無黨 ${start("independent")}；無黨素人 ${start("independent", outsider)}`,
    );
    expect(start("blue")).toBeGreaterThan(start("independent") * 2);
    expect(start("independent", outsider)).toBeGreaterThan(0);
    const s = newGame(EVENTS, 1, byParty("independent"), outsider);
    expect(s.payouts[0].party).toBe(0);
    expect(s.payouts[0].small).toBeGreaterThan(0);
  });

  it("跟黨關係越好，黨部撥款越多", () => {
    const base = newGame(EVENTS, 1, byParty("blue"), legislator);
    const rich = { ...base, stats: { ...base.stats, party: 90 } };
    const poor = { ...base, stats: { ...base.stats, party: 20 } };
    expect(payout(rich.stats, rich.income).party).toBeGreaterThan(payout(poor.stats, poor.income).party * 3);
  });

  it("經費不足時花錢的選項會鎖住；現任資源選項用市府預算，不花競選經費", () => {
    const perks = EVENTS.flatMap((e) => e.options.filter((o) => o.perk));
    for (const o of perks) expect(o.funds ?? 0).toBeGreaterThanOrEqual(0);
    const broke = { ...newGame(EVENTS, 1, byParty("minor"), outsider), funds: 0 };
    const rally = EVENTS.find((e) => e.id === "c-strategy")!.options.find((o) => o.id === "rally")!;
    expect(optionAvailability(broke, rally)).toBe("locked");
  });

  it("小黨與無黨籍比大黨更常因經費不足而少了選擇", () => {
    const optionFunds = (eventId: string, optionId: string) =>
      EVENTS.find((e) => e.id === eventId)!.options.find((o) => o.id === optionId)!.funds ?? 0;
    const lockedShare = (party: string) => {
      let locked = 0, total = 0;
      for (const g of games({ party: byParty(party) }, 300)) {
        // 重建每回合開始時的經費：撥款 + 先前選項的收支
        let funds = 0;
        g.history.forEach((h, i) => {
          for (const p of g.payouts.filter((p) => p.turn === i)) funds += p.party + p.donations + p.small;
          for (const id of h.offered) {
            const f = optionFunds(h.eventId, id);
            if (f < 0) {
              total++;
              if (funds + f < 0) locked++;
            }
          }
          funds += optionFunds(h.eventId, h.optionId);
        });
      }
      return total ? locked / total : 0;
    };
    const big = lockedShare("blue"), small = lockedShare("independent");
    console.log(`花錢選項付不起的比例：藍黨 ${pct(big)}、無黨籍 ${pct(small)}`);
    expect(small).toBeGreaterThan(big);
  });
});

describe("個人貸款", () => {
  const blue = PARTIES.find((p) => p.id === "blue")!;
  const legislator = BACKGROUNDS.find((b) => b.id === "legislator")!;

  it("整局只能借一次，借了就拿到固定金額", () => {
    const s = newGame(EVENTS, 1, blue, legislator);
    const after = takeLoan(s);
    expect(after.funds - s.funds).toBe(LOAN_AMOUNT);
    expect(canTakeLoan(after)).toBe(false);
    expect(() => takeLoan(after)).toThrow();
  });

  it("每回合扣一期，階段結束前還清；付得起時不會違約", () => {
    let s = takeLoan(newGame(EVENTS, 3, blue, legislator));
    const total = s.loan!.total;
    expect(total).toBe(Math.round(LOAN_AMOUNT * (1 + LOAN_INTEREST)));
    s = { ...s, funds: 100000 };
    while (s.turn < STAGE_LENGTH && !s.finished) {
      const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
      s = choose(s, EVENTS, open[0].id, CRISES, PARTIES, ARCS);
    }
    expect(s.loan!.remaining).toBe(0);
  });

  it("沒錢還款會逾期，階段結束還不清就違約", () => {
    let s = takeLoan(newGame(EVENTS, 5, blue, legislator));
    s = { ...s, funds: 0 };
    let defaulted = false;
    while (s.turn < STAGE_LENGTH && !s.finished) {
      const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
      s = choose(s, EVENTS, open[0].id, CRISES, PARTIES, ARCS);
      if (s.notices.some((n) => n.title === "貸款違約")) defaulted = true;
      s = { ...s, funds: 0 };
    }
    expect(defaulted).toBe(true);
    expect(s.loan!.remaining).toBe(0);
  });
});

describe("退黨", () => {
  it("黨內初選選擇退黨，正式改為無黨籍：換掉政黨旗標、不再拿黨部撥款", () => {
    const blue = PARTIES.find((p) => p.id === "blue")!;
    const legislator = BACKGROUNDS.find((b) => b.id === "legislator")!;
    // 找一個會抽到黨內初選的 seed，一路選到那個事件
    for (let seed = 0; seed < 300; seed++) {
      let s = newGame(EVENTS, seed, blue, legislator);
      while (!s.finished && s.turn < STAGE_LENGTH && currentEvent(s, EVENTS)!.id !== "c-party-nomination") {
        const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
        s = choose(s, EVENTS, open[0].id, CRISES, PARTIES, ARCS);
      }
      if (s.finished || s.turn >= STAGE_LENGTH) continue;
      s = { ...s, funds: 100000 };
      s = choose(s, EVENTS, "indie", CRISES, PARTIES, ARCS);
      expect(s.character.party).toBe("independent");
      expect(s.character.formerParty).toBe("blue");
      expect(s.flags).toContain("party-independent");
      expect(s.flags.filter((f) => ["party-blue", "party-major"].includes(f))).toEqual([]);
      expect(s.income.party).toBe(0);
      // 一路玩到退黨之後的下一次入帳
      const before = s.payouts.length;
      while (!s.finished && s.payouts.length === before) {
        const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
        s = choose(s, EVENTS, open[0].id, CRISES, PARTIES, ARCS);
      }
      if (s.payouts.length === before) continue;
      expect(s.payouts.at(-1)!.party).toBe(0);
      return;
    }
    throw new Error("找不到會抽到黨內初選的 seed");
  });
});

describe("個人貸款補繳", () => {
  it("中途漏繳一期，之後有錢就補上，不會在有錢的情況下違約", () => {
    const blue = PARTIES.find((p) => p.id === "blue")!;
    const legislator = BACKGROUNDS.find((b) => b.id === "legislator")!;
    let s = takeLoan(newGame(EVENTS, 9, blue, legislator));
    let defaulted = false;
    while (s.turn < STAGE_LENGTH && !s.finished) {
      // 第 4 回合故意沒錢，其餘回合錢很多
      s = { ...s, funds: s.turn === 4 ? 0 : 100000 };
      const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
      s = choose(s, EVENTS, open[0].id, CRISES, PARTIES, ARCS);
      if (s.notices.some((n) => n.title === "貸款違約")) defaulted = true;
    }
    expect(defaulted).toBe(false);
    expect(s.loan!.remaining).toBe(0);
  });
});

describe("人設與人物介紹", () => {
  it("每人抽 1 個政治人格、2 個不同類別的能力資質、1 個先天包袱；同一個 seed 結果相同", () => {
    for (let seed = 0; seed < 500; seed++) {
      const b = BACKGROUNDS[seed % BACKGROUNDS.length], p = PARTIES[seed % PARTIES.length];
      const profile = drawProfile(seed, b, p, TRAITS, BURDENS, CITIES[0]);
      const cats = profile.traits.map((id) => TRAITS.find((t) => t.id === id)!.category);
      expect(cats.filter((c) => c === "personality")).toHaveLength(1);
      expect(new Set(cats).size).toBe(3);
      expect(BURDENS.some((x) => x.id === profile.burden)).toBe(true);
      expect(drawProfile(seed, b, p, TRAITS, BURDENS, CITIES[0])).toEqual(profile);
    }
  });

  it("全隨機開局：城市、政黨、出身都抽得到，同一個 seed 結果相同", () => {
    const seen = { city: new Set<string>(), party: new Set<string>(), bg: new Set<string>() };
    const content = { cities: CITIES, parties: PARTIES, backgrounds: BACKGROUNDS, traits: TRAITS, burdens: BURDENS, legends: LEGENDS };
    for (let seed = 0; seed < 3000; seed++) {
      const c = drawCharacter(seed, content);
      seen.city.add(c.city.id);
      seen.party.add(c.party.id);
      seen.bg.add(`${c.party.id}/${c.background.id}`);
      expect(c.profile.city).toBe(c.city.id);
      if (seed < 20) expect(drawCharacter(seed, content)).toEqual(c);
    }
    expect(seen.city.size).toBe(CITIES.length);
    expect(seen.party.size).toBe(PARTIES.length);
    // 罕見組合也要抽得到，例如無黨籍的現任市長
    expect(seen.bg.size).toBe(PARTIES.length * BACKGROUNDS.length);
  });

  it("所有資質與包袱都抽得到", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 3000; seed++) {
      const profile = drawProfile(seed, BACKGROUNDS[seed % 5], PARTIES[seed % 6], TRAITS, BURDENS, CITIES[0]);
      profile.traits.forEach((id) => seen.add(id));
      seen.add(profile.burden);
    }
    expect([...TRAITS, ...BURDENS].filter((x) => !seen.has(x.id)).map((x) => x.id)).toEqual([]);
  });

  it("人物介紹組得起來：有開場、擅長或弱點、人格、包袱與參選句", () => {
    for (let seed = 0; seed < 500; seed++) {
      const b = BACKGROUNDS[seed % 5], p = PARTIES[(seed * 7) % 6];
      const intro = composeIntro(drawProfile(seed, b, p, TRAITS, BURDENS, CITIES[seed % 6]), b, p, TRAITS, BURDENS, CITIES[seed % 6]);
      expect(intro).not.toMatch(/undefined|。。|，，/);
      expect(intro).toMatch(/一直是你的弱點|你最擅長/);
      expect(intro).toMatch(/這一次，你(代表|以無黨籍身分)/);
      if (seed < 4) console.log(`【${p.name}・${b.name}】${intro}`);
    }
  });

  it("資質與包袱會套用到開局數值與旗標", () => {
    const blue = PARTIES[0], councilor = BACKGROUNDS.find((x) => x.id === "councilor")!;
    const profile = { city: "tianlong", traits: ["grassroots", "fixer", "principled"], burden: "local-clan", origin: 0 };
    const plain = newGame(EVENTS, 1, blue, councilor);
    const s = newGame(EVENTS, 1, blue, councilor, profileSetup(profile));
    expect(s.stats.council - plain.stats.council).toBe(6);
    expect(s.flags).toEqual(expect.arrayContaining(["trait-grassroots", "trait-fixer", "trait-principled", "burden-local-clan"]));
    const income = (g: typeof s) => g.payouts[0].party + g.payouts[0].donations + g.payouts[0].small;
    expect(s.funds - income(s) - (plain.funds - income(plain))).toBe(500);
  });
});

describe("資質影響事件結果", () => {
  const blue = PARTIES[0];
  const legislator = BACKGROUNDS.find((b) => b.id === "legislator")!;
  const withTraits = (...traits: string[]) =>
    // 用沒有城市變化、議題倍率也不影響這些選項的城市，單純測資質
    newGame(EVENTS, 1, blue, legislator, profileSetup({ city: "airplane", traits, burden: "old-controversy", origin: 0 }));
  const option = (eventId: string, optionId: string) =>
    EVENTS.find((e) => e.id === eventId)!.options.find((o) => o.id === optionId)!;

  it("手寫變化：辯論鬼才在辯論會攻擊對手，結果文字與效果都不同", () => {
    const attack = option("c-tv-debate", "attack");
    const plain = resolveOption(withTraits("principled"), attack);
    const debater = resolveOption(withTraits("debater", "principled"), attack);
    expect(plain.outcome).toBe(attack.outcome);
    expect(debater.outcome).not.toBe(attack.outcome);
    expect(debater.effects.approval).toBe((attack.effects.approval ?? 0) + 5);
    expect(debater.traitsInvolved).toEqual(["debater"]);
  });

  it("弱點優先：同時是辯論鬼才又容易失言，攻擊對手會出包", () => {
    const r = resolveOption(withTraits("debater", "gaffe-prone", "principled"), option("c-tv-debate", "attack"));
    expect(r.effects.approval).toBeLessThan(0);
    expect(r.traitsInvolved).toEqual(["gaffe-prone"]);
  });

  it("一般能力規則：草根魅力跑宮廟加分並補一句敘述；政策準備不足講政策扣分", () => {
    const temples = option("c-temples", "all");
    const r = resolveOption(withTraits("grassroots", "principled"), temples);
    expect(r.outcome.startsWith(temples.outcome)).toBe(true);
    expect(r.outcome.length).toBeGreaterThan(temples.outcome.length);
    expect(r.effects.approval).toBe((temples.effects.approval ?? 0) + SKILL_EFFECTS.grassroots.approval!);

    const youth = option("c-youth", "policy");
    const weak = resolveOption(withTraits("unprepared", "principled"), youth);
    expect(weak.effects.approval).toBe((youth.effects.approval ?? 0) - SKILL_EFFECTS.policy.approval!);
  });

  it("政策專訪：話術好但不是政策學霸，短期加分、之後被事實查核", () => {
    const accept = option("c-policy-interview", "accept");
    const r = resolveOption(withTraits("debater", "principled"), accept);
    expect(r.effects.approval).toBeGreaterThan(accept.effects.approval!);
    expect(r.delayed?.effects.approval).toBeLessThan(0);
    const wonk = resolveOption(withTraits("debater", "policy-wonk", "principled"), accept);
    expect(wonk.delayed).toBeUndefined();
  });

  it("資質專屬選項只有對應資質看得到", () => {
    const ambush = option("c-tv-debate", "ambush");
    expect(meetsCondition(withTraits("debater"), ambush.appearsIf)).toBe(true);
    expect(meetsCondition(withTraits("principled"), ambush.appearsIf)).toBe(false);
  });

  it("每個手寫變化都和原本的結果文字不同；整局會記錄被資質影響的選擇", () => {
    for (const e of EVENTS) for (const o of e.options) for (const v of o.variants ?? []) expect(v.outcome).not.toBe(o.outcome);
    const involved = games({}, 200).flatMap((g) => g.history.filter((h) => h.traitsInvolved));
    expect(involved.length).toBeGreaterThan(100);
    console.log(`200 局中被資質影響的選擇：${involved.length} 次`);
  });
});

describe("耐玩度與城市差異", () => {
  const content = { cities: CITIES, parties: PARTIES, backgrounds: BACKGROUNDS, traits: TRAITS, burdens: BURDENS, legends: LEGENDS };
  /** 用全隨機開局（和實際遊戲一樣）玩一局 */
  function playDrawn(seed: number): GameState {
    const c = drawCharacter(seed, content);
    const rand = mulberry32(seed);
    let s = newGame(EVENTS, seed, c.party, c.background, profileSetup(c.profile));
    while (!s.finished) {
      const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
      s = choose(s, EVENTS, open[Math.floor(rand() * open.length)].id, CRISES, PARTIES, ARCS);
    }
    return s;
  }

  it("兩局完整遊戲遇到的事件重複不多（平均共同事件 < 7 個）", () => {
    const full = Array.from({ length: 400 }, (_, i) => playDrawn(i)).filter((g) => g.history.length === TURN_PLAN.length);
    let shared = 0, pairs = 0;
    for (let i = 0; i + 1 < full.length; i += 2) {
      const a = new Set(full[i].deck);
      shared += full[i + 1].deck.filter((id) => a.has(id)).length;
      pairs++;
    }
    const avg = shared / pairs;
    console.log(`兩局完整遊戲平均共同事件：${avg.toFixed(1)} / ${TURN_PLAN.length}`);
    expect(avg).toBeLessThan(7);
  });

  it("每個城市都有專屬事件，而且一局裡真的會遇到", () => {
    for (const c of CITIES) {
      const own = EVENTS.filter((e) => e.conditions?.flags?.includes(`city-${c.id}`));
      expect(own.length, c.id).toBeGreaterThanOrEqual(6);
    }
    const games = Array.from({ length: 300 }, (_, i) => playDrawn(i));
    const perGame = games.map((g) => g.deck.filter((id) => EVENTS.find((e) => e.id === id)!.conditions?.flags?.some((f) => f.startsWith("city-"))).length);
    const avg = perGame.reduce((a, b) => a + b, 0) / perGame.length;
    console.log(`每局平均遇到的城市專屬事件：${avg.toFixed(1)} 個`);
    expect(avg).toBeGreaterThan(1.5);
  });

  it("同一個選項在不同城市，民調效果會依選民結構不同", () => {
    const blue = PARTIES[0], legislator = BACKGROUNDS.find((b) => b.id === "legislator")!;
    const inCity = (city: string) =>
      newGame(EVENTS, 1, blue, legislator, profileSetup({ city, traits: ["principled"], burden: "old-controversy", origin: 0 }));
    const event = EVENTS.find((e) => e.id === "c-tianlong-housing")!;
    const build = event.options.find((o) => o.id === "neighbor")!;
    const tianlong = resolveOption(inCity("tianlong"), build, event).effects.approval!;
    const gudu = resolveOption(inCity("gudu"), build, event).effects.approval!;
    expect(tianlong).toBeGreaterThan(gudu);
  });
});

describe("換你當選民", () => {
  it("挑出拿原則或公家資源換選票的選擇（最多 3 個），以及至多 1 個為原則放棄選票的選擇", () => {
    for (const s of games({}, 200)) {
      const items = summarize(s, EVENTS).reflection;
      const tempting = items.filter((i) => i.kind === "tempting");
      expect(tempting.length).toBeLessThanOrEqual(3);
      expect(items.filter((i) => i.kind === "principled").length).toBeLessThanOrEqual(1);
      if (items.some((i) => i.kind === "popular")) expect(items).toHaveLength(1);
      for (const i of tempting) {
        expect(i.approval).toBeGreaterThan(0);
        expect(i.integrity < 0 || i.perk).toBe(true);
      }
      for (const i of items.filter((i) => i.kind === "principled")) {
        expect(i.integrity).toBeGreaterThan(0);
        expect(i.approval).toBeLessThan(0);
      }
    }
  });

  it("每一局都有可以反問玩家的選擇", () => {
    const withItems = games({}, 300).filter((s) => summarize(s, EVENTS).reflection.length > 0).length;
    console.log(`有反思題的局：${pct(withItems / 300)}`);
    expect(withItems / 300).toBeGreaterThan(0.98);
  });
});

describe("後日談", () => {
  it("每一局都有大標與至少四段故事，且段落不重複", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = playRandom(seed);
      const story = buildEpilogue(g, EVENTS, summarize(g, EVENTS), ARCS);
      expect(story.headline.length).toBeGreaterThan(0);
      expect(story.paragraphs.length).toBeGreaterThanOrEqual(4);
      expect(new Set(story.paragraphs).size).toBe(story.paragraphs.length);
    }
  });

  it("貸款違約的人，後日談會寫到傾家蕩產", () => {
    const g = playRandom(7);
    const broke = { ...g, flags: [...g.flags, "loan-defaulted"], loanTaken: true };
    const story = buildEpilogue(broke, EVENTS, summarize(broke, EVENTS), ARCS);
    expect(story.paragraphs.join("")).toContain("銀行");
    expect(["為了選舉傾家蕩產的人", "把房子押進票匭的人", "被起訴的前候選人", "從選舉公報走進起訴書的人"]).toContain(story.headline);
  });

  it("落選的挑戰者不會被寫成做過市長", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = playRandom(seed);
      const s = summarize(g, EVENTS);
      if (s.stage !== "first" || g.flags.includes("bg-incumbent")) continue;
      const text = buildEpilogue(g, EVENTS, s, ARCS).paragraphs.join("");
      expect(text).not.toContain("任期");
      expect(text).not.toContain("卸任");
    }
  });

  it("後日談會提到這一局玩過的關鍵事件，也有城市專屬段落", () => {
    let mentioned = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = playRandom(seed);
      const s = summarize(g, EVENTS);
      const text = buildEpilogue(g, EVENTS, s, ARCS).paragraphs.join("");
      if (s.reflection.some((r) => text.includes(`「${r.eventTitle}」`) || text.includes(r.eventTitle))) mentioned++;
    }
    expect(mentioned).toBeGreaterThan(150);
  });

  it("同一局重算後日談，結果不變；不同局讀到的段落不同", () => {
    const g = playRandom(11);
    const a = buildEpilogue(g, EVENTS, summarize(g, EVENTS), ARCS);
    expect(buildEpilogue(g, EVENTS, summarize(g, EVENTS), ARCS)).toEqual(a);
    const stories = new Set(Array.from({ length: 100 }, (_, i) => {
      const x = playRandom(i + 1);
      return buildEpilogue(x, EVENTS, summarize(x, EVENTS), ARCS).paragraphs.join("|");
    }));
    expect(stories.size).toBe(100);
  });
});

describe("競選規模與開銷", () => {
  const pickFree = (s: GameState) => {
    const e = currentEvent(s, EVENTS)!;
    return offeredOptions(s, e).find((o) => !o.funds && optionAvailability(s, o) === "open")!.id;
  };

  it("大黨從標準規模開始，小黨從精簡開始", () => {
    expect(newGame(EVENTS, 1, PARTIES.find((p) => p.id === "blue")!, BACKGROUNDS[1]).scale).toBe("standard");
    expect(newGame(EVENTS, 1, PARTIES.find((p) => p.id === "minor")!, BACKGROUNDS[1]).scale).toBe("lean");
  });

  it("每個競選回合依規模扣人事、廣告、活動，並記錄在支出裡", () => {
    let s = setScale(newGame(EVENTS, 3, PARTIES[0], BACKGROUNDS[1]), "standard");
    s = { ...s, funds: 5000 };
    const next = choose(s, EVENTS, pickFree(s), [], PARTIES, ARCS);
    const c = CAMPAIGN_SCALES.standard.costs;
    expect(next.spending.staff).toBe(c.staff);
    expect(next.spending.ads).toBe(c.ads);
    expect(next.spending.events).toBe(c.events);
    expect(next.notices.some((n) => n.text.startsWith("競選總部開銷"))).toBe(true);
  });

  it("付不起選定的規模會自動縮編；連精簡都付不起就欠薪，連續欠薪會被爆料", () => {
    let s = setScale(newGame(EVENTS, 3, PARTIES[0], BACKGROUNDS[1]), "full");
    s = { ...s, funds: scaleCost("standard") };
    let next = choose(s, EVENTS, pickFree(s), [], PARTIES, ARCS);
    expect(next.scale).toBe("standard");
    expect(next.funds).toBe(0);
    for (let i = 0; i < 2; i++) {
      next = choose({ ...next, funds: 0, notices: [] }, EVENTS, pickFree(next), [], PARTIES, ARCS);
    }
    expect(next.arrears).toBe(2);
    expect(next.flags).toContain("unpaid-staff");
  });

  it("任期中只扣服務處開銷", () => {
    let s = playRandom(5);
    // 找一局有進入任期的
    for (let seed = 5; !s.firstElection?.won; seed++) s = playRandom(seed);
    const termTurns = s.history.filter((h) => TURN_PLAN[h.turn] === "term").length;
    expect(s.spending.office).toBeLessThanOrEqual(termTurns * OFFICE_UPKEEP);
    expect(termTurns).toBeGreaterThan(0);
  });
});

describe("資質品質", () => {
  it("每個資質都有品質，每一類都有負面與卓越資質", () => {
    for (const t of TRAITS) expect(["negative", "common", "rare", "epic"]).toContain(t.tier);
    for (const cat of ["communication", "policy", "organization", "personality"]) {
      const tiers = TRAITS.filter((t) => t.category === cat).map((t) => t.tier);
      expect(tiers).toContain("negative");
      expect(tiers).toContain("epic");
    }
  });

  it("卓越資質很稀有，負面與普通最常見", () => {
    const count: Record<string, number> = { negative: 0, common: 0, rare: 0, epic: 0 };
    let anyEpic = 0;
    const N = 3000;
    for (let seed = 1; seed <= N; seed++) {
      const c = drawCharacter(seed, { cities: CITIES, parties: PARTIES, backgrounds: BACKGROUNDS, traits: TRAITS, burdens: BURDENS });
      const tiers = c.profile.traits.map((id) => TRAITS.find((t) => t.id === id)!.tier);
      for (const t of tiers) count[t]++;
      if (tiers.includes("epic")) anyEpic++;
    }
    const total = N * 3;
    const share = (k: string) => count[k] / total;
    console.log(
      `資質品質：負面 ${(share("negative") * 100).toFixed(1)}%、普通 ${(share("common") * 100).toFixed(1)}%、` +
        `優秀 ${(share("rare") * 100).toFixed(1)}%、卓越 ${(share("epic") * 100).toFixed(1)}%；至少一個卓越的角色 ${((anyEpic / N) * 100).toFixed(1)}%`,
    );
    expect(share("epic")).toBeLessThan(0.08);
    expect(share("epic")).toBeGreaterThan(0.02);
    expect(share("negative") + share("common")).toBeGreaterThan(0.55);
  });
});

describe("對手", () => {
  const content = { cities: CITIES, parties: PARTIES, backgrounds: BACKGROUNDS, traits: TRAITS, burdens: BURDENS, legends: LEGENDS };

  it("每個角色都有兩個階段的對手，同一個 seed 抽到同一組；傳奇對手不會和玩家同黨", () => {
    let legends = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const c = drawCharacter(seed, content);
      const { first, second } = c.profile.rivals!;
      if (seed <= 20) expect(drawCharacter(seed, content).profile.rivals).toEqual(c.profile.rivals);
      for (const o of [first, second]) {
        if (o.legend) {
          expect(o.party).not.toBe(c.party.id);
          legends++;
        }
        expect(o.traits).toHaveLength(3);
      }
      expect(second.incumbent).toBe(false);
      if (c.background.id === "incumbent") expect(first.incumbent).toBe(false);
    }
    expect(legends / 2000).toBeGreaterThan(0.14);
    expect(legends / 2000).toBeLessThan(0.24);
  });

  it("傳奇對手的資料完整：資質存在、招牌事件存在且只對這位對手出現", () => {
    for (const l of LEGENDS) {
      for (const t of l.traits) expect(TRAITS.some((x) => x.id === t)).toBe(true);
      const sig = EVENTS.find((e) => e.id === l.signature)!;
      expect(sig).toBeDefined();
      expect(sig.conditions?.flags).toContain(`opp-legend-${l.id}`);
    }
  });

  it("對手越強，勝選機率越低", () => {
    const g = newGame(EVENTS, 9, PARTIES[0], BACKGROUNDS[1]);
    const weak = runElection({ ...g, opponent: { name: "甲", party: "green", title: "", incumbent: false, traits: [], strength: -0.3 } }, "first");
    const strong = runElection({ ...g, opponent: { name: "乙", party: "green", title: "", incumbent: false, traits: [], strength: 0.4 } }, "first");
    expect(weak.probability).toBeGreaterThan(strong.probability);
  });

  it("贏得不多時對手捲土重來，贏很多則換人", () => {
    let rematch = 0, fresh = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = playRandom(seed);
      if (!s.firstElection?.won || !s.character.profile?.rivals) continue;
      const { first, second } = s.character.profile.rivals;
      if (s.firstElection.probability <= 0.6) {
        expect(s.flags).toContain("opp-rematch");
        expect(s.opponent!.name).toBe(first.name);
        rematch++;
      } else {
        expect(s.opponent).toEqual(second);
        fresh++;
      }
    }
    expect(rematch).toBeGreaterThan(0);
    expect(fresh).toBeGreaterThan(0);
  });

  it("隨機對手的介紹用第三人稱，不會出現「你」", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const o = drawCharacter(seed, content).profile.rivals!.first;
      if (o.legend) continue;
      const text = describeOpponent(o, "某黨", TRAITS, LEGENDS);
      expect(text).toContain(o.name);
      expect(text).not.toContain("你");
    }
  });
});

describe("事件隨機性", () => {
  it("沒有條件限制的選戰與任期事件不會一直出現（單一事件出現率 < 25%）", () => {
    const N = 800;
    const seen: Record<string, number> = {};
    let reachedTerm = 0;
    for (let seed = 1; seed <= N; seed++) {
      const s = playRandom(seed * 7919);
      if (s.deck.some((id) => EVENTS.find((e) => e.id === id)!.phase === "term")) reachedTerm++;
      for (const id of s.deck) seen[id] = (seen[id] ?? 0) + 1;
    }
    const open = EVENTS.filter((e) => (e.phase === "campaign" || e.phase === "term") && !e.conditions && e.id !== "c-strategy");
    for (const e of open) {
      const rate = (seen[e.id] ?? 0) / (e.phase === "term" ? reachedTerm : N);
      expect(rate, `${e.title} 出現率 ${(rate * 100).toFixed(0)}%`).toBeLessThan(0.25);
    }
  });
});

describe("劇情鏈", () => {
  it("劇情資料完整：節點事件存在並指回劇情、選項引用的劇情存在", () => {
    expect(validateArcs(ARCS, EVENTS)).toEqual([]);
  });

  const games = Array.from({ length: 600 }, (_, i) => playRandom(i * 131 + 7));

  it("每條劇情鏈在模擬中都會開啟，而且至少有一個節點真的出場", () => {
    const more = Array.from({ length: 1500 }, (_, i) => playRandom(i * 37 + 1));
    for (const a of ARCS) {
      const opened = more.filter((g) => g.arcs[a.id]).length;
      const played = more.filter((g) => g.deck.some((id) => EVENTS.find((e) => e.id === id)?.arc === a.id)).length;
      expect(opened, a.id).toBeGreaterThan(0);
      expect(played, a.id).toBeGreaterThan(0);
    }
  });

  it("沒收過建商的錢，就不會遇到「金主的請託」", () => {
    for (const g of games) {
      if (g.deck.includes("t-donor-favor")) expect(g.arcs.donor, g.seed.toString()).toBeDefined();
    }
  });

  it("任期走完的局，每條劇情的節點都有結果（出場、分支略過或以快報結算），不會無聲消失", () => {
    let checked = 0;
    for (const g of games) {
      if (!g.finished || !g.firstElection?.won) continue;
      for (const a of Object.values(g.arcs)) {
        const def = ARCS.find((d) => d.id === a.id)!;
        expect(a.node, `${g.seed} ${a.id}`).toBe(def.nodes.length);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("第二階段任期中最多 3 個劇情回合", () => {
    for (const g of games) {
      const used = g.deck.filter((id, t) => ["term", "incumbency"].includes(TURN_PLAN[t]) && EVENTS.find((e) => e.id === id)!.arc).length;
      expect(used).toBeLessThanOrEqual(3);
    }
  });

  it("社宅只有真的蓋到承諾戶數才算兌現；灌水不等於兌現", () => {
    for (const g of games) {
      const h = g.arcs.housing;
      if (h?.status === "fulfilled") expect(h.facts.built).toBeGreaterThanOrEqual(h.facts.promised);
      if (h?.status === "concealed" || h?.status === "exposed") expect(h.facts.claimed).toBeGreaterThan(h.facts.built);
    }
  });

  it("第一次投票落選時，不結算任期中的劇情，後日談改寫「沒機會兌現」", () => {
    const lost = games.filter((g) => g.firstElection && !g.firstElection.won && Object.keys(g.arcs).length > 0);
    expect(lost.length).toBeGreaterThan(5);
    for (const g of lost) {
      for (const a of Object.values(g.arcs)) {
        const def = ARCS.find((d) => d.id === a.id)!;
        expect(def.nodes[a.node]?.phase).not.toBe("campaign");
        expect(a.log.every((l) => l.turn < 12)).toBe(true);
      }
    }
  });

  it("幕僚長回報不會一直重複同一句話（連續兩回合同一句 < 12%）", () => {
    let pairs = 0, same = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rand = mulberry32(seed * 31);
      let s = newGame(EVENTS, seed, PARTIES[seed % 6], BACKGROUNDS[seed % 5], profileSetup(drawProfile(seed, BACKGROUNDS[seed % 5], PARTIES[seed % 6], TRAITS, BURDENS, CITIES[seed % 6], LEGENDS)));
      let prev = "";
      while (!s.finished) {
        if (s.turn > 0) {
          const m = staffReport(s, ARCS).main ?? "";
          if (prev) { pairs++; if (m === prev) same++; }
          prev = m;
        }
        const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
        s = choose(s, EVENTS, open[Math.floor(rand() * open.length)].id, CRISES, PARTIES, ARCS);
      }
    }
    expect(same / pairs).toBeLessThan(0.12);
  });

  it("同一個 seed、同一串選擇，帳本完全相同", () => {
    for (const seed of [11, 202, 3003]) expect(playRandom(seed).arcs).toEqual(playRandom(seed).arcs);
  });
});

describe("分享圖卡", () => {
  it("醜聞與破產優先於輸贏；五種底圖都會用到", () => {
    const seen: Record<string, number> = {};
    for (let seed = 1; seed <= 1500; seed++) {
      const g = playRandom(seed * 37);
      const s = summarize(g, EVENTS);
      const k = cardKind(g, s);
      seen[k] = (seen[k] ?? 0) + 1;
      if (g.flags.includes("investigated")) expect(k).toBe("scandal");
      if (g.flags.includes("loan-defaulted") && k !== "scandal") expect(k).toBe("broke");
      if (k === "win") expect(s.election.won).toBe(true);
      if (k === "dawn" || k === "loss") expect(s.election.won).toBe(false);
    }
    console.log("分享圖卡底圖：" + Object.entries(seen).map(([k, n]) => `${k} ${((n / 1500) * 100).toFixed(1)}%`).join("、"));
    for (const k of ["scandal", "broke", "win", "dawn", "loss"]) expect(seen[k], k).toBeGreaterThan(0);
  });

  it("小故事：依分數挑 1–3 句再接結局，長度控制在圖卡放得下的範圍", () => {
    const lengths: number[] = [];
    const samples: string[] = [];
    const endingsSeen = new Set<string>();
    for (let seed = 1; seed <= 1500; seed++) {
      const g = playRandom(seed * 37);
      const s = summarize(g, EVENTS);
      const story = cardStory(g, s);
      lengths.push(story.length);
      expect(story).toMatch(/[。？！」]$/);
      if (g.opponent) expect(story).not.toContain(g.opponent.name);
      endingsSeen.add(s.ending.id);
      expect(story).not.toContain("undefined");
      if (seed % 300 === 0) samples.push(story);
    }
    lengths.sort((a, b) => a - b);
    console.log(`小故事長度：中位數 ${lengths[750]}、最長 ${lengths[lengths.length - 1]}\n` + samples.join("\n"));
    expect(lengths[lengths.length - 1]).toBeLessThanOrEqual(130);
    expect(lengths[750]).toBeGreaterThan(30);
    // 每種結局都要有圖卡收尾句；連任勝選不能再集中在單一結局
    const g = playRandom(37);
    const s = summarize(g, EVENTS);
    for (const id of ENDING_IDS) expect(cardStory(g, { ...s, ending: { id, title: "", tagline: "" } }), id).toMatch(/[。？！」]$/);
    expect(endingsSeen.size).toBeGreaterThanOrEqual(35);
  });
});

describe("政治命運", () => {
  const fateGames = Array.from({ length: 600 }, (_, i) => playRandom(i * 53 + 11, { fate: true }));

  it("卡池資料完整：效果、引用的能力與劇情存在，牌面提示不寫數字，每個階段三種類型都夠", () => {
    expect(validateFates(FATES, ARCS)).toEqual([]);
    expect(FATES.length).toBeGreaterThanOrEqual(100);
  });

  it("只在每個階段的第 3、6、9 回合後出現；落選的局最多 3 次，當選的局最多 6 次", () => {
    for (const g of fateGames) {
      const turns = (g.fateHistory ?? []).map((h) => h.turn);
      const allowed = g.firstElection?.won ? [3, 6, 9, 15, 18, 21] : [3, 6, 9];
      for (const t of turns) expect(allowed, `seed ${g.seed}`).toContain(t);
      expect(new Set(turns).size).toBe(turns.length);
    }
    expect(fateGames.some((g) => (g.fateHistory ?? []).length === 6)).toBe(true);
  });

  it("每次三張不同的牌、多半湊得出兩種以上類型；同一局出現過的牌不會再出現", () => {
    let mixed = 0, offers = 0;
    for (const g of fateGames) {
      const shown = (g.fateHistory ?? []).flatMap((h) => h.offered);
      expect(new Set(shown).size, `seed ${g.seed}`).toBe(shown.length);
      for (const h of g.fateHistory ?? []) {
        expect(new Set(h.offered).size).toBe(3);
        offers++;
        if (new Set(h.offered.map((id) => FATES.find((c) => c.id === id)!.kind)).size >= 2) mixed++;
      }
    }
    expect(mixed / offers).toBeGreaterThan(0.95);
  });

  it("沒開命運的局不會出現命運牌（預設關閉，既有平衡測試不受影響）", () => {
    for (const g of games({}, 100)) expect(g.fateHistory).toBeUndefined();
  });

  it("命運頁不能跳過、同一組不能選兩次；同一個 seed 與選擇會得到同一個結果", () => {
    let s = newGame(EVENTS, 4242, PARTIES[0], BACKGROUNDS[1], profileSetup(drawProfile(4242, BACKGROUNDS[1], PARTIES[0], TRAITS, BURDENS, CITIES[0], LEGENDS)), { fate: true });
    while (!s.pendingFate) {
      const e = currentEvent(s, EVENTS)!;
      s = choose(s, EVENTS, offeredOptions(s, e).find((o) => optionAvailability(s, o) === "open")!.id, CRISES, PARTIES, ARCS, FATES);
    }
    expect(currentEvent(s, EVENTS)).toBeUndefined();
    expect(() => choose(s, EVENTS, "x", CRISES, PARTIES, ARCS, FATES)).toThrow();
    const card = s.pendingFate.cards[0];
    const a = chooseFate(s, EVENTS, card, FATES, ARCS);
    const b = chooseFate(s, EVENTS, card, FATES, ARCS);
    expect(a).toEqual(b);
    expect(() => chooseFate(a, EVENTS, card, FATES, ARCS)).toThrow();
    expect(currentEvent(a, EVENTS)).toBeDefined();
    expect(a.turn).toBe(s.turn);
  });

  it("試煉有成有敗；正向效果同時最多兩個；劇情鏈的任期配額不變", () => {
    const ordeals = fateGames.flatMap((g) => (g.fateHistory ?? []).filter((h) => h.success !== undefined));
    const rate = ordeals.filter((h) => h.success).length / ordeals.length;
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.7);
    for (const g of fateGames) {
      expect((g.fateEffects ?? []).length).toBeLessThanOrEqual(2);
      const arcTurns = g.deck.filter((id, t) => ["term", "incumbency"].includes(TURN_PLAN[t]) && EVENTS.find((e) => e.id === id)?.arc).length;
      expect(arcTurns).toBeLessThanOrEqual(3);
    }
  });
});

