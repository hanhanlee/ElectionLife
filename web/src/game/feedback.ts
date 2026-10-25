// 幕僚長回報：把數值變化和劇情進度翻成一兩句話，讓玩家不看數字也知道現在的政治處境。
// 每一句都要說得出「是哪一個決定造成的」：引用玩家選過的事件、開過的帳、選的競選規模或命運牌；
// 找不到原因的話就不說，避免出現跟玩家作為無關的閒話。
// 全部是預先寫好的文案，依情境優先度挑選；同一個原因有多個版本，依 seed 與回合決定，重整不會變。

import { nextPayout } from "./engine";
import { CAMPAIGN_SCALES, scaleCost } from "./model";
import { arcProgress } from "./story";
import type { ArcDef, ArcState, GameEvent, GameState, HistoryEntry, StatKey } from "./types";

export interface StaffReport {
  /** 這回合最重要的一句話 */
  main?: string;
  /** 其他值得知道的事（快報，預設收合） */
  items: string[];
}

interface Line {
  priority: number;
  key: string;
  texts: string[];
}

function pick(texts: string[], seed: number, turn: number, salt: number): string {
  let h = Math.imul((seed ^ Math.imul(turn + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0, 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return texts[(h >>> 8) % texts.length];
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** 劇情文案裡的 {事實} 換成數字 */
const fill = (text: string, a: ArcState) => arcProgress({ progress: text } as ArcDef, a);

/** 回顧某個決定時的說法：依那個決定最大的影響（數值與方向）挑句子；{t} 代入事件標題 */
const CALLBACKS: Partial<Record<StatKey, [string[], string[]]>> = {
  approval: [
    ["「{t}」那一招還在發酵，市場裡有人跟你比讚。", "「{t}」的效果還在，最近造勢場的人多了一些。"],
    ["「{t}」的決定，網路上還有人在罵。", "「{t}」那件事，支持者群組裡還在吵。"],
  ],
  media: [
    ["「{t}」的新聞還在各台重播。", "「{t}」之後，記者打來約訪的電話沒停過。"],
    ["「{t}」之後，記者打來的電話少了很多。", "「{t}」那次之後，新聞版面很安靜。"],
  ],
  integrity: [
    ["「{t}」那次的堅持，有記者私下說佩服。", "「{t}」的決定，幾個老幕僚說他們跟對人了。"],
    ["「{t}」那件事，幕僚群組裡沒人再提，但大家都記得。", "「{t}」的決定，有一位幕僚私下問我：「我們真的要這樣嗎？」"],
  ],
  business: [
    ["「{t}」之後，有幾位老闆說想約你吃飯。", "「{t}」之後，募款餐會的訂桌多了好幾桌。"],
    ["「{t}」之後，募款餐會的訂桌少了幾桌。", "「{t}」之後，工商團體的電話變少了。"],
  ],
  party: [
    ["「{t}」之後，樁腳們動得特別勤快。", "「{t}」之後，地方組織的人主動來總部幫忙。"],
    ["「{t}」之後，樁腳的電話變少了。", "「{t}」那件事，地方組織的人還在不高興。"],
  ],
  council: [
    ["「{t}」之後，議會那邊客氣多了。", "「{t}」之後，幾位議員在質詢時放了水。"],
    ["「{t}」之後，議員們在質詢台上特別兇。", "「{t}」那件事，議會到現在還在記仇。"],
  ],
  team: [
    ["「{t}」之後，團隊的士氣好了不少。", "「{t}」那次，幕僚們說終於可以準時下班一天。"],
    ["「{t}」之後，幕僚們累壞了。", "「{t}」那陣子，團隊有兩個人請了病假。"],
  ],
  treasury: [
    ["「{t}」之後，財政局長難得笑了。", "「{t}」的決定，讓市庫喘了一口氣。"],
    ["「{t}」的帳，財政局長還在算。", "「{t}」之後，財政局長每次開會都在嘆氣。"],
  ],
  achievement: [
    ["「{t}」做出來的東西，市民開始在用了。", "「{t}」的成果，有里長特地打電話來道謝。"],
    ["「{t}」之後，好幾個工程的進度慢了下來。", "「{t}」那件事，局處長說計畫要重新排。"],
  ],
};

/** 特別篇把「施政成果」當作「政策準備」：回顧時講的是研究，不是工程 */
const SPECIAL_CALLBACKS: typeof CALLBACKS = {
  ...CALLBACKS,
  achievement: [
    ["「{t}」之後，政策團隊的資料夾又厚了一點。", "「{t}」做的功課，記者追問時派上用場了。"],
    ["「{t}」之後，政策團隊的進度落後了。", "「{t}」那陣子，政策研究幾乎停擺。"],
  ],
};

export function staffReport(state: GameState, arcDefs: ArcDef[], events: GameEvent[] = []): StaffReport {
  const callbacks = state.special ? SPECIAL_CALLBACKS : CALLBACKS;
  const served = state.turn >= 12 || state.flags.includes("bg-incumbent");
  const you = served ? "市長" : "老闆";
  const s = state.stats;
  const history = state.history;
  const last = history[history.length - 1];
  /** 引用玩家的決定：選項夠短就說選了什麼，太長才說事件名稱 */
  const title = (h: HistoryEntry) => {
    const event = events.find((e) => e.id === h.eventId);
    const label = event?.options.find((o) => o.id === h.optionId)?.label.replace(/[。！]$/, "").replace(/「/g, "『").replace(/」/g, "』");
    return label && label.length <= 16 ? label : (event?.title ?? "上次那件事");
  };
  const lines: Line[] = [];
  const add = (priority: number, key: string, texts: string[]) => lines.push({ priority, key, texts });

  /** 最近一次讓這個數值往這個方向變的決定（只看玩家的選擇本身） */
  const causeOf = (key: StatKey, sign: 1 | -1, within = 6): HistoryEntry | undefined =>
    history.slice(-within).reverse().find((h) => (h.optionDelta[key] ?? 0) * sign > 0);

  // 突發事件：上回合發生的危機
  for (const n of state.notices) {
    if (n.kind === "crisis" && n.tone === "bad" && n.title) {
      add(100, `crisis-${n.title}`, [
        `${you}，「${n.title}」的事還沒結束，接下來幾回合會一直有人問。`,
        `${you}，記者都在等你對「${n.title}」再講清楚一點。`,
      ]);
    }
  }

  // 這一回合要處理的劇情節點：提醒當初是哪個決定開的帳
  const current = events.find((e) => e.id === state.deck[state.turn]);
  const due = current?.arc ? state.arcs[current.arc] : undefined;
  if (due?.log.length) {
    const origin = due.log[0].text;
    add(98, `arc-due-${due.id}`, [
      `${you}，還記得當初「${origin}」嗎？今天要面對的，就是那件事。`,
      `${you}，今天這件事，要從「${origin}」說起。`,
    ]);
  }

  // 劇情：剛曝光的事、過期沒處理的事、還在進行中的事（都是玩家開過的帳）
  for (const a of Object.values(state.arcs)) {
    const def = arcDefs.find((d) => d.id === a.id);
    if (!def || a.id === due?.id) continue;
    // 還沒執政時，劇情的提醒只說「這筆帳選後會找上門」；執政後才講帳的進度，並冠上帳的名稱
    const origin = a.log[0]?.text ?? def.title;
    const texts = served
      ? (def.advisor[a.status] ?? []).map((t) => `${you}，「${def.title}」的事：${fill(t, a).replace(/^市長，/, "")}`)
      : [`${you}，「${origin}」已經記在帳本上了。選上之後，這筆帳會找上門。`, `${you}，「${origin}」的事，選後一定會有人來問。`];
    if (!texts.length) continue;
    const touched = a.log.length && a.log[a.log.length - 1].turn === state.turn - 1;
    const open = (a.status === "active" || a.status === "concealed") && a.node < def.nodes.length;
    if (a.status === "exposed" && touched) add(95, `arc-${a.id}`, texts);
    else if (touched) add(80, `arc-${a.id}`, texts);
    // 下一個節點快到了才提醒；平常只偶爾提一下，避免同一句話連續好幾回合
    else if (open && a.nextTurn >= state.turn && a.nextTurn <= state.turn + 2) add(70, `arc-${a.id}`, texts);
    else if (open && (state.turn + hash(a.id)) % 3 === 0) add(35, `arc-${a.id}`, texts);
  }

  // 經費：照玩家選的競選規模，撐不撐得到下次撥款
  const scaleLabel = CAMPAIGN_SCALES[state.scale].label;
  if (state.arrears > 0) {
    add(90, "arrears", [
      `${you}，照「${scaleLabel}」的規模，這個月的薪水發不出來，有兩個幕僚已經在投履歷了。`,
      `${you}，總部的人在問薪水的事。照「${scaleLabel}」的開銷，帳戶真的撐不住。`,
    ]);
  } else if (!served || state.turn >= 20) {
    const next = nextPayout(state);
    const burn = scaleCost(state.scale) + (state.loan?.remaining ? state.loan.installment : 0);
    if (burn > 0 && state.funds < burn * next.inTurns) {
      add(75, "funds", [
        `${you}，照「${scaleLabel}」的規模，總部的錢撐不到下次撥款。要嘛縮編，要嘛去找錢。`,
        `${you}，會計說照「${scaleLabel}」的開銷，帳戶快見底了。`,
      ]);
    }
  }

  // 民調大變動：引用造成變動的那個決定
  const d = last?.delta;
  const lastTitle = last ? title(last) : "";
  if (d && d.approval <= -5) {
    add(65, "approval-down", [
      `${you}，「${lastTitle}」之後，民調掉了 ${-d.approval} 點。支持者群組裡開始有人說要「再觀望」。`,
      `${you}，「${lastTitle}」的反應不太好，民調掉了 ${-d.approval} 點。`,
    ]);
  } else if (d && d.approval >= 6) {
    add(45, "approval-up", [
      `${you}，「${lastTitle}」之後，民調漲了 ${d.approval} 點。聲勢一起來，對手和記者就會開始翻你的舊帳，接下來的問題會比較難答。`,
      `${you}，「${lastTitle}」打中了，民調漲了 ${d.approval} 點，樁腳和支持者今天都打電話來關心。`,
    ]);
  }

  // 數值變成處境：剛跨過門檻時一定說，之後只偶爾提醒；一律說出是哪個決定推過去的，找不到就不說
  const threshold = (priority: number, key: StatKey, below: boolean, limit: number, texts: string[]) => {
    const now = s[key];
    const before = now - (d?.[key] ?? 0);
    if (!(below ? now <= limit : now >= limit)) return;
    const crossed = below ? before > limit : before < limit;
    if (!crossed && (state.turn + hash(String(key))) % 3 !== 0) return;
    const cause = causeOf(key, below ? -1 : 1);
    if (!cause) return;
    add(crossed ? priority : priority - 25, `stat-${key}`, texts.map((t) => `${you}，「${title(cause)}」之後，${t}`));
  };
  threshold(60, "council", true, 35, ["議會那邊不太配合，下一個預算案恐怕會被卡在委員會。", "議員們這週退回了兩份報告，說是「資料不完整」。"]);
  threshold(58, "team", true, 40, ["局處長們已經連續加班三週，有兩個在問退休的事。", "幕僚群組裡已經三天沒人回訊息了。"]);
  threshold(55, "party", true, 30, ["組織的人這次沒來，說是「人手調度不過來」。", "樁腳們的電話越來越難打通。"]);
  threshold(50, "business", false, 65, ["最近來拜訪的老闆有點多。每一個都說「只是來打招呼」。", "有位董事長送了一盒茶葉來。我先放在會議室，還沒拆。"]);
  threshold(48, "media", true, 24, ["今天沒有任何一家媒體報導你。對手倒是上了兩次頭條。", "記者會只來了三家媒體，其中一家是實習生。"]);
  if (served) threshold(52, "treasury", true, 30, ["財政局長說，再追加任何預算，就要動用第二預備金了。", "主計處把明年的預算砍了一成，每個局處都在抱怨。"]);
  threshold(30, "approval", false, 62, ["現在的聲勢不錯，但選民的記憶很短，接下來幾週沒有新東西，就會慢慢退燒。", "最近走在路上，有人主動來跟你自拍了。"]);

  // 命運牌：玩家選的牌還在生效
  for (const f of state.fateEffects ?? []) {
    const what = f.type === "boost" ? "下一次用得上" : f.type === "shield" ? "下次出事的時候有人擋" : "這幾週都還在幫你";
    add(25, `fate-${f.cardId}`, [`${you}，你選的「${f.label}」還在，${what}。`, `${you}，「${f.label}」那張牌${what}。`]);
  }

  // 沒有更急的事：回顧最近的一個決定，依它最大的影響挑一句話
  const recent = history.slice(-4).filter((h) => Object.values(h.optionDelta).some((v) => v !== 0));
  if (recent.length) {
    const h = recent[(hash(String(state.seed)) + state.turn) % recent.length];
    const [key, value] = (Object.entries(h.optionDelta) as [StatKey, number][])
      .filter(([k]) => callbacks[k])
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] ?? [];
    const pool = key && callbacks[key]?.[value > 0 ? 0 : 1];
    if (pool) add(10, `recall-${h.turn}`, pool.map((t) => `${you}，${t.replace("{t}", title(h))}`));
  }

  lines.sort((a, b) => b.priority - a.priority);
  const unique = lines.filter((l, i) => lines.findIndex((x) => x.key === l.key) === i);
  const texts = unique.map((l) => pick(l.texts, state.seed, state.turn, hash(l.key)));
  const [main, ...rest] = texts;
  return { main, items: rest.slice(0, 3) };
}
