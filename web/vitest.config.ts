import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // 平衡測試要模擬上千局，CI 機器比本機慢，預設 5 秒不夠
  test: { testTimeout: 60_000 },
});
