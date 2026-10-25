import { describe, expect, it } from "vitest";
import { backgroundById, CRISES, EVENTS, PARTIES, partyById, specialSetup, ARCS } from "@/content";
import { choose, chooseInterlude, currentEvent, interludeEvent, newGame } from "./engine";
import { SPECIALS } from "./special";
import { buildPlay, choiceShare, STATS_MIN_SAMPLE, validatePlay, type PlayerStats } from "./stats";

const def = SPECIALS[0];

function finishedGame() {
  let s = newGame(EVENTS, 7, partyById(def.party), backgroundById(def.background), specialSetup(def), {
    special: def.id,
    startDelta: def.startDelta,
    disabledCrises: def.disabledCrises,
  });
  while (!s.finished) {
    const il = interludeEvent(s, EVENTS);
    if (il) {
      s = chooseInterlude(s, EVENTS, il.options[0].id, ARCS);
      continue;
    }
    const e = currentEvent(s, EVENTS)!;
    s = choose(s, EVENTS, e.options.find((o) => s.offered.includes(o.id))!.id, CRISES, PARTIES, ARCS, []);
  }
  return s;
}

describe("玩家統計", () => {
  it("一局的紀錄通過後端檢查，內容不變", () => {
    const g = finishedGame();
    const play = buildPlay("0b7c2f1e-1234-4abc-9def-001122334455", g, g.firstElection!.won, "沒有奇蹟", 3, 7);
    expect(play.picks).toHaveLength(12);
    expect(validatePlay(JSON.parse(JSON.stringify(play)))).toEqual(play);
  });

  it("格式不對、不收的特別篇、重複的題目、塞標籤的結局名稱都會被擋下", () => {
    const g = finishedGame();
    const ok = buildPlay("0b7c2f1e-1234-4abc-9def-001122334455", g, true, "不可能的任務", 2, 7);
    expect(validatePlay(null)).toBeNull();
    expect(validatePlay({ ...ok, id: "x" })).toBeNull();
    expect(validatePlay({ ...ok, scenario: "main" })).toBeNull();
    expect(validatePlay({ ...ok, sameAsReal: 9 })).toBeNull();
    expect(validatePlay({ ...ok, ending: "<script>" })).toBeNull();
    expect(validatePlay({ ...ok, picks: [...ok.picks, ok.picks[0]] })).toBeNull();
    expect(validatePlay({ ...ok, picks: [["Bad Id", "x"]] })).toBeNull();
    expect(validatePlay({ ...ok, won: "yes" })).toBeNull();
  });

  it("每題的比例：樣本不夠時不顯示", () => {
    const stats: PlayerStats = {
      plays: 40,
      wins: 10,
      simulated: 0,
      endings: {},
      sameAsReal: { sum: 0, plays: 40 },
      choices: { a: { x: 20, y: 9 }, b: { x: 30, y: 10 } },
    };
    expect(choiceShare(stats, "a", "x")).toBeUndefined();
    expect(choiceShare(stats, "b", "x")).toBe(75);
    expect(choiceShare(stats, "b", "z")).toBe(0);
    expect(choiceShare(stats, "c", "x")).toBeUndefined();
    expect(STATS_MIN_SAMPLE).toBeGreaterThanOrEqual(30);
  });
});
