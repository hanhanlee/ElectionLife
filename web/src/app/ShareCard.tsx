"use client";

// 結局分享圖卡：在玩家的瀏覽器裡把文字畫到底圖上，產生一張寬 1080 的直式 JPEG：上半是底圖與結果，下半是這一局的小故事。
// 不需要後端；字型用系統內建的中文黑體，避免下載字型或出現方塊字。

import { useEffect, useState } from "react";
import type { CardKind } from "@/game/shareCard";
import styles from "./page.module.css";

interface CardText {
  kind: CardKind;
  /** 城市・政黨・出身 */
  label: string;
  /** 大字：當選、連任失敗…… */
  result: string;
  /** 後日談大標 */
  headline: string;
  /** 這一局濃縮成的小故事 */
  story: string;
  /** 底部的一句話（政治人格或換你當選民的結果） */
  line: string;
  won: boolean;
}

const W = 1080;
/** 底圖高度（4:5）；圖卡總高度依小故事的長度決定 */
const IMG_H = 1350;
const PANEL = "#0a0806";
const STORY_X = 90;
const STORY_SIZE = 40;
const STORY_LEADING = 66;
const FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 不能放在行首的標點：寧可讓它稍微超出版面，也不要自己掉到下一行 */
const NO_LINE_START = "，。、；：？！」』）";
const NO_LINE_END = "「『（";

/** 中文逐字斷行 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line && !NO_LINE_START.includes(ch)) {
      // 左引號不留在行尾，跟著下一個字換行
      const carry = NO_LINE_END.includes(line.slice(-1)) && line.length > 1 ? line.slice(-1) : "";
      lines.push(carry ? line.slice(0, -1) : line);
      line = carry + ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function scrim(ctx: CanvasRenderingContext2D, y0: number, y1: number, from: number, to: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(10, 8, 6, ${from})`);
  g.addColorStop(1, `rgba(10, 8, 6, ${to})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, y1 - y0);
}

async function drawCard(t: CardText): Promise<{ blob: Blob; height: number }> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  const ctx = canvas.getContext("2d")!;
  const img = await loadImage(`${BASE}/cards/${t.kind}.webp`);
  if ("fonts" in document) await document.fonts.ready;

  // 先量好小故事與底部那句話的行數，才知道圖卡要多高
  ctx.font = `500 ${STORY_SIZE}px ${FONT}`;
  const story = wrap(ctx, t.story, W - STORY_X * 2);
  ctx.font = `700 42px ${FONT}`;
  const bottom = wrap(ctx, t.line, 920);
  const storyTop = IMG_H - 250;
  const dividerY = storyTop + (story.length - 1) * STORY_LEADING + 64;
  const lineY = dividerY + 84;
  const taglineY = lineY + (bottom.length - 1) * 58 + 96;
  const footerY = taglineY + 96;
  const H = footerY + 64;
  canvas.height = H;

  ctx.fillStyle = PANEL;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, IMG_H);

  // 上方一層深色漸層讓標題清楚；底圖下緣漸漸融進深色的故事區
  scrim(ctx, 0, 560, 0.82, 0);
  scrim(ctx, IMG_H - 650, IMG_H, 0, 1);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 18;

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText(t.label, W / 2, 104);

  ctx.fillStyle = t.won ? "#ffd36e" : "#ffffff";
  ctx.font = `900 148px ${FONT}`;
  ctx.fillText(t.result, W / 2, 272);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 60px ${FONT}`;
  wrap(ctx, `「${t.headline}」`, 920).forEach((l, i) => ctx.fillText(l, W / 2, 372 + i * 76));

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = `500 ${STORY_SIZE}px ${FONT}`;
  story.forEach((l, i) => ctx.fillText(l, STORY_X, storyTop + i * STORY_LEADING));

  ctx.textAlign = "center";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 211, 110, 0.6)";
  ctx.fillRect(W / 2 - 60, dividerY, 120, 3);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 42px ${FONT}`;
  bottom.forEach((l, i) => ctx.fillText(l, W / 2, lineY + i * 58));

  ctx.fillStyle = "#ffd36e";
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText("你會投給這樣的自己嗎？", W / 2, taglineY);

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(`選舉人生：市長篇　${location.host}${BASE}`, W / 2, footerY);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("圖卡產生失敗"))), "image/jpeg", 0.9),
  );
  return { blob, height: H };
}

export default function ShareCard(props: CardText) {
  const [url, setUrl] = useState<string>();
  const [blob, setBlob] = useState<Blob>();
  const [height, setHeight] = useState(IMG_H);
  const [failed, setFailed] = useState(false);
  const { kind, label, result, headline, story, line, won } = props;

  useEffect(() => {
    let alive = true;
    let made: string | undefined;
    drawCard({ kind, label, result, headline, story, line, won })
      .then(({ blob: b, height: h }) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setHeight(h);
        setUrl(made);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [kind, label, result, headline, story, line, won]);

  if (failed) return null;
  const file = blob && new File([blob], "選舉人生-我的結局.jpg", { type: "image/jpeg" });
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  return (
    <section className={styles.card}>
      <h2>分享你的結局</h2>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- 圖卡是瀏覽器即時產生的圖片
        <img className={styles.shareCard} src={url} alt={`分享圖卡：${result}，「${headline}」`} width={W} height={height} />
      ) : (
        <p className={styles.lead}>圖卡產生中…</p>
      )}
      <div className={styles.shareActions}>
        {canShare && (
          <button
            className={styles.primary}
            onClick={() => navigator.share({ files: [file!], text: `我在《選舉人生》${result}：「${headline}」。你會投給這樣的自己嗎？` }).catch(() => {})}
          >
            分享圖卡
          </button>
        )}
        {url && (
          <a className={canShare ? styles.secondary : styles.primary} href={url} download="選舉人生-我的結局.jpg">
            下載圖卡
          </a>
        )}
      </div>
    </section>
  );
}
