import type { ProfileSetup } from "@/game/engine";
import { specialProfile, type SpecialDef } from "@/game/special";
import type { ArcDef, Background, Burden, City, Crisis, FateCard, GameEvent, Legend, Party, Profile, Trait } from "@/game/types";
import arcs from "./arcs.json";
import backgrounds from "./backgrounds.json";
import burdens from "./burdens.json";
import cities from "./cities.json";
import crises from "./crises.json";
import raw from "./events.json";
import specialCapital from "./special-capital.json";
import fates from "./fates.json";
// 由 scripts/derive_mayor_stats.py 產生，請勿手動修改
import history from "./history.json";
import legends from "./legends.json";
import parties from "./parties.json";
import traits from "./traits.json";

// 特別篇的事件也放進事件庫：只有特別篇會依劇本叫出它們，不會被隨機抽到
export const EVENTS = [...raw, ...specialCapital] as GameEvent[];
export const HISTORY = history;
export const PARTIES = parties as Party[];
export const BACKGROUNDS = backgrounds as Background[];
export const CRISES = crises as Crisis[];
export const TRAITS = traits as Trait[];
export const BURDENS = burdens as Burden[];
export const CITIES = cities as City[];
export const LEGENDS = legends as Legend[];
export const ARCS = arcs as ArcDef[];
export const FATES = fates as FateCard[];
export const cityById = (id: string) => CITIES.find((c) => c.id === id)!;

/** 把抽出的人設 id 轉成引擎需要的資料 */
export const profileSetup = (profile: Profile): ProfileSetup => ({
  profile,
  city: cityById(profile.city),
  traits: profile.traits.map((id) => TRAITS.find((t) => t.id === id)!),
  burden: BURDENS.find((b) => b.id === profile.burden)!,
});

/** 特別篇的固定人設 */
export const specialSetup = (def: SpecialDef): ProfileSetup => profileSetup(specialProfile(def, TRAITS));

export const partyById = (id: string) => PARTIES.find((p) => p.id === id)!;
export const backgroundById = (id: string) => BACKGROUNDS.find((b) => b.id === id)!;
