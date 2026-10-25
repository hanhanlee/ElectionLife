// 玩家統計的基礎樣本：用模擬器打 N 局，輸出成 SQL（simulated = 1）。平常不跑，設定 SEED_OUT 才執行。
// SEED_N=100 SEED_OUT=../worker/seed.sql npx vitest run src/game/special.seed.test.ts
// 結局頁會標明「含 N 局電腦模擬的基礎樣本」，真人玩到 300 局後不再計入。

import { writeFileSync } from "node:fs";
import { test } from "vitest";
import { ARCS, backgroundById, CRISES, EVENTS, PARTIES, partyById, specialSetup } from "@/content";
import { choose, chooseInterlude, currentEvent, interludeEvent, newGame } from "./engine";
import { VOTE_WEIGHTS } from "./model";
import { mulberry32 } from "./rng";
import { realityCheck, SPECIALS, specialEnding } from "./special";
import { buildPlay } from "./stats";
import type { GameOption, GameState } from "./types";

const def = SPECIALS[0];
const OUT = process.env.SEED_OUT;
const N = Number(process.env.SEED_N ?? 100);
type Pick = (opts: GameOption[], s: GameState, r: () => number) => GameOption;

const score = (o: GameOption, w: Partial<Record<string, number>>) => Object.entries(o.effects).reduce((a, [k, v]) => a + (w[k] ?? 0) * (v as number), 0);
const best: Pick = (opts) => [...opts].sort((a, b) => score(b, VOTE_WEIGHTS) - score(a, VOTE_WEIGHTS))[0];
const random: Pick = (o, _s, r) => o[Math.floor(r() * o.length)];
const real: Pick = (o, s, r) => o.find((x) => x.id === def.realChoices[s.pendingInterlude ?? s.deck[s.turn]]) ?? random(o, s, r);
const careful: Pick = (o, s, r) => o.find((x) => x.setFlags?.includes("policy-evidence")) ?? (r() < 0.5 ? best(o, s, r) : random(o, s, r));
/** 玩家大多半認真半隨興；少數完全隨便、少數照現實或很會算 */
const MIX: [number, Pick][] = [
  [0.4, (o, s, r) => (r() < 0.5 ? best(o, s, r) : random(o, s, r))],
  [0.2, random],
  [0.15, careful],
  [0.15, real],
  [0.1, best],
];

function play(seed: number, pick: Pick, branch: boolean): GameState {
  let s = newGame(EVENTS, seed, partyById(def.party), backgroundById(def.background), specialSetup(def), {
    special: def.id,
    specialBranch: branch,
    startDelta: def.startDelta,
    disabledCrises: def.disabledCrises,
  });
  const r = mulberry32(seed * 13 + 5);
  while (!s.finished) {
    const il = interludeEvent(s, EVENTS);
    if (il) {
      s = chooseInterlude(s, EVENTS, pick(il.options, s, r).id, ARCS);
      continue;
    }
    const e = currentEvent(s, EVENTS)!;
    s = choose(s, EVENTS, pick(e.options.filter((o) => s.offered.includes(o.id)), s, r).id, CRISES, PARTIES, ARCS, []);
  }
  return s;
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

test.skipIf(!OUT)("玩家統計的基礎樣本", () => {
  const rows: string[] = [];
  const pickR = mulberry32(20261025);
  const start = Date.now();
  for (let i = 0; i < N; i++) {
    const x = pickR();
    let acc = 0;
    const strategy = MIX.find(([w]) => (acc += w) > x)?.[1] ?? random;
    const branch = pickR() < 0.35;
    const g = play(900_000 + i, strategy, branch);
    const { won, probability } = g.firstElection!;
    const check = realityCheck(def, g, EVENTS, won);
    const ending = specialEnding(def, g, won, probability, EVENTS).title;
    const p = buildPlay(`sim-${String(i + 1).padStart(4, "0")}`, g, won, ending, check.same, check.rows.length);
    rows.push(
      `INSERT OR IGNORE INTO plays (id, scenario, branch, won, ending, same_real, real_total, ip_hash, created_at, simulated) VALUES (${q(p.id)}, ${q(p.scenario)}, ${p.branch ? 1 : 0}, ${p.won ? 1 : 0}, ${q(p.ending)}, ${p.sameAsReal}, ${p.realTotal}, 'simulated', ${start + i}, 1);`,
    );
    for (const [e, o] of p.picks) rows.push(`INSERT OR IGNORE INTO picks VALUES (${q(p.id)}, ${q(p.scenario)}, ${q(e)}, ${q(o)}, 0);`);
    for (const [e, o] of p.interludes) rows.push(`INSERT OR IGNORE INTO picks VALUES (${q(p.id)}, ${q(p.scenario)}, ${q(e)}, ${q(o)}, 1);`);
  }
  writeFileSync(OUT!, rows.join("\n") + "\n", "utf8");
});
