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

// ===== バリエーション生成（「文章バリエーション生成」ボタン用） =====

function makeXVariations(trend, context) {
  const topic = trend.title;
  const a = audience(context);
  const n = niche(context);
  return [
    {
      angle: "問題提起型",
      hook: "なぜいま見るべきか",
      draft: `${topic}、表面の話題より「誰の行動が変わるか」が本質です。\n${a}にとっての影響を、公式情報を根拠に3点に分けて整理します。\n1) 直近の変化  2) ${n}への影響  3) すぐ試せる検証`,
      hashtags: hashtags(topic, context).slice(0, 3)
    },
    {
      angle: "実験報告型",
      hook: "実際に試した結果",
      draft: `${topic}を${n}の現場で実際に試した結果、効いたのは「${a}が判断材料にできる粒度まで落とす」ことでした。\n小さく試した手順と、再現しやすいポイントを共有します。`,
      hashtags: hashtags(topic, context).slice(0, 3)
    },
    {
      angle: "失敗回避型",
      hook: "やりがちな落とし穴",
      draft: `${topic}に飛びつく前に、${n}でやりがちな失敗3つ。\n・公式情報を確認せず憶測で動く\n・流行り言葉だけ取り入れる\n・自分のアカウントの文脈を無視する\n冷静に判断材料を揃えましょう。`,
      hashtags: hashtags(topic, context).slice(0, 3)
    },
    {
      angle: "比較整理型",
      hook: "従来とどう違うか",
      draft: `${topic}は、これまでのやり方と何が違うのか。\n${a}の視点で、変わる点・変わらない点・置き換わる点の3つに整理しました。\n判断は「自分の前提に当てはまるか」だけで十分です。`,
      hashtags: hashtags(topic, context).slice(0, 3)
    }
  ];
}

function makeInstagramVariations(trend, context) {
  const topic = trend.title;
  const a = audience(context);
  const n = niche(context);
  return [
    {
      angle: "結論先出し型",
      hook: `${topic}、結論からいうと…`,
      beats: [
        "0-3秒: 結論を大きく1文で表示",
        `3-10秒: ${a}に関係する変化だけ抜き出す`,
        "10-22秒: 公式情報の引用と、注意点",
        "22-30秒: 今日試せる行動を1つに絞る"
      ],
      caption: `${topic}を${stance(context)}視点で。結論はキャプションでなく動画冒頭に。`,
      hashtags: hashtags(topic, context)
    },
    {
      angle: "ストーリー型",
      hook: `${topic}を試したら、見えた景色が変わった。`,
      beats: [
        "0-3秒: 失敗していた頃の映像/画像",
        `3-12秒: ${n}の現場で起きた具体的な出来事`,
        "12-22秒: ${topic}を取り入れて変わったこと",
        "22-30秒: 真似できる手順を1つだけ"
      ],
      caption: `${topic}は、知識ではなく体験で語ると伝わります。`,
      hashtags: hashtags(topic, context)
    },
    {
      angle: "リスト型",
      hook: `${topic}で${a}が押さえるべき3つ。`,
      beats: [
        "0-3秒: タイトルと「3つ」を強調",
        "3-12秒: ポイント①と1秒の根拠",
        "12-22秒: ポイント②と1秒の根拠",
        "22-30秒: ポイント③と「保存して試す」誘導"
      ],
      caption: `${topic}を最短で理解する3点。保存して、明日試してください。`,
      hashtags: hashtags(topic, context)
    },
    {
      angle: "誤解解消型",
      hook: `${topic}、よく聞く誤解はこれ。`,
      beats: [
        "0-3秒: 誤解を1文で大きく",
        "3-12秒: なぜそう見えるかの説明",
        "12-22秒: 公式情報での実際の事実",
        "22-30秒: ${a}が今日取るべき行動"
      ],
      caption: `${topic}を「煽り」ではなく「事実」で扱う。これが${stance(context)}。`,
      hashtags: hashtags(topic, context)
    }
  ];
}

function makeNoteVariations(trend, context) {
  const topic = trend.title;
  const a = audience(context);
  const n = niche(context);
  return [
    {
      angle: "深掘り解説型",
      title: `「${topic}」を${n}の視点で深く読む: 公式情報・現場感・実装の3階層`,
      outline: [
        "導入: なぜ${a}が今これを見るべきか",
        "公式情報・一次情報での裏取り",
        `${n}の現場で何が変わるか（自分の体験）`,
        "再現可能な実装ステップ",
        "今日から試せるチェックリスト"
      ],
      lead: `${topic}を、煽りや表面でなく${stance(context)}視点で整理します。`
    },
    {
      angle: "比較検証型",
      title: `「${topic}」vs 従来手法: ${a}の判断軸で並べてみた`,
      outline: [
        "比較する3つの軸を最初に明示",
        "従来手法の前提と実績",
        `${topic}が変える前提と、変わらない部分`,
        "切り替える条件、見送る条件",
        "${n}の文脈での具体的な判断例"
      ],
      lead: `${topic}は、すべてを置き換えるものではありません。比較で見たほうが判断が早くなります。`
    },
    {
      angle: "失敗から学ぶ型",
      title: `「${topic}」で${n}が陥りがちな失敗5パターンと、回避策`,
      outline: [
        "失敗パターン①と、起きた理由",
        "失敗パターン②と、見抜き方",
        "失敗パターン③と、現場での対処",
        "失敗パターン④⑤を簡潔に",
        `${a}が明日から避けるためのチェックリスト`
      ],
      lead: `${topic}は強力ですが、${n}の現場では同じ失敗が繰り返されています。再現性のある回避策を共有します。`
    },
    {
      angle: "実装手順型",
      title: `「${topic}」を${n}に取り入れる: 30日プラン`,
      outline: [
        "前提と必要なもの",
        "1〜7日目: 公式情報の理解と環境準備",
        "8〜14日目: 小さな試行と数値の取得",
        "15〜21日目: ${a}向けの仮実装と検証",
        "22〜30日目: 本実装と運用ルール化"
      ],
      lead: `${topic}は導入してからが本番。${stance(context)}で、30日の具体プランに落とし込みます。`
    }
  ];
}

export function generateVariations(trends, context = {}) {
  return trends.map((trend) => ({
    trend,
    variations: {
      x: makeXVariations(trend, context),
      instagram: makeInstagramVariations(trend, context),
      note: makeNoteVariations(trend, context)
    }
  }));
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
