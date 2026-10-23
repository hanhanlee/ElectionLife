import type { NextConfig } from "next";

// 首版為純靜態網站：事件以 JSON 打包，不需要後端
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
