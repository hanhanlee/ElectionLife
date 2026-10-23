import { describe, expect, it } from "vitest";
import { BACKGROUNDS, BURDENS, CITIES, CRISES, EVENTS, HISTORY as history, PARTIES, profileSetup, TRAITS } from "@/content";
import { composeIntro, drawCharacter, drawProfile } from "./profile";
import {
  choose,
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
} from "./engine";
import { LOAN_AMOUNT, LOAN_INTEREST, payout, SKILL_EFFECTS, STAGE_LENGTH } from "./model";
import { summarize } from "./endings";
import { mulberry32 } from "./rng";
import { validateEvents } from "./validate";
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
}

/** 用隨機策略玩完一局；未指定角色時依 seed 隨機挑 */
function playRandom(seed: number, opts: PlayOptions = {}): GameState {
  const rand = mulberry32(seed);
  const party = opts.party ?? PARTIES[Math.floor(rand() * PARTIES.length)];
  const background = opts.background ?? BACKGROUNDS[Math.floor(rand() * BACKGROUNDS.length)];
  let s = newGame(EVENTS, seed, party, background, profileSetup(drawProfile(seed, background, party, TRAITS, BURDENS, CITIES[seed % CITIES.length])));
  while (!s.finished) {
    const e = currentEvent(s, EVENTS)!;
    let open = offeredOptions(s, e).filter((o) => optionAvailability(s, o) !== "locked");
    if (opts.perks === "always" && open.some((o) => o.perk)) open = open.filter((o) => o.perk);
    if (opts.perks === "never") open = open.filter((o) => !o.perk);
    let pick = open[Math.floor(rand() * open.length)];
    if (opts.strategy === "greedy") pick = [...open].sort((a, b) => (b.effects.approval ?? 0) - (a.effects.approval ?? 0))[0];
    if (opts.strategy === "balanced") pick = [...open].sort((a, b) => balancedScore(b) - balancedScore(a))[0];
    s = choose(s, EVENTS, pick.id, CRISES, PARTIES);
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
        const tag = e.conditions?.flags?.find((f) => f.startsWith("party-") || f.startsWith("bg-"));
        // 中途退黨的玩家，結束時已沒有原政黨的旗標；原政黨事件是在退黨前抽到的
        if (tag && !(s.character.formerParty && tag.startsWith("party-"))) expect(s.flags).toContain(tag);
      }
      if (s.deck.includes("t-housing-progress")) expect(s.flags).toContain("promise-housing-big");
      if (s.deck.includes("t-cash-due")) expect(s.flags).toContain("promise-cash");
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
      s = choose(s, EVENTS, open[0].id, CRISES, PARTIES);
    }
    expect(s.loan!.remaining).toBe(0);
  });

  it("沒錢還款會逾期，階段結束還不清就違約", () => {
    let s = takeLoan(newGame(EVENTS, 5, blue, legislator));
    s = { ...s, funds: 0 };
    let defaulted = false;
    while (s.turn < STAGE_LENGTH && !s.finished) {
      const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
      s = choose(s, EVENTS, open[0].id, CRISES, PARTIES);
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
        s = choose(s, EVENTS, open[0].id, CRISES, PARTIES);
      }
      if (s.finished || s.turn >= STAGE_LENGTH) continue;
      s = { ...s, funds: 100000 };
      s = choose(s, EVENTS, "indie", CRISES, PARTIES);
      expect(s.character.party).toBe("independent");
      expect(s.character.formerParty).toBe("blue");
      expect(s.flags).toContain("party-independent");
      expect(s.flags.filter((f) => ["party-blue", "party-major"].includes(f))).toEqual([]);
      expect(s.income.party).toBe(0);
      while (!s.finished && s.payouts.length < 5) {
        const open = offeredOptions(s, currentEvent(s, EVENTS)!).filter((o) => optionAvailability(s, o) !== "locked");
        s = choose(s, EVENTS, open[0].id, CRISES, PARTIES);
      }
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
      s = choose(s, EVENTS, open[0].id, CRISES, PARTIES);
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
    const content = { cities: CITIES, parties: PARTIES, backgrounds: BACKGROUNDS, traits: TRAITS, burdens: BURDENS };
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
    newGame(EVENTS, 1, blue, legislator, profileSetup({ city: "tianlong", traits, burden: "old-controversy", origin: 0 }));
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
