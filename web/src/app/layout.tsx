import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const description = "你的城市、政黨、出身全部隨機。一路選到連任，你會投給這樣的自己嗎？一款關於政治誘因的黑色幽默選舉遊戲。";

export const metadata: Metadata = {
  // 分享預覽圖（app/opengraph-image.jpg）需要完整網址：部署時由 SITE_URL 指定（自己的網域或 github.io）
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
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

/** 在畫面出來前套用玩家選的外觀（淺色／深色），避免先閃一下系統的配色。鍵名與 SiteFooter 的 THEME_KEY 相同 */
const themeScript = `try{var t=localStorage.getItem("election-life:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme 會在載入時由小腳本設定，伺服器輸出沒有，所以略過這個屬性的比對警告
    <html lang="zh-Hant-TW" suppressHydrationWarning>
      <body>
        {children}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </body>
    </html>
  );
}
