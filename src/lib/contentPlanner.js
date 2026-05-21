import { normalizeText, tokenize, uniq } from "./utils.js";

function cleanHashtag(token) {
  return token
    .replace(/^#/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 24);
}

function hashtags(topic, context = {}) {
  const raw = uniq([
    ...tokenize(topic),
    ...tokenize(context.niche || ""),
    ...tokenize(context.audience || "")
  ]);
  return raw.map(cleanHashtag).filter((tag) => tag.length >= 2).slice(0, 5).map((tag) => `#${tag}`);
}

function stance(context = {}) {
  return context.brandStance?.trim() || "一次情報と公式情報を照合して、煽らずに実務目線で読む";
}

function audience(context = {}) {
  return context.audience?.trim() || "このテーマに関心のある読者";
}

function niche(context = {}) {
  return context.niche?.trim() || "自分の専門領域";
}

function makeXPlan(trend, context) {
  const topic = trend.title;
  return {
    platform: "X",
    objective: "返信と引用で論点を広げ、プロフィール遷移につなげる",
    draft: [
      `${topic}、いま見るべきポイントは「何が変わったか」より「誰の行動が変わるか」だと思う。${audience(context)}向けに、公式情報ベースで3つに分けると以下。`,
      `1. 直近の変化\n2. ${niche(context)}への影響\n3. 今日から試せる小さな検証\n\n煽りではなく、判断材料として整理します。`
    ].join("\n"),
    threadPlan: [
      "1投稿目: 変化の要点を1文で置く",
      "2投稿目: 公式ソースまたは一次情報を添える",
      "3投稿目: 自分の立場、反対意見、実験案を出す"
    ],
    cta: "違う見方がある人は、前提ごと教えてください。",
    hashtags: hashtags(topic, context).slice(0, 3)
  };
}

function makeInstagramPlan(trend, context) {
  const topic = trend.title;
  return {
    platform: "Instagram",
    objective: "冒頭3秒で文脈を作り、保存・シェアされる短尺解説にする",
    reelHook: `${topic}で、いま見落とされているポイント。`,
    beats: [
      "0-3秒: 結論を大きく表示",
      `3-10秒: ${audience(context)}に関係する変化だけを抜き出す`,
      "10-22秒: 公式情報、実例、注意点の順に見せる",
      "22-30秒: 今日試せる行動を1つに絞る"
    ],
    caption: `${topic}を${stance(context)}視点で整理しました。見た目の話題性だけでなく、実際に何が変わるかを確認してから使うのが大事です。`,
    storyFollowup: "ストーリーで二択アンケート: すでに試した / これから試す",
    hashtags: hashtags(topic, context)
  };
}

function makeNotePlan(trend, context) {
  const topic = trend.title;
  return {
    platform: "note",
    objective: "検索流入とnote内トピック推薦に乗る、一次情報入りの深掘り記事にする",
    title: `「${topic}」を${niche(context)}の視点で読む: 変化・影響・試すこと`,
    outline: [
      "導入: なぜ今この話題を見るべきか",
      "公式情報・一次情報で確認できること",
      `${niche(context)}に起きる具体的な変化`,
      "自分の体験・検証・現場感",
      "読者が今日試せるチェックリスト"
    ],
    lead: `${topic}が話題になっています。ただ、表面的な盛り上がりだけを追うと判断を誤りやすいので、${stance(context)}という前提で整理します。`,
    tags: hashtags(topic, context)
  };
}

function safetyChecklist(trend) {
  const checklist = [
    "公式発表、一次情報、日付を確認する",
    "断定を避け、推測は推測として分ける",
    "過度な煽り、晒し、相互フォロー誘導を入れない"
  ];
  if (trend.risk?.riskHits?.length) {
    checklist.unshift(`要注意語: ${trend.risk.riskHits.join(", ")}`);
  }
  return checklist;
}

export function buildContentPlans(scoredTrends, context = {}, limit = 8) {
  return scoredTrends.slice(0, limit).map((trend) => {
    const bestPlatform = Object.entries(trend.platformScores)
      .sort((a, b) => b[1] - a[1])[0][0];
    return {
      trend,
      bestPlatform,
      plans: {
        x: makeXPlan(trend, context),
        instagram: makeInstagramPlan(trend, context),
        note: makeNotePlan(trend, context)
      },
      action: {
        publishOrder: bestPlatform === "note"
          ? ["note", "Xで要約スレッド", "Instagramで図解Reel"]
          : bestPlatform === "instagram"
            ? ["Instagram Reel", "Xで論点化", "noteで詳細版"]
            : ["Xで論点テスト", "noteで深掘り", "Instagramで保存版"],
        experiment: [
          "A案: 公式情報を先に出す",
          "B案: 自分の体験を先に出す",
          "C案: 読者の悩みを先に出す"
        ],
        safetyChecklist: safetyChecklist(trend)
      },
      normalizedTopic: normalizeText(trend.title)
    };
  });
}
