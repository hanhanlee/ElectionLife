// 特別篇平衡模擬：平常不跑，設定 SIM_N 才會執行並輸出報表。
// SIM_N=10000 SIM_OUT=../docs/research/special-capital-sim.md npx vitest run src/game/special.sim.test.ts

import { writeFileSync } from "node:fs";
import { test } from "vitest";
import { ARCS, backgroundById, CRISES, EVENTS, PARTIES, partyById, specialSetup } from "@/content";
import { choose, chooseInterlude, currentEvent, interludeEvent, lacksFunds, newGame } from "./engine";
import { VOTE_WEIGHTS } from "./model";
import { mulberry32 } from "./rng";
import { SPECIALS, specialEnding } from "./special";
import type { GameOption, GameState } from "./types";

const def = SPECIALS[0];
const N = Number(process.env.SIM_N ?? 0);
type Pick = (opts: GameOption[], s: GameState, r: () => number) => GameOption;

const score = (o: GameOption, w: Partial<Record<string, number>>) =>
  Object.entries(o.effects).reduce((a, [k, v]) => a + (w[k] ?? 0) * (v as number), 0) + (o.funds ?? 0) / 1000;
const by = (w: Partial<Record<string, number>>): Pick => (opts) => [...opts].sort((a, b) => score(b, w) - score(a, w))[0];
const best = by({ ...VOTE_WEIGHTS, achievement: 0.28 });

/**
 * 現實路線：挑戰者在現實中的選擇（沒有對應的回合用高品質決策補）。
 * 用來檢查「照現實選，不會得到違反現實的結果」。
 */
const REAL_PATH: Record<string, string> = {
  "sp-capital-01": "defiant",
  "sp-capital-02": "warrior",
  "sp-capital-03": "local",
  "sp-capital-04": "enemy",
  "sp-capital-06": "earn",
  "sp-capital-07": "law",
  "sp-capital-08": "decouple",
  "sp-capital-09": "challenger",
  "sp-capital-m01": "explain",
  "sp-capital-m03": "unscripted",
  "sp-capital-m05": "substation",
  "sp-capital-m07": "attack",
  "sp-capital-n01": "same",
  "sp-capital-n03": "lunch",
  "sp-capital-n04": "soft",
  "sp-capital-n05": "ask",
  "sp-capital-n06": "more",
  "sp-capital-n07": "books",
};
const real: Pick = (o, s, r) => {
  const id = REAL_PATH[s.pendingInterlude ?? s.deck[s.turn]];
  return o.find((x) => x.id === id) ?? best(o, s, r);
};

/** 策略：隨機、穩健、最佳（依投票權重）、重視準備、只追聲量、一半最佳一半隨機、現實路線 */
const STRATEGIES: Record<string, Pick> = {
  現實路線: real,
  隨機遊玩: (o, _s, r) => o[Math.floor(r() * o.length)],
  保守穩健: by({ integrity: 1, team: 1, approval: 0.3 }),
  高品質決策: best,
  重視準備: (o, s, r) => o.find((x) => x.setFlags?.includes("policy-evidence")) ?? by({ achievement: 1, approval: 0.3 })(o, s, r),
  只追聲量: by({ media: 1, approval: 0.2 }),
  混合: (o, s, r) => (r() < 0.5 ? best(o, s, r) : o[Math.floor(r() * o.length)]),
};

function play(seed: number, pick: Pick, branch: boolean): GameState {
  let s = newGame(EVENTS, seed, partyById(def.party), backgroundById(def.background), specialSetup(def), {
    special: def.id,
    specialBranch: branch,
    startDelta: def.startDelta,
    disabledCrises: def.disabledCrises,
  });
  const r = mulberry32(seed * 7 + 1);
  while (!s.finished) {
    const il = interludeEvent(s, EVENTS);
    if (il) {
      s = chooseInterlude(s, EVENTS, pick(il.options.filter((o) => !lacksFunds(s, o)), s, r).id, ARCS);
      continue;
    }
    const e = currentEvent(s, EVENTS)!;
    const opts = e.options.filter((o) => s.offered.includes(o.id) && !lacksFunds(s, o));
    s = choose(s, EVENTS, pick(opts, s, r).id, CRISES, PARTIES, ARCS, []);
  }
  return s;
}

const title = (id: string) => EVENTS.find((e) => e.id === id)!.title;
const count = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);

test.skipIf(!N)("特別篇平衡模擬", () => {
  const out: string[] = [`每種策略 ${N.toLocaleString()} 局（種子 1–${N}），每局都是 12 回合。`];
  for (const branch of [false, true]) {
    out.push(`\n### ${branch ? "分支模式（第二局起）" : "固定版（第一局）"}\n`);
    out.push("| 策略 | 勝局數 | 勝率 | 平均模型勝率 | 最終支持度 P10／P50／P90 | 每局插曲 | 每局替換事件 |", "|---|---|---|---|---|---|---|");
    const endRows: string[] = [];
    const cards: Record<string, number> = {};
    for (const [name, pick] of Object.entries(STRATEGIES)) {
      let wins = 0;
      let p = 0;
      let interludes = 0;
      let swaps = 0;
      const endings: Record<string, number> = {};
      const crises: Record<string, number> = {};
      const approval: number[] = [];
      for (let seed = 1; seed <= N; seed++) {
        const g = play(seed, pick, branch);
        const { won, probability } = g.firstElection!;
        if (won) wins++;
        p += probability;
        approval.push(g.stats.approval);
        interludes += g.interludes!.length;
        const swapped = g.history.filter((h, i) => EVENTS.find((e) => e.id === h.eventId)!.specialTurn !== i + 1);
        swaps += swapped.length;
        if (name === "隨機遊玩") for (const id of [...swapped.map((h) => h.eventId), ...g.interludes!.map((i) => i.eventId)]) count(cards, id);
        count(endings, specialEnding(def, g, won, probability, EVENTS).title);
        for (const c of g.crisisLog) count(crises, c.id);
      }
      approval.sort((a, b) => a - b);
      const pct = (q: number) => approval[Math.floor(N * q)];
      out.push(
        `| ${name} | ${wins.toLocaleString()} | ${((wins / N) * 100).toFixed(1)}% | ${((p / N) * 100).toFixed(1)}% | ${pct(0.1)}／${pct(0.5)}／${pct(0.9)} | ${(interludes / N).toFixed(2)} | ${(swaps / N).toFixed(2)} |`,
      );
      const list = (m: Record<string, number>, unit = "") =>
        Object.entries(m)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${v.toLocaleString()}${unit}`)
          .join("、") || "—";
      endRows.push(`| ${name} | ${list(endings)} | ${list(crises, " 次")} |`);
    }
    out.push("\n結局筆數（每局一個結局）與突發事件觸發次數（一局可能觸發多次）：\n", "| 策略 | 結局筆數 | 突發事件觸發次數 |", "|---|---|---|", ...endRows);
    out.push(`\n隨機遊玩時，各替換事件與插曲的出現局數（共 ${N.toLocaleString()} 局）：\n`, "| 卡 | 出現局數 |", "|---|---|");
    for (const [id, v] of Object.entries(cards).sort((a, b) => b[1] - a[1])) {
      out.push(`| ${id.replace("sp-capital-", "").toUpperCase()} ${title(id)} | ${v.toLocaleString()} |`);
    }
  }
  writeFileSync(process.env.SIM_OUT ?? "special-sim.md", out.join("\n") + "\n");
}, 3_600_000);
