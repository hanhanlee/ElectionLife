import type { GameEvent } from "@/game/types";
import raw from "./events.json";

export const EVENTS = raw as GameEvent[];
