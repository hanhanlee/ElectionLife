// 幕僚長回報：把數值變化和劇情進度翻成一兩句話，讓玩家不看數字也知道現在的政治處境。
// 全部是預先寫好的文案，依情境優先度挑選；同一個原因有多個版本，依 seed 與回合決定，重整不會變。

import { nextPayout } from "./engine";
import { scaleCost } from "./model";
import { arcProgress, openArcs } from "./story";
import type { ArcDef, ArcState, GameState } from "./types";

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

export function staffReport(state: GameState, arcDefs: ArcDef[]): StaffReport {
  const served = state.turn >= 12 || state.flags.includes("bg-incumbent");
  const you = served ? "市長" : "老闆";
  const s = state.stats;
  const last = state.history[state.history.length - 1];
  const lines: Line[] = [];
  const add = (priority: number, key: string, texts: string[]) => lines.push({ priority, key, texts });

  // 突發事件：上回合發生的危機
  for (const n of state.notices) {
    if (n.kind === "crisis" && n.tone === "bad" && n.title) {
      add(100, `crisis-${n.title}`, [
        `${you}，「${n.title}」的事還沒結束，接下來幾回合會一直有人問。`,
        `${you}，記者都在等你對「${n.title}」再講清楚一點。`,
      ]);
    }
  }

  // 劇情：剛曝光的事、過期沒處理的事、還在進行中的事
  for (const a of Object.values(state.arcs)) {
    const def = arcDefs.find((d) => d.id === a.id);
    if (!def) continue;
    const texts = (def.advisor[a.status] ?? []).map((t) => fill(t, a).replace(/^市長，/, `${you}，`));
    if (!texts.length) continue;
    const touched = a.log.length && a.log[a.log.length - 1].turn === state.turn - 1;
    const open = (a.status === "active" || a.status === "concealed") && a.node < def.nodes.length;
    if (a.status === "exposed" && touched) add(95, `arc-${a.id}`, texts);
    else if (touched) add(80, `arc-${a.id}`, texts);
    // 下一個節點快到了才提醒；平常只偶爾提一下，避免同一句話連續好幾回合
    else if (open && a.nextTurn >= state.turn && a.nextTurn <= state.turn + 2) add(70, `arc-${a.id}`, texts);
    else if (open && (state.turn + hash(a.id)) % 3 === 0) add(35, `arc-${a.id}`, texts);
  }

  // 經費：撐不到下次撥款、欠薪
  if (state.arrears > 0) {
    add(90, "arrears", [`${you}，這個月的薪水還沒發，有兩個幕僚已經在投履歷了。`, `${you}，總部的人在問薪水的事，我說再等一下，他們不太相信。`]);
  } else if (!served || state.turn >= 20) {
    const next = nextPayout(state);
    const burn = scaleCost(state.scale) + (state.loan?.remaining ? state.loan.installment : 0);
    if (burn > 0 && state.funds < burn * next.inTurns) {
      add(75, "funds", [
        `${you}，照現在的規模，總部的錢撐不到下次撥款。要嘛縮編，要嘛去找錢。`,
        `${you}，會計說帳戶快見底了。廣告要不要先停一檔？`,
      ]);
    }
  }

  // 數值變成處境：剛跨過門檻時一定說，之後只偶爾提醒，避免同一句話連續出現
  const d = last?.delta;
  const state_ = (priority: number, key: keyof typeof s, below: boolean, threshold: number, texts: string[]) => {
    const now = s[key];
    const before = now - (d?.[key] ?? 0);
    const inside = below ? now <= threshold : now >= threshold;
    if (!inside) return;
    const crossed = below ? before > threshold : before < threshold;
    if (crossed || (state.turn + hash(String(key))) % 3 === 0) add(crossed ? priority : priority - 25, `stat-${String(key)}`, texts);
  };
  if (d && d.approval <= -5) add(65, "approval-down", [`${you}，民調掉了 ${-d.approval} 點。支持者群組裡開始有人說要「再觀望」。`, `${you}，今天的民調不太好看，掉了 ${-d.approval} 點。造勢場的人可能會少一點。`]);
  else if (d && d.approval >= 6) add(45, "approval-up", [`${you}，民調漲了 ${d.approval} 點。不過記者已經在找下一個可以問的問題了。`, `${you}，民調漲了 ${d.approval} 點，黨部今天打了三通電話來關心。`]);
  state_(60, "council", true, 35, [`${you}，議會那邊不太配合，下一個預算案恐怕會被卡在委員會。`, `${you}，議長的人說「不是不支持，只是希望你先聽聽他們的建議」。`, `${you}，議員們這週退回了兩份報告，說是「資料不完整」。`]);
  state_(58, "team", true, 40, [`${you}，局處長們已經連續加班三週，有兩個在問退休的事。`, `${you}，公文的處理速度慢了一半。不是大家不做事，是人手真的不夠。`, `${you}，幕僚群組裡已經三天沒人回訊息了。`]);
  state_(55, "party", true, 30, [`${you}，黨部這次沒派人來，說是「人手調度不過來」。`, `${you}，黨中央最近開會都沒提到你的名字。`, `${you}，黨部的文宣裡，你的照片被放到最後一頁。`]);
  state_(50, "business", false, 65, [`${you}，最近來拜訪的老闆有點多。每一個都說「只是來打招呼」。`, `${you}，有位董事長送了一盒茶葉來。我先放在會議室，還沒拆。`, `${you}，商會邀你當榮譽理事長。我覺得我們應該再想一下。`]);
  state_(48, "media", true, 24, [`${you}，今天沒有任何一家媒體報導你。${state.opponent?.name ?? "對手"}倒是上了兩次頭條。`, `${you}，記者會只來了三家媒體，其中一家是實習生。`]);
  if (served) state_(52, "treasury", true, 30, [`${you}，財政局長說，再追加任何預算，就要動用第二預備金了。`, `${you}，主計處把明年的預算砍了一成，每個局處都在抱怨。`]);
  state_(30, "approval", false, 62, [`${you}，現在的聲勢不錯。不過選民的記憶都很短。`, `${you}，最近走在路上，有人主動來跟你自拍了。`, `${you}，民調很好看。好看到黨中央開始問你下一步的打算。`]);

  // 平常日
  const weeksLeft = 12 - (state.turn % 12);
  const opp = state.opponent?.name ?? "對手";
  add(10, "calm", served
    ? [
        `${you}，今天的行程排滿了：兩場剪綵、一場里民大會、一場議會備詢。`,
        `${you}，市府這週沒什麼大事。記者在找新聞，我們最好別給他們。`,
        `${you}，1999 的話務量這週下降了一成。不知道是問題變少，還是大家放棄打了。`,
        `${you}，議會這週休會。這是我們難得可以好好做事的一週。`,
        `${you}，離下一次投票還有 ${weeksLeft} 個回合。${opp}最近常在你的選區跑行程。`,
      ]
    : [
        `${you}，今天的掃街行程排好了。${opp}那邊目前沒有新動作。`,
        `${you}，競選總部的志工今天多了五個人，都是自己找上門的。`,
        `${you}，離投票還有 ${weeksLeft} 個回合。${opp}的看板又多了一面。`,
        `${you}，今天的便當訂了兩百個，來了一百五十個人。剩下的我拿去給隔壁的警察了。`,
        `${you}，有位阿伯在總部門口站了一個小時，最後只說了一句「加油」就走了。`,
      ]);

  lines.sort((a, b) => b.priority - a.priority);
  const unique = lines.filter((l, i) => lines.findIndex((x) => x.key === l.key) === i);
  const texts = unique.map((l) => pick(l.texts, state.seed, state.turn, hash(l.key)));
  const [main, ...rest] = texts.filter((t, i) => unique[i].key !== "calm" || i === 0);
  return { main, items: rest.slice(0, 3) };
}

