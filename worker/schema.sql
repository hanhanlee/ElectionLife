-- 玩家統計：每一局一筆 plays、每一題一筆 picks。不存個人資料；ip_hash 是當天的雜湊，只用來限制送出頻率。
CREATE TABLE IF NOT EXISTS plays (
  id TEXT PRIMARY KEY,
  scenario TEXT NOT NULL,
  branch INTEGER NOT NULL,
  won INTEGER NOT NULL,
  ending TEXT NOT NULL,
  same_real INTEGER NOT NULL,
  real_total INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plays_scenario ON plays (scenario);
CREATE INDEX IF NOT EXISTS plays_ip ON plays (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS picks (
  play_id TEXT NOT NULL,
  scenario TEXT NOT NULL,
  event_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  interlude INTEGER NOT NULL,
  PRIMARY KEY (play_id, event_id)
);
CREATE INDEX IF NOT EXISTS picks_scenario ON picks (scenario, event_id, option_id);
