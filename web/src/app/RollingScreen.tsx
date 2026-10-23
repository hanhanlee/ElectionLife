"use client";

import { useEffect, useState } from "react";
import { BACKGROUNDS, BURDENS, CITIES, PARTIES, TRAITS } from "@/content";
import type { DrawnCharacter } from "@/game/profile";
import { TRAIT_TIER_LABELS, type TraitTier } from "@/game/types";
import styles from "./page.module.css";

const TICK_MS = 70;
const FIRST_LOCK_MS = 600;
const LOCK_GAP_MS = 520;

const QUIPS = [
  "正在分配你的家世背景…",
  "正在決定你會不會講話…",
  "正在檢查你家有沒有建案…",
  "正在聯絡你的派系大老…",
  "正在計算你被起底的機率…",
  "正在印你的競選旗幟…",
];

interface Slot {
  label: string;
  pool: string[];
  value: string;
  /** 資質的品質，定格後依品質上色 */
  tier?: TraitTier;
}

function slotsFor(c: DrawnCharacter): Slot[] {
  const trait = (id: string) => TRAITS.find((t) => t.id === id)!;
  const traitPool = TRAITS.map((t) => t.name);
  return [
    { label: "城市", pool: CITIES.map((x) => x.name), value: c.city.name },
    { label: "政黨", pool: PARTIES.map((x) => x.name), value: c.party.name },
    { label: "出身", pool: BACKGROUNDS.map((x) => x.name), value: c.background.name },
    ...c.profile.traits.map((id, i) => ({
      label: `資質 ${i + 1}`,
      pool: traitPool,
      value: trait(id).name,
      tier: trait(id).tier,
    })),
    { label: "先天包袱", pool: BURDENS.map((x) => x.name), value: BURDENS.find((b) => b.id === c.profile.burden)!.name },
  ];
}

/** 「正在隨機你的人生」：每一格像拉霸一樣閃過候選值，再依序定格；全部定格後等玩家按「下一步」 */
export default function RollingScreen({ character, onDone }: { character: DrawnCharacter; onDone: () => void }) {
  const [reduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  // 以實際經過的時間推進，而不是計算 interval 次數：分頁在背景時計時器會被瀏覽器節流
  const [elapsed, setElapsed] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const slots = slotsFor(character);
  const lockAll = FIRST_LOCK_MS + LOCK_GAP_MS * (slots.length - 1);
  const allLocked = reduced || skipped || elapsed >= lockAll;

  useEffect(() => {
    if (allLocked) return;
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), TICK_MS);
    return () => clearInterval(id);
  }, [allLocked]);

  const tick = Math.floor(elapsed / TICK_MS);
  const locked = (i: number) => allLocked || elapsed >= FIRST_LOCK_MS + LOCK_GAP_MS * i;

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>正在隨機你的人生…</h1>
      <p className={styles.lead}>{allLocked ? "人生已經決定了。接下來，就看你怎麼選。" : QUIPS[Math.floor(elapsed / 600) % QUIPS.length]}</p>
      <div className={styles.slotGrid}>
        {slots.map((s, i) => {
          const done = locked(i);
          // 還沒定格的格子，用 tick 輪流閃過候選值
          const spinning = s.pool[(tick * 7 + i * 13) % s.pool.length];
          return (
            <div key={s.label} className={done ? styles.slotLocked : styles.slot} data-tier={done ? s.tier : undefined}>
              <span className={styles.slotLabel}>
                {s.label}
                {done && s.tier && `・${TRAIT_TIER_LABELS[s.tier]}`}
              </span>
              <span className={done ? styles.slotValueLocked : styles.slotValue}>{done ? s.value : spinning}</span>
            </div>
          );
        })}
      </div>
      {allLocked ? (
        <button className={styles.primary} onClick={onDone} autoFocus>
          下一步
        </button>
      ) : (
        <button className={styles.quiet} onClick={() => setSkipped(true)}>
          跳過動畫
        </button>
      )}
    </main>
  );
}
