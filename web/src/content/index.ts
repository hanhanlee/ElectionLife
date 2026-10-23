import type { ProfileSetup } from "@/game/engine";
import type { Background, Burden, City, Crisis, GameEvent, Party, Profile, Trait } from "@/game/types";
import backgrounds from "./backgrounds.json";
import burdens from "./burdens.json";
import cities from "./cities.json";
import crises from "./crises.json";
import raw from "./events.json";
// 由 scripts/derive_mayor_stats.py 產生，請勿手動修改
import history from "./history.json";
import parties from "./parties.json";
import traits from "./traits.json";

export const EVENTS = raw as GameEvent[];
export const HISTORY = history;
export const PARTIES = parties as Party[];
export const BACKGROUNDS = backgrounds as Background[];
export const CRISES = crises as Crisis[];
export const TRAITS = traits as Trait[];
export const BURDENS = burdens as Burden[];
export const CITIES = cities as City[];
export const cityById = (id: string) => CITIES.find((c) => c.id === id)!;

/** 把抽出的人設 id 轉成引擎需要的資料 */
export const profileSetup = (profile: Profile): ProfileSetup => ({
  profile,
  city: cityById(profile.city),
  traits: profile.traits.map((id) => TRAITS.find((t) => t.id === id)!),
  burden: BURDENS.find((b) => b.id === profile.burden)!,
});

export const partyById = (id: string) => PARTIES.find((p) => p.id === id)!;
export const backgroundById = (id: string) => BACKGROUNDS.find((b) => b.id === id)!;
