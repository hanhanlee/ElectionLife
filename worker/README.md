# 玩家統計後端（beyondvote-stats）

玩完特別篇時，遊戲送出一筆匿名紀錄；結局頁讀回所有玩家的彙整（局數、當選率、結局分布、每一題各選項的比例）。

- `POST /plays`：一局的紀錄，格式與檢查在 `web/src/game/stats.ts`（前後端共用）。同一局重送不重複計算；同一來源 10 分鐘最多 20 局。
- `GET /stats?scenario=capital-2026`：彙整，快取 60 秒。
- `POST /starts`：開局計數（主線 `main` 與兩條特別篇），每開一局一筆，只記路線、是否分支模式與時間；繼續存檔不算。同一來源 10 分鐘最多 60 次。不對外提供讀取，要看用 `wrangler d1 execute` 查 `starts` 表。
- 只允許 beyondvote.com 與本機 localhost:3000 跨網域呼叫。
- 不存個人資料；`ip_hash` 是當天的雜湊，只用來限制送出頻率。

## 第一次部署（需要 Cloudflare 帳號登入）

```bash
cd worker
npm install
npx wrangler login                       # 在瀏覽器授權
npx wrangler d1 create beyondvote-stats  # 把回傳的 database_id 填進 wrangler.toml
npm run db:remote                        # 建立資料表
npx wrangler secret put SALT             # 輸入一串隨機字（雜湊 IP 用）
npm run deploy                           # 部署到 api.beyondvote.com
```

## 本機測試

```bash
cd worker
printf 'SALT="local-dev-salt"\n' > .dev.vars
npm run db:local
npm run dev                              # http://127.0.0.1:8787
```

遊戲端在 `web/.env.local` 設 `NEXT_PUBLIC_STATS_URL=http://127.0.0.1:8787`，再跑 `npm run dev`。沒有設定時，遊戲連 `https://api.beyondvote.com`；連不上時結局頁不顯示統計，不影響遊戲。

## 基礎樣本（電腦模擬）

上線初期統計是 0，先放入 100 局電腦模擬的對局，讓比例有個起點。這些局標記為 `simulated = 1`，結局頁會寫明「含 N 局電腦模擬的基礎樣本」；真人玩到 300 局後，統計自動不再計入模擬樣本（`DROP_SIMULATED_AT`）。

```bash
cd web
SEED_N=100 SEED_OUT=../worker/seed.sql npx vitest run src/game/special.seed.test.ts
cd ../worker
npx wrangler d1 execute beyondvote-stats --remote --file=seed.sql
```

模擬的打法混合：四成半認真半隨興、兩成隨便選、一成五重視準備、一成五照現實、一成每題挑最好的；三成五是第二局起的分支模式。要移除：`DELETE FROM picks WHERE play_id LIKE 'sim-%'; DELETE FROM plays WHERE simulated = 1;`
