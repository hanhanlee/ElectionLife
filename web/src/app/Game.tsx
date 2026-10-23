"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  backgroundById,
  BACKGROUNDS,
  BURDENS,
  CITIES,
  cityById,
  CRISES,
  EVENTS,
  HISTORY,
  PARTIES,
  partyById,
  profileSetup,
  TRAITS,
} from "@/content";
import {
  canTakeLoan,
  choose,
  currentEvent,
  FIRST_ELECTION_TURN,
  newGame,
  offeredOptions,
  isCampaignTurn,
  lacksFunds,
  nextPayout,
  setScale,
  optionAvailability,
  takeLoan,
  TURN_PLAN,
} from "@/game/engine";
import { difficultyLabel, estimateFirstWinRate } from "@/game/difficulty";
import { composeIntro, drawCharacter, type DrawnCharacter } from "@/game/profile";
import RollingScreen from "./RollingScreen";
import ResultBanner from "./ResultBanner";
import { buildEpilogue } from "@/game/epilogue";
import { summarize, type FinalStage, type ReflectionItem } from "@/game/endings";
import {
  CAMPAIGN_SCALES,
  LOAN_AMOUNT,
  LOAN_INTEREST,
  MODEL_VERSION,
  OFFICE_UPKEEP,
  scaleCost,
  STAGE_LENGTH,
  VOTE_WEIGHTS,
  WEIGHT_NOTES,
} from "@/game/model";
import { newSeed } from "@/game/rng";
import { clearGame, loadGame, saveGame } from "@/game/storage";
import {
  ALL_STATS,
  ISSUE_LABELS,
  STAT_HINTS,
  STAT_LABELS,
  VISIBLE_STATS,
  type CampaignScale,
  type Condition,
  type Notice,
  type GameState,
  type Issue,
  type Phase,
  type SourceStatus,
  type Stats,
  type StatKey,
} from "@/game/types";
import styles from "./page.module.css";

interface Outcome {
  text: string;
  /** 只有選項本身的效果；延遲後果與突發事件在 notices 裡分開顯示 */
  delta: Stats;
  funds?: number;
  notices: Notice[];
}

const PHASE_LABEL: Record<Phase, string> = {
  launch: "參選",
  platform: "政見",
  campaign: "選戰",
  eve: "選前之夜",
  term: "任期",
  incumbency: "任期尾聲・現任限定",
  reelection: "連任選戰",
};

function phaseLabel(state: GameState, phase: Phase): string {
  if (phase === "reelection" && state.flags.includes("bg-incumbent")) return "接班選戰";
  return PHASE_LABEL[phase];
}

function characterLabel(state: GameState): string {
  const { party, formerParty, background, profile } = state.character;
  const partyName = formerParty
    ? `${partyById(party).name}（退出${partyById(formerParty).name}）`
    : partyById(party).name;
  const city = profile ? `${cityById(profile.city).name}・` : "";
  return `${city}${partyName}・${backgroundById(background).name}`;
}

const CHARACTER_CONTENT = { cities: CITIES, parties: PARTIES, backgrounds: BACKGROUNDS, traits: TRAITS, burdens: BURDENS };

export default function Game() {
  const [game, setGame] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** 開局設定：先播放「正在隨機你的人生」，再顯示角色卡 */
  const [setup, setSetup] = useState<{ character: DrawnCharacter; rolling: boolean } | null>(null);

  useEffect(() => {
    // 存檔只在瀏覽器端讀取，避免伺服器輸出與客戶端不一致
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(loadGame());
  }, []);

  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);

  function start(state: GameState) {
    setSetup(null);
    setOutcome(null);
    setGame(state);
  }

  function restart() {
    clearGame();
    setSaved(null);
    setGame(null);
    setOutcome(null);
    setSetup({ character: drawCharacter(newSeed(), CHARACTER_CONTENT), rolling: true });
  }

  const finishRolling = useCallback(() => setSetup((s) => (s ? { ...s, rolling: false } : s)), []);

  /** 宣布退選：放棄這一局，回到開始畫面 */
  function withdraw() {
    clearGame();
    setSaved(null);
    setGame(null);
    setOutcome(null);
    setSetup(null);
  }

  if (setup) {
    const { character } = setup;
    if (setup.rolling) return <RollingScreen character={character} onDone={finishRolling} />;
    return (
      <CharacterReveal
        character={character}
        onStart={() =>
          start(newGame(EVENTS, newSeed(), character.party, character.background, profileSetup(character.profile)))
        }
      />
    );
  }

  if (!game) {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>選舉人生：市長篇</h1>
        <p className={styles.lead}>
          你的城市、政黨、出身和個性，全部隨機決定。你只能決定接下來怎麼選。當選之後，還有四年任期和下一場選舉在等你。
          事件與政見取材自過去 20 年的選舉公報與公開報導，並已虛構化。
        </p>
        <button className={styles.primary} onClick={restart}>開始參選</button>
        {saved && !saved.finished && (
          <button className={styles.secondary} onClick={() => start(saved)}>
            繼續上一局（{characterLabel(saved)}，第 {saved.turn + 1} 回合）
          </button>
        )}
      </main>
    );
  }

  if (game.finished && !outcome) return <EndScreen state={game} onRestart={restart} />;

  const event = outcome ? undefined : currentEvent(game, EVENTS);
  // 顯示結果時 turn 已前進，標題仍停在剛做完的那一回合
  const shownTurn = outcome ? game.turn - 1 : game.turn;
  const justVoted = outcome && game.turn === FIRST_ELECTION_TURN && game.firstElection;

  return (
    <main className={styles.main}>
      <p className={styles.turn}>
        {characterLabel(game)}　<span className={styles.funds}>💰 競選經費 {formatFunds(game.funds)}</span>
        {game.loan && game.loan.remaining > 0 && (
          <span className={styles.funds}>
            ｜貸款還剩 {formatFunds(game.loan.remaining)}，每回合還 {formatFunds(game.loan.installment)}
          </span>
        )}
      </p>
      <StatBar stats={game.stats} />
      <p className={styles.turn}>
        {stageLabel(game, shownTurn)} 第 {(shownTurn % STAGE_LENGTH) + 1} / {STAGE_LENGTH} 回合 ·{" "}
        {phaseLabel(game, TURN_PLAN[shownTurn])}
      </p>
      {!outcome && <BudgetPanel state={game} onScale={(scale) => setGame(setScale(game, scale))} />}
      {!outcome && canTakeLoan(game) && <LoanOffer state={game} onTake={() => setGame(takeLoan(game))} />}

      {outcome ? (
        <section className={styles.card}>
          <p className={styles.outcome}>{outcome.text}</p>
          <DeltaList delta={outcome.delta} funds={outcome.funds} />
          {outcome.notices.map((n) => (
            <NoticeView key={n.text} notice={n} />
          ))}
          {justVoted && <FirstElectionNotice state={game} />}
          <button className={styles.primary} onClick={() => setOutcome(null)}>
            {game.finished ? "看結果" : justVoted ? "進入第二階段" : "下一回合"}
          </button>
        </section>
      ) : (
        event && (
          <section className={styles.card}>
            {game.turn === 0 && game.notices.map((n) => <NoticeView key={n.text} notice={n} />)}
            <h2>{event.title}</h2>
            <p>{event.scenario}</p>
            <div className={styles.options}>
              {offeredOptions(game, event).map((o) => {
                const avail = optionAvailability(game, o);
                return (
                  <button
                    key={o.id}
                    className={avail === "open" ? styles.option : styles.optionLocked}
                    disabled={avail === "locked"}
                    onClick={() => {
                      const next = choose(game, EVENTS, o.id, CRISES, PARTIES);
                      const last = next.history[next.history.length - 1];
                      setOutcome({ text: last.outcome, delta: last.optionDelta, funds: o.funds, notices: next.notices });
                      setGame(next);
                    }}
                  >
                    {o.label}
                    {avail === "unlockable" && (
                      <small> · 解鎖代價：{formatDelta(o.unlockCost!)}</small>
                    )}
                    {o.funds !== undefined && (
                      <small className={styles.funds}>
                        {" "}· 經費 {o.funds > 0 ? "+" : "−"}{formatFunds(Math.abs(o.funds))}
                      </small>
                    )}
                    {avail === "locked" && (
                      <small> · 🔒 {lacksFunds(game, o) ? "經費不足" : requirementText(o.requires)}</small>
                    )}
                    {o.legalRisk && <small> · ⚖ {o.legalRisk}</small>}
                    {o.perk && <small> · 🏛 動用現任資源{o.effects.treasury ? "（市府出錢）" : ""}</small>}
                  </button>
                );
              })}
            </div>
          </section>
        )
      )}
      {!game.finished && <WithdrawButton onConfirm={withdraw} />}
    </main>
  );
}

/** 遊戲中隨時可以宣布退選；按兩次才生效，避免誤觸 */
function WithdrawButton({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button className={styles.quiet} onClick={() => setAsking(true)}>
        宣布退選
      </button>
    );
  }
  return (
    <div className={styles.crisis}>
      <p>確定要宣布退選嗎？這一局會結束，回到開始畫面重新來過。</p>
      <div className={styles.choiceRow}>
        <button className={styles.choiceActive} onClick={onConfirm}>
          確定退選
        </button>
        <button className={styles.choice} onClick={() => setAsking(false)}>
          繼續選下去
        </button>
      </div>
    </div>
  );
}

function TraitList({ advantages, baggage }: { advantages: string[]; baggage: string[] }) {
  return (
    <ul className={styles.traits}>
      {advantages.map((a) => <li key={a}>＋ {a}</li>)}
      {baggage.map((b) => <li key={b} className={styles.baggage}>－ {b}</li>)}
    </ul>
  );
}

function CharacterReveal({ character, onStart }: { character: DrawnCharacter; onStart: () => void }) {
  const { city, party, background, profile } = character;
  const winRate = useMemo(
    () => estimateFirstWinRate(EVENTS, CRISES, PARTIES, party, background, profileSetup(profile)),
    [party, background, profile],
  );
  const intro = composeIntro(profile, background, party, TRAITS, BURDENS, city);
  const tags = [
    ...profile.traits.map((id) => TRAITS.find((t) => t.id === id)!.name),
    BURDENS.find((b) => b.id === profile.burden)!.name,
  ];
  const challengers = HISTORY.challengers[party.id as keyof typeof HISTORY.challengers];

  return (
    <main className={styles.main}>
      <p className={styles.turn}>
        {city.name}・{party.name}
      </p>
      <h1 className={styles.title}>你的身分：{background.name}</h1>
      <section className={styles.card}>
        <div className={styles.tags}>
          {tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
        <p className={styles.intro}>{intro}</p>
      </section>
      <section className={styles.card}>
        <h2>{city.name}</h2>
        <p>{city.tagline}</p>
        <p>{city.voters}</p>
        <div className={styles.tags}>
          {city.voterGroups.map((g) => (
            <span key={g.name} className={styles.tag}>
              {g.name} {g.share}%
            </span>
          ))}
        </div>
        <p>
          <small>
            選民最在意：
            {(Object.entries(city.issueWeights) as [Issue, number][])
              .filter(([, w]) => w >= 1.2)
              .sort((a, b) => b[1] - a[1])
              .map(([issue]) => ISSUE_LABELS[issue])
              .join("、")}
          </small>
        </p>
      </section>
      <section className={styles.card}>
        <h2>{party.name}</h2>
        <p>{party.description}</p>
        <TraitList advantages={party.advantages} baggage={party.baggage} />
        <p>
          <small className={styles.funds}>
            💰 {party.funding > 0 ? `每 3 回合黨部撥款約 ${formatFunds(party.funding)}` : "沒有黨部撥款"}
            {party.fundraising ? `；小額捐款能力 ×${party.fundraising}` : ""}
          </small>
        </p>
      </section>
      <section className={styles.card}>
        <h2>{background.name}</h2>
        <p>{background.description}</p>
        <TraitList advantages={background.advantages} baggage={background.baggage} />
        <p>
          <small className={styles.funds}>
            🤝 政商關係起始 {background.startDelta.business! > 0 ? "+" : ""}
            {background.startDelta.business}
            {background.fundraising ? `；小額捐款能力 ×${background.fundraising}` : ""}
          </small>
        </p>
      </section>
      <section className={styles.card}>
        <h2>難度：{difficultyLabel(winRate)}</h2>
        <p>以隨機玩法模擬 300 次競選，當選率約 <strong>{Math.round(winRate * 100)}%</strong>。</p>
        <p>
          <small>
            {background.incumbent
              ? `史實：${HISTORY.period} 年縣市長以上的現任者尋求連任，${HISTORY.overall.incumbents_running} 人中 ${HISTORY.overall.incumbents_won} 人成功。`
              : `史實：${HISTORY.period} 年縣市長以上的非現任「${party.name}」對應政黨候選人，${challengers.candidates} 人中 ${challengers.won} 人當選（${Math.round(challengers.win_rate * 100)}%）${challengers.candidates < 10 ? "，樣本很少，僅供參考" : ""}。`}
            資料來源：中選會選舉資料庫。
          </small>
        </p>
      </section>
      <button className={styles.primary} onClick={onStart}>開始參選</button>
    </main>
  );
}

function FirstElectionNotice({ state }: { state: GameState }) {
  const { won, probability, mobilization } = state.firstElection!;
  const incumbent = state.flags.includes("bg-incumbent");
  const pct = Math.round(probability * 100);
  const spent = mobilization > 0 ? `投票前投入選前動員 ${formatFunds(mobilization)}。` : "你沒有剩下任何經費做選前動員。";
  if (!won) {
    return (
      <p className={styles.notice}>
        🗳 {spent}開票結果：{incumbent ? "連任失敗" : "落選"}。（模型估計勝率 {pct}%）
      </p>
    );
  }
  return (
    <p className={styles.notice}>
      🗳 {spent}開票結果：
      {incumbent
        ? "連任成功！第二階段：第二任開始了，這次沒有連任壓力，最後要交棒給接班人。"
        : "當選！第二階段：任期開始了，那些承諾都是你的了。四年後，你要挑戰連任。"}
      （模型估計勝率 {pct}%）
    </p>
  );
}

function StatBar({ stats }: { stats: Stats }) {
  return (
    <>
      <div className={styles.stats}>
        {VISIBLE_STATS.map((k) => (
          <div key={k} className={styles.stat} title={STAT_HINTS[k]}>
            <span>
              {STAT_LABELS[k]} <b>{stats[k]}</b>
            </span>
            <div className={stats[k] <= 25 ? styles.meterLow : styles.meter}>
              <div style={{ width: `${stats[k]}%` }} />
            </div>
          </div>
        ))}
      </div>
      <details className={styles.hints}>
        <summary>每個數值有什麼用？</summary>
        <ul className={styles.list}>
          {[...VISIBLE_STATS, "integrity" as const].map((k) => (
            <li key={k}>
              <strong>{STAT_LABELS[k]}</strong>：{STAT_HINTS[k]}
            </li>
          ))}
          <li>
            <strong>競選經費</strong>：每 3 回合撥款一次（黨部、個人、募款）。辦活動要花錢，競選期每回合有總部開銷；
            投票前剩下的錢會自動投入選前動員（最多 4,000 萬），直接影響得票。
          </li>
        </ul>
      </details>
    </>
  );
}

function formatFunds(n: number): string {
  return `${n.toLocaleString()} 萬`;
}

const SCALE_ORDER: CampaignScale[] = ["lean", "standard", "full"];

/** 每回合的預算：競選回合選規模（人事、廣告、活動），任期中只有服務處開銷 */
function BudgetPanel({ state, onScale }: { state: GameState; onScale: (scale: CampaignScale) => void }) {
  const next = nextPayout(state);
  const loanDue = state.loan && state.loan.remaining > 0 ? state.loan.installment : 0;
  if (!isCampaignTurn(state.turn)) {
    return (
      <p className={styles.turn}>
        任期中：每回合服務處與政治幕僚開銷 {formatFunds(OFFICE_UPKEEP)}。下次入帳在 {next.inTurns} 回合後，預估{" "}
        {formatFunds(next.estimate)}。
      </p>
    );
  }
  const burn = scaleCost(state.scale) + loanDue;
  const lasts = burn > 0 ? Math.floor(state.funds / burn) : Infinity;
  return (
    <section className={styles.budget}>
      <div className={styles.scaleRow} role="radiogroup" aria-label="競選規模">
        {SCALE_ORDER.map((k) => {
          const plan = CAMPAIGN_SCALES[k];
          const effect = formatDelta(plan.effects);
          return (
            <button
              key={k}
              role="radio"
              aria-checked={state.scale === k}
              className={state.scale === k ? styles.scaleOn : styles.scaleOff}
              onClick={() => onScale(k)}
            >
              <strong>{plan.label}</strong>
              <span>{formatFunds(scaleCost(k))}／回合</span>
              <small>{effect || "沒有額外效果"}</small>
            </button>
          );
        })}
      </div>
      <p className={styles.budgetNote}>
        {CAMPAIGN_SCALES[state.scale].note}。人事 {CAMPAIGN_SCALES[state.scale].costs.staff}｜廣告{" "}
        {CAMPAIGN_SCALES[state.scale].costs.ads}｜活動 {CAMPAIGN_SCALES[state.scale].costs.events} 萬
        {loanDue > 0 && `，另有貸款還款 ${loanDue} 萬`}。
      </p>
      <p className={lasts <= next.inTurns ? styles.budgetWarn : styles.budgetNote}>
        照這個規模，經費可以撐 {lasts === Infinity ? "很久" : `${lasts} 回合`}；下次入帳在 {next.inTurns} 回合後，預估{" "}
        {formatFunds(next.estimate)}。
        {lasts < next.inTurns && " 撐不到下次入帳：會被迫縮編，連精簡都付不起就是欠薪。"}
      </p>
    </section>
  );
}

function FundsSummary({ state }: { state: GameState }) {
  const sum = (k: "party" | "donations" | "small") => state.payouts.reduce((s, p) => s + p[k], 0);
  const raised = state.history.reduce((s, h) => {
    const o = EVENTS.find((e) => e.id === h.eventId)?.options.find((x) => x.id === h.optionId);
    return s + Math.max(0, o?.funds ?? 0);
  }, 0);
  const loan = state.loan?.principal ?? 0;
  const income = sum("party") + sum("donations") + sum("small") + raised + loan;
  const sp = state.spending;
  const mobilization = state.firstElection?.mobilization ?? 0;
  return (
    <>
      <p>
        收入：黨部撥款 {formatFunds(sum("party"))}、政治獻金 {formatFunds(sum("donations"))}、小額捐款{" "}
        {formatFunds(sum("small"))}、其他募得 {formatFunds(raised)}
        {loan > 0 && `、個人貸款 ${formatFunds(loan)}`}，共 {formatFunds(income)}。
      </p>
      <p>
        支出：人事 {formatFunds(sp.staff)}、廣告 {formatFunds(sp.ads)}、造勢與活動 {formatFunds(sp.events + sp.options)}
        {sp.office > 0 && `、服務處 ${formatFunds(sp.office)}`}
        {mobilization > 0 && `、第一次選前動員 ${formatFunds(mobilization)}`}
        {sp.loan > 0 && `、貸款還款 ${formatFunds(sp.loan)}`}。剩下 {formatFunds(state.funds)}
        （最後一次投票前自動投入動員）。
      </p>
      {state.flags.includes("unpaid-staff") && <p className={styles.notice}>⚠ 你曾經連續欠薪，幕僚上網爆料。</p>}
    </>
  );
}

function stageLabel(state: GameState, turn: number): string {
  if (turn < STAGE_LENGTH) return "第一階段：競選";
  return state.flags.includes("bg-incumbent") ? "第二階段：第二任與接班" : "第二階段：任期與連任";
}

/** 個人貸款：整局一次，固定金額，借了之後每回合扣本金加利息，必須在這個階段結束前還清 */
function LoanOffer({ state, onTake }: { state: GameState; onTake: () => void }) {
  const total = Math.round(LOAN_AMOUNT * (1 + LOAN_INTEREST));
  const turnsLeft = (state.turn < STAGE_LENGTH ? STAGE_LENGTH : TURN_PLAN.length) - state.turn;
  return (
    <details className={styles.hints}>
      <summary>🏦 個人貸款（整局只能借一次）</summary>
      <p>
        借 {formatFunds(LOAN_AMOUNT)}，連本帶利要還 {formatFunds(total)}，從這回合起分 {turnsLeft} 期，每回合約還{" "}
        {formatFunds(Math.ceil(total / turnsLeft / 10) * 10)}，必須在這個階段結束前還清。付不出來會上新聞，到期還不清就是違約。
      </p>
      <button className={styles.secondary} onClick={onTake}>
        申請貸款
      </button>
    </details>
  );
}

/** 選項鎖住時顯示需要的數值，例如「需要 市庫財政 ≥ 30」 */
function requirementText(cond?: Condition): string {
  const parts = [
    ...Object.entries(cond?.min ?? {}).map(([k, v]) => `${STAT_LABELS[k as StatKey]} ≥ ${v}`),
    ...Object.entries(cond?.max ?? {}).map(([k, v]) => `${STAT_LABELS[k as StatKey]} ≤ ${v}`),
  ];
  return parts.length ? `需要 ${parts.join("、")}` : "條件未達成";
}

function NoticeView({ notice }: { notice: Notice }) {
  const impact = notice.effects && <DeltaList delta={notice.effects} funds={notice.funds} all />;
  if (notice.kind === "delayed") {
    return (
      <div>
        <p className={styles.notice}>⚠ {notice.text}</p>
        {impact}
      </div>
    );
  }
  if (notice.kind === "funds") {
    return (
      <div className={notice.tone === "good" ? styles.crisisGood : styles.crisis}>
        {notice.text.split("｜").map((line) => (
          <p key={line}>💰 {line}</p>
        ))}
      </div>
    );
  }
  return (
    <div className={notice.tone === "good" ? styles.crisisGood : styles.crisis}>
      <strong>{notice.tone === "good" ? "🎉 " : "🚨 "}突發事件：{notice.title}</strong>
      <p>{notice.text}</p>
      {impact}
    </div>
  );
}

function formatDelta(delta: Partial<Stats>, keys: readonly StatKey[] = ALL_STATS): string {
  return keys
    .filter((k) => delta[k])
    .map((k) => `${STAT_LABELS[k]} ${delta[k]! > 0 ? "+" : ""}${delta[k]}`)
    .join("、");
}

/** all：連隱藏的原則也顯示（突發事件的衝擊要讓玩家看清楚） */
function DeltaList({ delta, funds, all }: { delta: Partial<Stats>; funds?: number; all?: boolean }) {
  const parts = [formatDelta(delta, all ? ALL_STATS : VISIBLE_STATS)];
  if (funds) parts.push(`競選經費 ${funds > 0 ? "+" : "−"}${formatFunds(Math.abs(funds))}`);
  const text = parts.filter(Boolean).join("、");
  return text ? <p className={styles.delta}>{text}</p> : null;
}

const REFLECT_PREFIX: Record<ReflectionItem["kind"], string> = {
  tempting: "你為了選票：",
  principled: "你為了原則：",
  popular: "你最受歡迎的一招：",
};

/** 換你當選民：把玩家自己的選擇丟回給玩家，以選民的身分表態 */
function VoterReflection({ items, shareHead }: { items: ReflectionItem[]; shareHead: string }) {
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const tempting = items.filter((i) => i.kind === "tempting");
  const principled = items.find((i) => i.kind === "principled");
  const done = items.every((i) => i.id in answers);
  const rejected = tempting.filter((i) => answers[i.id] === false).length;

  const share =
    tempting.length > 0
      ? `${shareHead}。我用來拿選票的 ${tempting.length} 招裡，有 ${rejected} 招，我自己當選民時不會支持。`
      : `${shareHead}，而且沒用任何拿原則換選票的招。`;

  if (items.length === 0) return null;

  return (
    <section className={styles.card}>
      <h2>換你當選民</h2>
      <p>剛才你是候選人。現在換個位置：如果現實中的候選人做了這些事，你會支持他嗎？</p>
      {items.map((i) => (
        <div key={i.id} className={styles.reflect}>
          <p>
            <small>{REFLECT_PREFIX[i.kind]}{i.eventTitle}</small>
            <br />
            <strong>{i.optionLabel}</strong>
            <br />
            <small className={styles.delta}>
              民調 {i.approval > 0 ? "+" : ""}{i.approval}、原則 {i.integrity > 0 ? "+" : ""}{i.integrity}
              {i.perk && "、動用公家資源"}
            </small>
          </p>
          <div className={styles.choiceRow}>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                className={answers[i.id] === v ? styles.choiceActive : styles.choice}
                onClick={() => setAnswers({ ...answers, [i.id]: v })}
              >
                {v ? "我會支持" : "我不會支持"}
              </button>
            ))}
          </div>
        </div>
      ))}

      {done && (
        <div className={styles.reflectSummary}>
          {tempting.length > 0 ? (
            <p>
              你用來爭取選票的 {tempting.length} 個做法中，有 <strong>{rejected} 個</strong>是你身為選民不會支持的。
              {rejected > 0
                ? "選舉獎勵的，和我們希望候選人做的，不一定一樣。"
                : "你支持你自己的每一個選擇。下次現實中的候選人這樣做時，你也會這樣想嗎？"}
            </p>
          ) : (
            <p>你沒有用任何「拿原則換選票」的做法。這是你希望候選人做的事嗎？它也是讓候選人贏的事嗎？</p>
          )}
          {principled && (
            <p>
              {answers[principled.id]
                ? "你會支持為原則放棄民調的候選人。但在這場遊戲裡，原則不會直接換成選票。現實中，你的那一票會嗎？"
                : "你不會因為原則而支持他。那麼，候選人為什麼要選擇原則？"}
            </p>
          )}
          <p className={styles.share}>{share}</p>
          <button
            className={styles.secondary}
            onClick={() => {
              navigator.clipboard?.writeText(share).then(() => setCopied(true), () => setCopied(false));
            }}
          >
            {copied ? "已複製" : "複製這句話"}
          </button>
        </div>
      )}
    </section>
  );
}

const SOURCE_LABEL: Record<SourceStatus, string> = {
  placeholder: "虛構情境",
  real: "改編自真實事件，來源整理中",
  draft: "改編自真實事件，查核中",
  verified: "改編自真實事件，已查核",
};

const RESULT_LABEL: Record<FinalStage, [string, string]> = {
  first: ["當選", "落選"],
  reelection: ["連任成功", "連任失敗"],
  successor: ["接班成功", "接班失敗"],
};

function EndScreen({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const s = summarize(state, EVENTS);
  const played = state.history.map((h) => EVENTS.find((e) => e.id === h.eventId)!);
  const incumbent = state.flags.includes("bg-incumbent");
  const firstLabel: [string, string] = incumbent ? RESULT_LABEL.reelection : RESULT_LABEL.first;
  const [winText, loseText] = s.stage === "first" ? firstLabel : RESULT_LABEL[s.stage];
  const party = partyById(state.character.party);
  const challengers = HISTORY.challengers[party.id as keyof typeof HISTORY.challengers];

  const story = buildEpilogue(state, EVENTS, s);

  return (
    <main className={styles.main}>
      <ResultBanner
        won={s.election.won}
        result={s.election.won ? winText : loseText}
        character={characterLabel(state)}
        vote={Math.round(s.election.probability * 100)}
      />

      <section className={styles.card}>
        <p className={styles.turn}>後日談｜{s.ending.title}</p>
        <h1 className={styles.epilogueHeadline}>{story.headline}</h1>
        <p className={styles.lead}>{s.ending.tagline}</p>
        <div className={styles.epilogue}>
          {story.paragraphs.map((p) => <p key={p}>{p}</p>)}
        </div>
        <p><small>{s.persona}</small></p>
      </section>

      <div className={styles.endActions}>
        <button className={styles.primary} onClick={onRestart}>再來一局</button>
        <a className={styles.analysisLink} href="#analysis">往下看這一局的事件分析 ↓</a>
      </div>

      <div id="analysis" />
      <VoterReflection
        items={s.reflection}
        shareHead={`我在《選舉人生》以「${characterLabel(state)}」${s.election.won ? winText : loseText}`}
      />

      <section className={styles.card}>
        <h2>兩張成績單</h2>
        <FundsSummary state={state} />
        {state.crisisLog.length > 0 && (
          <p>
            突發事件：
            {state.crisisLog.map((l) => CRISES.find((c) => c.id === l.id)!.title).join("、")}
          </p>
        )}
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
        <p>模型估計的勝選機率：{Math.round(s.election.probability * 100)}%</p>
        <ul className={styles.list}>
          <li>
            選前動員：投入 {formatFunds(s.election.mobilization)}，加分 {s.election.mobilizationValue.toFixed(2)}
            <small> — 投票前剩下的競選經費會自動投入動員，最多 3,000 萬。</small>
          </li>
          {s.election.contributions.filter((c) => VOTE_WEIGHTS[c.stat] > 0).map((c) => (
            <li key={c.stat}>
              {STAT_LABELS[c.stat]}：{c.value >= 0 ? "加分" : "扣分"} {Math.abs(c.value).toFixed(2)}
              {c.stat === "achievement" && s.stage === "first" && !incumbent ? (
                <small> — 你還沒執政過；選民拿對手的政績和你比較。</small>
              ) : (
                WEIGHT_NOTES[c.stat] && <small> — {WEIGHT_NOTES[c.stat]}</small>
              )}
            </li>
          ))}
        </ul>
        <p><small>{WEIGHT_NOTES.integrity}（模型版本 {MODEL_VERSION}，非真實得票預測）</small></p>
      </section>

      {s.perks.available > 0 && (
        <section className={styles.card}>
          <h2>你的現任優勢</h2>
          <p>
            有 {s.perks.available} 次機會可以動用現任才有的資源：剪綵、市政廣告、加碼福利、大型活動曝光。
            你用了 <strong>{s.perks.count} 次</strong>
            {s.perks.count > 0 && (
              <>，民調因此 <strong>{s.perks.approval >= 0 ? "+" : ""}{s.perks.approval}</strong>
                （約為勝選機率模型加分 {((VOTE_WEIGHTS.approval * s.perks.approval) / 10).toFixed(2)}）</>
            )}
            。
          </p>
          {s.perks.treasury < 0 && (
            <p>
              這些活動花的是市府預算：市庫財政因此 <strong>{s.perks.treasury}</strong>，你的競選經費一毛未動。
              挑戰者想辦同樣規模的活動，得從自己的競選經費裡掏錢。
            </p>
          )}
          <p>
            {s.perks.count === 0
              ? "你一次都沒用。這很有原則，也讓你失去了大多數現任者都有的優勢。"
              : "這些資源都是市府的，也就是市民的。但站在台上的，是你。"}
          </p>
        </section>
      )}

      <section className={styles.card}>
        <h2>現實中呢？</h2>
        {s.stage === "first" && !incumbent ? (
          <p>
            {HISTORY.period} 年間，縣市長以上選舉中，非現任的「{party.name}」對應政黨候選人{" "}
            {challengers.candidates} 人中有 {challengers.won} 人當選（{Math.round(challengers.win_rate * 100)}%）。
            現任者尋求連任則有 {Math.round(HISTORY.overall.incumbent_win_rate * 100)}% 成功。
            挑戰者最大的對手，常常是現任者手上的資源。
          </p>
        ) : (
          <p>
            {HISTORY.period} 年間，縣市長以上的現任者尋求連任，{HISTORY.overall.incumbents_running} 人中有{" "}
            {HISTORY.overall.incumbents_won} 人成功，連任率{" "}
            <strong>{Math.round(HISTORY.overall.incumbent_win_rate * 100)}%</strong>。直轄市長是{" "}
            {HISTORY.direct_municipality.incumbents_running} 人中 {HISTORY.direct_municipality.incumbents_won} 人。
            現實中的現任優勢從哪裡來？很大一部分，就是你剛剛遇到的那些選擇。
          </p>
        )}
        <p>
          <small>
            資料來源：<a href={HISTORY.source_url} target="_blank" rel="noreferrer">{HISTORY.source_title}</a>
            （擷取於 {HISTORY.retrieved_at}）。描述性統計，不代表任何行為與當選的因果關係。
          </small>
        </p>
      </section>

      <section className={styles.card}>
        <h2>真實事件原型</h2>
        <ul className={styles.list}>
          {played.map((e) => (
            <li key={e.id}>
              <strong>{e.title}</strong>：{e.source.prototype}
              <small>（{SOURCE_LABEL[e.source.status]}）</small>
              {e.source.refs.map((r) => (
                <a key={r.url + r.quote} href={r.url} target="_blank" rel="noreferrer"> [{r.title}]</a>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <button className={styles.primary} onClick={onRestart}>再來一局</button>
    </main>
  );
}
