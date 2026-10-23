# 選舉人生：市長篇

黑色幽默的市長模擬遊戲。12 回合（2 競選、9 任期、1 連任選戰），純靜態網站。

## 結構

```
web/                    Next.js 16（output: export，無後端）
  src/game/types.ts     型別：數值、事件、選項、來源
  src/game/model.ts     連任模擬權重（會公開在結局頁）
  src/game/engine.ts    回合引擎（純函式、可用 seed 重現）
  src/game/endings.ts   結局判定與政治人格
  src/game/validate.ts  事件庫檢查
  src/content/events.json  事件庫
```

## 指令（在 `web/` 內）

- `npm run dev`：開發伺服器
- `npm test`：引擎與事件庫測試（含隨機策略連任率）
- `npm run build`：輸出靜態網站到 `web/out/`

## 事件撰寫規則

1. 場景、城市、政黨、人物一律虛構；不得出現真實姓名或可對號入座的細節。
2. 每個事件的 `source.prototype` 用中性語氣描述真實原型，不點名個人。
3. `status`：`placeholder`（純虛構草稿）→ `draft`（已附來源）→ `verified`（人工查核完成，必填 `reviewedBy`、`reviewedAt`）。
4. `draft` 以上必須附 `refs`，每筆都要有網址與**原文摘錄**；沒有來源的事件不得進入事件池。
5. 上線前 `validateEvents(events, { release: true })` 必須零錯誤。
6. 不預設任何行為必然帶來選票；調整 `effects` 後跑 `npm test` 確認連任率不會一面倒。
