// 結局頁最上方的開票結果大圖：當選是紅底、彩帶和煙火；落選是灰底、雨和倒下的旗子。

import styles from "./page.module.css";

interface Props {
  won: boolean;
  /** 大字：當選、連任成功、落選…… */
  result: string;
  character: string;
  /** 模型估計勝選機率；特別篇不顯示 */
  vote?: number;
  /** 例如「對手：王志明（綠黨）」 */
  opponent?: string;
}

function Fireworks() {
  const bursts = [
    { x: 60, y: 50, r: 30 },
    { x: 330, y: 38, r: 24 },
    { x: 300, y: 120, r: 16 },
    { x: 95, y: 135, r: 14 },
  ];
  return (
    <g stroke="#fde68a" strokeWidth="3" strokeLinecap="round" opacity="0.85">
      {bursts.map((b) =>
        Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <line
              key={`${b.x}-${i}`}
              x1={b.x + Math.cos(a) * b.r * 0.35}
              y1={b.y + Math.sin(a) * b.r * 0.35}
              x2={b.x + Math.cos(a) * b.r}
              y2={b.y + Math.sin(a) * b.r}
            />
          );
        }),
      )}
    </g>
  );
}

function Confetti() {
  const colors = ["#fde68a", "#fca5a5", "#ffffff", "#fbbf24"];
  return (
    <g>
      {Array.from({ length: 28 }, (_, i) => (
        <rect
          key={i}
          x={(i * 53) % 400}
          y={(i * 37) % 220}
          width="6"
          height="12"
          rx="1"
          fill={colors[i % colors.length]}
          transform={`rotate(${(i * 47) % 180} ${(i * 53) % 400} ${(i * 37) % 220})`}
          opacity="0.8"
        />
      ))}
    </g>
  );
}

function Rain() {
  return (
    <g stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" opacity="0.45">
      {Array.from({ length: 34 }, (_, i) => {
        const x = (i * 41) % 400;
        const y = (i * 29) % 200;
        return <line key={i} x1={x} y1={y} x2={x - 6} y2={y + 18} />;
      })}
    </g>
  );
}

/** 斜倒在地上的競選旗 */
function FallenFlag() {
  return (
    <g opacity="0.55">
      <line x1="300" y1="210" x2="390" y2="150" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
      <path d="M380 157 L340 120 L318 152 Z" fill="#94a3b8" />
    </g>
  );
}

export default function ResultBanner({ won, result, character, vote, opponent }: Props) {
  return (
    <section className={won ? styles.bannerWin : styles.bannerLose} aria-label={`開票結果：${result}`}>
      <svg className={styles.bannerArt} viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {won ? (
          <>
            <Confetti />
            <Fireworks />
          </>
        ) : (
          <>
            <Rain />
            <FallenFlag />
          </>
        )}
      </svg>
      <p className={styles.bannerLabel}>{character}</p>
      <p className={won ? styles.bannerSash : styles.bannerStamp}>{result}</p>
      <p className={styles.bannerVote}>
        {opponent}
        {vote !== undefined && `${opponent ? "｜" : ""}模型估計勝選機率 ${vote}%`}
      </p>
    </section>
  );
}
