import type { NextConfig } from "next";

// 首版為純靜態網站：事件以 JSON 打包，不需要後端。
// 部署在 github.io 時網址在子路徑（/ElectionLife），由 PAGES_BASE_PATH 指定；用自己的網域時在根路徑。本機開發維持根路徑。
const basePath = process.env.PAGES_BASE_PATH ?? "";
// 網站的完整網址（分享預覽圖需要），部署時由 SITE_URL 指定
const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  // 讓畫面上的 <img> 也能拿到網址前綴（public/ 裡的圖片不會自動加 basePath）
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_SITE_URL: siteUrl },
};

export default nextConfig;
