// 人設：開局全隨機抽出城市、政黨、出身、資質與先天包袱，並組合成一段人物介紹。

import { mulberry32 } from "./rng";
import {
  LEGEND_CHANCE,
  OPPONENT_INCUMBENT_CHANCE,
  OPPONENT_INCUMBENT_STRENGTH,
  OPPONENT_TIER_STRENGTH,
} from "./model";
import type { Background, Burden, City, Legend, Opponent, Party, PartyId, Profile, Trait, TraitCategory, TraitTier } from "./types";

const PROFILE_SALT = 0x9e0f11e;
const CHARACTER_SALT = 0x11fe;
const RIVAL_SALT = 0x51a7e;
/** 帶有 rareFor 旗標的政黨抽到這個出身時，權重打這個折 */
const RARE_FACTOR = 0.4;
/** 符合出身或政黨的資質與包袱，抽中機率乘上這個倍數 */
const AFFINITY_BOOST = 3;

/** 各品質的抽中權重：卓越資質很稀有，負面與普通最常見 */
export const TIER_WEIGHT: Record<TraitTier, number> = { negative: 1, common: 1.2, rare: 0.8, epic: 0.3 };
const ABILITY_CATEGORIES: TraitCategory[] = ["communication", "policy", "organization"];

function pick<T>(items: T[], weight: (t: T) => number, r: number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let x = r * total;
  for (const t of items) {
    x -= weight(t);
    if (x < 0) return t;
  }
  return items[items.length - 1];
}

/**
 * 抽人設：1 個政治人格資質、另外 2 個來自不同類別的資質，以及 1 個先天包袱。
 * 不保證平衡，允許純優勢或純弱勢的組合；同一個 seed 會抽到同一組。
 */
export function drawProfile(
  seed: number,
  background: Background,
  party: Party,
  traits: Trait[],
  burdens: Burden[],
  city: City,
  legends: Legend[] = [],
): Profile {
  const rng = mulberry32((seed ^ PROFILE_SALT) >>> 0);
  const drawn = drawTraits(traits, background.id, rng);

  const burden = pick(
    burdens,
    (b) =>
      (b.affinity?.includes(background.id) ? AFFINITY_BOOST : 1) *
      (b.partyAffinity?.includes(party.id) ? AFFINITY_BOOST : 1),
    rng(),
  );
  const origin = Math.floor(rng() * background.origins.length);
  const rivals = {
    first: drawOpponent(seed, 1, party.id, background.id === "incumbent", traits, burdens, legends),
    second: drawOpponent(seed, 2, party.id, true, traits, burdens, legends),
  };
  return { city: city.id, traits: drawn.map((t) => t.id), burden: burden.id, origin, rivals };
}

/** 1 個政治人格資質，加上 2 個來自不同能力類別的資質；越好的品質越難抽到 */
function drawTraits(traits: Trait[], backgroundId: string | undefined, rng: () => number): Trait[] {
  const weight = (t: Trait) => (backgroundId && t.affinity?.includes(backgroundId) ? AFFINITY_BOOST : 1) * TIER_WEIGHT[t.tier];
  const personality = pick(traits.filter((t) => t.category === "personality"), weight, rng());
  const categories = [...ABILITY_CATEGORIES];
  const abilities: Trait[] = [];
  for (let i = 0; i < 2; i++) {
    const category = categories.splice(Math.floor(rng() * categories.length), 1)[0];
    abilities.push(pick(traits.filter((t) => t.category === category), weight, rng()));
  }
  return [...abilities, personality];
}

const SURNAMES = "陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙盧梁顏柯翁魏孫戴范宋方鄧杜傅侯";
const GIVEN = "志家俊建明宗文世政國承冠宇宏信忠正和平安仁德昌永嘉惠美淑芳婉雅怡婷玉秀麗慧珊佩欣詩庭睿瑞博凱哲翔軒傑維偉毅誠";

/** 虛構姓名：常見姓氏加兩個字的名字 */
export function fakeName(rng: () => number): string {
  const ch = (pool: string) => pool[Math.floor(rng() * pool.length)];
  const first = ch(GIVEN);
  let second = ch(GIVEN);
  while (second === first) second = ch(GIVEN);
  return ch(SURNAMES) + first + second;
}

const OPPONENT_TITLES: Record<string, string> = {
  incumbent: "尋求連任的現任市長",
  legislator: "現任立法委員",
  councilor: "資深市議員",
  official: "前副市長",
  outsider: "政治素人",
};

export const opponentStrength = (traitIds: string[], traits: Trait[], incumbent: boolean) =>
  traitIds.reduce((s, id) => s + OPPONENT_TIER_STRENGTH[traits.find((t) => t.id === id)!.tier], 0) +
  (incumbent ? OPPONENT_INCUMBENT_STRENGTH : 0);

/**
 * 抽對手：20% 是傳奇對手（政黨不能和玩家相同），其餘是隨機對手。
 * 大黨玩家的對手多半是另一個大黨；小黨與無黨籍面對兩大黨之一。
 * youAreIncumbent：玩家是現任（或已當選），對手就一定是挑戰者。
 */
export function drawOpponent(
  seed: number,
  stage: 1 | 2,
  partyId: PartyId,
  youAreIncumbent: boolean,
  traits: Trait[],
  burdens: Burden[],
  legends: Legend[],
): Opponent {
  const rng = mulberry32((seed ^ (RIVAL_SALT * stage)) >>> 0);
  const legendPool = legends.filter((l) => l.party !== partyId);
  if (legendPool.length > 0 && rng() < LEGEND_CHANCE) {
    const l = legendPool[Math.floor(rng() * legendPool.length)];
    return {
      name: l.nickname,
      legend: l.id,
      party: l.party,
      title: l.title,
      incumbent: false,
      traits: l.traits,
      burden: l.burden,
      strength: opponentStrength(l.traits, traits, false),
    };
  }
  const major: PartyId[] = ["blue", "green"];
  const party: PartyId = major.includes(partyId)
    ? rng() < 0.85
      ? major.find((p) => p !== partyId)!
      : "white"
    : major[Math.floor(rng() * 2)];
  const incumbent = !youAreIncumbent && rng() < OPPONENT_INCUMBENT_CHANCE;
  const bgPool = ["legislator", "councilor", "official", "outsider"];
  const bg = incumbent ? "incumbent" : bgPool[Math.floor(rng() * bgPool.length)];
  const drawn = drawTraits(traits, bg, rng).map((t) => t.id);
  const burden = burdens[Math.floor(rng() * burdens.length)].id;
  return {
    name: fakeName(rng),
    party,
    title: OPPONENT_TITLES[bg],
    incumbent,
    traits: drawn,
    burden,
    strength: opponentStrength(drawn, traits, incumbent),
  };
}

export interface CharacterContent {
  cities: City[];
  parties: Party[];
  backgrounds: Background[];
  traits: Trait[];
  burdens: Burden[];
  legends?: Legend[];
}

export interface DrawnCharacter {
  city: City;
  party: Party;
  background: Background;
  profile: Profile;
}

/**
 * 全隨機開局：城市 → 政黨 → 出身 → 資質與包袱，全部由同一個 seed 決定。
 * 不是每種組合機率相同（大黨較常見、第三勢力的現任市長較少見），但每種組合都可能出現。
 */
export function drawCharacter(seed: number, content: CharacterContent): DrawnCharacter {
  const rng = mulberry32((seed ^ CHARACTER_SALT) >>> 0);
  const city = pick(content.cities, (c) => c.weight, rng());
  const party = pick(content.parties, (p) => p.weight, rng());
  const background = pick(
    content.backgrounds,
    (b) => b.weight * (b.rareFor?.some((f) => party.flags.includes(f)) ? RARE_FACTOR : 1),
    rng(),
  );
  const profile = drawProfile(seed, background, party, content.traits, content.burdens, city, content.legends ?? []);
  return { city, party, background, profile };
}

/** 把詞組接成「甲、乙與丙」 */
function joinPhrases(items: string[], last = "與"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join("、")}${last}${items.at(-1)}`;
}

/**
 * 組合人物介紹：開場句 → 擅長與弱點 → 政治人格 → 包袱 → 這次代表誰參選。
 * 開場句優先用包袱的（例如政治世家、地方宗族），沒有時用出身的。
 */
export function composeIntro(
  profile: Profile,
  background: Background,
  party: Party,
  traits: Trait[],
  burdens: Burden[],
  city: City,
): string {
  const picked = profile.traits.map((id) => traits.find((t) => t.id === id)!);
  const burden = burdens.find((b) => b.id === profile.burden)!;
  const strengths = picked.flatMap((t) => (t.strength ? [t.strength] : []));
  const weaknesses = picked.flatMap((t) => (t.weakness ? [t.weakness] : []));

  const sentences = [burden.origin ?? background.origins[profile.origin]];
  if (strengths.length && weaknesses.length) {
    sentences.push(`你最擅長${joinPhrases(strengths)}，但${joinPhrases(weaknesses, "和")}一直是你的弱點。`);
  } else if (strengths.length) {
    sentences.push(`你最擅長${joinPhrases(strengths)}，到目前為止，還沒有人抓到你的弱點。`);
  } else if (weaknesses.length) {
    sentences.push(`老實說，你沒有什麼特別拿手的事，${joinPhrases(weaknesses, "和")}更一直是你的弱點。`);
  }
  sentences.push(...picked.flatMap((t) => (t.line ? [t.line] : [])));
  sentences.push(burden.line);

  const goal = background.incumbent ? `爭取連任${city.mayorTitle}` : `參選${city.mayorTitle}`;
  sentences.push(
    party.id === "independent" ? `這一次，你以無黨籍身分${goal}。` : `這一次，你代表${party.name}${goal}。`,
  );
  return sentences.join("");
}

/** 對手介紹：傳奇對手用手寫的介紹，隨機對手用資質組出第三人稱的句子 */
export function describeOpponent(o: Opponent, partyName: string, traits: Trait[], legends: Legend[]): string {
  const legend = o.legend ? legends.find((l) => l.id === o.legend) : undefined;
  if (legend) return legend.intro;
  const picked = o.traits.map((id) => traits.find((t) => t.id === id)!);
  const strengths = picked.flatMap((t) => (t.strength ? [t.strength] : []));
  const weaknesses = picked.flatMap((t) => (t.weakness ? [t.weakness] : []));
  const sentences = [`${o.name}，${partyName}的${o.title}。`];
  if (strengths.length && weaknesses.length) {
    sentences.push(`最擅長${joinPhrases(strengths)}，但${joinPhrases(weaknesses, "和")}是弱點。`);
  } else if (strengths.length) {
    sentences.push(`最擅長${joinPhrases(strengths)}，目前還看不出明顯的弱點。`);
  } else if (weaknesses.length) {
    sentences.push(`沒有什麼特別拿手的事，${joinPhrases(weaknesses, "和")}更是弱點。`);
  }
  // 政治人格的句子是寫給玩家的第二人稱，換成對手的名字
  // 第一個「你」換成名字，其餘省略（「王志明從來不道歉，因為從來不覺得自己有錯」）
  sentences.push(...picked.flatMap((t) => (t.line ? [t.line.replace("你", o.name).replaceAll("你", "")] : [])));
  return sentences.join("");
}
