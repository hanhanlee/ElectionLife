// 設定畫面的難度估算：用隨機玩法模擬競選期，算出第一次投票的當選率。

import { choose, currentEvent, newGame, offeredOptions, optionAvailability, type ProfileSetup } from "./engine";
import { mulberry32 } from "./rng";
import type { ArcDef, Background, Crisis, GameEvent, Party } from "./types";

export function estimateFirstWinRate(
  events: GameEvent[],
  crises: Crisis[],
  parties: Party[],
  party: Party,
  background: Background,
  setup?: ProfileSetup,
  n = 300,
  arcs: ArcDef[] = [],
): number {
  let wins = 0;
  for (let seed = 1; seed <= n; seed++) {
    const rand = mulberry32(seed * 7919);
    let s = newGame(events, seed, party, background, setup);
    while (!s.firstElection) {
      const open = offeredOptions(s, currentEvent(s, events)!).filter((o) => optionAvailability(s, o) !== "locked");
      s = choose(s, events, open[Math.floor(rand() * open.length)].id, crises, parties, arcs);
    }
    if (s.firstElection.won) wins++;
  }
  return wins / n;
}

export function difficultyLabel(winRate: number): string {
  if (winRate >= 0.55) return "簡單";
  if (winRate >= 0.35) return "普通";
  if (winRate >= 0.18) return "困難";
  return "地獄";
}
