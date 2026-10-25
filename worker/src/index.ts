// 玩家統計後端：收遊戲送來的匿名紀錄（POST /plays），回傳彙整（GET /stats?scenario=…）。
// 格式檢查與遊戲端共用 web/src/game/stats.ts。

import { STATS_SCENARIOS, validatePlay, type PlayerStats } from "../../web/src/game/stats";

// 只用到 D1 的這幾個方法，不另外裝型別套件
interface D1Result<T> {
  results: T[];
  meta: { changes: number };
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result<unknown>[]>;
}
interface Env {
  DB: D1Database;
  /** 雜湊 IP 用的密鑰（wrangler secret put SALT） */
  SALT: string;
}

const ORIGINS = ["https://beyondvote.com", "https://www.beyondvote.com", "http://localhost:3000"];
/** 同一個來源 10 分鐘內最多送幾局 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20;
const MAX_BODY = 8 * 1024;
/** 統計快取秒數 */
const STATS_TTL = 60;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return ORIGINS.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
    : {};
}

const json = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(req), ...extra } });

/** 當天的 IP 雜湊：隔天就對不起來，只用來擋短時間大量送出 */
async function ipHash(req: Request, salt: string): Promise<string> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${salt}|${day}|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function savePlay(req: Request, env: Env): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_BODY) return json(req, { error: "too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(req, { error: "bad json" }, 400);
  }
  const play = validatePlay(body);
  if (!play) return json(req, { error: "invalid" }, 400);

  const now = Date.now();
  const hash = await ipHash(req, env.SALT ?? "");
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM plays WHERE ip_hash = ? AND created_at > ?").bind(hash, now - RATE_WINDOW_MS).first<{ n: number }>();
  if ((recent?.n ?? 0) >= RATE_MAX) return json(req, { error: "slow down" }, 429);

  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO plays (id, scenario, branch, won, ending, same_real, real_total, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(play.id, play.scenario, play.branch ? 1 : 0, play.won ? 1 : 0, play.ending, play.sameAsReal, play.realTotal, hash, now)
    .run();
  // 同一局重送：已經記過了，不重複算
  if (inserted.meta.changes === 0) return json(req, { ok: true, duplicate: true });

  const pick = env.DB.prepare("INSERT OR IGNORE INTO picks (play_id, scenario, event_id, option_id, interlude) VALUES (?, ?, ?, ?, ?)");
  await env.DB.batch([
    ...play.picks.map(([e, o]) => pick.bind(play.id, play.scenario, e, o, 0)),
    ...play.interludes.map(([e, o]) => pick.bind(play.id, play.scenario, e, o, 1)),
  ]);
  return json(req, { ok: true });
}

/** 真人局數到這個數字後，不再計入電腦模擬的基礎樣本 */
const DROP_SIMULATED_AT = 300;

async function readStats(req: Request, env: Env, scenario: string): Promise<PlayerStats> {
  const real = await env.DB.prepare("SELECT COUNT(*) AS n FROM plays WHERE scenario = ? AND simulated = 0").bind(scenario).first<{ n: number }>();
  // 真人夠多時只算真人；不夠時連同模擬樣本一起算
  const only = (real?.n ?? 0) >= DROP_SIMULATED_AT ? " AND simulated = 0" : "";
  const [totals, endings, choices] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS plays, COALESCE(SUM(won), 0) AS wins, COALESCE(SUM(same_real), 0) AS same, COALESCE(SUM(simulated), 0) AS simulated FROM plays WHERE scenario = ?${only}`,
    ).bind(scenario),
    env.DB.prepare(`SELECT ending, COUNT(*) AS n FROM plays WHERE scenario = ?${only} GROUP BY ending`).bind(scenario),
    env.DB.prepare(
      `SELECT k.event_id, k.option_id, COUNT(*) AS n FROM picks k JOIN plays p ON p.id = k.play_id WHERE k.scenario = ?${only.replace("simulated", "p.simulated")} GROUP BY k.event_id, k.option_id`,
    ).bind(scenario),
  ]);
  const t = (totals.results[0] ?? { plays: 0, wins: 0, same: 0, simulated: 0 }) as { plays: number; wins: number; same: number; simulated: number };
  const stats: PlayerStats = {
    plays: t.plays,
    wins: t.wins,
    simulated: t.simulated,
    endings: {},
    sameAsReal: { sum: t.same, plays: t.plays },
    choices: {},
  };
  for (const r of endings.results as { ending: string; n: number }[]) stats.endings[r.ending] = r.n;
  for (const r of choices.results as { event_id: string; option_id: string; n: number }[]) {
    (stats.choices[r.event_id] ??= {})[r.option_id] = r.n;
  }
  return stats;
}

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (req.method === "POST" && url.pathname === "/plays") return savePlay(req, env);
    if (req.method === "GET" && url.pathname === "/stats") {
      const scenario = url.searchParams.get("scenario") ?? "";
      if (!(STATS_SCENARIOS as readonly string[]).includes(scenario)) return json(req, { error: "unknown scenario" }, 404);
      // 一分鐘內的請求共用同一份彙整（快取不分來源，CORS 標頭每次重新加）
      const cache = (caches as unknown as { default: Cache }).default;
      const key = new Request(`https://stats.cache/${scenario}`);
      const hit = await cache.match(key);
      if (hit) return json(req, await hit.json(), 200, { "Cache-Control": `public, max-age=${STATS_TTL}` });
      const stats = await readStats(req, env, scenario);
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(stats), { headers: { "Cache-Control": `public, max-age=${STATS_TTL}` } })));
      return json(req, stats, 200, { "Cache-Control": `public, max-age=${STATS_TTL}` });
    }
    return json(req, { error: "not found" }, 404);
  },
};
