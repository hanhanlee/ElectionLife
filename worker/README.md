# 玩家統計後端（beyondvote-stats）

玩完特別篇時，遊戲送出一筆匿名紀錄；結局頁讀回所有玩家的彙整（局數、當選率、結局分布、每一題各選項的比例）。

- `POST /plays`：一局的紀錄，格式與檢查在 `web/src/game/stats.ts`（前後端共用）。同一局重送不重複計算；同一來源 10 分鐘最多 20 局。
- `GET /stats?scenario=capital-2026`：彙整，快取 60 秒。
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
