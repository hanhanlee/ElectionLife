// 人設：開局全隨機抽出城市、政黨、出身、資質與先天包袱，並組合成一段人物介紹。

import { mulberry32 } from "./rng";
import type { Background, Burden, City, Party, Profile, Trait, TraitCategory } from "./types";

const PROFILE_SALT = 0x9e0f11e;
const CHARACTER_SALT = 0x11fe;
/** 帶有 rareFor 旗標的政黨抽到這個出身時，權重打這個折 */
const RARE_FACTOR = 0.4;
/** 符合出身或政黨的資質與包袱，抽中機率乘上這個倍數 */
const AFFINITY_BOOST = 3;
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
): Profile {
  const rng = mulberry32((seed ^ PROFILE_SALT) >>> 0);
  const traitWeight = (t: Trait) => (t.affinity?.includes(background.id) ? AFFINITY_BOOST : 1);

  const personality = pick(traits.filter((t) => t.category === "personality"), traitWeight, rng());
  const categories = [...ABILITY_CATEGORIES];
  const abilities: Trait[] = [];
  for (let i = 0; i < 2; i++) {
    const category = categories.splice(Math.floor(rng() * categories.length), 1)[0];
    abilities.push(pick(traits.filter((t) => t.category === category), traitWeight, rng()));
  }

  const burden = pick(
    burdens,
    (b) =>
      (b.affinity?.includes(background.id) ? AFFINITY_BOOST : 1) *
      (b.partyAffinity?.includes(party.id) ? AFFINITY_BOOST : 1),
    rng(),
  );
  return {
    city: city.id,
    traits: [...abilities, personality].map((t) => t.id),
    burden: burden.id,
    origin: Math.floor(rng() * background.origins.length),
  };
}

export interface CharacterContent {
  cities: City[];
  parties: Party[];
  backgrounds: Background[];
  traits: Trait[];
  burdens: Burden[];
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
  const profile = drawProfile(seed, background, party, content.traits, content.burdens, city);
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
