"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ARCS,
  backgroundById,
  BACKGROUNDS,
  BURDENS,
  CITIES,
  cityById,
  CRISES,
  EVENTS,
  FATES,
  HISTORY,
  LEGENDS,
  PARTIES,
  partyById,
  profileSetup,
  specialSetup,
  TRAITS,
} from "@/content";
import {
  canSetScale,
  canTakeLoan,
  choose,
  chooseFate,
  chooseInterlude,
  currentEvent,
  interludeEvent,
  FIRST_ELECTION_TURN,
  newGame,
  offeredOptions,
  displayOrder,
  isCampaignTurn,
  lacksFunds,
  nextPayout,
  nextScaleTurn,
  setScale,
  optionAvailability,
  takeLoan,
  TURN_PLAN,
  usesMoney,
} from "@/game/engine";
import { difficultyLabel, estimateFirstWinRate } from "@/game/difficulty";
import { composeIntro, describeOpponent, drawCharacter, type DrawnCharacter } from "@/game/profile";
import RollingScreen from "./RollingScreen";
import ResultBanner from "./ResultBanner";
import ShareCard from "./ShareCard";
import SiteFooter from "./SiteFooter";
import { cardKind, cardStory, firstPerson } from "@/game/shareCard";
import { buildEpilogue } from "@/game/epilogue";
import { staffReport } from "@/game/feedback";
import { arcProgress, fillArcText, openArcs } from "@/game/story";
import { summarize, type FinalStage, type ReflectionItem } from "@/game/endings";
import { choiceShare, percent, STATS_MIN_SAMPLE, type PlayerStats } from "@/game/stats";
import { usePlayerStats } from "./playerStats";
import { fillSaid, realityCheck, turningPoints, SPECIAL_SERIES, specialById, specialEnding, type SpecialDef } from "@/game/special";
import {
  CAMPAIGN_SCALES,
  FATE_ENABLED,
  LOAN_AMOUNT,
  LOAN_INTEREST,
  MOBILIZATION_CAP,
  MODEL_VERSION,
  OFFICE_UPKEEP,
  scaleCost,
  STAGE_LENGTH,
  VOTE_WEIGHTS,
  WEIGHT_NOTES,
} from "@/game/model";
import { newSeed } from "@/game/rng";
import { clearGame, hasStaleSave, loadGame, saveGame } from "@/game/storage";
import {
  ALL_STATS,
  HIDDEN_STATS,
  INTERLUDE_LABELS,
  ISSUE_LABELS,
  STAT_HINTS,
  STAT_LABELS,
  TRAIT_TIER_LABELS,
  VISIBLE_STATS,
  type ArcKind,
  type CampaignScale,
  type Condition,
  type FateCard,
  type FateKind,
  type Notice,
  type Opponent,
  type GameState,
  type FactLevel,
  type GameOption,
  type Issue,
  type Phase,
  type SourceStatus,
  type Stats,
  type StatKey,
} from "@/game/types";
import styles from "./page.module.css";

interface Outcome {
  /** 命運牌的結果有標題（牌名與成敗） */
  title?: string;
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

/** 數值的名稱與說明：特別篇會換掉其中幾個（例如「施政成果」改成「政策準備」） */
const StatText = createContext<{
  labels: Record<StatKey, string>;
  hints: Record<StatKey, string>;
  /** 這一局顯示的數值（特別篇只顯示用得到的） */
  visible: readonly StatKey[];
  /** 這一局算不算錢（特別篇不算） */
  money: boolean;
}>({ labels: STAT_LABELS, hints: STAT_HINTS, visible: VISIBLE_STATS, money: true });

function statTextFor(state: GameState) {
  const def = state.special ? specialById(state.special) : undefined;
  return def
    ? { labels: { ...STAT_LABELS, ...def.statLabels }, hints: { ...STAT_HINTS, ...def.statHints }, visible: def.visibleStats, money: false }
    : { labels: STAT_LABELS, hints: STAT_HINTS, visible: VISIBLE_STATS, money: true };
}

const FACT_TAG: Record<FactLevel, string> = {
  FACT: "📰 改編自真實事件",
  CLAIM: "🗣 取材自某方說法，不是查證過的結論",
  SIMULATION: "🎭 遊戲虛構",
};

/** 玩過特別篇之後，部分回合會換成替換事件（只記在這個瀏覽器） */
const specialPlayedKey = (id: string) => `election-life:special-played:${id}`;
function specialPlayed(id: string): boolean {
  try {
    return localStorage.getItem(specialPlayedKey(id)) === "1";
  } catch {
    return false;
  }
}

const CHARACTER_CONTENT = { cities: CITIES, parties: PARTIES, backgrounds: BACKGROUNDS, traits: TRAITS, burdens: BURDENS, legends: LEGENDS };

export default function Game() {
  const [game, setGame] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [stale, setStale] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** 開局設定：先播放「正在隨機你的人生」，再顯示角色卡 */
  const [setup, setSetup] = useState<{ character: DrawnCharacter; rolling: boolean } | null>(null);
  /** 特別篇的開場說明 */
  const [special, setSpecial] = useState<SpecialDef | null>(null);
  /** 特別篇的選邊頁：先選這場選舉，再選站哪一邊 */
  const [series, setSeries] = useState(false);

  useEffect(() => {
    // 存檔只在瀏覽器端讀取，避免伺服器輸出與客戶端不一致
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(loadGame());
    setStale(hasStaleSave());
  }, []);

  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);

  function start(state: GameState) {
    setSetup(null);
    setSpecial(null);
    setSeries(false);
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
    setSpecial(null);
    setSeries(false);
  }

  function startSpecial(def: SpecialDef) {
    start(
      newGame(EVENTS, newSeed(), partyById(def.party), backgroundById(def.background), specialSetup(def), {
        special: def.id,
        specialBranch: specialPlayed(def.id),
        startDelta: def.startDelta,
        disabledCrises: def.disabledCrises,
      }),
    );
  }

  // 返回只換頁，不會刪掉存檔
  if (special) return <SpecialIntro def={special} onStart={() => startSpecial(special)} onBack={() => setSpecial(null)} />;
  if (series) return <SeriesScreen onPick={setSpecial} onBack={() => setSeries(false)} />;

  if (setup) {
    const { character } = setup;
    if (setup.rolling) return <RollingScreen character={character} onDone={finishRolling} />;
    return (
      <CharacterReveal
        character={character}
        onStart={() =>
          start(newGame(EVENTS, newSeed(), character.party, character.background, profileSetup(character.profile), { fate: FATE_ENABLED }))
        }
      />
    );
  }

  if (!game) {
    return (
      <main className={styles.main}>
        {/* 主視覺已經寫著標題，文字標題留給螢幕閱讀器與搜尋引擎 */}
        <h1 className={styles.visuallyHidden}>選舉人生：市長篇</h1>
        {/* eslint-disable-next-line @next/next/no-img-element -- 靜態輸出不使用 next/image 的圖片最佳化 */}
        <img
          className={styles.hero}
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/title.webp`}
          alt="選舉人生：市長篇。候選人站在競選宣傳車上，對著夕陽下的城市揮手。"
          width={1200}
          height={800}
          fetchPriority="high"
        />
        <p className={styles.lead}>選一場選舉參選。事件取材自真實的選舉公報與報導，並已虛構化。</p>
        {stale && <p className={styles.notice}>遊戲更新了，上一局的存檔無法繼續。請開始新的一局。</p>}
        {saved && !saved.finished && (
          <button className={styles.primary} onClick={() => start(saved)}>
            繼續上一局（{characterLabel(saved)}，第 {saved.turn + 1} 回合）
          </button>
        )}
        {/* 首頁是一張選票：每一種玩法是一位「候選人」，按下去就像蓋下圈選章 */}
        <section className={styles.ballot} aria-labelledby="ballot-title">
          <div className={styles.ballotHead}>
            <h2 id="ballot-title">選擇你要參加的選舉</h2>
            <span>請圈選一項</span>
          </div>
          <button className={styles.ballotRow} onClick={restart}>
            <span className={styles.ballotNo}>1</span>
            <BallotPhoto src="/title.webp" />
            <span className={styles.ballotBody}>
              <strong className={styles.ballotName}>市長篇</strong>
              <span className={styles.ballotParty}>主線｜隨機人生</span>
              <span className={styles.ballotText}>城市、政黨、出身和個性全部隨機。選上之後，還有四年任期和下一場選舉。</span>
              <span className={styles.ballotAction}>開始參選</span>
            </span>
            <span className={styles.ballotStamp} aria-hidden="true" />
          </button>
          <button className={styles.ballotRow} onClick={() => setSeries(true)}>
            <span className={styles.ballotNo}>2</span>
            <BallotPhoto src={`/specials/${SPECIAL_SERIES.art}.webp`} />
            <span className={styles.ballotBody}>
              <strong className={styles.ballotName}>{SPECIAL_SERIES.title}</strong>
              <span className={styles.ballotParty}>特別篇｜取材自進行中的選戰</span>
              <span className={styles.ballotText}>{SPECIAL_SERIES.teaser}</span>
              <span className={styles.ballotAction}>選擇陣營</span>
            </span>
            <span className={styles.ballotStamp} aria-hidden="true" />
          </button>
        </section>
        <SiteFooter />
      </main>
    );
  }

  if (game.finished && !outcome) {
    const def = game.special ? specialById(game.special) : undefined;
    if (def) return <SpecialEndScreen def={def} state={game} onRetry={() => startSpecial(def)} onHome={withdraw} onMain={restart} />;
    return <EndScreen state={game} onRestart={restart} />;
  }

  const fate = outcome ? undefined : game.pendingFate;
  const interlude = outcome || fate ? undefined : interludeEvent(game, EVENTS);
  const event = outcome || fate ? undefined : interlude ?? currentEvent(game, EVENTS);
  const options = interlude ? displayOrder(game, interlude, interlude.options) : event ? displayOrder(game, event, offeredOptions(game, event)) : [];

  function pick(o: GameOption) {
    if (interlude) {
      const next = chooseInterlude(game!, EVENTS, o.id, ARCS);
      const last = next.interludes![next.interludes!.length - 1];
      setOutcome({ title: `🃏 ${interlude.title}`, text: last.outcome, delta: last.delta, funds: last.funds || undefined, notices: [] });
      setGame(next);
      return;
    }
    const next = choose(game!, EVENTS, o.id, CRISES, PARTIES, ARCS, FATES);
    const last = next.history[next.history.length - 1];
    setOutcome({ text: last.outcome, delta: last.optionDelta, funds: o.funds, notices: next.notices });
    setGame(next);
  }
  // 顯示結果時 turn 已前進，標題仍停在剛做完的那一回合
  const shownTurn = outcome ? game.turn - 1 : game.turn;
  const justVoted = outcome && game.turn === FIRST_ELECTION_TURN && game.firstElection;

  return (
    <StatText.Provider value={statTextFor(game)}>
    <main className={styles.main}>
      {/* 手機優先：頂端只放「我是誰、第幾回合、有多少錢」與數值，這一回合要做的決定緊接在後 */}
      <header className={styles.gameHeader}>
        <p className={styles.turnLine}>
          <strong>
            {stageLabel(game, shownTurn)} 第 {(shownTurn % STAGE_LENGTH) + 1} / {STAGE_LENGTH} 回合
          </strong>
          <span>{phaseLabel(game, TURN_PLAN[shownTurn])}</span>
          {usesMoney(game) && <span className={styles.funds}>💰 {formatFunds(game.funds)}</span>}
        </p>
        <p className={styles.whoLine}>
          {characterLabel(game)}
          {game.opponent && `｜對手：${game.opponent.name}（${partyById(game.opponent.party).name}）`}
        </p>
      </header>
      <StatBar stats={game.stats} />
      <ActiveFates state={game} />
      {!outcome && !fate && canSetScale(game) && <ScalePicker state={game} onScale={(scale) => setGame(setScale(game, scale))} />}
      {!outcome && !fate && game.turn > 0 && <StaffReportCard state={game} />}

      {outcome ? (
        <section className={styles.card}>
          {outcome.title && <h2>{outcome.title}</h2>}
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
      ) : fate ? (
        <FateScreen
          state={game}
          onPick={(card) => {
            const next = chooseFate(game, EVENTS, card.id, FATES, ARCS);
            const last = next.fateHistory![next.fateHistory!.length - 1];
            const verdict = last.success === undefined ? "" : last.success ? "・成功" : "・失敗";
            setOutcome({ title: `🃏 ${card.title}${verdict}`, text: last.outcome, delta: last.delta, funds: last.funds || undefined, notices: next.notices });
            setGame(next);
          }}
        />
      ) : (
        event && (
          <section className={styles.card}>
            {game.turn === 0 && game.notices.map((n) => <NoticeView key={n.text} notice={n} />)}
            {interlude?.interlude && (
              <p className={styles.turn}>
                {interlude.interludeFollowUp ? "📎 後續發展" : `🃏 命運插曲｜${INTERLUDE_LABELS[interlude.interlude]}`}
              </p>
            )}
            <h2>{event.title}</h2>
            {event.arc && <p className={styles.arcTag}>📒 {ARCS.find((a) => a.id === event.arc)?.title}</p>}
            {event.fact && <p className={styles.arcTag}>{FACT_TAG[event.fact]}</p>}
            <p>{fillSaid(fillArcText(event.scenario, game.arcs), game, EVENTS)}</p>
            <div className={styles.options}>
              {options.map((o) => {
                const avail = optionAvailability(game, o);
                return (
                  <button
                    key={o.id}
                    className={avail === "open" ? styles.option : styles.optionLocked}
                    disabled={avail === "locked"}
                    onClick={() => pick(o)}
                  >
                    {fillArcText(o.label, game.arcs)}
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
                    {o.legalRisk && <small> · ⚖ 觸法風險：{o.legalRisk}</small>}
                    {o.perk && <small> · 🏛 動用現任資源{o.effects.treasury ? "（市府出錢）" : ""}</small>}
                  </button>
                );
              })}
            </div>
          </section>
        )
      )}
      {!outcome && usesMoney(game) && <BudgetSummary state={game} />}
      {!outcome && Object.keys(game.arcs).length > 0 && <LedgerPanel state={game} />}
      {!outcome && !fate && canTakeLoan(game) && <LoanOffer state={game} onTake={() => setGame(takeLoan(game))} />}
      <StatHints />
      {!game.finished && <WithdrawButton onConfirm={withdraw} />}
      <SiteFooter />
    </main>
    </StatText.Provider>
  );
}

const FATE_KIND_LABELS: Record<FateKind, string> = { opportunity: "機運", contract: "契約", ordeal: "試煉" };

/** 命運頁的開場白：幕僚長遞來三個選擇 */
const FATE_INTROS: Record<"campaign" | "term", string[]> = {
  campaign: [
    "老闆，有三通電話在等你回。只能回一通。",
    "老闆，今天桌上有三份邀約。幕僚長說：「選一個，其他的就當沒看到。」",
    "老闆，選戰打到這裡，有三條路擺在你面前。",
  ],
  term: [
    "市長，有三件事同時找上門。你只能處理一件。",
    "市長，秘書遞來三張便條紙，每一張都寫著「急」。",
    "市長，幕僚長關上門說：「這三件事，你得選一件。」",
  ],
};

/** 政治命運：三張牌選一張，確認後不能反悔 */
function FateScreen({ state, onPick }: { state: GameState; onPick: (card: FateCard) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const offer = state.pendingFate!;
  const cards = offer.cards.map((id) => FATES.find((c) => c.id === id)!);
  const intros = FATE_INTROS[offer.stage];
  const intro = intros[(state.seed + state.turn) % intros.length];
  const chosen = cards.find((c) => c.id === picked);
  return (
    <section className={styles.card}>
      <p className={styles.fateKicker}>政治命運來敲門</p>
      <h2>{intro}</h2>
      <div className={styles.fateCards} role="radiogroup" aria-label="三張命運牌">
        {cards.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={picked === c.id}
            className={styles.fateCard}
            data-kind={c.kind}
            onClick={() => setPicked(c.id)}
          >
            <span className={styles.fateKind}>{FATE_KIND_LABELS[c.kind]}</span>
            <strong>{c.title}</strong>
            <span>{c.scene}</span>
            <small>{c.hint}</small>
          </button>
        ))}
      </div>
      <div className={styles.stickyAction}>
        <button className={styles.primary} disabled={!chosen} onClick={() => chosen && onPick(chosen)}>
          {chosen ? `就選「${chosen.title}」` : "先選一張牌"}
        </button>
      </div>
    </section>
  );
}

/** 正在生效的命運效果：只寫名字和還剩多久 */
function ActiveFates({ state }: { state: GameState }) {
  const active = state.fateEffects ?? [];
  if (!active.length) return null;
  const left = (a: (typeof active)[number]) =>
    a.type === "boost" ? `還能用 ${a.charges} 次` : a.type === "shield" ? "能擋下一次危機" : `還有 ${a.turns} 回合`;
  return <p className={styles.fateActive}>🃏 生效中：{active.map((a) => `${a.label}（${left(a)}）`).join("、")}</p>;
}

/** 結局頁：這一局抽到的命運 */
function FateSummary({ state }: { state: GameState }) {
  const history = state.fateHistory ?? [];
  if (!history.length) return null;
  return (
    <section className={styles.card}>
      <h2>你的政治命運</h2>
      <ul className={styles.list}>
        {history.map((h) => {
          const card = FATES.find((c) => c.id === h.cardId);
          if (!card) return null;
          const verdict = h.success === undefined ? "" : h.success ? "（成功）" : "（失敗）";
          return (
            <li key={h.offerId}>
              <strong>
                {FATE_KIND_LABELS[card.kind]}・{card.title}
                {verdict}
              </strong>
              ：{h.outcome}
            </li>
          );
        })}
      </ul>
    </section>
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
    () => estimateFirstWinRate(EVENTS, CRISES, PARTIES, party, background, profileSetup(profile), 300, ARCS),
    [party, background, profile],
  );
  const intro = composeIntro(profile, background, party, TRAITS, BURDENS, city);
  const traits = profile.traits.map((id) => TRAITS.find((t) => t.id === id)!);
  const burdenName = BURDENS.find((b) => b.id === profile.burden)!.name;
  const challengers = HISTORY.challengers[party.id as keyof typeof HISTORY.challengers];

  return (
    <main className={styles.main}>
      <p className={styles.turn}>
        {city.name}・{party.name}
      </p>
      <h1 className={styles.title}>你的身分：{background.name}</h1>
      <section className={styles.card}>
        <CardLabel label="你的人設" hint="抽到的資質（顏色代表品質）與先天包袱，決定你擅長什麼、背著什麼" />
        <div className={styles.tags}>
          {traits.map((t) => (
            <span key={t.id} className={styles.tierTag} data-tier={t.tier} title={`${TRAIT_TIER_LABELS[t.tier]}資質`}>
              {t.name}
            </span>
          ))}
          <span className={styles.tag}>{burdenName}</span>
        </div>
        <p className={styles.tierLegend}>
          {(["negative", "common", "rare", "epic"] as const).map((k) => (
            <span key={k} data-tier={k}>
              {TRAIT_TIER_LABELS[k]}
            </span>
          ))}
        </p>
        <p className={styles.intro}>{intro}</p>
      </section>
      {profile.rivals && <OpponentCard opponent={profile.rivals.first} heading="你的對手" />}
      <section className={styles.card}>
        <CardLabel label="競選城市" hint="選民結構與他們在意的議題，會放大或縮小你每個選擇的效果" />
        <CityImage id={city.id} name={city.name} />
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
        <CardLabel label="所屬政黨" hint="決定黨部撥款、起始支持，以及你要一起背的政黨包袱" />
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
        <CardLabel label="出身背景" hint="你參選前的身分，影響起始數值與募得到的錢" />
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
        <CardLabel label="預估難度" hint="用這組人設與對手模擬出來的當選率" />
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
      <div className={styles.stickyAction}>
        <button className={`${styles.primary} ${styles.glow}`} onClick={onStart}>開始參選</button>
      </div>
    </main>
  );
}

function FirstElectionNotice({ state }: { state: GameState }) {
  const { won, probability, mobilization } = state.firstElection!;
  const incumbent = state.flags.includes("bg-incumbent");
  const pct = Math.round(probability * 100);
  const spent = mobilization > 0 ? `投票前投入選前動員 ${formatFunds(mobilization)}。` : "你沒有剩下任何經費做選前動員。";
  const rival = state.character.profile?.rivals?.first;
  const vs = rival ? `對上${rival.name}，` : "";
  if (state.special) {
    return (
      <>
        <p className={styles.notice}>{specialById(state.special)?.voteNote}</p>
        <p className={styles.notice}>
          🗳 開票結果：{vs}
          {won ? "當選！" : "落選。"}
        </p>
      </>
    );
  }
  if (!won) {
    return (
      <p className={styles.notice}>
        🗳 {spent}開票結果：{vs}
        {incumbent ? "連任失敗" : "落選"}。（模型估計勝率 {pct}%）
      </p>
    );
  }
  const next = state.opponent;
  const rematch = state.flags.includes("opp-rematch");
  return (
    <>
      <p className={styles.notice}>
        🗳 {spent}開票結果：{vs}
        {incumbent
          ? "連任成功！第二階段：第二任開始了，這次沒有連任壓力，最後要交棒給接班人。"
          : "當選！第二階段：任期開始了，那些承諾都是你的了。四年後，你要挑戰連任。"}
        （模型估計勝率 {pct}%）
      </p>
      {next && (
        <>
          <p className={styles.notice}>
            {rematch
              ? `你贏得不多。${next.name}在敗選感言說：「四年後，我會再回來。」下一場選舉的對手，還是同一個人。`
              : `你贏得很漂亮，${rival?.name ?? "對手"}暫時退出了政壇。四年後，一位新的挑戰者已經在準備了。`}
          </p>
          <OpponentCard opponent={next} heading={rematch ? "捲土重來的對手" : "下一場選舉的對手"} />
        </>
      )}
    </>
  );
}

function StatBar({ stats }: { stats: Stats }) {
  const { labels: STAT_LABELS, hints: STAT_HINTS, visible } = useContext(StatText);
  return (
    <>
      <div className={styles.stats}>
        {visible.map((k) => (
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
    </>
  );
}

/** 每個數值的用途（放在畫面下方，需要時再展開） */
function StatHints() {
  const { labels: STAT_LABELS, hints: STAT_HINTS, visible, money } = useContext(StatText);
  return (
    <>
      <details className={styles.hints}>
        <summary>每個數值有什麼用？</summary>
        <ul className={styles.list}>
          {[...visible, "integrity" as const].map((k) => (
            <li key={k}>
              <strong>{STAT_LABELS[k]}</strong>：{STAT_HINTS[k]}
            </li>
          ))}
          {money && (<li>
            <strong>競選經費</strong>：每 3 回合撥款一次（黨部、個人、募款）。辦活動要花錢，競選期每回合有總部開銷；
            投票前剩下的錢會自動投入選前動員（最多 4,000 萬），直接影響得票。
          </li>)}
        </ul>
      </details>
    </>
  );
}

function formatFunds(n: number): string {
  return `${n.toLocaleString()} 萬`;
}

/** 城市插畫（web/public/cities/<城市 id>.webp）；載入失敗時直接隱藏，不影響卡片其他內容 */
function CityImage({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 靜態輸出不使用 next/image 的圖片最佳化
    <img
      className={styles.cityImage}
      src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/cities/${id}.webp`}
      alt={`${name}的城市插畫`}
      width={1200}
      height={800}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** 特別篇的選邊頁：同一場選戰的兩條路線，大圖並排；還沒做好的路線不能選 */
function SeriesScreen({ onPick, onBack }: { onPick: (def: SpecialDef) => void; onBack: () => void }) {
  return (
    <main className={styles.main}>
      <button className={styles.topBack} onClick={onBack}>← 上一頁</button>
      <p className={styles.turn}>特別篇</p>
      <h1 className={styles.title}>{SPECIAL_SERIES.title}</h1>
      <p className={styles.lead}>{SPECIAL_SERIES.teaser}</p>
      <div className={styles.sides}>
        {SPECIAL_SERIES.routes.map((route) => {
          const def = route.specialId ? specialById(route.specialId) : undefined;
          return (
            <section key={route.title} className={def ? styles.side : `${styles.side} ${styles.sideSoon}`}>
              <SpecialImage art={route.art} alt={`${route.title}的插畫`} className={styles.sideImage} />
              <div className={styles.sideBody}>
                <p className={styles.turn}>{route.side}</p>
                <h2>{route.title}</h2>
                <p>{route.teaser}</p>
                {def ? (
                  <button className={`${styles.primary} ${styles.glow}`} onClick={() => onPick(def)}>{route.cta}</button>
                ) : (
                  <button className={styles.secondary} disabled>即將推出</button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <button className={styles.quietLink} onClick={onBack}>回到開始畫面</button>
    </main>
  );
}

/** 「你的選擇」旁邊的小字：有多少玩家在這一題選了一樣的；樣本不夠時不顯示 */
function PlayerShare({ stats, eventId, optionId }: { stats: PlayerStats | null; eventId: string; optionId: string }) {
  const share = stats ? choiceShare(stats, eventId, optionId) : undefined;
  return share === undefined ? null : <small className={styles.playerShare}>（{share}% 的玩家也這樣選）</small>;
}

/** 其他玩家的這場選戰：局數、當選率、結局分布、和現實一樣的題數 */
function PlayerSummary({ stats, same }: { stats: PlayerStats; same: number }) {
  if (stats.plays < STATS_MIN_SAMPLE) {
    return (
      <section className={styles.card}>
        <h2>其他玩家的這場選戰</h2>
        <p className={styles.lead}>目前累積 {stats.plays.toLocaleString()} 局。滿 {STATS_MIN_SAMPLE} 局之後，這裡會顯示其他玩家的結果，以及每一題有多少人和你選得一樣。</p>
      </section>
    );
  }
  const endings = Object.entries(stats.endings).sort((a, b) => b[1] - a[1]);
  const avg = stats.sameAsReal.plays ? stats.sameAsReal.sum / stats.sameAsReal.plays : 0;
  return (
    <section className={styles.card}>
      <h2>其他玩家的這場選戰</h2>
      <p>
        玩家已經打完 <strong>{stats.plays.toLocaleString()}</strong> 局
        {stats.simulated > 0 && "（含電腦模擬的基礎樣本）"}
        ，其中 <strong>{percent(stats.wins, stats.plays)}%</strong> 當選。
      </p>
      <ul className={styles.endingBars}>
        {endings.map(([title, n]) => (
          <li key={title}>
            <span>{title}</span>
            <span className={styles.endingBar}>
              <span style={{ width: `${percent(n, stats.plays)}%` }} />
            </span>
            <span>{percent(n, stats.plays)}%</span>
          </li>
        ))}
      </ul>
      <p>
        和現實選擇一樣的題數，玩家平均 {avg.toFixed(1)} 題；你這一局 {same} 題。
      </p>
      <p>
        <small>
          統計來自玩家匿名送出的遊戲紀錄，只記遊戲裡的選擇與結果，是遊戲數據，不是民調。
          {stats.simulated > 0 && "上線初期先放入電腦模擬的基礎樣本，讓比例有個起點；真人玩到 300 局後，模擬樣本就不再計入。"}
        </small>
      </p>
    </section>
  );
}

/** 首頁選票上的「候選人照片」：裝飾用，替代文字留空 */
function BallotPhoto({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 靜態輸出不使用 next/image 的圖片最佳化
    <img
      className={styles.ballotPhoto}
      src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${src}`}
      alt=""
      width={1200}
      height={800}
      loading="lazy"
      decoding="async"
    />
  );
}

/** 特別篇插畫（web/public/specials/<art>.webp）；載入失敗時直接隱藏 */
function SpecialImage({ art, alt, className }: { art: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 靜態輸出不使用 next/image 的圖片最佳化
    <img
      className={className}
      src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/specials/${art}.webp`}
      alt={alt}
      width={1200}
      height={800}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** 卡片最上面的小字：這張卡在描述什麼，以及它對遊戲的影響 */
function CardLabel({ label, hint, children }: { label: string; hint: string; children?: React.ReactNode }) {
  return (
    <p className={styles.cardLabel}>
      <span className={styles.cardLabelName}>{label}</span>
      {children}
      <span className={styles.cardLabelHint}>{hint}</span>
    </p>
  );
}

/** 對手卡片：身分、資質（依品質上色）與介紹 */
function OpponentCard({ opponent, heading, intro }: { opponent: Opponent; heading: string; intro?: string }) {
  const party = partyById(opponent.party);
  const traits = opponent.traits.map((id) => TRAITS.find((t) => t.id === id)!);
  const level =
    opponent.strength >= 0.3 ? "很強" : opponent.strength >= 0.15 ? "強" : opponent.strength >= 0 ? "普通" : "較弱";
  return (
    <section className={styles.card}>
      <CardLabel label={heading} hint="這場選舉要打敗的人；對手的資質會變成選戰中的事件">
        {opponent.legend && <span className={styles.legendBadge}>⭐ 傳奇對手</span>}
      </CardLabel>
      <h2>{opponent.name}</h2>
      <p className={styles.turn}>
        {party.name}・{opponent.title}・實力{level}
      </p>
      <div className={styles.tags}>
        {traits.map((t) => (
          <span key={t.id} className={styles.tierTag} data-tier={t.tier} title={`${TRAIT_TIER_LABELS[t.tier]}資質`}>
            {t.name}
          </span>
        ))}
      </div>
      <p className={styles.intro}>{intro ?? describeOpponent(opponent, party.name, TRAITS, LEGENDS)}</p>
    </section>
  );
}

const ARC_KIND_LABEL: Record<ArcKind, string> = { promise: "政策承諾", debt: "政治人情債", scandal: "重大爭議" };

/** 回合編號：競選第 N 回合／任期第 N 回合 */
function turnLabel(turn: number): string {
  return turn < STAGE_LENGTH ? `競選第 ${turn + 1} 回合` : `第二階段第 ${turn - STAGE_LENGTH + 1} 回合`;
}

/** 幕僚長回報：一句主要處境，其他折疊成快報 */
function StaffReportCard({ state }: { state: GameState }) {
  const report = staffReport(state, ARCS, EVENTS);
  if (!report.main) return null;
  return (
    <section className={styles.staff}>
      <p>
        <span className={styles.staffName}>🗣 幕僚長</span>
        {report.main}
      </p>
      {report.items.length > 0 && (
        <details className={styles.staffMore}>
          <summary>快報（{report.items.length}）</summary>
          <ul>
            {report.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** 政治帳本：我答應過什麼、誰幫過我、做到哪裡、還欠誰什麼 */
function LedgerPanel({ state, open = false }: { state: GameState; open?: boolean }) {
  const arcs = Object.values(state.arcs);
  const pending = openArcs(state, ARCS).length;
  return (
    <details className={styles.ledger} open={open}>
      <summary>
        📒 政治帳本
        {pending > 0 ? `：待處理 ${pending} 件` : `：${arcs.length} 筆紀錄`}
      </summary>
      {arcs.map((a) => {
        const def = ARCS.find((d) => d.id === a.id)!;
        return (
          <div key={a.id} className={styles.ledgerEntry}>
            <p>
              <strong>{def.title}</strong>
              <small>　{ARC_KIND_LABEL[def.kind]}｜{def.statusLabels[a.status]}</small>
            </p>
            <p className={styles.ledgerProgress}>{arcProgress(def, a)}</p>
            <ul className={styles.ledgerLog}>
              {a.log.map((l, i) => (
                <li key={i}>
                  <small>{turnLabel(l.turn)}</small>　{l.text}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}

const SCALE_ORDER: CampaignScale[] = ["lean", "standard", "full"];

/** 每回合的預算：競選回合選規模（人事、廣告、活動），任期中只有服務處開銷 */
/** 回合數（0-based）換成玩家看到的「第幾階段第幾回合」 */
const turnName = (turn: number) => `${turn < STAGE_LENGTH ? "" : "第二階段"}第 ${(turn % STAGE_LENGTH) + 1} 回合`;

/** 競選規模的選擇：只在第一階段第 1、7 回合與第二階段第 7 回合出現 */
function ScalePicker({ state, onScale }: { state: GameState; onScale: (scale: CampaignScale) => void }) {
  const upcoming = nextScaleTurn(state.turn);
  const reelection = !isCampaignTurn(state.turn);
  const { labels } = useContext(StatText);
  return (
    <section className={styles.budget}>
      <p className={styles.budgetTitle}>
        {reelection ? "連任選戰從第 9 回合開始：現在決定競選總部的規模" : "這一回合可以調整競選規模"}
        <small>
          {upcoming !== undefined && !reelection ? `下次調整：${turnName(upcoming)}` : "決定後到選舉結束都不能再改"}
        </small>
      </p>
      <div className={styles.scaleRow} role="radiogroup" aria-label="競選規模">
        {SCALE_ORDER.map((k) => {
          const plan = CAMPAIGN_SCALES[k];
          const effect = formatDelta(plan.effects, ALL_STATS, labels);
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
        {CAMPAIGN_SCALES[state.scale].costs.ads}｜活動 {CAMPAIGN_SCALES[state.scale].costs.events} 萬。
      </p>
    </section>
  );
}

/** 經費摘要：一兩行，放在事件下方；撐不到下次入帳時改用警告色 */
function BudgetSummary({ state }: { state: GameState }) {
  const next = nextPayout(state);
  const loanDue = state.loan && state.loan.remaining > 0 ? state.loan.installment : 0;
  const loan = loanDue > 0 ? `｜貸款還剩 ${formatFunds(state.loan!.remaining)}，每回合還 ${formatFunds(loanDue)}` : "";
  if (!isCampaignTurn(state.turn)) {
    return (
      <p className={styles.budgetNote}>
        💰 任期中：每回合服務處開銷 {formatFunds(OFFICE_UPKEEP)}｜{next.inTurns} 回合後入帳約 {formatFunds(next.estimate)}
        {loan}
      </p>
    );
  }
  const burn = scaleCost(state.scale) + loanDue;
  const lasts = burn > 0 ? Math.floor(state.funds / burn) : Infinity;
  const short = lasts < next.inTurns;
  return (
    <p className={short ? styles.budgetWarn : styles.budgetNote}>
      💰 {CAMPAIGN_SCALES[state.scale].label}規模 {formatFunds(scaleCost(state.scale))}／回合｜可撐{" "}
      {lasts === Infinity ? "很久" : `${lasts} 回合`}｜{next.inTurns} 回合後入帳約 {formatFunds(next.estimate)}
      {loan}
      {short && "。撐不到下次入帳：會被迫縮編，連精簡都付不起就是欠薪。"}
    </p>
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
  if (state.special) return `特別篇：${specialById(state.special)?.title ?? ""}`;
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
  if (notice.kind === "story") {
    return (
      <p className={styles.storyNotice}>
        📒 {notice.title && <strong>{notice.title}：</strong>}
        {notice.text}
      </p>
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

function formatDelta(delta: Partial<Stats>, keys: readonly StatKey[] = ALL_STATS, labels = STAT_LABELS): string {
  return keys
    .filter((k) => delta[k])
    .map((k) => `${labels[k]} ${delta[k]! > 0 ? "+" : ""}${delta[k]}`)
    .join("、");
}

/** all：連隱藏的原則也顯示（突發事件的衝擊要讓玩家看清楚） */
function DeltaList({ delta, funds, all }: { delta: Partial<Stats>; funds?: number; all?: boolean }) {
  const { labels, visible } = useContext(StatText);
  const parts = [formatDelta(delta, all ? [...visible, ...HIDDEN_STATS] : visible, labels)];
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
function VoterReflection({
  items,
  shareHead,
  onShareLine,
}: {
  items: ReflectionItem[];
  shareHead: string;
  /** 答完題後，把結果交給分享圖卡 */
  onShareLine?: (line: string) => void;
}) {
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

  useEffect(() => {
    if (!done || !onShareLine) return;
    onShareLine(
      tempting.length > 0
        ? `我用來拿選票的 ${tempting.length} 招裡，有 ${rejected} 招，我自己當選民時不會支持。`
        : "我沒用任何拿原則換選票的招。",
    );
  }, [done, rejected, tempting.length, onShareLine]);

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

  const story = buildEpilogue(state, EVENTS, s, ARCS);
  const [shareLine, setShareLine] = useState<string>();

  return (
    <main className={styles.main}>
      <ResultBanner
        won={s.election.won}
        result={s.election.won ? winText : loseText}
        character={characterLabel(state)}
        vote={Math.round(s.election.probability * 100)}
        opponent={state.opponent && `對手：${state.opponent.name}（${partyById(state.opponent.party).name}）`}
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

      <ShareCard
        kind={cardKind(state, s)}
        label={characterLabel(state)}
        result={s.election.won ? winText : loseText}
        headline={story.headline}
        story={cardStory(state, s)}
        line={shareLine ?? firstPerson(s.persona)}
        won={s.election.won}
      />

      <div className={styles.endActions}>
        <button className={styles.primary} onClick={onRestart}>再來一局</button>
        <a className={styles.analysisLink} href="#analysis">往下看這一局的事件分析 ↓</a>
      </div>

      <div id="analysis" />
      <VoterReflection
        items={s.reflection}
        shareHead={`我在《選舉人生》以「${characterLabel(state)}」${s.election.won ? winText : loseText}`}
        onShareLine={setShareLine}
      />

      <FateSummary state={state} />

      {Object.keys(state.arcs).length > 0 && (
        <section className={styles.card}>
          <h2>政治帳本結算</h2>
          <p>
            <small>你答應過什麼、欠過誰什麼，最後怎麼收場。「灌水」與「私下回報」都不算兌現。</small>
          </p>
          <LedgerPanel state={state} open />
        </section>
      )}

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
            {s.leftovers.map((t, i) => <p key={i} className={styles.notice}>{t}</p>)}
          </>
        )}
      </section>

      <section className={styles.card}>
        <h2>為什麼是這個結果？</h2>
        <p>模型估計的勝選機率：{Math.round(s.election.probability * 100)}%</p>
        <ul className={styles.list}>
          {state.opponent && (
            <li>
              對手{state.opponent.name}：{s.election.opponentStrength >= 0 ? "扣分" : "加分"}{" "}
              {Math.abs(s.election.opponentStrength).toFixed(2)}
              <small> — 對手資質越好越難打；對手是現任市長再扣 0.15，捲土重來的對手再扣 0.05。</small>
            </li>
          )}
          <li>
            選前動員：投入 {formatFunds(s.election.mobilization)}，加分 {s.election.mobilizationValue.toFixed(2)}
            <small> — 投票前剩下的競選經費會自動投入動員，最多 {formatFunds(MOBILIZATION_CAP)}。</small>
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
      <SiteFooter />
    </main>
  );
}

/** 特別篇的開場：固定的人設與對手，不抽籤 */
function SpecialIntro({ def, onStart, onBack }: { def: SpecialDef; onStart: () => void; onBack: () => void }) {
  const setup = specialSetup(def);
  const party = partyById(def.party);
  const [replay, setReplay] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setReplay(specialPlayed(def.id)), [def.id]);
  return (
    <main className={styles.main}>
      <button className={styles.topBack} onClick={onBack}>← 上一頁</button>
      <p className={styles.turn}>
        特別篇・{setup.city.name}・{party.name}
      </p>
      <h1 className={styles.title}>{def.title}</h1>
      <SpecialImage art={def.art} alt={`${def.title}：候選人站在宣傳車上，對著舉著手燈的人潮揮手。`} className={styles.hero} />
      <section className={styles.card}>
        <CardLabel label="你的處境" hint="特別篇的人設是固定的，事件依照真實選戰的時間順序出場" />
        <div className={styles.tags}>
          {setup.traits.map((t) => (
            <span key={t.id} className={styles.tierTag} data-tier={t.tier} title={`${TRAIT_TIER_LABELS[t.tier]}資質`}>
              {t.name}
            </span>
          ))}
          <span className={styles.tag}>{setup.burden.name}</span>
        </div>
        {def.intro.map((p) => (
          <p key={p} className={styles.intro}>{p}</p>
        ))}
        {replay && <p><small>你玩過這一篇了。這一局，有些回合會出現不一樣的事件。</small></p>}
      </section>
      <OpponentCard opponent={setup.profile.rivals!.first} heading="你的對手" intro={def.opponentIntro} />
      <p>
        <small>
          事件取材自公開報導，人名一律以身分影射；標示「🎭 遊戲虛構」的情節、對話與結果都是虛構的。{def.reality}
        </small>
      </p>
      <div className={styles.stickyAction}>
        <button className={`${styles.primary} ${styles.glow}`} onClick={onStart}>{def.startLabel}</button>
        <button className={styles.quietLink} onClick={onBack}>選另一個陣營</button>
      </div>
    </main>
  );
}

function SpecialEndScreen({
  def,
  state,
  onRetry,
  onHome,
  onMain,
}: {
  def: SpecialDef;
  state: GameState;
  onRetry: () => void;
  onHome: () => void;
  onMain: () => void;
}) {
  const { won, probability } = state.firstElection!;
  const ending = specialEnding(def, state, won, probability, EVENTS);
  const played = state.history.map((h) => {
    const event = EVENTS.find((e) => e.id === h.eventId)!;
    return { event, option: event.options.find((o) => o.id === h.optionId)!, turn: h.turn };
  });
  const interludes = (state.interludes ?? []).map((i) => {
    const event = EVENTS.find((e) => e.id === i.eventId)!;
    return { event, option: event.options.find((o) => o.id === i.optionId)!, turn: i.turn };
  });
  const sourced = played.filter(({ event }) => event.fact !== "SIMULATION" || event.source.refs.length > 0);
  const reflected = played.filter(({ event }) => event.reflection);
  const check = realityCheck(def, state, EVENTS, won);
  const result = won ? "當選" : "落選";
  const players = usePlayerStats(state, won, ending.title, check.same, check.rows.length);
  // 分享圖卡的轉折點：贏了寫拉開差距的那一步，輸了寫最痛的那一步；沒有就改寫另一個
  const turns = turningPoints(state, EVENTS);
  const shareTurning = won ? (turns.up ?? turns.down) : (turns.down ?? turns.up);

  useEffect(() => {
    try {
      localStorage.setItem(specialPlayedKey(def.id), "1");
    } catch {
      // 記不住也沒關係，下一局只是不會出現替換事件
    }
  }, [def.id]);

  return (
    <StatText.Provider value={statTextFor(state)}>
    <main className={styles.main}>
      <ResultBanner
        won={won}
        result={result}
        character={`特別篇・${def.title}`}
        opponent={state.opponent && `對手：${state.opponent.name}（${partyById(state.opponent.party).name}）`}
      />
      <section className={styles.card}>
        <p className={styles.turn}>結局｜{ending.title}</p>
        <h1 className={styles.epilogueHeadline}>{ending.headline}</h1>
        <div className={styles.epilogue}>
          {ending.paragraphs.map((p) => <p key={p}>{p}</p>)}
        </div>
        <p className={styles.disclaimer}>這是遊戲裡的虛構結果，不是真實選情。原則不會直接換成選票，但決定了你用什麼方式贏，或用什麼方式輸。</p>
      </section>
      <ShareCard
        kind={won ? def.cards.win : def.cards.loss}
        label={`特別篇・${def.title}`}
        result={result}
        headline={ending.headline}
        story={def.shareStory(won, check.same, check.rows.length, shareTurning?.title)}
        line={check.closing[1]}
        won={won}
      />
      <section className={styles.card}>
        <p className={styles.lead}>{def.cta}</p>
        <button className={styles.primary} onClick={onMain}>繼續 BeyondVote 完整政治人生</button>
        <div className={styles.endActions}>
          <button className={styles.secondary} onClick={onRetry}>再挑戰一次</button>
          <button className={styles.secondary} onClick={onHome}>回到開始畫面</button>
        </div>
      </section>
      <section className={styles.card}>
        <h2>你的選擇</h2>
        <ol className={styles.list}>
          {played.map(({ event, option, turn }) => (
            <li key={event.id}>
              <strong>{event.title}</strong>：{option.label}
              <PlayerShare stats={players} eventId={event.id} optionId={option.id} />
              {interludes
                .filter((i) => i.turn === turn)
                .map((i) => (
                  <div key={i.event.id}>
                    <small>🃏 {i.event.title}：{i.option.label}</small>
                    <PlayerShare stats={players} eventId={i.event.id} optionId={i.option.id} />
                  </div>
                ))}
            </li>
          ))}
        </ol>
      </section>
      {players && <PlayerSummary stats={players} same={check.same} />}
      {reflected.length > 0 && (
        <section className={styles.card}>
          <h2>真實世界的這一題</h2>
          <p><small>你這一局遇到的攻防，在現實中是這樣發生的。兩邊各自省略或扭曲了什麼，留給你判斷。</small></p>
          {reflected.map(({ event }) => (
            <div key={event.id} className={styles.reflection}>
              <h3>{event.title}</h3>
              {event.reflection!.map((line) => <p key={line}>{line}</p>)}
              <p>
                <small>
                  {event.source.refs.map((r) => (
                    <a key={r.url + r.quote} href={r.url} target="_blank" rel="noreferrer">[{r.title}] </a>
                  ))}
                </small>
              </p>
            </div>
          ))}
        </section>
      )}
      <section className={styles.card}>
        <h2>你和現實的這一路</h2>
        {def.realityNow.paragraphs.map((p) => <p key={p}>{p}</p>)}
        {check.rows.length > 0 && (
          <>
            <ul className={styles.list}>
              {check.rows.map(({ event, real, mine, same }) => (
                <li key={event.id}>
                  <strong>{event.title}</strong>
                  {same ? (
                    <div><small>✅ 你和他都選了：{real.label}</small></div>
                  ) : (
                    <>
                      <div><small>現實中他選了：{real.label}</small></div>
                      <div><small>你選了：{mine.label}</small></div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p>這一局，你有 {check.same} 題和現實的選擇一樣（共 {check.rows.length} 題）。</p>
          </>
        )}
        {check.closing.map((p) => <p key={p}><strong>{p}</strong></p>)}
        <p>
          <small>
            {def.realityNow.refs.map((r) => (
              <a key={r.url} href={r.url} target="_blank" rel="noreferrer">[{r.title}] </a>
            ))}
          </small>
        </p>
      </section>
      <section className={styles.card}>
        <h2>真實事件原型</h2>
        <p><small>{def.reality}</small></p>
        <ul className={styles.list}>
          {sourced.filter(({ event }) => !event.reflection).map(({ event }) => (
            <li key={event.id}>
              <strong>{event.title}</strong>：{event.source.prototype}
              {event.fact && <small>（{FACT_TAG[event.fact]}）</small>}
              {event.source.refs.map((r) => (
                <a key={r.url + r.quote} href={r.url} target="_blank" rel="noreferrer"> [{r.title}]</a>
              ))}
            </li>
          ))}
        </ul>
      </section>
      <SiteFooter />
    </main>
    </StatText.Provider>
  );
}
