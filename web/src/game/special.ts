// 特別篇：固定的人設與對手，十二個依劇本出場的事件，第一次投票後結束。
// 取材自正在進行的真實選戰，人名一律以身分或綽號影射。

import { opponentStrength } from "./profile";
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
  /** 開票前的說明：支持度是遊戲指數，不是真實民調 */
  voteNote: string;
  endings: SpecialEnding[];
  /** 結局頁最後的提醒：現實中的選戰 */
  reality: string;
  /** 結局頁導向主篇的一句話 */
  cta: string;
}

const has = (s: GameState, flag: string) => s.flags.includes(flag);

/** 結局的補充段落：讓前面的選擇在後日談裡被提到 */
function echoes(s: GameState): string[] {
  const lines: string[] = [];
  if (has(s, "sp-typhoon")) lines.push("檢討會上，幕僚把那段颱風夜的發言放了三遍。論點沒有錯，只是說在了錯的時間，也說錯了該由誰決定。");
  if (has(s, "sp-local")) lines.push("那張老鼠通報地圖，後來被好幾個里長貼在辦公室的牆上。");
  if (has(s, "sp-courted")) lines.push("前副市長團隊的那兩位老幕僚，選後傳了一句訊息給你：「下次還可以再談。」");
  return lines.slice(0, 1);
}

export const SPECIALS: SpecialDef[] = [
  {
    id: "capital-2026",
    title: "首都逆轉戰",
    teaser: "被對岸立案偵查的立委，落後二十八點，挑戰首都的現任市長。",
    intro: [
      "你是綠黨的立法委員，在大學教犯罪學，創辦了一間教民眾防災、識讀假訊息的民防學院。",
      "對岸說你「分裂國家」，對你立案偵查。半年後，黨要你去挑戰首都的現任市長。",
      "第一份民調，你落後二十八個百分點。所有人都說這是不可能的任務。",
    ],
    party: "green",
    background: "legislator",
    profile: { city: "tianlong", traits: ["policy-wonk", "meme-lord", "principled"], burden: "activist-network", origin: 0 },
    opponent: {
      name: "名門市長",
      party: "blue",
      title: "尋求連任的現任市長",
      incumbent: true,
      traits: ["photogenic", "connected", "clean-image"],
      burden: "dynasty",
    },
    opponentIntro:
      "家族四代都出現在課本裡。外型體面、形象乾淨，第一任做得四平八穩，民調一直很好看。批評的人說：很好看，但不知道做了什麼。",
    opponentBonus: 0.45,
    startDelta: { approval: -21, media: -4 },
    statLabels: { approval: "支持度", achievement: "政策準備" },
    statHints: {
      approval: "遊戲裡的聲勢指數，不是真實民調。",
      achievement: "你的政見有多少研究、財源和時程撐著。宣布政見不會增加，做功課才會。",
    },
    voteNote: "開票前，幕僚提醒你：支持度只是聲勢，不是票。名門市長的基本盤一直都在，很多人在電話裡不表態。",
    endings: [
      {
        when: (_s, won, _p, promises) => won && promises.debt === 0,
        title: "不可能的任務",
        headline: "落後二十八點的人，當選了",
        paragraphs: (s) => [
          "開票到晚上九點，名門市長的競選總部關燈了。你上台的第一句話是：「明天早上，我要去看那幾個最常淹水的地方。」",
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
        headline: "首都還是名門市長的",
        paragraphs: (s) => [
          "開票不到一小時，勝負就出來了。你走上台，謝謝每一位在雨中幫你發傳單的志工。",
          ...echoes(s),
          "落後二十八點的仗，本來就很少有人打贏。但你讓很多人想了想：這座城市要的是什麼樣的市長。",
        ],
      },
    ],
    reality: "現實中的這場選戰，在 2026 年 11 月 28 日投票。遊戲裡的結果，只是無數種可能中的一種，不代表任何預測或立場。",
    cta: "這場選舉結束了。如果你真的當上市長，接下來四年呢？",
  },
];

export const specialById = (id: string) => SPECIALS.find((s) => s.id === id);

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
 * 翻舊帳：把 {said:旗標} 換成玩家最近一次設下這個旗標的選擇，例如「〈颱風天的股市〉時說的『……』」。
 * 只引用玩家真的選過的話；找不到就保留成「之前說過的話」。
 */
export function fillSaid(text: string, state: GameState, events: GameEvent[]): string {
  return text.replace(/\{said:([\w-]+)\}/g, (_, flag: string) => {
    const hit = picked(state, events)
      .filter((p) => p.option?.setFlags?.includes(flag))
      .at(-1);
    return hit ? `〈${hit.event!.title}〉時說的「${hit.option!.label.replace(/「/g, "『").replace(/」/g, "』")}」` : "之前說過的話";
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

export function specialEnding(def: SpecialDef, state: GameState, won: boolean, probability: number, events: GameEvent[]) {
  const promises = promiseLedger(state, events);
  const ending = def.endings.find((e) => e.when(state, won, probability, promises))!;
  return { ...ending, paragraphs: ending.paragraphs(state, promises) };
}
