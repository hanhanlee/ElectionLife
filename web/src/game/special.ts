// 特別篇：固定的人設與對手，十二個依劇本出場的事件，第一次投票後結束。
// 取材自正在進行的真實選戰，人名一律以身分或綽號影射。

import { opponentStrength } from "./profile";
import type { CardKind } from "./shareCard";
import type { GameEvent, GameState, Opponent, Profile, StatDelta, StatKey, Trait } from "./types";

/** 結局判斷用的承諾帳：做過幾個沒有財源的承諾、具體縮減或補上試算了幾次 */
export interface PromiseLedger {
  made: number;
  trimmed: number;
  /** 還沒化解的承諾負債：每次具體修正抵銷一筆，不會一次歸零 */
  debt: number;
}

export interface SpecialEnding {
  when: (s: GameState, won: boolean, probability: number, promises: PromiseLedger) => boolean;
  title: string;
  headline: string;
  paragraphs: (s: GameState, promises: PromiseLedger) => string[];
  /** 這個結局本身就在講「守住原則卻輸了」，不再加高原則落選的旁白 */
  principled?: boolean;
}

export interface SpecialDef {
  id: string;
  title: string;
  /** 開始畫面的一句介紹 */
  teaser: string;
  /** 開場插畫（web/public/specials/<art>.webp） */
  art: string;
  /** 開場頁的開始按鈕 */
  startLabel: string;
  /** 開局說明，一段一句 */
  intro: string[];
  party: string;
  background: string;
  profile: Omit<Profile, "rivals">;
  opponent: Omit<Opponent, "strength">;
  opponentIntro: string;
  /** 對手的額外強度（logit）：現任市長的基本盤，在一般對手的計算之外再加 */
  opponentBonus: number;
  /** 開局民調大幅落後：在政黨、出身、資質的加減之外再調整 */
  startDelta: StatDelta;
  /** 特別篇裡換個名字的數值（例如還沒執政的挑戰者沒有「施政成果」，改看「政策準備」） */
  statLabels: Partial<Record<StatKey, string>>;
  statHints: Partial<Record<StatKey, string>>;
  /** 特別篇顯示的數值：用不到的（市庫、議會、政商）不顯示；特別篇也不算錢 */
  visibleStats: StatKey[];
  /** 開票前的說明：支持度是遊戲指數，不是真實民調 */
  voteNote: string;
  /** 特別篇關掉的通用突發事件：由特別篇自己的插曲處理同一類代價 */
  disabledCrises: string[];
  endings: SpecialEnding[];
  /** 結局頁最後的提醒：現實中的選戰 */
  reality: string;
  /** 現實中的挑戰者在各題的選擇（事件 id → 選項 id）；結局頁的終章反思和平衡模擬的「現實路線」都用這份 */
  realChoices: Record<string, string>;
  /** 終章反思的最後一句：依輸贏與和現實相同的題數換一句，再加一句兩條路線共同的問題 */
  closings: { lost: string; wonSame: string; wonDifferent: string; always: string };
  /** 分享圖卡：底圖與小故事 */
  cards: { win: CardKind; loss: CardKind };
  /** turning：這一局的轉折點（事件標題），讓每個人分享的小故事不一樣 */
  shareStory: (won: boolean, same: number, total: number, turning?: string) => string;
  /** 選擇的回響：玩家這一局做過的選擇，在後日談裡被提到（每局最多兩句） */
  recaps: { eventId: string; optionId: string; text: string }[];
  /** 原則很高卻落選時加一段旁白的門檻（挑戰者開局原則就高，門檻也比較高，旁白才不會每次都出現） */
  principledLoss: number;
  /** 這一局的你：依數值挑一句（團隊累垮、政見寫成白皮書、說了自己不信的話……），沒有特別的就不寫 */
  statLine: (s: GameState) => string | undefined;
  /** 終章反思開頭：現實的選戰走到哪裡（真名只出現在結局頁） */
  realityNow: { paragraphs: string[]; refs: { title: string; url: string }[] };
  /** 結局頁導向主篇的一句話 */
  cta: string;
}


/** 挑戰者當選後說的第一句話：取自這場選戰市民最在意的事，依種子輪換 */
const FIRST_MORNING = [
  "明天早上，我會開始整理那一千多則『市長，你給我聽好了』，一則一則排進市府的工作清單，讓台北變成大家想要的樣子。",
  "明天早上，我會先看資料、開會，準備具體的營養午餐改善計畫，讓家長可以放心把孩子交給我們。",
  "明天早上，我會從短期、中期、長期開始規劃交通，讓大家通勤省一點時間，多一點時間留給自己和家人。",
  "明天早上，我會先找環保局和各區里長，把鼠患的通報資料攤開來，一區一區訂出處理的時間表。",
  "明天早上，我會先去看那些沒有電梯的老公寓，把都更和長照一起排進計畫，讓長輩不用再被困在家裡。",
];

export const SPECIALS: SpecialDef[] = [
  {
    id: "capital-2026",
    title: "首都逆轉戰",
    teaser: "被對岸立案偵查的立委，落後二十八點，挑戰首都的現任市長。",
    art: "route-challenger",
    startLabel: "接受徵召",
    intro: [
      "你是綠黨的立法委員，在大學教犯罪學，創辦了一間民防學院，教民眾在戰爭與災難中自救、識讀假訊息。",
      "對岸說你「分裂國家」，對你立案偵查。半年後，黨要你去挑戰首都的現任市長。",
      "徵召後的第一份民調，你落後二十八個百分點。所有人都說這是不可能的任務。",
    ],
    party: "green",
    background: "legislator",
    profile: { city: "tianlong", traits: ["policy-wonk", "meme-lord", "principled"], burden: "activist-network", origin: 0 },
    opponent: {
      name: "公子市長",
      party: "blue",
      title: "尋求連任的現任市長",
      incumbent: true,
      traits: ["photogenic", "connected", "clean-image"],
      burden: "dynasty",
    },
    opponentIntro:
      "家族四代都出現在課本裡。外型體面、形象乾淨，第一任做得四平八穩，民調一直很好看。批評的人說：很好看，但不知道做了什麼。",
    opponentBonus: 0.05,
    startDelta: { approval: -21, media: -4 },
    statLabels: { approval: "支持度", achievement: "政策準備" },
    statHints: {
      approval: "遊戲裡的聲勢指數，不是真實民調。",
      achievement: "你的政見有多少研究、財源和時程撐著。宣布政見不會增加，做功課才會。",
    },
    visibleStats: ["approval", "media", "achievement", "team", "party"],
    // 挑戰者聲量高是現實（民調也一路追上來），不該固定扣分；衝聲量的代價改由插曲 F13〈短影音被斷章取義〉處理，玩家可以選擇怎麼回應
    disabledCrises: ["x-overexposure"],
    voteNote: "開票前，幕僚提醒你：支持度只是聲勢，不是票。公子市長的基本盤一直都在，很多人在電話裡不表態。",
    endings: [
      {
        when: (_s, won, _p, promises) => won && promises.debt === 0,
        title: "不可能的任務",
        headline: "落後二十八點的人，當選了",
        paragraphs: (s) => [
          `開票到晚上九點，公子市長的競選總部關了燈。你走上台，台下有人哭、有人笑，有人還舉著五月那份「落後二十八點」的民調截圖。你說的第一句話是：「${FIRST_MORNING[s.seed % FIRST_MORNING.length]}」`,
          "你答應過的事不多，但每一件都算過錢、排過時程。贏下選舉只是拿到鑰匙，接下來四年，才是真正難的部分。",
        ],
      },
      {
        when: (_s, won) => won,
        title: "代價昂貴的翻盤",
        headline: "你贏了，帳單也到了",
        paragraphs: (_s, promises) => [
          "開票開到最後一刻，你以些微差距勝出。慶功宴還沒散，財政局的老科長傳來一則訊息：「恭喜市長。那些承諾的錢，要從哪裡來？」",
          promises.trimmed > 0
            ? "你在選前縮減過一些承諾，但看板上的數字，大家都還記得。四年後，他們會一個一個對答案。"
            : "看板上的數字很大，大家都記得。四年後，他們會一個一個對答案。",
        ],
      },
      {
        when: (s, won) => !won && s.stats.integrity >= 75 && s.stats.achievement >= 40,
        title: "雖敗猶榮",
        principled: true,
        headline: "你輸了，但大家記得你講過的每一個數字",
        paragraphs: () => [
          "你輸了。敗選記者會上，你把政策團隊做的那一疊研究放在桌上：「這些不會浪費，誰當市長都可以拿去用。」",
          "半年前，沒有人相信你追得上來。現在，公子市長的施政報告裡，開始出現你提過的那些地名和數字。",
        ],
      },
      {
        when: (s, won) => !won && s.stats.media >= 50 && s.stats.team >= 45,
        title: "意外的政治新星",
        headline: "選舉輸了，但所有人都認識你了",
        paragraphs: () => [
          "你輸了，但你的名字比選前大了十倍。敗選記者會才結束，就有三個節目打電話來邀你當來賓。",
          "你的團隊沒有散。有人問下一場仗在哪裡，你說：「先回家睡一覺。」然後，你把那張落後二十八點的民調截圖，設成了手機桌布。",
        ],
      },
      {
        when: () => true,
        title: "沒有奇蹟",
        headline: "首都還是公子市長的",
        paragraphs: () => [
          "開票不到一小時，勝負就出來了。你走上台，先謝謝那些在雨裡幫你發傳單的志工，再向公子市長道賀。",
          "落後二十八點的仗，本來就很少有人打贏。但這半年，很多人第一次認真想了想：這座城市要的，是什麼樣的市長。",
        ],
      },
    ],
    reality: "現實中的這場選戰，在 2026 年 11 月 28 日投票。遊戲裡的結果，只是無數種可能中的一種，不代表任何預測或立場。",
    realChoices: {
      "sp-capital-01": "defiant",
      "sp-capital-02": "warrior",
      "sp-capital-03": "local",
      "sp-capital-04": "enemy",
      "sp-capital-06": "earn",
      "sp-capital-07": "law",
      "sp-capital-08": "decouple",
      "sp-capital-09": "challenger",
      "sp-capital-m01": "explain",
      "sp-capital-m03": "unscripted",
      "sp-capital-m05": "substation",
      "sp-capital-m07": "attack",
      "sp-capital-n01": "same",
      "sp-capital-n03": "lunch",
      "sp-capital-n04": "soft",
      "sp-capital-n05": "ask",
      "sp-capital-n06": "more",
      "sp-capital-n07": "books",
    },
    closings: {
      lost: "現實裡，他做了這些選擇，把落後二十八點追成拉鋸。你在哪幾題做了不一樣的決定？",
      wonSame: "你走了他走過的路，也走到了終點。現實裡，這條路還沒走完。",
      wonDifferent: "你用自己的方法贏了。他在現實裡為什麼沒這樣選？是他錯了，還是你漏看了什麼？",
      always: "他的選擇裡，有哪些是你不會做的？",
    },
    cards: { win: "capital-win", loss: "capital-loss" },
    shareStory: (won, same, total, turning) =>
      `落後二十八點起步，${won ? "我當選了" : "最後沒能翻盤"}。${turning ? `轉折點是〈${turning}〉。` : ""}${total > 0 ? `${total} 個真實攻防裡，我有 ${same} 題和現實選得一樣。` : ""}`,
    recaps: [
      { eventId: "sp-capital-01", optionId: "defiant", text: "「下一步大概是通緝吧，我們沒在怕」，那支短影音後來被志工印在背心上，跟著你跑完了整場選戰。" },
      { eventId: "sp-capital-01", optionId: "report", text: "你那份跨境鎮壓的研究報告，選後被翻成英文和日文，還有外國記者專程飛來問細節。" },
      { eventId: "sp-capital-01", optionId: "calm", text: "被立案偵查的那天，你照常去上課。學生說，那是他們這學期最安靜的一堂課。" },
      { eventId: "sp-capital-02", optionId: "staff", text: "黨中央派來的輔選人力一直待到開票那晚。他們排的行程很多，你自己想跑的地方，也少了很多。" },
      { eventId: "sp-capital-03", optionId: "local", text: "你一區一區跑出來的那張老鼠和淹水通報地圖，後來被好幾個里長貼在辦公室的牆上。" },
      { eventId: "sp-capital-03", optionId: "security", text: "「首都是滲透的第一線」這句話跟著你跑了整場選戰。支持你的人很買單，也有人說，他們比較想聽巷口的事。" },
      { eventId: "sp-capital-03", optionId: "poll", text: "那份只公布一題的民調，選後還是有人在問：完整的問卷，到底長什麼樣子？" },
      { eventId: "sp-capital-04", optionId: "timeline", text: "你公開的那份家族生意時間線，讓謠言少了很多。也有人說，參選人不該連父親的帳都要攤開。" },
      { eventId: "sp-capital-04", optionId: "ignore", text: "你沒有回應家裡生意的謠言。選後，它還在某些群組裡，被當成「大家都知道」的事。" },
      { eventId: "sp-capital-05", optionId: "costs", text: "政策島上每一頁的財源和時程，選後被好幾個公民團體拿去對照，連對手的幕僚都在看。" },
      { eventId: "sp-capital-05", optionId: "remix", text: "二創大賽的作品比你的政見還多。有幾支到投票那天都還在被轉傳，只是很少人點進去看政見。" },
      { eventId: "sp-capital-06", optionId: "earn", text: "「不管上一屆投誰」那段話被剪成好幾支短影音。開票後，有人留言說，他就是因為那段才投給你。" },
      { eventId: "sp-capital-06", optionId: "invite", text: "前副市長團隊的那兩位老幕僚，選後傳來一句：「下次還可以再談。」" },
      { eventId: "sp-capital-06", optionId: "ads", text: "那批鎖定第三勢力選民的精準廣告點擊率很高；被截圖的那一張，也一直被拿出來講。" },
      { eventId: "sp-capital-07", optionId: "thank", text: "你說參加選舉活動是很正常的小事。那位藝人後來傳來一句謝謝，沒有署名，但你知道是誰。" },
      { eventId: "sp-capital-07", optionId: "law", text: "你要求修的那條法，選後還在委員會排隊。不過，跨境恐嚇候選人這件事，第一次被認真寫進了法案。" },
      { eventId: "sp-capital-08", optionId: "decouple", text: "檢討會上，幕僚把那段颱風夜的發言放了三遍。論點值得討論，只是說在了颱風夜，也沒先問在金融業上班的人怎麼想。" },
      { eventId: "sp-capital-08", optionId: "listen", text: "颱風過後你去聽的那幾個淹水社區，選後有里長打電話來問：上次說的抽水站，什麼時候動工？" },
      { eventId: "sp-capital-09", optionId: "brag", text: "造勢場上念出的「領先十七點」，選後被拿來對照開票結果，做成了一張很難看的圖。" },
      { eventId: "sp-capital-09", optionId: "challenger", text: "「我永遠是挑戰者」，後來成了你的志工群組名稱。" },
      { eventId: "sp-capital-11", optionId: "rest", text: "選前那兩天的輪休，讓志工在選前之夜還有力氣，一路喊到最後一刻。" },
      { eventId: "sp-capital-11", optionId: "rally", text: "那場包下廣場的大型造勢，空拍畫面很壯觀。收場的志工，凌晨三點才回到家。" },
      { eventId: "sp-capital-12", optionId: "fear", text: "選前之夜那句「我不怕，是因為有你們」，很多人錄了下來，選後還在轉。" },
      { eventId: "sp-capital-12", optionId: "trim", text: "選前之夜你縮成的三件事，後來被貼在競總的牆上，旁邊有人用麥克筆寫：「記得喔。」" },
      { eventId: "sp-capital-12", optionId: "third", text: "選前之夜站上台的那幾位第三勢力選民，選後有人說，那是整場選戰最真實的十分鐘。" },
      { eventId: "sp-capital-m01", optionId: "explain", text: "你承認十二年前寫得太省的那段話，成了整場選戰被轉傳最多次的澄清。" },
      { eventId: "sp-capital-m01", optionId: "counter", text: "「台北市現在就在做，你的市府就在做」，那句反擊到投票那天都還在留言區被引用。" },
      { eventId: "sp-capital-m03", optionId: "unscripted", text: "「市長，你給我聽好了」辦了好幾場，選後還有市民來問：下一場什麼時候？" },
      { eventId: "sp-capital-m03", optionId: "mock", text: "你轉發的那支「講稿機」合輯，後來被人用同樣的手法，剪成了你的版本。" },
      { eventId: "sp-capital-m07", optionId: "attack", text: "「垃圾桶少了，老鼠還在」成了這場選戰最常被引用的一句話。老鼠倒是一隻也沒有少。" },
      { eventId: "sp-capital-m07", optionId: "joke", text: "「兩天是開始，不是結束」，選後還是有人每天到你的臉書留言：今天是第幾天？" },
      { eventId: "sp-capital-m07", optionId: "hormone", text: "你提的荷爾蒙滅鼠藥劑，選後真的有廠商去找市府談了。" },
      { eventId: "sp-capital-n01", optionId: "changed", text: "你承認對雙城論壇的想法調整過。有中間選民說，那是他們第一次聽到候選人承認自己變了。" },
      { eventId: "sp-capital-n02", optionId: "calm", text: "地檢署起訴那天，你只說了一句「希望這種事不要再發生在任何一個候選人身上」。那句話，比任何反擊都走得遠。" },
      { eventId: "sp-capital-n03", optionId: "mock", text: "「市府是賣鮮奶的廠商嗎？」被做成了好幾張梗圖。至於午餐，到投票那天都沒有人再問。" },
      { eventId: "sp-capital-n04", optionId: "firm", text: "你說「選舉比的是市政，不是長相」，前部長那通電話講了很久。中間選民倒是記住了這一句。" },
      { eventId: "sp-capital-n06", optionId: "more", text: "那幾集偏藍節目的專訪，選後觀看數還在漲；其中一位主持人，還因此被黨內連署要開除黨籍。" },
      { eventId: "sp-capital-n07", optionId: "books", text: "那張青年政策的試算表，被工程師社群整理成了一個網頁，連青年局的人都在看。" },
      { eventId: "sp-capital-n07", optionId: "push", text: "「AI 卡」三個字很紅。錢從哪裡來，到現在還是沒有人知道。" },
      { eventId: "sp-capital-02", optionId: "warrior", text: "「戰士沒有選擇戰場的權利」，這句話後來成了你的競選口號之一。" },
      { eventId: "sp-capital-04", optionId: "enemy", text: "你說家裡生意的事是對岸在干擾選舉。支持者很買單，但那份時間線，你始終沒有公開。" },
      { eventId: "sp-capital-10", optionId: "map", text: "辯論上你攤開的淹水與鼠患數據，選後被好幾個里長印出來，貼在里民活動中心。" },
      { eventId: "sp-capital-10", optionId: "plan", text: "辯論那晚你不攻擊，只講政見、財源和時程。有人說那是整場最無聊的十分鐘，也有人說，那是唯一聽得懂的十分鐘。" },
      { eventId: "sp-capital-10", optionId: "security", text: "辯論上你把話題拉到跨境鎮壓和城市韌性。支持者很振奮，也有人說，他們那天比較想聽巷口的老鼠和家裡的老公寓。" },
      { eventId: "sp-capital-10", optionId: "evidence", text: "辯論上你一題一題拿出政策研究，請對手回應。那一段後來被網友剪成一支影片，標題叫「挑戰者的期末報告」。" },
      { eventId: "sp-capital-m06", optionId: "files", text: "辯論上你拿出對手的舊公文和舊發言。那幾分鐘很精彩，也讓人想起，你自己也有舊帳。" },
      { eventId: "sp-capital-m06", optionId: "own", text: "辯論一開場，你先交代了自己前後說法的差異。對手準備好的那幾題，後來一題都沒問。" },
      { eventId: "sp-capital-11", optionId: "stations", text: "選前那兩天你一站一站掃捷運站。有個上班族說，他連續三天，都在同一個出口遇到你。" },
      { eventId: "sp-capital-12", optionId: "rats", text: "選前之夜你最後一次講老鼠、淹水和老公寓。台下有位阿嬤說，這是她第一次聽完一整場政見。" },
      { eventId: "sp-capital-n03", optionId: "lunch", text: "你一直追問的午餐招標，選前終於全部完成了。教育局沒有提到你，但家長群組有。" },
      { eventId: "sp-capital-n03", optionId: "swap", text: "你提的「加碼鮮奶的錢，先拿去提升午餐品質」，被一個家長社團整理成了連署。" },
    ],
    principledLoss: 95,
    statLine: (s) =>
      s.stats.team <= 40
        ? "選戰最後一個月，競總裡幾乎沒有人睡滿六個小時。開票那晚，有志工靠在牆邊睡著了，手裡還拿著傳單。"
        : s.stats.achievement >= 70
          ? "你的政策團隊整理出兩百多頁的政見白皮書。選後，有大學拿去當公共政策課的教材。"
          : s.stats.integrity <= 60
            ? "選戰後半段，你說了幾句自己也不太相信的話。開票那晚，你想起了其中一句。"
            : s.stats.media >= 75
              ? "這半年，你上了上百次新聞。有人說你是這場選戰最會用網路的人，也有人說，你是被網路用得最兇的人。"
              : s.stats.party <= 40
                ? "黨中央的人，開票那晚沒有來。你知道，這一路上你和黨之間的帳，還沒算完。"
                : undefined,
    realityNow: {
      paragraphs: [
        "沈伯洋被徵召後的第一份民調，落後蔣萬安二十八個百分點，很多人說這是垃圾時間。",
        "十月二十日，信民協會公布的民調是沈伯洋 50.3%、蔣萬安 33.3%。做分析的民調專家也提醒：民調不是得票率，換算成得票，兩人可能非常接近。垃圾時間，打成了焦土戰。",
      ],
      refs: [
        { title: "聯合報：北市最新民調，蔣萬安大贏沈伯洋 28 個百分點", url: "https://udn.com/news/story/124652/9529403" },
        { title: "Newtalk（2026-10-20）：沈伯洋支持度領先 17%，戴立安分析", url: "https://newtalk.tw/news/view/2026-10-20/1066585" },
      ],
    },
    cta: "這場選舉結束了。如果你真的當上市長，接下來四年呢？",
  },
  {
    id: "capital-2026-incumbent",
    title: "首都保衛戰",
    teaser: "民調一路領先的現任市長，要守住這座城。",
    art: "route-incumbent",
    startLabel: "爭取連任",
    intro: [
      "你是藍黨的首都市長，律師出身。家族四代都出現在課本裡，四年前你第一次選市長就贏了。",
      "第一任做得四平八穩，民調一直很好看。綠黨徵召了在大學教犯罪學、被對岸立案偵查的 Puma 委員來挑戰你。",
      "對手徵召後的第一份民調，你領先二十八個百分點。所有人都說，這場選舉躺著選就好。",
    ],
    party: "blue",
    background: "incumbent",
    profile: { city: "tianlong", traits: ["photogenic", "connected", "clean-image"], burden: "dynasty", origin: 0 },
    opponent: {
      name: "Puma委員",
      party: "green",
      title: "挑戰首都的立法委員",
      incumbent: false,
      traits: ["policy-wonk", "meme-lord", "principled"],
      burden: "activist-network",
    },
    opponentIntro: "大學犯罪學教授、民防學院創辦人，被對岸立案偵查，網路梗很多。批評的人說：國安理論一百分，市政實務零經驗，政見長到像在寫期末論文。",
    opponentBonus: -0.3,
    startDelta: {},
    statLabels: { approval: "支持度" },
    statHints: { approval: "遊戲裡的聲勢指數，不是真實民調。" },
    visibleStats: ["approval", "media", "achievement", "team", "party"],
    disabledCrises: ["x-overexposure"],
    voteNote: "開票前，幕僚提醒你：支持度只是聲勢，不是票。很多人在電話裡不表態，這一次，不表態的是誰的人？",
    endings: [
      {
        when: (s, won) => won && s.stats.integrity >= 80,
        title: "守住了",
        headline: "城守住了，你也沒有變",
        paragraphs: () => [
          "開票到晚上九點，Puma 委員打電話來道賀。你在台上說的第一句話是：「謝謝願意給我第二次機會的每一個人，也謝謝沒有投給我的人，你們的聲音，我聽到了。」",
          "第二任開始了。這一次，沒有人說你是躺著選上的；你也知道，下一個四年，不能再只靠領先。",
        ],
      },
      {
        when: (_s, won) => won,
        title: "險勝",
        headline: "你守住了城，但城裡的人看你的眼神不一樣了",
        paragraphs: () => [
          "開票開到最後一刻，你以些微差距勝出。慶功宴上沒有人開香檳，黨部主委拍拍你的肩膀，只說了兩個字：「好險。」",
          "五月領先二十八點的選舉，最後只贏了幾個百分點。接下來四年，每一個市民都會記得：這座城，差一點就換人了。",
        ],
      },
      {
        when: (s, won) => !won && s.stats.integrity >= 75,
        title: "城破，但你沒有失態",
        principled: true,
        headline: "你輸了，但你一路上沒有說過一句自己不相信的話",
        paragraphs: () => [
          "你輸了。敗選記者會上，你先向 Puma 委員道賀，再向市府同仁道謝：「市政不會因為選舉停下來，交接的每一份資料，我們都會準備好。」",
          "那天晚上，很多原本沒有投給你的人說，這是你這四年最像市長的一天。",
        ],
      },
      {
        when: (s, won) => !won && s.stats.party >= 76,
        title: "基本盤還在",
        headline: "深藍的票都投給你了，只是不夠",
        paragraphs: () => [
          "開票時，你在幾個老社區一路領先，其他地方卻一路落後。黨部的人安慰你：「基本盤都在。」你知道，問題從來不在基本盤。",
          "那些在電話裡不表態的人，最後都去投票了，只是沒有投給你。",
        ],
      },
      {
        when: () => true,
        title: "城破",
        headline: "領先二十八點的人，輸了",
        paragraphs: () => [
          "開票不到一小時，勝負就出來了。你走上台，台下的支持者比四年前少了一半，很多人已經在收旗子。",
          "幕僚把整場選戰的剪報攤在桌上，從五月那份領先二十八點的民調，一路翻到昨天。你想找出是哪一天開始輸的，翻了很久，翻不到。",
        ],
      },
    ],
    reality: "現實中的這場選戰，在 2026 年 11 月 28 日投票。遊戲裡的結果，只是無數種可能中的一種，不代表任何預測或立場。",
    realChoices: {
      "sp-incumbent-01": "steady",
      "sp-incumbent-02": "press",
      "sp-incumbent-03": "off",
      "sp-incumbent-04": "milk",
      "sp-incumbent-05": "post",
      "sp-incumbent-06": "never",
      "sp-incumbent-07": "announce",
      "sp-incumbent-08": "calm",
      "sp-incumbent-09": "experience",
      "sp-incumbent-10": "kings",
      "sp-incumbent-11": "pivot",
      "sp-incumbent-p01": "show",
      "sp-incumbent-f07": "broom",
    },
    closings: {
      lost: "現實裡，他從領先二十八點走到這一步。你在哪幾題，和他做了一樣的決定？",
      wonSame: "你走了他走過的路，最後守住了。現實裡，這條路還沒走完。",
      wonDifferent: "你贏了。但你的選擇和現實為什麼總是不同？如果你支持的是他的政黨，這還是你本來想支持的樣子嗎？要怎麼讓它改變？",
      always: "他的選擇裡，有哪些是你不會做的？",
    },
    cards: { win: "incumbent-win", loss: "incumbent-loss" },
    shareStory: (won, same, total, turning) =>
      `領先二十八點起步，${won ? "我守住了這座城" : "最後還是輸了"}。${turning ? `轉折點是〈${turning}〉。` : ""}${total > 0 ? `${total} 個真實攻防裡，我有 ${same} 題和現實選得一樣。` : ""}`,
    recaps: [
      { eventId: "sp-incumbent-01", optionId: "steady", text: "「現在全力拚市政，沒在想選舉的事」，五月說的這句話，到了十月被對手剪進了好幾支影片的開頭。" },
      { eventId: "sp-incumbent-01", optionId: "alert", text: "五月你說要當成落後在打，幕僚們嘴上說好；到了十月，他們才知道你是對的。" },
      { eventId: "sp-incumbent-01", optionId: "mock", text: "「謝謝綠黨送的禮物」，後來被對手印在了募款海報上。" },
      { eventId: "sp-incumbent-02", optionId: "press", text: "大陸小組那幾份追打對手的新聞稿，被記者整理成一張時間表，標題是：這是市府，還是競總？" },
      { eventId: "sp-incumbent-02", optionId: "open", text: "你公開的歷屆論壇成果清單，有些很實在，有些只是一張合照；但大家第一次能自己判斷。" },
      { eventId: "sp-incumbent-03", optionId: "off", text: "七月那天沒風沒雨的颱風假，後來被做成了梗圖，每次颱風來，都會被轉一次。" },
      { eventId: "sp-incumbent-03", optionId: "work", text: "七月那天你守在應變中心，沒有放假。股市照常開盤，也沒有人淹水，只有幾位家長到現在還在抱怨孩子淋了雨。" },
      { eventId: "sp-incumbent-04", optionId: "milk", text: "鮮奶加碼的研究，選後還在研究。午餐的招標，倒是早就完成了。" },
      { eventId: "sp-incumbent-04", optionId: "lunch", text: "你先公布的午餐招標進度表，讓鮮奶的梗沒有地方接。教育局的人說，那是今年最好過的一個月。" },
      { eventId: "sp-incumbent-05", optionId: "post", text: "那篇貼文底下的五十萬則留言，到投票那天都還在；你當立委時凍結戒治預算的舊提案，也一起被翻了出來。" },
      { eventId: "sp-incumbent-05", optionId: "read", text: "那一週你沒有出手，改辦了一場戒治座談。座談的紀錄後來被很多人轉傳，比任何一篇貼文都走得久。" },
      { eventId: "sp-incumbent-06", optionId: "never", text: "「本來就沒有要邀請他上台」，這句話在網路上流傳得比你的政見還久；文化局長打的那通電話，也被拿出來問了好幾次。" },
      { eventId: "sp-incumbent-06", optionId: "freedom", text: "你說出席誰的活動都是他的自由。那句話後來連 Puma 委員都引用了。" },
      { eventId: "sp-incumbent-07", optionId: "announce", text: "選前宣布要遷走的機場，選後還沒有人知道要遷到哪裡。中央說，四年來，這是你們第一次來談。" },
      { eventId: "sp-incumbent-07", optionId: "plan", text: "你堅持先算清楚再談機場。選後，交通學者拿你的試算開了一場研討會。" },
      { eventId: "sp-incumbent-08", optionId: "calm", text: "「勇敢站出來」這四個字被很多支持者轉貼。開票那天你才知道，原來有那麼多人一直不敢說。" },
      { eventId: "sp-incumbent-08", optionId: "alarm", text: "你對內喊出「我們現在就是落後」的那天，黨部的電話響了一整晚。" },
      { eventId: "sp-incumbent-08", optionId: "slap", text: "「用選票打臉那位大老」，黨部群組很振奮；中間選民聽到的，是民調輸了就怪出錢的人。" },
      { eventId: "sp-incumbent-09", optionId: "experience", text: "那天搬樹枝的影片，被剪進了好幾支合輯；清潔隊長那則「是我邀請的」留言，也被截圖了好幾千次。" },
      { eventId: "sp-incumbent-09", optionId: "thanks", text: "颱風後你去現場，只說了一句謝謝，沒拿工具，也沒拍照。清潔隊員到現在還記得。" },
      { eventId: "sp-incumbent-10", optionId: "kings", text: "競總成立那天，三位天王的發言比你還長。選後有人問：這場選舉的主角，到底是誰？" },
      { eventId: "sp-incumbent-10", optionId: "young", text: "競總成立那天站上台的那位大學生，選後成了你的青年政策顧問。" },
      { eventId: "sp-incumbent-11", optionId: "pivot", text: "辯論上，你把每一題都帶回鮮奶、午餐、大巨蛋和輝達。那一段，成了這場選戰最有名的合輯。" },
      { eventId: "sp-incumbent-11", optionId: "admit", text: "辯論上你承認做得不夠好的那一段，是整場觀看數最高的片段。" },
      { eventId: "sp-incumbent-12", optionId: "family", text: "選前之夜你講的家族故事，網路上的留言比現場的掌聲還多，按讚最多的那一則寫著：不驗 DNA 嗎？" },
      { eventId: "sp-incumbent-12", optionId: "sorry", text: "選前之夜那句「我聽到了」，很多人說，是你這四年最像市長的一句話。" },
      { eventId: "sp-incumbent-f02", optionId: "pan", text: "「這個鍋子我還不熟悉」，變成了那年冬天最常聽到的玩笑話，連你自己的幕僚都在講。" },
      { eventId: "sp-incumbent-f02", optionId: "learn", text: "你在綜藝節目上承認很少下廚，被唸了一整段。那集的留言區，是你今年最和氣的一個。" },
      { eventId: "sp-incumbent-f06", optionId: "split", text: "那晚你說「我是台灣人」，黨部的電話響到天亮；也有很多原本不會投給你的人，第一次停下來聽你說話。" },
      { eventId: "sp-incumbent-f06", optionId: "respect", text: "黨主席開口的那天，你說她有她的看法。隔天的標題寫的是：現任市長不願切割。" },
      { eventId: "sp-incumbent-f07", optionId: "broom", text: "「掃馬路的掃把跟家裡用的不一樣」，你說的是實話，但大家只記得掃把。" },
      { eventId: "sp-incumbent-p01", optionId: "show", text: "你說背稿和看字幕機不可能同時發生。那段回答，成了問 A 答 B 合輯裡最常被播的一段。" },
      { eventId: "sp-incumbent-p01", optionId: "redo", text: "你在節目上說「我剛才沒有回答到題目，我重新回答一次」。很多人轉傳那段影片，說：原來他也可以這樣回答。" },
      { eventId: "sp-incumbent-02", optionId: "pivot", text: "雙城論壇照辦，主題改成防災與公衛。對手準備好的「破口」說，一時找不到可以打的地方。" },
      { eventId: "sp-incumbent-03", optionId: "half", text: "七月那天你只放了半天颱風假，股市上午照常開盤。兩邊都有人罵，但罵得比較小聲。" },
      { eventId: "sp-incumbent-04", optionId: "retort", text: "「只要是我們推的政策，再好你們都要先罵？」這句話很解氣；至於午餐，後來沒有人再提。" },
      { eventId: "sp-incumbent-05", optionId: "skip", text: "對手十二年前那篇文章，你一個字都沒有碰。那一週，新聞都在談別的事。" },
      { eventId: "sp-incumbent-06", optionId: "thanks", text: "那位藝人後來真的來了，坐在台下，鼓掌鼓得很客氣。" },
      { eventId: "sp-incumbent-07", optionId: "central", text: "你先去中央談機場，中央說可以成立小組。小組開了三次會，選舉就結束了。" },
      { eventId: "sp-incumbent-09", optionId: "eoc", text: "颱風後你留在應變中心，沒有去現場拍照。復原進度表每兩小時更新一次，被里長們轉了好幾輪。" },
      { eventId: "sp-incumbent-10", optionId: "policy", text: "競總成立大會改成了政績說明會。場面冷了一點，但那是今年唯一一場附參考資料的成立大會。" },
      { eventId: "sp-incumbent-11", optionId: "record", text: "辯論上你一題一題拿出捷運、社宅和托育的數字。聽不太懂的人很多，但沒有人說你答非所問。" },
      { eventId: "sp-incumbent-11", optionId: "needle", text: "辯論上你又問了一次十二年前那句話。對手只回了一句，全場觀眾就笑了。" },
      { eventId: "sp-incumbent-12", optionId: "record", text: "選前之夜你一項一項念出四年做到的事。有人聽到睡著，也有人第一次知道，原來那條路是你修的。" },
      { eventId: "sp-incumbent-f01", optionId: "clean", text: "大巨蛋那隻老鼠之後，業者全面清消了。鼠類偵防師在哪裡，還是有人在問。" },
      { eventId: "sp-incumbent-f05", optionId: "silent", text: "那兩位主持人，到選前都還在等你回覆。" },
      { eventId: "sp-incumbent-f05", optionId: "go", text: "你終於去上了對面的節目，不先要題目。那集的留言區，是你今年看過最多「其實還不錯」的一次。" },
    ],
    principledLoss: 85,
    statLine: (s) =>
      s.stats.team <= 40
        ? "選戰最後一個月，市府和競總的人都累垮了。開票那晚，副秘書長在會議室裡睡著，手機還開著災情群組。"
        : s.stats.integrity <= 65
          ? "選戰最後幾週，你說了幾句幕僚寫好、你自己也不太相信的話。開票那晚，你想起了其中一句。"
          : s.stats.achievement >= 80
            ? "四年的政績報告厚得像一本電話簿。選後有人一頁一頁看完，說：其實做了不少事，只是沒有人講清楚。"
            : s.stats.party >= 85
              ? "黨部的動員一場比一場大。開票那晚，黨部主委說：該來的，都來了。"
              : s.stats.media >= 75
                ? "這半年你上新聞的次數，比四年加起來還多。可惜，很多是合輯。"
                : undefined,
    realityNow: {
      paragraphs: [
        "沈伯洋被徵召後的第一份民調，蔣萬安領先二十八個百分點，很多人說這場選舉躺著選就好。",
        "十月二十日，信民協會公布的民調是沈伯洋 50.3%、蔣萬安 33.3%。做分析的民調專家也提醒：民調不是得票率，換算成得票，兩人可能非常接近。躺著選，選成了焦土戰。",
      ],
      refs: [
        { title: "聯合報：北市最新民調，蔣萬安大贏沈伯洋 28 個百分點", url: "https://udn.com/news/story/124652/9529403" },
        { title: "Newtalk（2026-10-20）：沈伯洋支持度領先 17%，戴立安分析", url: "https://newtalk.tw/news/view/2026-10-20/1066585" },
      ],
    },
    cta: "這場選舉結束了。如果你真的連任了，第二個任期要怎麼做？",
  },
];

export const specialById = (id: string) => SPECIALS.find((s) => s.id === id);

/** 首頁的特別篇入口：同一場選戰，兩邊各一條路線；還沒做好的路線顯示「即將推出」 */
export const SPECIAL_SERIES: {
  title: string;
  teaser: string;
  /** 插畫（web/public/specials/<art>.webp） */
  art: string;
  /** cta：選邊頁的按鈕文字 */
  routes: { title: string; side: string; teaser: string; art: string; cta: string; specialId?: string }[];
} = {
  title: "2026 首都保衛戰",
  art: "capital-2026",
  teaser: "有人盼望奇蹟，有人不能輸。你能將選戰帶向不同的結局嗎？",
  routes: [
    { title: "洋流慧聚", side: "挑戰者路線", teaser: "被對岸立案偵查的立委，落後二十八點，挑戰首都的現任市長。", art: "route-challenger", cta: "大洋流號，出發", specialId: "capital-2026" },
    { title: "萬安守城", side: "現任市長路線", teaser: "民調一路領先的現任市長，要守住這座城。", art: "route-incumbent", cta: "守住這一城", specialId: "capital-2026-incumbent" },
  ],
};

/** 特別篇的完整人設：對手強度依資質與現任身分計算，和一般對手一樣 */
export function specialProfile(def: SpecialDef, traits: Trait[]): Profile {
  const strength = opponentStrength(def.opponent.traits, traits, def.opponent.incumbent) + def.opponentBonus;
  const opponent: Opponent = { ...def.opponent, strength: Math.round(strength * 100) / 100 };
  return { ...def.profile, rivals: { first: opponent, second: opponent } };
}

/** 玩家選過的選項（含插曲），由舊到新 */
function picked(state: GameState, events: GameEvent[]) {
  return [...state.history, ...(state.interludes ?? [])]
    .sort((a, b) => a.turn - b.turn)
    .map((h) => {
      const event = events.find((e) => e.id === h.eventId);
      return { event, option: event?.options.find((o) => o.id === h.optionId) };
    });
}

/**
 * 翻舊帳：把 {said:旗標} 換成玩家最近一次設下這個旗標時「說出口的話」（選項的 recall），例如「股市要不要跟停班停課脫鉤，值得討論。」。
 * 只引用玩家真的選過的話；找不到就保留成「之前說過的話」。
 */
export function fillSaid(text: string, state: GameState, events: GameEvent[]): string {
  return text.replace(/\{said:([\w-]+)\}/g, (_, flag: string) => {
    const hit = picked(state, events)
      .filter((p) => p.option?.setFlags?.includes(flag))
      .at(-1);
    if (!hit) return "之前說過的話";
    const words = hit.option!.recall ?? hit.option!.label;
    return `「${words.replace(/「/g, "『").replace(/」/g, "』")}」`;
  });
}

/** 從玩家實際選過的選項（含插曲）算承諾帳 */
export function promiseLedger(state: GameState, events: GameEvent[]): PromiseLedger {
  const picked = [...state.history, ...(state.interludes ?? [])].map(
    (h) => events.find((e) => e.id === h.eventId)?.options.find((o) => o.id === h.optionId)?.setFlags ?? [],
  );
  const made = picked.filter((f) => f.includes("promise-debt")).length;
  const trimmed = picked.filter((f) => f.includes("promise-trimmed")).length;
  return { made, trimmed, debt: Math.max(0, made - trimmed) };
}

/** 原則很高卻落選時，結局加這段旁白：守原則的人，選戰往往不吃香（門檻見各路線的 principledLoss） */
const PRINCIPLED_LOSS =
  "開票那晚，競選總部的人走得差不多了。你一路上沒有說過一句自己不相信的話，沒有剪過一支斷章取義的影片，也沒有答應過一件做不到的事。你坐在空下來的椅子上，想了很久：為什麼最後是這個下場？你想不通。也許選舉本來就不是在比誰比較誠實；也許，只是還不到時候。";

/**
 * 終章反思：這一局遇到、現實中也有選擇的題目，對照「現實中他選了什麼／你選了什麼」，最後一句依結果換。
 * 插曲與架空的回合不列。
 */
export function realityCheck(def: SpecialDef, state: GameState, events: GameEvent[], won: boolean) {
  const rows = state.history.flatMap((h) => {
    const realId = def.realChoices[h.eventId];
    const event = events.find((e) => e.id === h.eventId);
    const real = event?.options.find((o) => o.id === realId);
    const mine = event?.options.find((o) => o.id === h.optionId);
    return event && real && mine ? [{ event, real, mine, same: real.id === mine.id }] : [];
  });
  const same = rows.filter((r) => r.same).length;
  const mostlySame = same * 2 >= rows.length;
  const c = def.closings;
  const closing = !won ? c.lost : mostlySame ? c.wonSame : c.wonDifferent;
  return { rows, same, closing: [closing, c.always] };
}

/** 這一局的轉折：支持度漲最多與跌最多的那一步（變化至少 3 點才算），連同玩家在那一步選了什麼 */
export function turningPoints(state: GameState, events: GameEvent[]) {
  const steps = state.history.flatMap((h) => {
    const event = events.find((e) => e.id === h.eventId);
    const option = event?.options.find((o) => o.id === h.optionId);
    // 標題裡的「（架空）」只在遊戲進行中標示，後日談不重複
    return event && option ? [{ title: event.title.replace(/（架空）$/, ""), event, option, change: h.optionDelta?.approval ?? 0 }] : [];
  });
  const up = [...steps].sort((a, b) => b.change - a.change)[0];
  const down = [...steps].sort((a, b) => a.change - b.change)[0];
  return { up: up && up.change >= 3 ? up : undefined, down: down && down.change <= -3 ? down : undefined };
}

type Step = NonNullable<ReturnType<typeof turningPoints>["up"]>;

const recapOf = (def: SpecialDef, step: Step) => def.recaps.find((r) => r.eventId === step.event.id && r.optionId === step.option.id)?.text;
/** 沒有寫好回響的選項，就引用玩家當時選的那句 */
const choseLine = (step: Step) => `那天，你選了：「${step.option.label.replace(/「/g, "『").replace(/」/g, "』")}」。`;

/** 轉折段落：寫出關鍵的那一天、玩家做了什麼、後來怎麼了 */
function turningParagraph(def: SpecialDef, state: GameState, events: GameEvent[], won: boolean): { text?: string; used: string[] } {
  const { up, down } = turningPoints(state, events);
  const key = won ? up : down;
  const other = won ? down : up;
  const used = [key, other].flatMap((x) => (x ? [`${x.event.id}/${x.option.id}`] : []));
  // 兩種說法依種子輪換，同一個轉折在不同局讀起來不一樣
  const v = state.seed % 2;
  const lines: string[] = [];
  if (key) {
    lines.push(
      won
        ? [`回頭看，這場仗是在〈${key.title}〉那一天拉開的。`, `如果要選一天，你會選〈${key.title}〉。`][v]
        : [`回頭看，最痛的一刀，在〈${key.title}〉。`, `後來你最常想起的，是〈${key.title}〉那一天。`][v],
    );
    lines.push(recapOf(def, key) ?? choseLine(key));
  }
  if (other) {
    lines.push(
      won
        ? [`差點讓你輸掉的，是〈${other.title}〉。`, `也有讓你冒冷汗的一天：〈${other.title}〉。`][v]
        : [`你走得最好的一步在〈${other.title}〉，可惜那樣的路，後來沒能一直走下去。`, `其實你也有走對的時候，例如〈${other.title}〉；只是不夠。`][v],
    );
  }
  return { text: lines.length ? lines.join("") : undefined, used };
}

/** 選擇的回響：轉折之外，再挑一句；起點依種子輪換，同樣的選擇在不同局會被提到不同的句子 */
function choiceRecap(def: SpecialDef, state: GameState, used: string[]): string | undefined {
  const picked = [...state.history, ...(state.interludes ?? [])];
  const hits = def.recaps.filter(
    (r) => !used.includes(`${r.eventId}/${r.optionId}`) && picked.some((p) => p.eventId === r.eventId && p.optionId === r.optionId),
  );
  return hits.length ? hits[state.seed % hits.length].text : undefined;
}

export function specialEnding(def: SpecialDef, state: GameState, won: boolean, probability: number, events: GameEvent[]) {
  const promises = promiseLedger(state, events);
  const ending = def.endings.find((e) => e.when(state, won, probability, promises))!;
  const paragraphs = ending.paragraphs(state, promises);
  // 放在第一段之後、其他補充段落之前
  if (!won && !ending.principled && state.stats.integrity >= def.principledLoss) paragraphs.splice(1, 0, PRINCIPLED_LOSS);
  // 開票夜之後、尾聲之前：這一局的轉折、另一個選擇的回響、這一局的你
  const turning = turningParagraph(def, state, events, won);
  const recap = choiceRecap(def, state, turning.used);
  const statLine = def.statLine(state);
  const extra = [turning.text, recap, statLine].filter((x): x is string => !!x);
  paragraphs.splice(paragraphs.length - 1, 0, ...extra);
  return { ...ending, paragraphs };
}
