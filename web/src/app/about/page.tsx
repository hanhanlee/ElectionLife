import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "../SiteFooter";
import { CONTACT_EMAIL } from "../site";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "關於與聲明｜選舉人生：市長篇",
  description: "BeyondVote 的設計理念、真實人物與公開資料的使用方式、政治中立與免責聲明，以及資料勘誤的聯絡方式。",
};

export default function About() {
  return (
    <main className={`${styles.main} ${styles.about}`}>
      <Link href="/" className={styles.backLink}>
        ← 回到遊戲
      </Link>
      <h1>BeyondVote｜設計理念與免責聲明</h1>

      <section>
        <h2>我們的設計理念</h2>
        <p>政治不只是選舉，民主也不只是一張選票。</p>
        <p>一場選舉的勝負，往往只是另一段故事的開始。</p>
        <p>從決定參選、爭取支持，到面對輿論、政治攻防與公共政策，每一個選擇都有其考量，也可能帶來意想不到的後果。</p>
        <p>BeyondVote 希望透過互動式政治模擬遊戲，讓玩家從不同角度體驗政治人物所面臨的機會、困境與抉擇。</p>
        <p>我們不希望告訴玩家什麼是唯一正確的政治立場，而是希望透過遊戲，鼓勵玩家思考：</p>
        <ul>
          <li>一項看似理想的政策，實際推動時可能面臨哪些困難？</li>
          <li>當政治理想與現實利益發生衝突時，該如何取捨？</li>
          <li>贏得選舉，是否就代表能夠實現承諾？</li>
          <li>當每一個選擇都有代價，我們又該如何評價一位政治人物？</li>
        </ul>
        <p>我們相信，理解政治的複雜性，是參與民主的重要一步。</p>
      </section>

      <section>
        <h2>關於真實人物與公開資料</h2>
        <p>
          本遊戲部分人物設定、背景故事及事件靈感，可能參考真實政治人物、歷史事件、公開新聞報導、政府公開資訊及其他可供查證的公開資料。
        </p>
        <p>
          我們致力於合理呈現相關資訊，但公開資料可能存在不完整、過時、報導觀點差異或理解偏差等情況，因此無法保證所有內容均完全正確或即時。
        </p>
        <p>此外，為兼顧遊戲性與敘事效果，部分人物設定、事件發展、對話、選項及遊戲結果可能經過簡化、改編、虛構或戲劇化處理。</p>
        <p>遊戲中的情節、人物能力數值、選擇結果及評價，不應視為對任何真實人物的客觀評分、事實認定或完整歷史描述。</p>
      </section>

      <section>
        <h2>政治中立與免責聲明</h2>
        <p>BeyondVote 為獨立創作的政治模擬遊戲，目的在於提供娛樂體驗、公共議題探索及政治決策思考。</p>
        <p>
          除非另有明確說明，本遊戲不代表任何政黨、政治人物、政府機關或政治組織的立場，也不構成對任何特定政治人物或政黨的支持、反對、背書或選舉建議。
        </p>
        <p>遊戲所呈現的政治情境及其結果，皆基於遊戲設計與模擬機制，不代表現實世界必然發生的結果。</p>
        <p>本遊戲內容僅供娛樂及思考參考，不應作為判斷真實人物、歷史事件或公共政策的唯一依據。</p>
      </section>

      <section>
        <h2>資料勘誤與意見回饋</h2>
        <p>我們重視資訊的正確性，也理解政治與公共議題往往具有不同觀點和解讀方式。</p>
        <p>儘管我們盡力查證與整理資料，仍難免出現事實錯誤、資訊過時、脈絡不完整或描述不夠精確之處。</p>
        <p>如果您發現遊戲中有任何事實謬誤、資料引用不當，或值得進一步釐清的內容，誠摯歡迎來信告訴我們。</p>
        <p>為協助查證，建議您提供相關人物或事件名稱、具體問題說明，以及可供參考的資料來源。</p>
        <p>我們將依據可查證的資訊進行檢視，並視情況修正或補充內容。</p>
        <p className={styles.contact}>
          聯絡信箱：
          {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <span>整理中，近期公布</span>}
        </p>
      </section>

      <section className={styles.aboutClosing}>
        <p>
          <strong>BeyondVote</strong>
        </p>
        <p>選舉有勝負，民主沒有標準答案。</p>
        <p>我們希望這不只是一場遊戲，而是一個讓更多人願意理解政治、思考選擇、參與公共討論的起點。</p>
      </section>

      <SiteFooter />
    </main>
  );
}
