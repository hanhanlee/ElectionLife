import type { NextConfig } from "next";

// 首版為純靜態網站：事件以 JSON 打包，不需要後端。
// GitHub Pages 的網址在子路徑（/ElectionLife），部署時由 PAGES_BASE_PATH 指定；本機開發維持根路徑。
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
};

export default nextConfig;
