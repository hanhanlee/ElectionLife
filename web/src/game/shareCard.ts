// 結局分享圖卡：依這一局的下場挑底圖（web/public/cards/<種類>.webp），文字由畫面疊上。
// 5 張底圖對應 10 種結局與後日談大標；醜聞與破產優先於輸贏，因為那才是這一局真正的故事。
// 小故事依最後的分數與結局，從預先寫好的句子裡挑。

import type { GameSummary } from "./endings";
import { mulberry32 } from "./rng";
import type { GameState, StatKey } from "./types";

/** 底圖（web/public/cards/<kind>.webp）；capital-* 是特別篇《首都逆轉戰》專用 */
export type CardKind = "scandal" | "broke" | "win" | "dawn" | "loss" | "capital-win" | "capital-loss";

const SCANDAL_CRISES = ["x-vote-buying", "x-investigation", "x-collusion", "x-campaign-scandal"];
/** 曝光時算醜聞的劇情（金錢與人事交換）；政見灌水被拆穿不算 */
const SCANDAL_ARCS = ["donor", "faction", "transparency", "alliance"];

export function cardKind(state: GameState, summary: GameSummary): CardKind {
  const scandal =
    state.crisisLog.some((l) => SCANDAL_CRISES.includes(l.id)) ||
    Object.values(state.arcs).some((a) => a.status === "exposed" && SCANDAL_ARCS.includes(a.id)) ||
    state.flags.includes("investigated");
  if (scandal) return "scandal";
  const won = summary.election.won;
  const broke =
    state.flags.includes("loan-defaulted") ||
    state.flags.includes("unpaid-staff") ||
    (!won && summary.ending.id === "lost-broke");
  if (broke) return "broke";
  if (won) return "win";
  if (state.stats.integrity >= 82) return "dawn";
  return "loss";
}

/** 圖卡底部的一句話：把「你最常守護…」改成第一人稱 */
export function firstPerson(persona: string): string {
  return persona.replace(/^你/, "我");
}

type Pool = string[];

interface StatLines {
  /** 只有選上過市長才有意義的數值（市庫、施政、議會） */
  servedOnly?: boolean;
  low: [number, Pool];
  high: [number, Pool];
  /** 落在中間時的備用句（只有少數數值有） */
  mid?: Pool;
}

/** 最後的分數落在哪一段，就用哪一段的句子；{v} 代入分數。門檻參考模擬結局的分布（約前後 25%） */
const STAT_LINES: Partial<Record<StatKey, StatLines>> = {
  approval: {
    low: [35, ["最後一份民調只剩 {v}，造勢場的椅子總是坐不滿。", "我的民調一路往下掉，連支持者群組都安靜了。", "掃街的時候，願意跟我握手的人越來越少。"]],
    high: [70, ["民調最高衝到 {v}，走在路上常有人要合照。", "我的支持度一直很好看，好看到黨中央開始問我下一步。", "市場裡的阿姨都認得我，見面就喊凍蒜。"]],
    mid: ["我的民調不上不下，像大部分的候選人一樣。", "民調停在 {v}，不算差，但也從來沒有穩過。"],
  },
  integrity: {
    low: [45, ["為了選票，我說過很多自己都不信的話。", "那些交換、那些說好不說的事，我一件一件都記得。", "我學會了在鏡頭前說「這是誤會」。"]],
    high: [85, ["有些票我寧可不要，也沒有改口。", "我拒絕了很多「大家都這樣做」的建議。", "幕僚說我太固執，但我晚上睡得著。"]],
    mid: ["我守住了一些原則，也放掉了一些。", "有些事我堅持了，有些事我告訴自己「這次就算了」。"],
  },
  treasury: {
    servedOnly: true,
    low: [30, ["市庫被我花到見底，財政局長每次見我都在嘆氣。", "我留下的市庫只剩零頭，下一任的第一場記者會就在罵這件事。"]],
    high: [58, ["我把市庫顧得很緊，議員說我小氣，審計處說我難得。", "卸任時市庫還有餘裕，只是很少人注意到。"]],
  },
  achievement: {
    servedOnly: true,
    low: [12, ["四年下來，剪綵比完工多。", "說好的建設，大多還停在規劃圖上。"]],
    high: [45, ["任內蓋的東西，現在每天都有人在用。", "捷運、社宅、公園，不少落成碑上刻著我的名字。"]],
  },
  council: {
    servedOnly: true,
    low: [35, ["議會跟我吵了四年，預算每次都卡在委員會。", "議長的電話，我後來都不太想接。"]],
    high: [58, ["議會那邊我打點得很好，預算幾乎一路放行。", "議長跟我稱兄道弟，案子很少卡關。"]],
  },
  team: {
    low: [32, ["身邊的幕僚一個一個離開，發言人換了三次。", "團隊累垮了，群組裡已經很久沒人回訊息。"]],
    high: [55, ["我的團隊一路跟著我，沒有人中途跳船。", "幕僚們加班到半夜，還會順便幫我訂便當。"]],
  },
  party: {
    low: [28, ["黨部對我愛理不理，文宣裡我的照片在最後一頁。", "黨中央開會時，很少有人提到我的名字。"]],
    high: [68, ["黨部全力挺我，大咖一個接一個來站台。", "黨中央把我當成明日之星，輔選資源源源不絕。"]],
  },
  media: {
    low: [21, ["媒體幾乎不報導我，記者會常常只來三家。", "很多市民直到投票那天，才知道我有參選。"]],
    high: [50, ["我天天上新聞，好的壞的都有。", "我的名字掛在跑馬燈上的時間，比任何人都長。"]],
  },
  business: {
    low: [25, ["我跟財團保持距離，募款餐會因此冷冷清清。", "企業主不太喜歡我，捐款名單短得可憐。"]],
    high: [63, ["來拜訪的老闆很多，每一個都說「只是來打招呼」。", "我跟建商們很熟，熟到記者開始畫關係圖。"]],
  },
};

/** 每種結局的收尾句（不放對手姓名：對看圖卡的人沒有意義） */
const ENDING_LINES: Record<string, Pool> = {
  "first-votebuy": ["開票那晚我不在總部，在地檢署做筆錄。", "我發出去的走路工，比拿到的選票還多。"],
  "first-scandal": ["選舉打到一半，我的黑料比政見還多。最後我落選了。", "每天早上我都要先看完爆料才敢出門掃街。開票那晚也是。"],
  "first-broke": ["最後我落選了，房子也跟著輸掉了。", "開票那晚之後，銀行的人比記者先到。"],
  "first-lost-close": ["開票那晚，我以些微差距輸給了競選對手。", "最後只差幾個百分點，當選的是對手。", "我差一點就贏了，那幾個百分點我算了好幾年。"],
  "first-fakepoll": ["我的民調一路領先，直到真正的開票。", "那份領先的民調，選後成了傳播系的教材。"],
  "first-thesis": ["整場選舉大家都在討論我的論文，最後我落選了。", "選民記得的不是我的政見，是我的論文頁數。"],
  "first-promise": ["我什麼都答應了，選民什麼都不信。", "我開出的支票加起來是市府三年的預算，選民沒有兌現。"],
  "first-sponsored": ["黨部不挺我，但企業主很挺我。選民看得出來。", "我的造勢舞台是建商搭的，選票不是。"],
  "first-buzz": ["最後我聲量第一，票數第二。", "網路上人人都在討論我，投票所裡沒有那麼多人。"],
  "first-quixote": ["我對著風車衝鋒，風車贏了。", "我堅持的事都沒有改，選票也沒有來。"],
  "first-alone": ["開票那晚，總部裡沒有一個黨部的人。", "我一個人選到最後，也一個人看完開票。"],
  "first-lost": ["開票不到兩小時，競選對手就宣布當選。", "最後我落選了，差距大到沒人提驗票。", "這座城市最後選了我的對手。"],
  "won-comeback": ["出征失敗回來後，市民居然還是讓我連任了。", "我請假去選更大的位子沒選上，回來又贏了連任。"],
  "won-builder": ["四年後，我又贏了競選對手，連任成功。", "選民看見了我做的事，讓我再做四年。"],
  "won-clean-spender": ["我一毛錢都沒拿，但市庫的錢也一毛都沒剩。我連任了。", "我很清廉，也很會花錢。選民讓我再做四年。"],
  "won-clean": ["四年後我連任成功，沒有欠任何人人情。", "我沒拿原則換票，選民還是讓我再做四年。"],
  "won-padded": ["我的政見數字都很漂亮，有人去現場數了，還沒數完。我連任了。", "政見的完成率每一季都在成長，我的票也是。"],
  "won-tragedy": ["那場悲劇之後，我的民調漲了。我連任了，這件事我從來不提。", "每一場告別式我都站在最前排，鏡頭也是。"],
  "won-perks": ["市府的每一場活動都替我造勢，我連任成功。", "我把市政宣導辦成競選晚會，帳單由全體市民買單。"],
  "won-crony": ["四年後我連任成功，慶功宴的花籃一半來自建商。", "我又贏了一次。有人幫我把路鋪好了，他們會記得的。"],
  "won-spender": ["四年後我連任成功。市民拿到了錢，下一任拿到了帳單。", "我用市庫買到了下一個四年。"],
  "won-talkshow": ["我上過的政論節目比完成的建設還多。我連任了。", "打開電視就找得到我。選民也找到了我的名字，投了下去。"],
  "won-influencer": ["我靠聲量贏下連任，大家都看過我的影片。", "至少開票那晚，聲量就是政績。我連任成功。"],
  "won-machine": ["樁腳一個不少地動起來，我又贏了一次。", "我不一定被喜歡，但組織幫我贏下了連任。"],
  "won-council": ["議長在我的連任慶功宴上致詞，講得比我還久。", "議會一路放行，我也一路連任。"],
  "won-landslide": ["開票十五分鐘，對手就打電話來恭喜我了。", "這場連任選舉，我最大的對手是投票率。"],
  "won-squeaker": ["開票開到凌晨我才敢上台，我險勝連任。", "我贏了，贏得連自己都不太相信。"],
  "won-idol": ["我靠人氣贏下連任，沒有人問我做了什麼。", "走到哪裡都有人要合照，開票那晚也一樣。"],
  "won-showman": ["靠著一場又一場的剪綵，我擊敗對手，連任成功。", "四年後我連任成功。剪過的彩帶接起來，可以繞市區一圈。"],
  "lost-deserter": ["我中途出征沒選上，回來連任也輸了。", "兩邊都想要，最後兩邊都沒有。"],
  "lost-monk": ["我默默做了很多事，默默到連選民都不知道。我連任失敗了。", "我不上節目、不拍影片，只看公文。選民把票投給了會拍影片的人。"],
  "lost-broken": ["我在公報上的承諾，到卸任那天還是一張透視圖。", "對手的廣告只問了一句：說好的呢？我連任失敗了。"],
  "lost-builder": ["四年後我輸給了競選對手，剪綵的人換成了別人。", "我蓋的東西還在，但連任選舉我輸了。"],
  "lost-broke": ["連任選舉我輸給了對手，留下一個見底的市庫。", "四年後選民換了人，帳單留給了下一任。"],
  "lost-clean": ["連任選舉我輸了，但沒有輸掉自己。", "四年後選民換了人。我沒拿原則換票，晚上還睡得著。"],
  "lost-abandoned": ["選前最後一週，黨主席去幫別人站台。我連任失敗了。", "黨部說全力支持，然後我輸掉了連任。"],
  "lost-scandal": ["連任失敗後，我每週二上午都要開庭。", "我在法院門口說「相信司法」的次數，比說政見還多。"],
  "lost-atm": ["四年來建商需要什麼，我就給什麼。選民最後給了我答案。", "我的市政地圖跟建商的推案地圖重疊得剛剛好。我連任失敗了。"],
  "lost-pollwinner": ["民調贏了，選票輸了。投票那天沒有人幫我載人。", "我的支持度一直領先，但黨部的遊覽車開去了別的地方。"],
  "lost-gridlock": ["我跟議會吵了四年，最後連任失敗。", "每份預算都卡在議會，選民只記得我什麼都推不動。"],
  "lost-invisible": ["卸任那天，有市民問：「原來那四年是你喔？」", "我做了四年市長，連任失敗時也沒什麼人發現。"],
  "lost-loner": ["選到最後，總部只剩我和一台影印機。", "幕僚一個一個離開，我連任失敗了。"],
  "lost-generic": ["四年後我連任失敗，成了只做一任的市長。", "連任選舉，對手贏了我。四年很長，選民的記憶很短。"],
  "successor-scandal": ["接班選舉打到一半，檢調先找上了我。", "接班人在電視上說，跟我不太熟。"],
  "successor-shadow": ["接班人當選了，重要的決定還是在我家客廳做的。", "我不在台上了，但台上的人講的每一句話，都是我改過的稿。"],
  "successor-regent": ["接班人當選了，市府的公文還是會先送一份到我家。", "我卸任了，但市政會議上大家還是先看我的臉色。"],
  "successor-won": ["任期屆滿，我推出的接班人擊敗了競選對手。", "接班人當選了，致詞時感謝了我三次。"],
  "successor-mess": ["接班人輸了，新市長說我留下了一個爛攤子。", "我留給接班人的，是一份比政見還厚的負債表。"],
  "successor-faded": ["我卸任時民調還很好，但民調不會自己去投票。接班人輸了。", "我很受歡迎，接班人沒有。選民分得很清楚。"],
  "successor-lost": ["任期屆滿，我推出的接班人輸給了競選對手。", "接班人落選了，我蓋的東西成了別人的政績。"],
};

const STORY_LIMIT = 130;

/**
 * 圖卡上的小故事：依最後的分數挑 1–3 句描述（越極端的數值越容易入選），再接上這種結局的收尾句。
 * 句子依這一局的 seed 隨機挑選，同一局重整不會變。
 */
export function cardStory(state: GameState, summary: GameSummary): string {
  const rand = mulberry32(state.seed ^ 0x5eed);
  const pick = (pool: Pool) => pool[Math.floor(rand() * pool.length)];
  const served = summary.stage !== "first";

  const candidates: { key: StatKey; score: number; pool: Pool }[] = [];
  const fillers: { key: StatKey; pool: Pool }[] = [];
  for (const [key, lines] of Object.entries(STAT_LINES) as [StatKey, StatLines][]) {
    if (lines.servedOnly && !served) continue;
    const v = state.stats[key];
    const [lo, loPool] = lines.low;
    const [hi, hiPool] = lines.high;
    // 超出門檻越多越容易入選，再加一點隨機，讓相近的局面讀到不同的數值
    if (v <= lo) candidates.push({ key, score: (lo - v) / 20 + rand(), pool: loPool });
    else if (v >= hi) candidates.push({ key, score: (v - hi) / 20 + rand(), pool: hiPool });
    else if (lines.mid) fillers.push({ key, pool: lines.mid });
  }
  candidates.sort((a, b) => b.score - a.score);

  const count = 1 + Math.floor(rand() * 3);
  const chosen = [...candidates, ...fillers].slice(0, count);
  const fill = (text: string, key?: StatKey) => text.replace("{v}", key ? String(state.stats[key]) : "");
  const sentences = chosen.map((c) => fill(pick(c.pool), c.key));
  const ending = pick(ENDING_LINES[summary.ending.id]);

  while (sentences.length > 1 && sentences.join("").length + ending.length > STORY_LIMIT) sentences.pop();
  return sentences.join("") + ending;
}
