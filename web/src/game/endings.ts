// 結局判定：選舉結果 × 最後的數值與關鍵旗標 → 一個外號（剪綵之王、撒幣大俠……）；每種結局有多個標語版本。

import { isPerk, runElection, totalDelta, type ElectionResult } from "./engine";
import { ALL_STATS, STAT_LABELS, type GameEvent, type GameState, type StatKey } from "./types";

export interface Ending {
  id: string;
  title: string;
  tagline: string;
}

interface EndingDef {
  /** 這個人的外號，像政論節目或鄉民會給的稱號 */
  title: string;
  /** 多個版本，依這一局的 seed 挑一個 */
  taglines: string[];
  /** 依序檢查，取第一個符合的 */
  when: (c: EndingCtx) => boolean;
}

interface EndingCtx {
  s: GameState["stats"];
  won: boolean;
  probability: number;
  perks: number;
  /** 承諾過幾項政見（promise-* 旗標） */
  promises: number;
  /** 貸款違約，或借了錢而且花光了 */
  broke: boolean;
  has: (flag: string) => boolean;
  arc: (id: string) => string | undefined;
  crisis: (id: string) => boolean;
  /** 政見承諾類劇情（社宅、捷運、發錢……）處於這個狀態的條數 */
  promiseCount: (status: string) => number;
}

/** 政見承諾類劇情：灌水算「數字魔術師」，跳票算「跳票市長」 */
const PROMISE_ARCS = ["housing", "mrt", "cash", "flood", "air", "tourism", "transparency"];

const always = () => true;

/** 每一場選舉的結局，依序檢查；條件嚴格、故事性強的排前面，最後一個是預設 */
const ENDING_GROUPS: Record<"first" | "won" | "lost" | "successor", Record<string, EndingDef>> = {
  first: {
    "first-votebuy": { title: "走路工大戶", when: (c) => c.has("vote-buying"), taglines: ["你發出去的走路工，比拿到的選票還多。", "樁腳的帳冊上，你的名字寫得比選舉公報還清楚。", "開票那晚你不在總部，在地檢署做筆錄。"] },
    "first-scandal": { title: "黑料候選人", when: (c) => c.crisis("x-campaign-scandal") || c.crisis("x-collusion"), taglines: ["選舉打到一半，你的黑料比政見還多。", "每天早上，你都要先看完爆料才敢出門掃街。"] },
    "first-broke": { title: "破產候選人", when: (c) => c.broke, taglines: ["你把房子押進票匭，票匭沒有還給你。", "選完之後，銀行的人比記者先到。"] },
    "first-lost-close": { title: "差一點市長", when: (c) => c.probability >= 0.4, taglines: ["只差幾個百分點。四年後，你還會再來嗎？", "開票到最後一刻你都還有機會。那幾個百分點，你會記很久。"] },
    "first-fakepoll": { title: "民調魔術師", when: (c) => c.has("fake-poll"), taglines: ["你的民調一路領先，直到真正的開票。", "那份「領先」的民調，選後成了傳播系的教材。"] },
    "first-thesis": { title: "論文門主角", when: (c) => c.has("thesis-fight"), taglines: ["選民記得的不是你的政見，是你的論文頁數。", "整場選舉，大家都在討論你的碩士論文，沒有人討論市政。"] },
    "first-promise": { title: "支票大王", when: (c) => c.promises >= 3, taglines: ["你開出的支票，加起來是市府三年的預算。選民沒有兌現。", "捷運、現金、觀光、社宅，你什麼都答應了，選民什麼都不信。"] },
    "first-sponsored": { title: "金主候選人", when: (c) => c.s.business >= 60 && c.s.party <= 30, taglines: ["黨部不挺你，但企業主很挺你。選民看得出來。", "你的競選總部是建商借的，造勢舞台是建商搭的，選票不是建商的。"] },
    "first-buzz": { title: "聲量冠軍", when: (c) => c.s.media >= 50, taglines: ["聲量冠軍，票數亞軍。", "網路上每個人都在討論你，投票所裡沒有那麼多人。"] },
    "first-quixote": { title: "唐吉訶德", when: (c) => c.s.integrity >= 85, taglines: ["你對著風車衝鋒，風車贏了。", "你堅持的每一件事都是對的，只是選票不這麼想。"] },
    "first-alone": { title: "孤軍候選人", when: (c) => c.s.party <= 25, taglines: ["黨部的人只在你登記那天出現過一次。", "你的競選總部，連黨旗都是自己買的。"] },
    "first-lost": { title: "陪跑員", when: always, taglines: ["這座城市選擇了別人。你的政見，對手可能會拿去用。", "競選總部的看板一週內就拆完了。你的名字留在選舉公報裡。", "你學到了選舉的很多事，學費有點貴。"] },
  },
  won: {
    "won-comeback": { title: "回鍋市長", when: (c) => c.has("ran-higher"), taglines: ["你出征失敗又回來了，市民居然讓你連任。", "請假去選更大的位子沒選上，回來還是坐回原位。這座城市很寬容。"] },
    "won-builder": { title: "建設狂魔", when: (c) => c.s.achievement >= 50 && c.s.approval >= 55, taglines: ["你做了事，選民也剛好看見了。請珍惜這個機率。", "全市的工地圍籬都印著你的名字，這次是真的有蓋完。"] },
    "won-clean-spender": { title: "清廉散財童子", when: (c) => c.s.integrity >= 80 && c.s.treasury <= 30, taglines: ["你一毛錢都沒拿，但市庫的錢也一毛都沒剩。", "你很清廉，也很會花錢。審計報告和廉政報告都提到了你。"] },
    "won-clean": { title: "清流市長", when: (c) => c.s.integrity >= 82, taglines: ["你沒有拿原則去換票，選民也沒有讓你失望。這次。", "四年來你拒絕了很多「大家都這樣做」，最後還是贏了。幕僚到現在都不太敢相信。"] },
    "won-perks": { title: "公帑造勢王", when: (c) => c.perks >= 4, taglines: ["市府的每一場活動，都剛好在你的選區。", "你把市政宣導辦成了競選晚會，費用由全體市民買單。"] },
    "won-crony": { title: "建商之友", when: (c) => c.s.business >= 65, taglines: ["你連任了，建商也是。", "慶功宴的花籃，一半來自你任內得標的公司。", "你贏得很輕鬆，因為有人幫你把路鋪好了。他們會記得的。"] },
    "won-spender": { title: "撒幣大俠", when: (c) => c.s.treasury <= 20, taglines: ["市民拿到了錢，下一任拿到了帳單。", "你發的每一筆錢都寫著「市長關心你」，只有預算書上寫著「舉債」。", "你用市庫買到了四年。利息會由下一代慢慢付。"] },
    "won-padded": { title: "數字魔術師", when: (c) => c.promiseCount("concealed") >= 1, taglines: ["你說的數字都很漂亮：社宅、捷運、空品。有人去現場數了，還沒數完。", "政見的完成率每一季都在成長，工地的進度沒有。"] },
    "won-tragedy": { title: "悲情牌大師", when: (c) => c.has("used-tragedy"), taglines: ["那場悲劇之後，你的民調漲了。這件事你從來不提。", "你在每一場告別式都站在最前排，鏡頭也是。"] },
    "won-talkshow": { title: "通告市長", when: (c) => c.s.media >= 50 && c.s.achievement <= 15, taglines: ["你上過的政論節目比你完成的建設還多。", "四年來你是全台最好找的市長：打開電視就找得到。"] },
    "won-influencer": { title: "網紅市長", when: (c) => c.s.media >= 50, taglines: ["你的影片觀看數，比任何一項政見的完成率都高。", "選民不一定知道你做了什麼，但每個人都看過你跳舞。", "聲量就是政績。至少在開票那晚是這樣。"] },
    "won-machine": { title: "樁腳之神", when: (c) => c.s.party >= 62, taglines: ["你不一定被喜歡，但你的樁腳很準時。", "黨部的遊覽車一台接一台開進投票所附近。你贏的是動員，不是人心。"] },
    "won-council": { title: "議會好麻吉", when: (c) => c.s.council >= 60, taglines: ["議長在你的慶功宴上致詞，講得比你還久。", "四年來你的預算一路放行。條件是什麼，只有你和議長知道。"] },
    "won-landslide": { title: "躺著選的市長", when: (c) => c.probability >= 0.85, taglines: ["開票十五分鐘，對手就打電話來恭喜你了。", "這場選舉你最大的對手，是投票率。"] },
    "won-squeaker": { title: "險勝市長", when: (c) => c.probability < 0.5, taglines: ["你贏了，贏得連自己都不太相信。", "開票開到凌晨，你才敢上台。差距小到對手申請了驗票。"] },
    "won-idol": { title: "人氣天王", when: (c) => c.s.approval >= 80, taglines: ["你走到哪裡都有人要合照，至於政績，下次再說。", "民調一直很好看，好看到沒有人問你做了什麼。"] },
    "won-showman": { title: "剪綵之王", when: always, taglines: ["任內剪斷的彩帶，接起來可以繞市區一圈。", "你出席的開工典禮比完工典禮多三倍。選民記得的是你拿剪刀的樣子。", "四年來你站在每一個工地前面拍照。至於工地後來怎麼了，那是另一個故事。"] },
  },
  lost: {
    "lost-deserter": { title: "落跑市長", when: (c) => c.has("ran-higher"), taglines: ["你上任不到一年就出征了。市民用選票回答了「那我們呢？」", "兩邊都想要，最後兩邊都沒有。"] },
    "lost-monk": { title: "苦行僧市長", when: (c) => c.s.achievement >= 26 && c.s.media <= 25, taglines: ["你默默做了很多事，默默到連選民都不知道。", "你不上節目、不拍影片，只看公文。選民把票投給了會拍影片的人。"] },
    "lost-builder": { title: "無名建設家", when: (c) => c.s.achievement >= 38, taglines: ["下一任市長剪綵的，是你蓋的東西。", "你把四年花在看不見的地方：管線、排水、預算表。選民看不見。"] },
    "lost-broken": { title: "跳票市長", when: (c) => c.promiseCount("exposed") >= 1 || c.promiseCount("broken") >= 2, taglines: ["你在公報上的承諾，到卸任那天還是一張透視圖。", "對手的競選廣告只有一句話：「說好的呢？」"] },
    "lost-broke": { title: "敗家市長", when: (c) => c.s.treasury <= 15, taglines: ["煙火很美，帳單更長。", "你辦了很多場活動，市庫辦了一場告別式。"] },
    "lost-clean": { title: "孤獨的清流", when: (c) => c.s.integrity >= 82, taglines: ["你沒有拿原則換票，選民也沒有拿票換你的原則。", "有人說你太天真。你說，至少你晚上睡得著。"] },
    "lost-abandoned": { title: "黨的棄子", when: (c) => c.s.party <= 30, taglines: ["選前最後一週，黨主席去幫別的縣市站台了。", "黨部說「全力支持」，然後把輔選經費撥給了別人。"] },
    "lost-atm": { title: "建商提款機", when: (c) => c.s.business >= 63 && c.s.integrity <= 40, taglines: ["四年來建商需要什麼，你就給什麼。選民最後也給了你一個答案。", "你的市政地圖跟建商的推案地圖，重疊得剛剛好。"] },
    "lost-pollwinner": { title: "民調贏家", when: (c) => c.s.approval >= 60 && c.s.party <= 40, taglines: ["民調贏了，選票輸了。差別在於投票那天沒有人幫你載人。", "你的支持度一直領先，但黨部的遊覽車開去了別的地方。"] },
    "lost-gridlock": { title: "議會公敵", when: (c) => c.s.council <= 30, taglines: ["你跟議會吵了四年，最後兩邊都沒贏，贏的是對手。", "每一份預算都卡在委員會。選民只記得你什麼都推不動。"] },
    "lost-scandal": { title: "法院常客", when: (c) => c.has("investigated") && c.s.integrity <= 30, taglines: ["你卸任後的行程，比在任時還固定：每週二上午開庭。", "你在法院門口說「相信司法」的次數，比說政見還多。"] },
    "lost-invisible": { title: "隱形市長", when: (c) => c.s.media <= 21, taglines: ["卸任那天，有市民問：「原來那四年是你喔？」", "你做了四年市長，新聞畫面加起來不到十分鐘。"] },
    "lost-loner": { title: "光桿司令", when: (c) => c.s.team <= 25, taglines: ["選到最後，總部只剩你和一台影印機。", "你的幕僚一個一個離開，最後連發言人都是臨時找的。"] },
    "lost-generic": { title: "四年限定市長", when: always, taglines: ["四年很長，選民的記憶很短。", "你成了市府走廊上一張掛得不太顯眼的照片。", "沒有大醜聞，也沒有大政績。選民覺得可以換個人試試看。"] },
  },
  successor: {
    "successor-scandal": { title: "法院常客", when: (c) => c.has("investigated") && c.s.integrity <= 30, taglines: ["接班選舉打到一半，檢調先找上了你。接班人在電視上說「跟老市長不熟」。", "你卸任後最常去的地方，是地方法院的第三法庭。"] },
    "successor-shadow": { title: "幕後藏鏡人", when: (c) => c.won && c.s.integrity <= 35, taglines: ["接班人當選了，市府的重要決定還是在你家客廳做的。", "你不在台上了，但台上的人講的每一句話，都是你改過的稿。"] },
    "successor-regent": { title: "太上市長", when: (c) => c.won && c.s.approval >= 70, taglines: ["接班人當選了，但市府的公文還是會先送一份到你家。", "你卸任了，可是每次市政會議，大家還是會先看你的臉色。"] },
    "successor-won": { title: "造王者", when: (c) => c.won, taglines: ["接班人致詞時感謝了你三次。四年後，接班人會說那些都是自己做的。", "你的路線延續下去了。至於接班人會不會照著走，那是另一回事。"] },
    "successor-mess": { title: "爛攤子製造機", when: (c) => c.s.treasury <= 15, taglines: ["接班人輸了。新市長的第一場記者會，標題是「前朝留下的爛攤子」。", "你留給接班人的，是一份比政見還厚的負債表。"] },
    "successor-faded": { title: "人走茶涼", when: (c) => c.s.approval >= 60, taglines: ["你卸任時民調還很好，但民調不會自己去投票。", "你很受歡迎，接班人沒有。選民分得很清楚。"] },
    "successor-lost": { title: "末代市長", when: always, taglines: ["你蓋的東西，現在是別人的政績了。", "新市長上任第一週，就宣布要「全面檢討前朝政策」。"] },
  },
};

const ENDINGS: Record<string, EndingDef> = Object.assign({}, ...Object.values(ENDING_GROUPS));

/** 遊戲在哪一場選舉結束：第一次投票、連任選舉、或現任市長任期屆滿後的接班選舉 */
export type FinalStage = "first" | "reelection" | "successor";

export function finalStage(state: GameState): FinalStage {
  if (state.firstElection && !state.firstElection.won) return "first";
  return state.flags.includes("bg-incumbent") ? "successor" : "reelection";
}

export interface GameSummary {
  stage: FinalStage;
  election: ElectionResult;
  ending: Ending;
  protected: StatKey;
  sacrificed: StatKey;
  persona: string;
  /** 任期結束時尚未爆發的延遲後果：留給下一任的帳單 */
  leftovers: string[];
  /** 動用現任資源的次數與換到的民調 */
  perks: { count: number; available: number; approval: number; treasury: number };
  /** 「換你當選民」：讓玩家從選民角度重新檢視自己的選擇 */
  reflection: ReflectionItem[];
}

export interface ReflectionItem {
  id: string;
  /** tempting：拿原則或公家資源換到選票；principled：為了原則放棄選票；popular：沒有前兩者時，最受歡迎的一招 */
  kind: "tempting" | "principled" | "popular";
  eventTitle: string;
  optionLabel: string;
  approval: number;
  integrity: number;
  perk: boolean;
}

/**
 * 挑出最值得反問的選擇：換到最多民調、但傷了原則或動用了公家資源的（最多 3 個），
 * 以及一個為了原則放棄民調的選擇。
 */
function reflectionItems(state: GameState, events: GameEvent[]): ReflectionItem[] {
  const items = state.history.map((h) => {
    const event = events.find((e) => e.id === h.eventId)!;
    const option = event.options.find((o) => o.id === h.optionId)!;
    return {
      id: String(h.turn),
      eventTitle: event.title,
      optionLabel: option.label,
      approval: h.optionDelta.approval,
      integrity: h.optionDelta.integrity,
      perk: !!option.perk,
    };
  });
  const tempting = items
    .filter((i) => i.approval > 0 && (i.integrity < 0 || i.perk))
    .sort((a, b) => b.approval - a.approval)
    .slice(0, 3)
    .map((i) => ({ ...i, kind: "tempting" as const }));
  const principled = items
    .filter((i) => i.integrity > 0 && i.approval < 0)
    .sort((a, b) => b.integrity - a.integrity - (a.approval - b.approval))
    .slice(0, 1)
    .map((i) => ({ ...i, kind: "principled" as const }));
  if (tempting.length + principled.length > 0) return [...tempting, ...principled];
  const popular = [...items].sort((a, b) => b.approval - a.approval)[0];
  return popular && popular.approval > 0 ? [{ ...popular, kind: "popular" as const }] : [];
}

function pickEnding(state: GameState, stage: FinalStage, election: ElectionResult, perks: number): Ending {
  const group = stage === "first" ? "first" : stage === "successor" ? "successor" : election.won ? "won" : "lost";
  const c: EndingCtx = {
    s: state.stats,
    won: election.won,
    probability: election.probability,
    perks,
    promises: state.flags.filter((f) => f.startsWith("promise-")).length,
    broke: state.flags.includes("loan-defaulted") || (state.loanTaken && state.funds <= 200),
    has: (f) => state.flags.includes(f),
    arc: (id) => state.arcs[id]?.status,
    crisis: (id) => state.crisisLog.some((l) => l.id === id),
    promiseCount: (status) => PROMISE_ARCS.filter((id) => state.arcs[id]?.status === status).length,
  };
  const [id, def] = Object.entries(ENDING_GROUPS[group]).find(([, d]) => d.when(c))!;
  const tagline = def.taglines[(state.seed >>> 3) % def.taglines.length];
  return { id, title: def.title, tagline };
}

function perkUsage(state: GameState, events: GameEvent[]): GameSummary["perks"] {
  const perks = { count: 0, available: 0, approval: 0, treasury: 0 };
  for (const h of state.history) {
    // 只計算當回合實際出現過現任資源選項的事件
    const options = events.find((e) => e.id === h.eventId)?.options ?? [];
    if (options.some((o) => o.perk && h.offered.includes(o.id))) perks.available++;
    if (isPerk(events, h.eventId, h.optionId)) {
      perks.count++;
      perks.approval += h.optionDelta.approval;
      perks.treasury += Math.min(0, h.optionDelta.treasury);
    }
  }
  return perks;
}

export function summarize(state: GameState, events: GameEvent[]): GameSummary {
  const stage = finalStage(state);
  // 第一次投票後經費已扣掉動員費用，重算時要還原當時的經費
  const atVote = stage === "first" ? { ...state, funds: state.funds + state.firstElection!.mobilization } : state;
  const election = runElection(atVote, stage === "first" ? "first" : "final");
  const delta = totalDelta(state);
  const ranked = [...ALL_STATS].sort((a, b) => delta[b] - delta[a]);
  const protectedStat = ranked[0];
  const sacrificed = ranked[ranked.length - 1];
  const perks = perkUsage(state, events);
  return {
    stage,
    election,
    ending: pickEnding(state, stage, election, perks.count),
    protected: protectedStat,
    sacrificed,
    persona: `你最常守護「${STAT_LABELS[protectedStat]}」，最常犧牲「${STAT_LABELS[sacrificed]}」。`,
    leftovers: state.pending.map((p) => p.text),
    perks,
    reflection: reflectionItems(state, events),
  };
}

export const ENDING_IDS = Object.keys(ENDINGS);
