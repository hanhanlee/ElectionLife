import type { GameEvent } from "@/game/types";
import raw from "./events.json";
// 由 scripts/derive_mayor_stats.py 產生，請勿手動修改
import history from "./history.json";

export const EVENTS = raw as GameEvent[];
export const HISTORY = history;
