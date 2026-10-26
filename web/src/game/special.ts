// 特別篇：固定的人設與對手，十二個依劇本出場的事件，第一次投票後結束。
// 取材自正在進行的真實選戰，人名一律以身分或綽號影射。

import { opponentStrength } from "./profile";
import type { CardKind } from "./shareCard";
import type { GameEvent, GameState, Opponent, Profile, StatDelta, StatKey, Trait } from "./types";

/** 結局判斷用的承諾帳：做過幾個沒有財源的承諾、具體縮減或補上試算了幾次 */
export interface PromiseLedger {
  made: number;
  trimmed: number;
  /** 還沒化解的承諾負債：每次具體修正抵銷一筆，不會一次歸零 */
  debt: number;
}

export interface SpecialEnding {
  when: (s: GameState, won: boolean, probability: number, promises: PromiseLedger) => boolean;
  title: string;
  headline: string;
  paragraphs: (s: GameState, promises: PromiseLedger) => string[];
}

export interface SpecialDef {
  id: string;
  title: string;
  /** 開始畫面的一句介紹 */
  teaser: string;
  /** 開場插畫（web/public/specials/<art>.webp） */
  art: string;
  /** 開場頁的開始按鈕 */
  startLabel: string;
  /** 開局說明，一段一句 */
  intro: string[];
  party: string;
  background: string;
  profile: Omit<Profile, "rivals">;
  opponent: Omit<Opponent, "strength">;
  opponentIntro: string;
  /** 對手的額外強度（logit）：現任市長的基本盤，在一般對手的計算之外再加 */
  opponentBonus: number;
  /** 開局民調大幅落後：在政黨、出身、資質的加減之外再調整 */
  startDelta: StatDelta;
  /** 特別篇裡換個名字的數值（例如還沒執政的挑戰者沒有「施政成果」，改看「政策準備」） */
  statLabels: Partial<Record<StatKey, string>>;
  statHints: Partial<Record<StatKey, string>>;
  /** 特別篇顯示的數值：用不到的（市庫、議會、政商）不顯示；特別篇也不算錢 */
  visibleStats: StatKey[];
  /** 開票前的說明：支持度是遊戲指數，不是真實民調 */
  voteNote: string;
  /** 特別篇關掉的通用突發事件：由特別篇自己的插曲處理同一類代價 */
  disabledCrises: string[];
  endings: SpecialEnding[];
  /** 結局頁最後的提醒：現實中的選戰 */
  reality: string;
  /** 現實中的挑戰者在各題的選擇（事件 id → 選項 id）；結局頁的終章反思和平衡模擬的「現實路線」都用這份 */
  realChoices: Record<string, string>;
  /** 終章反思的最後一句：依輸贏與和現實相同的題數換一句，再加一句兩條路線共同的問題 */
  closings: { lost: string; wonSame: string; wonDifferent: string; always: string };
  /** 分享圖卡：底圖與小故事 */
  cards: { win: CardKind; loss: CardKind };
  shareStory: (won: boolean, same: number, total: number) => string;
  /** 終章反思開頭：現實的選戰走到哪裡（真名只出現在結局頁） */
  realityNow: { paragraphs: string[]; refs: { title: string; url: string }[] };
  /** 結局頁導向主篇的一句話 */
  cta: string;
}

const has = (s: GameState, flag: string) => s.flags.includes(flag);

/** 結局的補充段落：讓前面的選擇在後日談裡被提到 */
function echoes(s: GameState): string[] {
  const lines: string[] = [];
  // 已經在插曲 L02 被追問過的，結局不再重提颱風夜
  if (has(s, "sp-typhoon") && !s.interludes?.some((i) => i.eventId === "sp-capital-l02")) lines.push("檢討會上，幕僚把那段颱風夜的發言放了三遍。論點值得討論，只是說在了颱風夜，也沒先問在金融業上班的人怎麼想。");
  if (has(s, "sp-local")) lines.push("那張老鼠通報地圖，後來被好幾個里長貼在辦公室的牆上。");
  if (has(s, "sp-courted")) lines.push("前副市長團隊的那兩位老幕僚，選後傳了一句訊息給你：「下次還可以再談。」");
  return lines.slice(0, 1);
}

export const SPECIALS: SpecialDef[] = [
  {
    id: "capital-2026",
    title: "首都逆轉戰",
    teaser: "被對岸立案偵查的立委，落後二十八點，挑戰首都的現任市長。",
    art: "route-challenger",
    startLabel: "接受徵召",
    intro: [
      "你是綠黨的立法委員，在大學教犯罪學，創辦了一間民防學院，教民眾在戰爭與災難中自救、識讀假訊息。",
      "對岸說你「分裂國家」，對你立案偵查。半年後，黨要你去挑戰首都的現任市長。",
      "徵召後的第一份民調，你落後二十八個百分點。所有人都說這是不可能的任務。",
    ],
    party: "green",
    background: "legislator",
    profile: { city: "tianlong", traits: ["policy-wonk", "meme-lord", "principled"], burden: "activist-network", origin: 0 },
    opponent: {
      name: "公子市長",
      party: "blue",
      title: "尋求連任的現任市長",
      incumbent: true,
      traits: ["photogenic", "connected", "clean-image"],
      burden: "dynasty",
    },
    opponentIntro:
      "家族四代都出現在課本裡。外型體面、形象乾淨，第一任做得四平八穩，民調一直很好看。批評的人說：很好看，但不知道做了什麼。",
    opponentBonus: 0.05,
    startDelta: { approval: -21, media: -4 },
    statLabels: { approval: "支持度", achievement: "政策準備" },
    statHints: {
      approval: "遊戲裡的聲勢指數，不是真實民調。",
      achievement: "你的政見有多少研究、財源和時程撐著。宣布政見不會增加，做功課才會。",
    },
    visibleStats: ["approval", "media", "achievement", "team", "party"],
    // 挑戰者聲量高是現實（民調也一路追上來），不該固定扣分；衝聲量的代價改由插曲 F13〈短影音被斷章取義〉處理，玩家可以選擇怎麼回應
    disabledCrises: ["x-overexposure"],
    voteNote: "開票前，幕僚提醒你：支持度只是聲勢，不是票。公子市長的基本盤一直都在，很多人在電話裡不表態。",
    endings: [
      {
        when: (_s, won, _p, promises) => won && promises.debt === 0,
        title: "不可能的任務",
        headline: "落後二十八點的人，當選了",
        paragraphs: (s) => [
          "開票到晚上九點，公子市長的競選總部關燈了。你上台的第一句話是：「明天早上，我要去看那幾個最常淹水的地方。」",
          ...echoes(s),
          "你答應過的事不多，但每一件都算過。接下來四年，才是真正難的部分。",
        ],
      },
      {
        when: (_s, won) => won,
        title: "代價昂貴的翻盤",
        headline: "你贏了，帳單也到了",
        paragraphs: (s, promises) => [
          "開票到最後一刻，你以些微差距勝出。慶功宴上，財政局的老科長傳來一句話：「恭喜。那些承諾的錢，要從哪裡來？」",
          ...echoes(s),
          promises.trimmed > 0
            ? "你在選前縮減過承諾，但看板上的數字，大家還記得。"
            : "看板上的數字很大，大家都記得。四年後，大家也會記得你做到了多少。",
        ],
      },
      {
        when: (s, won) => !won && s.stats.integrity >= 75 && s.stats.achievement >= 40,
        title: "雖敗猶榮",
        headline: "你輸了，但大家記得你講過的每一個數字",
        paragraphs: (s) => [
          "你輸了。敗選記者會上，你把政策團隊做的那一疊研究放在桌上，說：「這些不會浪費。」",
          ...echoes(s),
          "半年前沒有人相信你能追上來。現在，對手的施政報告裡，開始出現你提過的那些地方。",
        ],
      },
      {
        when: (s, won) => !won && s.stats.media >= 50 && s.stats.team >= 45,
        title: "意外的政治新星",
        headline: "選舉輸了，但所有人都認識你了",
        paragraphs: (s) => [
          "你輸了，但你的名字比選前大了十倍。敗選記者會結束後，有三個電視節目邀你去當來賓。",
          ...echoes(s),
          "你的團隊沒有散。有人問下一場仗在哪裡，你說：「先睡一覺。」",
        ],
      },
      {
        when: () => true,
        title: "沒有奇蹟",
        headline: "首都還是公子市長的",
        paragraphs: (s) => [
          "開票不到一小時，勝負就出來了。你走上台，謝謝每一位在雨中幫你發傳單的志工。",
          ...echoes(s),
          "落後二十八點的仗，本來就很少有人打贏。但你讓很多人想了想：這座城市要的是什麼樣的市長。",
        ],
      },
    ],
    reality: "現實中的這場選戰，在 2026 年 11 月 28 日投票。遊戲裡的結果，只是無數種可能中的一種，不代表任何預測或立場。",
    realChoices: {
      "sp-capital-01": "defiant",
      "sp-capital-02": "warrior",
      "sp-capital-03": "local",
      "sp-capital-04": "enemy",
      "sp-capital-06": "earn",
      "sp-capital-07": "law",
      "sp-capital-08": "decouple",
      "sp-capital-09": "challenger",
      "sp-capital-m01": "explain",
      "sp-capital-m03": "unscripted",
      "sp-capital-m05": "substation",
      "sp-capital-m07": "attack",
      "sp-capital-n01": "same",
      "sp-capital-n03": "lunch",
      "sp-capital-n04": "soft",
      "sp-capital-n05": "ask",
      "sp-capital-n06": "more",
      "sp-capital-n07": "books",
    },
    closings: {
      lost: "現實裡，他做了這些選擇，把落後二十八點追成拉鋸。你在哪幾題做了不一樣的決定？",
      wonSame: "你走了他走過的路，也走到了終點。現實裡，這條路還沒走完。",
      wonDifferent: "你用自己的方法贏了。他在現實裡為什麼沒這樣選？是他錯了，還是你漏看了什麼？",
      always: "他的選擇裡，有哪些是你不會做的？",
    },
    cards: { win: "capital-win", loss: "capital-loss" },
    shareStory: (won, same, total) =>
      `落後二十八點起步，${won ? "我當選了" : "最後沒能翻盤"}。${total > 0 ? `我遇到的 ${total} 個真實攻防裡，有 ${same} 題和現實的選擇一樣。` : ""}`,
    realityNow: {
      paragraphs: [
        "沈伯洋被徵召後的第一份民調，落後蔣萬安二十八個百分點，很多人說這是垃圾時間。",
        "十月二十日，信民協會公布的民調是沈伯洋 50.3%、蔣萬安 33.3%。做分析的民調專家也提醒：民調不是得票率，換算成得票，兩人可能非常接近。垃圾時間，打成了焦土戰。",
      ],
      refs: [
        { title: "聯合報：北市最新民調，蔣萬安大贏沈伯洋 28 個百分點", url: "https://udn.com/news/story/124652/9529403" },
        { title: "Newtalk（2026-10-20）：沈伯洋支持度領先 17%，戴立安分析", url: "https://newtalk.tw/news/view/2026-10-20/1066585" },
      ],
    },
    cta: "這場選舉結束了。如果你真的當上市長，接下來四年呢？",
  },
  {
    id: "capital-2026-incumbent",
    title: "首都保衛戰",
    teaser: "民調一路領先的現任市長，要守住這座城。",
    art: "route-incumbent",
    startLabel: "爭取連任",
    intro: [
      "你是藍黨的首都市長，律師出身。家族四代都出現在課本裡，四年前你第一次選市長就贏了。",
      "第一任做得四平八穩，民調一直很好看。綠黨徵召了在大學教犯罪學、被對岸立案偵查的 Puma 委員來挑戰你。",
      "對手徵召後的第一份民調，你領先二十八個百分點。所有人都說，這場選舉躺著選就好。",
    ],
    party: "blue",
    background: "incumbent",
    profile: { city: "tianlong", traits: ["photogenic", "connected", "clean-image"], burden: "dynasty", origin: 0 },
    opponent: {
      name: "Puma委員",
      party: "green",
      title: "挑戰首都的立法委員",
      incumbent: false,
      traits: ["policy-wonk", "meme-lord", "principled"],
      burden: "activist-network",
    },
    opponentIntro: "大學犯罪學教授、民防學院創辦人，被對岸立案偵查，網路梗很多。批評的人說：國安理論一百分，市政實務零經驗，政見長到像在寫期末論文。",
    opponentBonus: -0.3,
    startDelta: {},
    statLabels: { approval: "支持度" },
    statHints: { approval: "遊戲裡的聲勢指數，不是真實民調。" },
    visibleStats: ["approval", "media", "achievement", "team", "party"],
    disabledCrises: ["x-overexposure"],
    voteNote: "開票前，幕僚提醒你：支持度只是聲勢，不是票。很多人在電話裡不表態，這一次，不表態的是誰的人？",
    endings: [
      {
        when: (s, won) => won && s.stats.integrity >= 80,
        title: "守住了",
        headline: "城守住了，你也沒有變",
        paragraphs: () => [
          "開票到晚上九點，對手打電話來祝賀。你在台上說的第一句話是：「謝謝願意給我第二次機會的每一個人，也謝謝沒有投給我的人，我聽到了。」",
          "第二任開始了。這一次，沒有人說你是躺著選上的。",
        ],
      },
      {
        when: (_s, won) => won,
        title: "險勝",
        headline: "你守住了城，但城裡的人看你的眼神不一樣了",
        paragraphs: () => [
          "開票開到最後一刻，你以些微差距勝出。慶功宴上，黨部的人說：「好險。」",
          "領先二十八點的選舉，最後贏了幾個百分點。接下來四年，每一個市民都會記得，這座城差一點就換人了。",
        ],
      },
      {
        when: (s, won) => !won && s.stats.integrity >= 75,
        title: "城破，但你沒有失態",
        headline: "你輸了，但你一路上沒有說過一句自己不相信的話",
        paragraphs: () => [
          "你輸了。敗選記者會上，你向對手道賀，也向市府同仁道謝：「市政不會因為選舉停下來，交接的每一份資料，我們都會準備好。」",
          "很多人說，這是你這四年最像市長的一天。",
        ],
      },
      {
        when: (s, won) => !won && s.stats.party >= 76,
        title: "基本盤還在",
        headline: "深藍的票都投給你了，只是不夠",
        paragraphs: () => [
          "開票時，你在幾個老社區一路領先，但其他地方一路落後。黨部的人說：「基本盤都在。」你知道問題不在基本盤。",
          "那些在電話裡不表態的人，最後去投票了，只是沒有投給你。",
        ],
      },
      {
        when: () => true,
        title: "城破",
        headline: "領先二十八點的人，輸了",
        paragraphs: () => [
          "開票不到一小時，勝負就出來了。你走上台，看著比四年前少了一半的支持者。",
          "幕僚把整場選戰的新聞剪報攤在桌上，從五月那份領先二十八點的民調，一路翻到昨天。你想找出是哪一天開始輸的，翻了很久，翻不到。",
        ],
      },
    ],
    reality: "現實中的這場選戰，在 2026 年 11 月 28 日投票。遊戲裡的結果，只是無數種可能中的一種，不代表任何預測或立場。",
    realChoices: {
      "sp-incumbent-01": "steady",
      "sp-incumbent-02": "press",
      "sp-incumbent-03": "off",
      "sp-incumbent-04": "milk",
      "sp-incumbent-05": "post",
      "sp-incumbent-06": "never",
      "sp-incumbent-07": "announce",
      "sp-incumbent-08": "calm",
      "sp-incumbent-09": "experience",
      "sp-incumbent-10": "kings",
      "sp-incumbent-11": "pivot",
      "sp-incumbent-p01": "show",
      "sp-incumbent-f07": "broom",
    },
    closings: {
      lost: "現實裡，他從領先二十八點走到這一步。你在哪幾題，和他做了一樣的決定？",
      wonSame: "你走了他走過的路，最後守住了。現實裡，這條路還沒走完。",
      wonDifferent: "你贏了。但你的選擇和現實為什麼總是不同？如果你支持的是他的政黨，這還是你本來想支持的樣子嗎？要怎麼讓它改變？",
      always: "他的選擇裡，有哪些是你不會做的？",
    },
    cards: { win: "win", loss: "loss" },
    shareStory: (won, same, total) =>
      `領先二十八點起步，${won ? "我守住了這座城" : "最後還是輸了"}。${total > 0 ? `我遇到的 ${total} 個真實攻防裡，有 ${same} 題和現實的選擇一樣。` : ""}`,
    realityNow: {
      paragraphs: [
        "沈伯洋被徵召後的第一份民調，蔣萬安領先二十八個百分點，很多人說這場選舉躺著選就好。",
        "十月二十日，信民協會公布的民調是沈伯洋 50.3%、蔣萬安 33.3%。做分析的民調專家也提醒：民調不是得票率，換算成得票，兩人可能非常接近。躺著選，選成了焦土戰。",
      ],
      refs: [
        { title: "聯合報：北市最新民調，蔣萬安大贏沈伯洋 28 個百分點", url: "https://udn.com/news/story/124652/9529403" },
        { title: "Newtalk（2026-10-20）：沈伯洋支持度領先 17%，戴立安分析", url: "https://newtalk.tw/news/view/2026-10-20/1066585" },
      ],
    },
    cta: "這場選舉結束了。如果你真的連任了，第二個任期要怎麼做？",
  },
];

export const specialById = (id: string) => SPECIALS.find((s) => s.id === id);

/** 首頁的特別篇入口：同一場選戰，兩邊各一條路線；還沒做好的路線顯示「即將推出」 */
export const SPECIAL_SERIES: {
  title: string;
  teaser: string;
  /** 插畫（web/public/specials/<art>.webp） */
  art: string;
  routes: { title: string; side: string; teaser: string; art: string; specialId?: string }[];
} = {
  title: "2026 首都保衛戰",
  art: "capital-2026",
  teaser: "有人盼望奇蹟，有人不能輸。你能將選戰帶向不同的結局嗎？",
  routes: [
    { title: "洋流慧聚", side: "挑戰者路線", teaser: "被對岸立案偵查的立委，落後二十八點，挑戰首都的現任市長。", art: "route-challenger", specialId: "capital-2026" },
    { title: "萬安守城", side: "現任市長路線", teaser: "民調一路領先的現任市長，要守住這座城。", art: "route-incumbent", specialId: "capital-2026-incumbent" },
  ],
};

/** 特別篇的完整人設：對手強度依資質與現任身分計算，和一般對手一樣 */
export function specialProfile(def: SpecialDef, traits: Trait[]): Profile {
  const strength = opponentStrength(def.opponent.traits, traits, def.opponent.incumbent) + def.opponentBonus;
  const opponent: Opponent = { ...def.opponent, strength: Math.round(strength * 100) / 100 };
  return { ...def.profile, rivals: { first: opponent, second: opponent } };
}

/** 玩家選過的選項（含插曲），由舊到新 */
function picked(state: GameState, events: GameEvent[]) {
  return [...state.history, ...(state.interludes ?? [])]
    .sort((a, b) => a.turn - b.turn)
    .map((h) => {
      const event = events.find((e) => e.id === h.eventId);
      return { event, option: event?.options.find((o) => o.id === h.optionId) };
    });
}

/**
 * 翻舊帳：把 {said:旗標} 換成玩家最近一次設下這個旗標時「說出口的話」（選項的 recall），例如「股市要不要跟停班停課脫鉤，值得討論。」。
 * 只引用玩家真的選過的話；找不到就保留成「之前說過的話」。
 */
export function fillSaid(text: string, state: GameState, events: GameEvent[]): string {
  return text.replace(/\{said:([\w-]+)\}/g, (_, flag: string) => {
    const hit = picked(state, events)
      .filter((p) => p.option?.setFlags?.includes(flag))
      .at(-1);
    if (!hit) return "之前說過的話";
    const words = hit.option!.recall ?? hit.option!.label;
    return `「${words.replace(/「/g, "『").replace(/」/g, "』")}」`;
  });
}

/** 從玩家實際選過的選項（含插曲）算承諾帳 */
export function promiseLedger(state: GameState, events: GameEvent[]): PromiseLedger {
  const picked = [...state.history, ...(state.interludes ?? [])].map(
    (h) => events.find((e) => e.id === h.eventId)?.options.find((o) => o.id === h.optionId)?.setFlags ?? [],
  );
  const made = picked.filter((f) => f.includes("promise-debt")).length;
  const trimmed = picked.filter((f) => f.includes("promise-trimmed")).length;
  return { made, trimmed, debt: Math.max(0, made - trimmed) };
}

/** 原則很高卻落選時，結局加這段旁白：守原則的人，選戰往往不吃香 */
export const PRINCIPLED_LOSS_INTEGRITY = 85;
const PRINCIPLED_LOSS =
  "開票那晚，競選總部的人走得差不多了。你一路上沒有說過一句自己不相信的話，沒有剪過一支斷章取義的影片，也沒有答應過一件做不到的事。你坐在空下來的椅子上，想了很久：為什麼最後是這個下場？你想不通。也許選舉本來就不是在比誰比較誠實；也許，只是還不到時候。";

/**
 * 終章反思：這一局遇到、現實中也有選擇的題目，對照「現實中他選了什麼／你選了什麼」，最後一句依結果換。
 * 插曲與架空的回合不列。
 */
export function realityCheck(def: SpecialDef, state: GameState, events: GameEvent[], won: boolean) {
  const rows = state.history.flatMap((h) => {
    const realId = def.realChoices[h.eventId];
    const event = events.find((e) => e.id === h.eventId);
    const real = event?.options.find((o) => o.id === realId);
    const mine = event?.options.find((o) => o.id === h.optionId);
    return event && real && mine ? [{ event, real, mine, same: real.id === mine.id }] : [];
  });
  const same = rows.filter((r) => r.same).length;
  const mostlySame = same * 2 >= rows.length;
  const c = def.closings;
  const closing = !won ? c.lost : mostlySame ? c.wonSame : c.wonDifferent;
  return { rows, same, closing: [closing, c.always] };
}

export function specialEnding(def: SpecialDef, state: GameState, won: boolean, probability: number, events: GameEvent[]) {
  const promises = promiseLedger(state, events);
  const ending = def.endings.find((e) => e.when(state, won, probability, promises))!;
  const paragraphs = ending.paragraphs(state, promises);
  // 放在第一段之後、其他補充段落之前
  if (!won && state.stats.integrity >= PRINCIPLED_LOSS_INTEGRITY) paragraphs.splice(1, 0, PRINCIPLED_LOSS);
  return { ...ending, paragraphs };
}
