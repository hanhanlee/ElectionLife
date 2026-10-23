"use client";

import { useEffect, useState } from "react";
import { EVENTS } from "@/content";
import { choose, currentEvent, newGame, optionAvailability, TURN_PLAN } from "@/game/engine";
import { summarize } from "@/game/endings";
import { VOTE_WEIGHTS, WEIGHT_NOTES, MODEL_VERSION } from "@/game/model";
import { newSeed } from "@/game/rng";
import { clearGame, loadGame, saveGame } from "@/game/storage";
import {
  ALL_STATS,
  STAT_LABELS,
  VISIBLE_STATS,
  type GameState,
  type Stats,
  type StatKey,
} from "@/game/types";
import styles from "./page.module.css";

interface Outcome {
  text: string;
  delta: Stats;
  notices: string[];
}

const PHASE_LABEL = { campaign: "競選期", term: "任期", reelection: "連任選戰" } as const;

export default function Game() {
  const [game, setGame] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    // 存檔只在瀏覽器端讀取，避免伺服器輸出與客戶端不一致
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(loadGame());
  }, []);

  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);

  function start(state: GameState) {
    setOutcome(null);
    setGame(state);
  }

  function restart() {
    clearGame();
    setSaved(null);
    start(newGame(EVENTS, newSeed()));
  }

  if (!game) {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>選舉人生：市長篇</h1>
        <p className={styles.lead}>
          你是一座虛構城市的市長候選人。12 個決定，4 年任期，一場連任選舉。
          事件取材自過去 20 年的公開報導，並已虛構化。
        </p>
        <button className={styles.primary} onClick={restart}>開始參選</button>
        {saved && !saved.finished && (
          <button className={styles.secondary} onClick={() => start(saved)}>
            繼續上一局（第 {saved.turn + 1} 回合）
          </button>
        )}
      </main>
    );
  }

  if (game.finished && !outcome) return <EndScreen state={game} onRestart={restart} />;

  const event = outcome ? undefined : currentEvent(game, EVENTS);
  // 顯示結果時 turn 已前進，標題仍停在剛做完的那一回合
  const shownTurn = outcome ? game.turn - 1 : game.turn;

  return (
    <main className={styles.main}>
      <StatBar stats={game.stats} />
      <p className={styles.turn}>
        第 {shownTurn + 1} / {TURN_PLAN.length} 回合 · {PHASE_LABEL[TURN_PLAN[shownTurn]]}
      </p>

      {outcome ? (
        <section className={styles.card}>
          <p className={styles.outcome}>{outcome.text}</p>
          <DeltaList delta={outcome.delta} />
          {outcome.notices.map((n) => (
            <p key={n} className={styles.notice}>⚠ {n}</p>
          ))}
          {game.turn === 2 && <p className={styles.notice}>🎉 你當選市長了。現在，那些承諾都是你的了。</p>}
          <button className={styles.primary} onClick={() => setOutcome(null)}>
            {game.finished ? "開票" : "下一回合"}
          </button>
        </section>
      ) : (
        event && (
          <section className={styles.card}>
            <h2>{event.title}</h2>
            <p>{event.scenario}</p>
            <div className={styles.options}>
              {event.options.map((o) => {
                const avail = optionAvailability(game, o);
                return (
                  <button
                    key={o.id}
                    className={avail === "open" ? styles.option : styles.optionLocked}
                    disabled={avail === "locked"}
                    onClick={() => {
                      const next = choose(game, EVENTS, o.id);
                      const last = next.history[next.history.length - 1];
                      setOutcome({ text: o.outcome, delta: last.delta, notices: next.notices });
                      setGame(next);
                    }}
                  >
                    {o.label}
                    {avail === "unlockable" && (
                      <small> · 解鎖代價：{formatDelta(o.unlockCost!)}</small>
                    )}
                    {o.legalRisk && <small> · ⚖ {o.legalRisk}</small>}
                  </button>
                );
              })}
            </div>
          </section>
        )
      )}
    </main>
  );
}

function StatBar({ stats }: { stats: Stats }) {
  return (
    <div className={styles.stats}>
      {VISIBLE_STATS.map((k) => (
        <div key={k} className={styles.stat}>
          <span>{STAT_LABELS[k]}</span>
          <div className={styles.meter}>
            <div style={{ width: `${stats[k]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDelta(delta: Partial<Stats>, keys: readonly StatKey[] = ALL_STATS): string {
  return keys
    .filter((k) => delta[k])
    .map((k) => `${STAT_LABELS[k]} ${delta[k]! > 0 ? "+" : ""}${delta[k]}`)
    .join("、");
}

function DeltaList({ delta }: { delta: Stats }) {
  const text = formatDelta(delta, VISIBLE_STATS);
  return text ? <p className={styles.delta}>{text}</p> : null;
}

function EndScreen({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const s = summarize(state);
  const played = state.history.map((h) => EVENTS.find((e) => e.id === h.eventId)!);

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className={styles.turn}>{s.election.won ? "連任成功" : "連任失敗"}</p>
        <h1 className={styles.title}>{s.ending.title}</h1>
        <p className={styles.lead}>{s.ending.tagline}</p>
        <p>{s.persona}</p>
      </section>

      <section className={styles.card}>
        <h2>兩張成績單</h2>
        <ul className={styles.list}>
          {ALL_STATS.map((k) => (
            <li key={k}>{STAT_LABELS[k]}：{state.stats[k]}</li>
          ))}
        </ul>
        {s.leftovers.length > 0 && (
          <>
            <h3>留給下一任的帳單</h3>
            {s.leftovers.map((t) => <p key={t} className={styles.notice}>{t}</p>)}
          </>
        )}
      </section>

      <section className={styles.card}>
        <h2>為什麼是這個結果？</h2>
        <p>模型估計的連任機率：{Math.round(s.election.probability * 100)}%</p>
        <ul className={styles.list}>
          {s.election.contributions.filter((c) => VOTE_WEIGHTS[c.stat] > 0).map((c) => (
            <li key={c.stat}>
              {STAT_LABELS[c.stat]}：{c.value >= 0 ? "加分" : "扣分"} {Math.abs(c.value).toFixed(2)}
              {WEIGHT_NOTES[c.stat] && <small> — {WEIGHT_NOTES[c.stat]}</small>}
            </li>
          ))}
        </ul>
        <p><small>{WEIGHT_NOTES.integrity}（模型版本 {MODEL_VERSION}，非真實得票預測）</small></p>
      </section>

      <section className={styles.card}>
        <h2>真實事件原型</h2>
        <ul className={styles.list}>
          {played.map((e) => (
            <li key={e.id}>
              <strong>{e.title}</strong>：{e.source.prototype}
              {e.source.status !== "verified" && <small>（查核中）</small>}
              {e.source.refs.map((r) => (
                <a key={r.url} href={r.url} target="_blank" rel="noreferrer"> [{r.title}]</a>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <button className={styles.primary} onClick={onRestart}>再選一次</button>
    </main>
  );
}
