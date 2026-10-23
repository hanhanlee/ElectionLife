// 後日談：依這一局留下的痕跡（輸贏、關鍵抉擇、錢、良心、人脈與資質、家庭、城市）組出結局後的故事。
// 每一段從符合條件的片段中挑第一個，所以條件嚴格的片段要排在前面。
// 片段可以有多個版本，依這一局的 seed 挑一個，同樣的局面在不同局會讀到不同的句子。

import type { GameSummary, ReflectionItem } from "./endings";
import type { GameEvent, GameState } from "./types";

export interface Epilogue {
  /** 一句話總結這個人的下場，結局頁的大標 */
  headline: string;
  paragraphs: string[];
}

interface Ctx {
  state: GameState;
  summary: GameSummary;
  won: boolean;
  /** 選上過市長（第一次投票贏了，或本來就是現任） */
  served: boolean;
  years: number;
  legalRisks: number;
  scandals: number;
  has: (flag: string) => boolean;
}

type Text = string | string[];

interface Fragment {
  when: (c: Ctx) => boolean;
  /** 讓這段成為大標的候選，數字越大越優先 */
  headline?: [number, Text];
  text: (c: Ctx) => Text;
}

const SCANDALS = ["x-vote-buying", "x-investigation", "x-collusion", "x-campaign-scandal"];
const always = () => true;

const CAREER: Fragment[] = [
  {
    when: (c) => c.has("ran-higher") && c.won,
    headline: [3, "出征失敗又回來的市長"],
    text: () => [
      "你請假去選更大的位子，沒有選上。回到市府那天，桌上的公文堆到半個人高。不知道為什麼，市民最後還是讓你連任了。",
      "那場更大的選舉你輸了。回到市長室時，副市長把位子讓回給你，說：「歡迎回來。」語氣很難判斷。",
    ],
  },
  {
    when: (c) => c.has("ran-higher"),
    headline: [4, "中途出征的市長"],
    text: () => [
      "你請假去選更大的位子，兩邊都沒有顧好。市民在下一次投票時，用選票回答了「那我們呢？」這個問題。",
      "你上任不到一年就出征了。多年後，這座城市的人談起你，第一句話都是：「喔，那個沒做完的。」",
    ],
  },
  {
    when: (c) => c.won && c.summary.stage === "reelection",
    headline: [2, ["連任八年的市長", "坐滿兩任的市長", "做滿八年的市長"]],
    text: () => [
      "連任那晚，你在競選總部的台上哭了。八年任期到底那天，市府員工送你一本相簿，裡面最多的是剪綵照。",
      "第二任的最後一天，你在市長室坐到很晚。桌上的名牌明天就要換掉，你把它拍了一張照，沒有發到網路上。",
      "八年過去，你成了這座城市裡最有名、也最常被罵的人。卸任那天，有人在市府門口放鞭炮，你分不清是歡送還是慶祝。",
    ],
  },
  {
    when: (c) => c.won && c.summary.stage === "successor",
    headline: [2, "成功交棒的老市長"],
    text: () => [
      "接班人當選了。交接典禮上接班人說「站在巨人的肩膀上」，記者寫的是「新人新氣象」。",
      "接班人勝選那晚，第一個感謝的是你。半年後，市府新聞稿裡已經找不到你的名字。",
    ],
  },
  {
    when: (c) => c.summary.stage === "successor",
    text: () => [
      "你力挺的接班人輸了。新市長上任第一週，就宣布要「全面檢討前朝政策」。",
      "接班人敗選那晚，鏡頭一直對著站在後排的你。隔天的標題是：「老市長的時代結束了」。",
    ],
  },
  {
    when: (c) => c.won,
    headline: [1, "第一次當選的市長"],
    text: () => "開票那晚，鞭炮放了二十分鐘。你在台上說「這是全體市民的勝利」，台下的樁腳在算誰的功勞比較大。",
  },
  {
    when: (c) => c.served,
    headline: [1, "只做一任的市長"],
    text: () => [
      "連任失敗那晚，你很早就關了手機。卸任那天，辦公室的紙箱只裝了三箱，其中一箱是沒送出去的競選小物。",
      "你成了這座城市少數只做一任的市長。交接那天，新市長和你握手的時間，剛好夠記者拍一張照片。",
      "敗選感言你只講了兩分鐘。走下台時，你聽到有人小聲說：「四年前不是這樣的。」",
    ],
  },
  {
    when: (c) => c.summary.election.probability >= 0.4,
    text: () => [
      "你只差一點。落選感言講到一半，支持者喊「四年後再來」，你笑了，但沒有答應。",
      "開票到最後一個小時，你還領先。後來的那幾個百分點，你在腦子裡重算了好幾年。",
    ],
  },
  {
    when: always,
    text: () => [
      "你落選了。競選總部的看板在一週內拆完，有一面被附近的檳榔攤拿去擋雨。",
      "開票不到兩個小時，對手就宣布當選。你的競選總部裡，便當還有一半沒發完。",
      "你落選了，差距大到沒有人提「重新驗票」。隔天早上，你一個人去把競選總部的鐵門拉下來。",
    ],
  },
];

const MONEY: Fragment[] = [
  {
    when: (c) => c.has("loan-defaulted"),
    headline: [5, ["為了選舉傾家蕩產的人", "把房子押進票匭的人"]],
    text: () => [
      "選完之後，銀行的人比記者先到。房子被拍賣，你搬回老家，跟爸媽擠一間。偶爾有人在菜市場認出你，問你：「那時候花那麼多錢，值得嗎？」",
      "法院的查封公告貼在你家門口，就貼在當年競選貼紙的旁邊。銀行催收的電話，比當年的拜票電話還多。",
    ],
  },
  {
    when: (c) => c.state.loanTaken && c.state.funds <= 200,
    headline: [3, "把積蓄押上選舉的人"],
    text: () => [
      "貸款最後是還清了，但你的存款也歸零了。你開始在網路上接講座，題目是「我在選舉中學到的事」，一場三千元。",
      "你還清了貸款，也賣掉了車。現在你搭公車上班，偶爾會在站牌旁看到自己當年的政見。",
    ],
  },
  {
    when: (c) => c.state.funds >= 3000,
    text: (c) => [
      `競選帳戶還剩 ${c.state.funds.toLocaleString()} 萬。依法要繳庫或捐給政黨，你看著這個數字想：早知道就多辦幾場造勢。`,
      `選完你才發現帳戶裡還有 ${c.state.funds.toLocaleString()} 萬沒花。會計問要怎麼處理，你想了很久，說：「下次再說。」`,
    ],
  },
  {
    when: (c) => c.served && c.state.stats.treasury <= 25,
    text: () => [
      "你留下的市庫只剩一個零頭。下一任市長的第一場記者會，標題是「前朝留下的爛攤子」。",
      "審計報告出爐那天，市府的負債創了新高。你的名字出現在報告的第一頁。",
    ],
  },
  {
    when: (c) => c.served && c.summary.leftovers.length > 0,
    text: (c) => [
      `你留下了 ${c.summary.leftovers.length} 筆還沒爆開的帳。它們會在下一任市長的任期裡，一筆一筆浮上來。`,
      `你任內埋下的 ${c.summary.leftovers.length} 個問題還沒爆開。接手的人第一年就會發現，然後開記者會。`,
    ],
  },
  {
    when: (c) => c.state.funds <= 300,
    text: () => [
      "競選經費花到最後一塊錢。謝票車隊的油錢，是你自己刷卡付的。",
      "選完那天，競選帳戶只剩一個零頭。幕僚的最後一個月薪水，你分了兩次才發完。",
      "最後一週的造勢把錢燒光了。選後你一家一家打電話給廠商，請他們再寬限一個月。",
      "競選總部退租那天，房東扣了押金修牆上的膠帶痕跡。那是你這場選戰最後一筆支出。",
    ],
  },
  {
    when: always,
    text: () => [
      "競選帳目結算完，剛好打平。會計把最後一張收據交給你，說：「下次如果還要選，記得早點開始募款。」",
      "你把競選收支報告送到監察院，厚厚一疊。承辦人員翻了兩頁，說：「很少看到記這麼清楚的。」",
      "帳戶裡剩下的錢，剛好夠辦一場感謝餐會。來的人比造勢晚會少很多，但每個人你都叫得出名字。",
    ],
  },
];

const CONSCIENCE: Fragment[] = [
  {
    when: (c) => c.has("used-tragedy"),
    headline: [5, ["在槍聲裡拉票的人", "把悲劇變成選票的人"]],
    text: () => [
      "選前之夜那場「祈禱」，後來被剪成一支影片，標題是〈他們怎麼利用一場悲劇〉。受傷的那位搭檔出院後，再也沒有接你的電話。",
      "你常說那晚是為傷者祈禱。只有你自己知道，那天台下的歡呼聲讓你鬆了一口氣。",
    ],
  },
  {
    when: (c) => c.has("fake-poll"),
    text: () => [
      "封關前那份「領先」的民調，選後被記者查出樣本數只有兩百多人。民調公司改了名字，繼續接案。",
      "你放出去的那份民調，後來成了傳播系的教材，章節名稱叫〈選前十天的數字遊戲〉。",
    ],
  },
  {
    when: (c) => c.has("thesis-fight"),
    text: () => "論文官司打了五年，你最後還是輸了。學位被撤銷那天，新聞只有一小格，比當年的爆料小很多。",
  },
  {
    when: (c) => c.scandals >= 2 || (c.legalRisks >= 3 && c.state.stats.integrity <= 35),
    headline: [6, ["被起訴的前候選人", "從選舉公報走進起訴書的人"]],
    text: () => [
      "選後第三個月，檢察官上門了。你在法院門口對鏡頭說「相信司法會還我清白」，案子一審判了三年。以前搶著跟你合照的人，現在說「不太熟」。",
      "起訴書有兩百多頁，你的名字出現了四百多次。開庭那天，旁聽席坐滿了記者，沒有一個是你的支持者。",
    ],
  },
  {
    when: (c) => c.state.stats.integrity <= 25,
    headline: [4, "昧著良心贏得掌聲的人"],
    text: () => [
      "那些交換、那些說好不說的事，後來陸續被翻出來。網路上有人整理出你的「髮夾彎全集」，播放次數比你任何一支政見影片都高。",
      "你答應過的事，有一半不能說；不能說的那一半，後來都被別人說出來了。你的名字成了一個形容詞。",
    ],
  },
  {
    when: (c) => c.state.stats.integrity <= 40 && c.won,
    text: () => [
      "你贏了，但有幾個晚上睡不著。你告訴自己：大家都這樣做，不這樣做就輸了。",
      "慶功宴上大家都在乾杯。你看著那些曾經跟你談過條件的人，突然很想早點回家。",
    ],
  },
  {
    when: (c) => c.state.stats.integrity >= 75 && !c.won,
    headline: [3, ["輸了選舉、沒輸掉自己的人", "清清白白落選的人", "沒拿那筆錢的候選人"]],
    text: () => [
      "你沒有拿那筆錢，也沒有答應那些條件。有人說你太天真；也有一群年輕人寫信給你，說因為你，他們第一次去投票。",
      "你輸了，但輸得很乾淨。幾年後，一位當年的對手陣營幕僚私下跟你說：「其實我們那時候很怕你。」",
    ],
  },
  {
    when: (c) => c.state.stats.integrity >= 75,
    text: () => [
      "你堅持了幾件不討好的事。多年後，有記者回頭查你的帳目，發現乾乾淨淨，反而寫不出新聞。",
      "你沒有讓任何人失望到底，也沒有讓任何人滿意到底。這在政治圈裡，已經算是一種成就。",
    ],
  },
];

// 一個人選完之後怎麼過：先看人脈，人脈沒有特別的故事時，改說這個人的個性
const PEOPLE: Fragment[] = [
  {
    when: (c) => c.has("unpaid-staff"),
    headline: [3, "欠了幕僚薪水的候選人"],
    text: () => [
      "選戰最後那幾個月的薪水，你過了兩年才還清。當年的幕僚在面試新工作時，被問到上一份工作，都只說「選舉」。",
      "欠薪的事後來上了勞動部的新聞稿。你補發了薪水，但那幾個熬夜做文宣的年輕人，再也沒有接過任何選舉的工作。",
    ],
  },
  {
    when: (c) => c.has("cross-strait-visit"),
    text: () => [
      "你在對岸那個機構門口的合照，每次選舉都會被翻出來一次。那幾億元的採購意向書，最後真正下單的不到三成。",
      "對岸的商會每年寄賀卡給你，比你自己黨部寄得還準時。",
    ],
  },
  {
    when: (c) => c.state.stats.team <= 25,
    text: () => [
      "當年的核心幕僚一個個離開。有人去了對手陣營，有人寫了一本書，第三章叫做「我在候選人身邊看到的事」。",
      "你的幕僚長在選後一週就換了工作。離職那天桌上留了一張紙條：「保重。」字寫得很用力。",
    ],
  },
  {
    when: (c) => !!c.state.character.formerParty,
    text: () => [
      "你換過黨。舊黨的人說你背叛，新黨的人始終不太信任你。每次開會，你都坐在最旁邊的位子。",
      "你的兩個前黨部都不太提你。維基百科上，你的黨籍那一欄被編輯了十七次。",
    ],
  },
  {
    when: (c) => c.state.stats.party <= 25,
    text: () => [
      "黨中央不再邀你站台。下一次選舉，你的名字沒有出現在任何一張文宣上。",
      "黨主席的新年賀卡寄到了每一位地方首長和候選人手上，除了你。",
    ],
  },
  {
    when: (c) => c.state.stats.business >= 70,
    text: () => [
      "選後你進了一家建設公司當顧問，辦公室就在那塊新的重劃區裡。沒有人覺得意外。",
      "幾家大企業爭著請你當董事。你挑了待遇最好的那家，它剛好也是你選戰中最大的金主。",
    ],
  },
  {
    when: (c) => c.state.stats.media >= 75 && c.state.stats.achievement <= 45,
    text: () => [
      "你的粉專還有幾十萬人追蹤。你開始開箱美食、直播打電動，留言最多的是「當年說的捷運呢？」",
      "你成了網紅。業配一支比當年的月薪還多，但每支影片底下都有人問：「政見做到幾項了？」",
    ],
  },
  {
    when: (c) => c.served && c.state.stats.council <= 20,
    text: () => [
      "議會裡跟你吵最兇的那位議員，選後在臉書上寫了一篇長文。標題是〈終於〉。",
      "你和議會之間的帳，後來被寫成一篇碩士論文，題目是〈府會關係的崩壞〉。",
    ],
  },
  {
    when: (c) => c.state.stats.team >= 70,
    text: () => "你的團隊後來散布在各個城市的市府裡。他們開會時偶爾會說：「如果是老闆，會怎麼做？」",
  },
];

/** 資質專屬段落：人脈沒有特別故事時，用這個人的個性收尾 */
const TRAIT_LINES: Record<string, { headline?: string; text: (c: Ctx) => Text }> = {
  debater: {
    headline: "政論節目的常客",
    text: () => "你成了政論節目的常客，主持人最愛讓你最後一個發言。你很少輸過辯論，只是辯輸你的那些人，後來都選上了。",
  },
  grassroots: {
    text: () => "你還是習慣每天早上去市場繞一圈。攤販們不再叫你「候選人」，改叫你的名字，順手塞給你兩顆橘子。",
  },
  photogenic: {
    headline: "比政見更有名的臉",
    text: () => "你的照片被做成梗圖，在網路上流傳了好幾年。很少人記得你提過什麼政見，但每個人都記得你的笑容。",
  },
  "poor-speaker": {
    text: () => "多年後，你終於學會在三十秒內講完一個政策。上課的講師說：「早十年來就好了。」",
  },
  "policy-wonk": {
    text: () => "你把這些年的心得寫成一本政策白皮書，印了兩千本。一千八百本堆在倉庫裡，剩下的兩百本，有一本出現在對手的書架上。",
  },
  "veteran-admin": {
    text: () => "幾個局處的公文流程，至今還沿用你當年訂的版本。新來的科員不知道是誰訂的，只知道很好用。",
  },
  indecisive: {
    headline: "永遠在研議中的人",
    text: () => "記者回顧你的政治生涯，只用了三個字：「研議中」。你看到報導時想反駁，想了三天還沒決定怎麼回。",
  },
  unprepared: {
    text: () => "選戰中被問倒的那支影片，現在是政治系的上課教材。教授每年播放前都會說：「不要笑，你們以後也可能這樣。」",
  },
  organizer: {
    text: () => "你建立的動員網絡，後來被其他候選人整套借走。沒有人付錢，只有人送了一個花籃。",
  },
  fixer: {
    text: () => "地方上的大小糾紛，還是有人打電話來請你喬。你沒有頭銜了，但電話一通都沒少。",
  },
  "faction-shadow": {
    text: () => "派系大老在一次餐會上舉杯說：「當年要不是我們，哪有今天？」全桌都笑了，你也跟著笑。",
  },
  "gaffe-prone": {
    headline: "被失言定義的政治人物",
    text: () => "你那幾句失言被剪成鬼畜影片，播放次數破百萬。你終於在某件事上拿到了全國第一。",
  },
  principled: {
    text: () => "有人問你後不後悔那些堅持。你想了一下，說：「後悔的是，還有幾件沒堅持住。」",
  },
  opportunist: {
    headline: "政壇變色龍",
    text: () => "選後你又換了兩次立場。名嘴說你是「政壇變色龍」，你上節目時笑著接受了這個稱號，順便宣傳了新書。",
  },
  overconfident: {
    text: (c) =>
      c.won
        ? "你到處說那場勝利全靠自己。幕僚們互看一眼，沒有說話。"
        : "直到今天，你還是覺得那場選舉自己應該要贏。你在聚會上講了很多次，聽的人越來越少。",
  },
  "conflict-averse": {
    text: () => "那些你沒有正面回應的問題，後來都由別人回答了。答案你不太喜歡，但你也沒有反駁。",
  },
};

const PEOPLE_FALLBACK = [
  "選後，手機裡的群組一個個安靜下來。當年每天打來的人，現在只在你生日時傳一張長輩圖。",
  "選後你換了手機號碼。舊號碼最後一封簡訊是一家民調公司寄來的：「感謝您參與本次調查。」",
  "你偶爾還會夢到掃街。夢裡每個人都跟你握手，醒來時右手還有點痠。",
];

// 家庭與個人：先看先天包袱，再看這一局的節奏
const FAMILY: Fragment[] = [
  {
    when: (c) => c.has("burden-family-conflict"),
    headline: [4, ["事業與家族一起崩塌的人", "選戰打完、家族也散了的人"]],
    text: () => [
      "家族企業的案子在選戰中被翻了出來。選後，兄弟為了誰該負責吵到上法院，過年的團圓飯從此只剩你和媽媽兩個人。",
      "親戚的標案被一件件查出來。家族群組從每天問安，變成每天轉貼律師的聯絡方式。",
    ],
  },
  {
    when: (c) => c.has("burden-dynasty"),
    text: (c) =>
      c.won
        ? "家族的牌匾上又多了一個名字。你的孩子在學校被問：「你以後也要選市長嗎？」孩子沒有回答。"
        : "你是家族第一個輸掉選舉的人。祖父的照片掛在客廳，你經過時總是不太敢抬頭。",
  },
  {
    when: (c) => c.has("burden-tycoon-family"),
    text: () => [
      "家裡的公司在你參選期間被盯得很緊，股東會上有人說：「這場遊戲玩夠了沒？」",
      "家族公司的股價在你參選期間跌了一成。選後你回公司上班，會議室裡沒有人問你選舉的事。",
    ],
  },
  {
    when: (c) => c.has("burden-celebrity-family"),
    text: () => [
      "八卦週刊比政治版更關心你。選後，你的另一半上了談話節目，主題是「當政治人物另一半的那些年」。",
      "狗仔在你家樓下守了一整個選戰。選後他們撤了，你反而有點不習慣。",
    ],
  },
  {
    when: (c) => c.has("burden-activist-network"),
    text: () => [
      "當年一起上街的朋友，有人說你變了，有人說你沒變。他們聚會時還是會找你，只是不再讓你坐主桌。",
      "社運圈的老朋友在臉書上寫了一篇〈我們曾經相信的那個人〉。按讚的人裡面，有幾個是你的前幕僚。",
    ],
  },
  {
    when: (c) => c.has("burden-old-controversy"),
    text: () => "那件舊事最後還是沒有被忘記。它被收進某本台灣政治史的註腳，你的名字用的是全名。",
  },
  {
    when: (c) => c.has("burden-lone-wolf"),
    text: () => "從頭到尾你都是一個人。選後的第一個早上，沒有行程、沒有幕僚、沒有電話，你才發現自己已經很久沒有好好吃一頓早餐。",
  },
  {
    when: (c) => c.served && c.years >= 8,
    headline: [3, "把家留在市府之外的人"],
    text: () => "八年裡，你錯過了孩子的畢業典禮、父親的手術、每一個結婚紀念日。卸任那天回到家，客廳的沙發已經換過兩次了。",
  },
  {
    when: (c) => c.served,
    text: () => [
      "四年來，你在家吃晚餐的次數兩隻手數得出來。孩子的聯絡簿上，家長簽名都是另一半的筆跡。",
      "你的另一半說，這四年像是跟一張競選看板結婚。卸任後第一個週末，你們去看了一場電影，你看到一半就睡著了。",
    ],
  },
  {
    when: always,
    text: () => [
      "選後你終於回家吃了一頓晚飯。家人什麼都沒問，只是多煮了一道你愛吃的菜。",
      "選戰那幾個月，孩子學會了自己搭公車上學。選後你說要接送，孩子說：「不用了，習慣了。」",
      "你的爸媽把那面「凍蒜」旗子摺好，收進衣櫃最上層，跟你小時候的獎狀放在一起。",
    ],
  },
];

/** 城市專屬段落：[做過市長, 沒做過市長] */
const CITY_LINES: Record<string, [string[], string[]]> = {
  tianlong: [
    [
      "天龍市的房價在你任內又漲了兩成。卸任後你想在市區租一間辦公室，看了三間就放棄了。",
      "多年後，天龍市的年輕人還是買不起房子。他們在網路上討論是哪一任市長的責任，你的名字排在第三。",
    ],
    [
      "選後你搬離了天龍市。不是因為輸了，是因為房租又漲了。",
      "天龍市的選舉很快被下一個新聞蓋過去。三個月後，已經有人在問：「那個誰，後來去哪了？」",
    ],
  ],
  xinlong: [
    [
      "每天早上，還是有幾十萬人擠在往天龍市的橋上。有人在車陣裡看到你當年的看板，還沒拆。",
      "你任內畫的捷運路線，有一半還在規劃。新龍市的通勤族每天經過那些工地圍籬，上面印的是下一任市長的名字。",
    ],
    [
      "你的看板在快速道路旁掛到隔年夏天，風吹日曬，最後只剩下「凍蒜」兩個字。",
      "新龍市太大了。選後你開車繞了一圈謝票，花了一整天，還有三個區沒去到。",
    ],
  ],
  airplane: [
    [
      "航空城的抗議布條還掛在原地，只是換了一批人在綁。",
      "你任內喊的「讓城市起飛」，最後只有機場的飛機真的起飛了。徵收戶的官司還在打。",
    ],
    [
      "選後你經過機場，飛機一架架起飛。你想起自己的競選口號：「讓城市起飛」。",
      "飛機城的工業區照常運轉，夜班的工人們大多不知道曾經有你這個候選人。",
    ],
  ],
  mama: [
    [
      "隔年遶境，你排在扶轎隊伍的很後面。宮廟主委笑著說：「今年換人扶前面了。」",
      "媽媽市的派系大老換了一輪，餐會上的主桌也換了一輪。你被安排在靠近廁所的那一桌。",
    ],
    [
      "選後你去廟裡還願。主委說：「媽祖有保庇，只是保庇的是別人。」",
      "媽媽市的宮廟主委們在選後的餐會上聊起你，評語只有一句：「人不錯，可惜沒人罩。」",
    ],
  ],
  gudu: [
    [
      "古都的老街又多了三家文青咖啡，少了兩家老店。導覽員講到那段拆遷時，會順便提起你的名字。",
      "你任內保下來的那棟老房子，後來變成網美打卡點。門口的解說牌上，沒有提到是誰保下來的。",
    ],
    [
      "你回到老城區的巷子裡，阿婆認出你，塞給你一碗豆花：「選輸沒要緊，吃甜的。」",
      "古都市的人很念舊。選後好幾年，還有人在廟口跟你說：「上次我有投你喔。」你不確定是不是真的。",
    ],
  ],
  gangdu: [
    [
      "港口的起重機還在，年輕人還是北上。過年回鄉的車潮裡，有人說：「這城市好像有變，又好像沒有。」",
      "你任內辦的那幾場大型活動，被市府觀光局寫進了簡報。簡報的最後一頁，是下一任市長的照片。",
    ],
    [
      "選後你在港邊坐了一個下午。一個北漂回鄉的年輕人認出你，說自己那天有特地回來投票，投給了你的對手。",
      "港都市的選戰一向很熱。選後三天，街上的旗子都收了，只剩海風還是一樣大。",
    ],
  ],
};

/** 這一局最值得回頭看的那個選擇，多年後怎麼被記得 */
function keyEventText(item: ReflectionItem, c: Ctx): string[] {
  const e = `「${item.eventTitle}」`;
  const o = `「${item.optionLabel}」`;
  if (item.kind === "principled") {
    return [
      `${e}那一回，你選擇了${o}，民調因此掉了 ${-item.approval}。幕僚說那是整場選戰最笨的決定；多年後，那是你唯一願意拿出來講的事。`,
      `有人問你這輩子最驕傲的決定是什麼。你說是${e}那一回，你選了${o}。問的人想了想：「那一次你不是掉了很多票嗎？」`,
    ];
  }
  if (item.kind === "popular") {
    return [
      `大家記得你，多半是因為${e}。你選擇${o}的那一次，是你人氣最高的一刻，後來再也沒有超過。`,
      `多年後，計程車司機認出你，第一句話就是：「${item.eventTitle}那時候，你是不是選了『${item.optionLabel}』？」你點點頭，沒有說其他的事。`,
    ];
  }
  const perk = item.perk ? "用的是市府的資源，" : "";
  return [
    `多年後回頭看，最關鍵的是${e}那一回。你選擇了${o}，${perk}民調漲了 ${item.approval}。當時沒人追究；後來每次有人質疑你，都會先提起這件事。`,
    `記者寫你的人物專訪時，翻出了${e}的舊新聞。你當年選擇${o}，換到了掌聲，也換到了這篇專訪的標題。`,
    c.won
      ? `你常想起${e}那天。如果沒有選${o}，你還會贏嗎？你不確定，但你知道那一刻自己猶豫過。`
      : `你常想起${e}那天。你選了${o}，最後還是沒有贏。有些交換，換到的比想像中少。`,
  ];
}

/** 依 seed 與段落編號挑版本，同一局重新整理不會變 */
function variant(texts: Text, seed: number, slot: number): string {
  if (typeof texts === "string") return texts;
  let h = Math.imul((seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return texts[h % texts.length];
}

function first(list: Fragment[], c: Ctx): Fragment | undefined {
  return list.find((f) => f.when(c));
}

export function buildEpilogue(state: GameState, events: GameEvent[], summary: GameSummary): Epilogue {
  const incumbent = state.flags.includes("bg-incumbent");
  const served = incumbent || !!state.firstElection?.won;
  const legalRisks = state.history.filter((h) =>
    events.find((e) => e.id === h.eventId)?.options.find((o) => o.id === h.optionId)?.legalRisk,
  ).length;
  const c: Ctx = {
    state,
    summary,
    won: summary.election.won,
    served,
    years: !served ? 0 : summary.stage === "successor" || (summary.election.won && summary.stage === "reelection") ? 8 : 4,
    legalRisks,
    scandals: state.crisisLog.filter((l) => SCANDALS.includes(l.id)).length,
    has: (f) => state.flags.includes(f),
  };
  const seed = state.seed;
  const headlines: [number, string][] = [];
  const paragraphs: string[] = [];
  const add = (f: Fragment | undefined, slot: number) => {
    if (!f) return;
    if (f.headline) headlines.push([f.headline[0], variant(f.headline[1], seed, slot + 10)]);
    paragraphs.push(variant(f.text(c), seed, slot));
  };

  add(first(CAREER, c), 0);

  // 關鍵抉擇：同時有「拿原則換選票」和「為原則放棄選票」時，依 seed 挑一個說
  const tempting = summary.reflection.find((r) => r.kind === "tempting");
  const principled = summary.reflection.find((r) => r.kind === "principled");
  const key = tempting && principled ? (seed % 2 ? principled : tempting) : (tempting ?? principled ?? summary.reflection[0]);
  if (key) {
    if (key.kind === "tempting" && key.perk && served) headlines.push([2, "把市府資源用在選舉上的人"]);
    paragraphs.push(variant(keyEventText(key, c), seed, 1));
  }

  add(first(MONEY, c), 2);
  add(first(CONSCIENCE, c), 3);

  const people = first(PEOPLE, c);
  if (people) add(people, 4);
  else {
    const traits = (state.character.profile?.traits ?? []).filter((t) => TRAIT_LINES[t]);
    const trait = traits.length ? TRAIT_LINES[traits[seed % traits.length]] : undefined;
    if (trait) {
      if (trait.headline) headlines.push([1, trait.headline]);
      paragraphs.push(variant(trait.text(c), seed, 4));
    } else paragraphs.push(variant(PEOPLE_FALLBACK, seed, 4));
  }

  add(first(FAMILY, c), 5);

  const city = CITY_LINES[state.character.profile?.city ?? ""];
  if (city) paragraphs.push(variant(city[served ? 0 : 1], seed, 6));
  else if (!served) paragraphs.push("你的幾個政見，後來被當選的對手換了名字推出。記者會上沒有人提起你。");

  // 同分時保留先加入的（依段落順序）
  const headline = headlines.reduce<[number, string] | undefined>((best, h) => (!best || h[0] > best[0] ? h : best), undefined);
  return {
    headline:
      headline?.[1] ??
      variant(served ? ["做過一任市長的人", "市長名單上的一行字"] : ["參選過市長的人", "選舉公報上的一個名字", "差點成為市長的人"], seed, 20),
    paragraphs,
  };
}
