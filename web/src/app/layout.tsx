import type { Metadata, Viewport } from "next";
import "./globals.css";

const description = "你的城市、政黨、出身全部隨機。一路選到連任，你會投給這樣的自己嗎？一款關於政治誘因的黑色幽默選舉遊戲。";

export const metadata: Metadata = {
  // 分享預覽圖（app/opengraph-image.jpg）需要完整網址；GitHub Pages 部署時有網址前綴
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_PATH ? "https://hanhanlee.github.io" : "http://localhost:3000"),
  title: "選舉人生：市長篇",
  description,
  openGraph: {
    title: "選舉人生：市長篇",
    description,
    type: "website",
    locale: "zh_TW",
    siteName: "選舉人生",
  },
  twitter: { card: "summary_large_image", title: "選舉人生：市長篇", description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
