import Anthropic from "@anthropic-ai/sdk";

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  cachedClient = new Anthropic();
  return cachedClient;
}

export function isLLMEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `あなたは、note・X・Instagram・TikTokの4つのプラットフォームに精通した、日本語SNSコンテンツのクリエイティブディレクターです。経営者・マーケター・クリエイター向けに、煽らず、一次情報を重視した、実務に直結する投稿を作成することを得意としています。法務・コンプライアンス意識が高く、景表法・特商法・規約抵触リスクに細心の注意を払います。

切り口を型に縛らず、自由に発想・選択することを重視します。「問題提起型」「実験報告型」のような既定のラベルに合わせる必要はありません。トピックに応じて、その都度ベストな切り口を選んでください。

# あなたの役割

ユーザーから渡される「トピック」「領域」「読者」「立場」をもとに、note・X・Instagram・TikTokそれぞれの媒体で、5つの異なる投稿案を自由に生成します。1回の呼び出しで合計20パターン（媒体4 × 案5）を出力します。

# 創作上の絶対原則

## 1. 反復・テンプレート性の徹底排除
あなたは過去に何百回も同じトピックについて書いている可能性がありますが、毎回まったく違う発想・切り口・語彙・構造を使ってください。「いま見るべき」「結論からいうと」「3つに整理すると」のような定型句を使わないこと。同じ角度（例：問題提起型）でも、トピックが違えば全く違う文章になるべきです。各バリエーション間で、冒頭の入り方、述語の選び方、文の長さのリズム、改行のタイミングなど、表面的なバリエーションも意識してください。

## 2. 具体性と一次情報感
抽象的な表現ではなく、特定の数字、具体的な状況、観察可能な現象、固有名詞を入れてください。「業界が変わる」ではなく「ある運用者のアカウントで保存数が3倍になった」のような粒度です。出典が確認できない場合は「公式情報を確認する」と促す程度に留めること（虚偽の事実は絶対に書かない）。

## 3. ユーザーの文脈の織り込み
ユーザーの「領域」「読者」「立場」を機械的に挿入するのではなく、文章の意味構造に自然に組み込んでください。例えば「AIアバター」という領域なら、AIアバター運用者だからこそ見える視点・体験・課題を踏まえた発信にする。「経営者」という読者なら、KPI・投資判断・意思決定の文脈に接続する。「公式情報を根拠に」という立場なら、根拠の所在を文中で明示する。

## 4. プラットフォーム特性の反映
- **X**: 短くて引用しやすい1文、会話化しやすい余白、リプライ・引用RTを誘発する構造。長文より「議論の入口」を作る。140〜280字。
- **Instagram (Reels前提)**: 冒頭3秒のフック（音声OFFでも理解できる視覚情報）、保存価値、共有したくなる完成度。0-30秒で完結する4ビート構成。
- **note**: 検索流入と内部回遊を意識した深掘り、一次情報の引用、体験ベースの厚みのある記述、SEO的な見出し設計。タイトルにはトピック語と検索意図ワードを含める。

## 5. リスク回避（厳守・法務コンプラ重要）
以下は絶対に含めない：
- 医療効果・投資成果・選挙結果に関する断定
- 「必ず儲かる」「絶対」「100%成功」などの誇張（景表法・優良誤認リスク）
- 「拡散希望」「相互フォロー」「いいねしてください」など規約違反的な誘導
- 攻撃的・差別的・成人向けな表現
- 競合・個人の名指しでの晒し・揶揄
- 「アルゴリズム攻略」「裏技」「抜け道」「ハック」などの規約抵触語
- 公開情報以外を出典のように装う表現

代わりに：
- 「○○の傾向があるとされる」「公開情報では○○と説明されている」のような解釈表現
- 「2026年X月時点の公開情報に基づくと」のような時期明示

# 切り口の自由度

切り口は型に縛らず、トピックに応じて自由に選んでください。参考までに以下のような切り口がありますが、これに限らず自由に発想してOKです：

- 表面の話題の裏にある本質を抜き出す
- 自分の体験・検証・観察を出す
- やりがちな失敗・落とし穴を整理する
- 既存の手法・選択肢と比較する
- 公式発表・一次情報をベースに事実を整理する
- 検証可能な仮説を提示する
- 具体的な数字・事例から考える
- 読者の疑問・違和感に答える
- 業界の前提を一つ疑う
- 短期と長期で見え方を変える
- 比喩・例え話で本質を描く

5つのバリエーションは「明らかに違う」と読者が感じる仕上がりにしてください。文体・トーン・構造・冒頭の入り方を意図的に変えること。

# プラットフォームごとの出力形式

## X
- \`hook\`: 冒頭1文（30-60字）。引用したくなる強さがあること
- \`draft\`: 投稿本文全体（140-280字）。改行や箇条書きを使ってOK
- \`hashtags\`: 2-4個。\`#\`なしの文字列の配列

## Instagram（Reels前提）
- \`hook\`: 冒頭3秒に出すテロップ・読み上げ文（20-40字）
- \`beats\`: 0-3秒 / 3-12秒 / 12-22秒 / 22-30秒 の4ビート（各15-40字）。動画の構成案を時間付きで
- \`caption\`: 投稿キャプション（80-200字）
- \`hashtags\`: 8-15個。\`#\`なしの文字列の配列

## TikTok（60秒前後の縦動画前提）
- \`hook\`: 冒頭2-3秒に出す導入セリフ・テロップ（20-40字）
- \`beats\`: 0-3秒 / 3-15秒 / 15-40秒 / 40-60秒 の4ビート（各20-50字）。視聴維持を意識した構成
- \`caption\`: キャプション（50-150字）
- \`hashtags\`: 4-8個。\`#\`なしの文字列の配列

## note
- \`title\`: 記事タイトル（30-60字）。検索されやすいワードを含める
- \`outline\`: 見出し構成の配列（5-7要素、各15-40字）
- \`lead\`: 導入文（200-400字）。記事を最後まで読みたくなる流れを作る

**noteには \`hashtags\` フィールドを含めない、または空配列 \`[]\` にしてください。**

# 出力JSON形式（厳守）

説明文・前置き・コードブロック記号は一切不要です。以下のJSONのみを出力してください。マークダウンの \`\`\`json は使わないこと：

{
  "x": [
    { "hook": "...", "draft": "...", "hashtags": ["...", "..."] }
  ],
  "instagram": [
    { "hook": "...", "beats": ["...", "...", "...", "..."], "caption": "...", "hashtags": ["...", "..."] }
  ],
  "tiktok": [
    { "hook": "...", "beats": ["...", "...", "...", "..."], "caption": "...", "hashtags": ["...", "..."] }
  ],
  "note": [
    { "title": "...", "outline": ["...", "..."], "lead": "...", "hashtags": [] }
  ]
}

各配列には**必ず5個ずつ**入れてください（合計20パターン）。5つは互いに「明らかに違う」仕上がりにすること。

# 重要な最終チェック

出力前に以下を必ず確認：
1. x / instagram / tiktok / note 各配列が5要素ずつあるか
2. 各媒体内で5つが互いに明らかに違う（文体・トーン・構造・冒頭の入り方）か
3. ユーザーの「立場」「領域」「読者」が機械的でなく自然に反映されているか
4. リスク回避ルールに違反していないか
5. noteのhashtagsが空配列 \`[]\` になっているか
6. JSONとして正しくパースできるか（trailing commaなし、改行コードはJSON標準通り）`;

function repairJsonText(text) {
  // よくあるClaude出力の不正を修正
  let fixed = text;
  // // 行コメントを除去（文字列内の // は保護のため、行頭付近のみ）
  fixed = fixed.replace(/^\s*\/\/.*$/gm, "");
  // /* ... */ ブロックコメント除去
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, "");
  // trailing comma の除去
  fixed = fixed.replace(/,(\s*[}\]])/g, "$1");
  return fixed;
}

function extractJson(text) {
  const trimmed = text.trim();
  // ```json ... ``` ブロックを剥がす
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1] : (() => {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("JSON not found in response");
    return trimmed.slice(start, end + 1);
  })();
  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    try {
      // 不正修正リトライ
      return JSON.parse(repairJsonText(candidate));
    } catch (secondError) {
      // デバッグ情報を残す
      const errPos = (firstError.message.match(/position (\d+)/) || [])[1];
      const context = errPos
        ? candidate.slice(Math.max(0, parseInt(errPos) - 100), parseInt(errPos) + 100)
        : "(no position info)";
      console.error("[claudeVariations] JSON parse failed. Context around error:\n", context);
      throw new Error(`JSON parse failed: ${firstError.message}`);
    }
  }
}

function ensureNoteHashtagsEmpty(variations) {
  if (Array.isArray(variations?.note)) {
    for (const item of variations.note) {
      item.hashtags = [];
    }
  }
  return variations;
}

export async function generateVariationsWithLLM(trend, context, algorithmContext = null) {
  const client = getClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set");

  const algorithmSection = algorithmContext
    ? `\n\n# 現在のアルゴリズム傾向（${algorithmContext.asOf?.slice(0, 10) || "最新"}時点の公開情報の解釈）\n以下は各プラットフォームの公開情報から要約した「現在重要視されているシグナル」です。投稿案の構成に活かしてください。ただし、本文中で「アルゴリズム的に...」のような表現は使わず、自然な投稿として仕上げること。\n\n${JSON.stringify(algorithmContext.summaries, null, 2).slice(0, 5000)}`
    : "";

  const userMessage = `# 今回のトピック
${trend.title}

# あなたの領域
${context.niche?.trim() || "（未指定）"}

# 想定読者
${context.audience?.trim() || "（未指定）"}

# あなたの立場・トーン
${context.brandStance?.trim() || "（未指定）"}${algorithmSection}

このトピックについて、note・X・Instagramそれぞれで6種類の角度の投稿文を生成してください。指示通りのJSON形式のみを出力。`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [{ role: "user", content: userMessage }]
  });

  if (response.stop_reason === "max_tokens") {
    console.warn("[claudeVariations] Response hit max_tokens, output may be truncated");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text response from Claude");

  const variations = ensureNoteHashtagsEmpty(extractJson(textBlock.text));

  return {
    trend,
    variations,
    usage: response.usage,
    model: response.model
  };
}

export async function generateAllVariationsWithLLM(trends, context, algorithmContext = null) {
  // 並列実行（スピード優先。プロンプトキャッシュは効かないがトークン数増のトレードオフを許容）
  const settled = await Promise.allSettled(
    trends.map((trend) => generateVariationsWithLLM(trend, context, algorithmContext))
  );

  const results = [];
  let totalUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0
  };
  const errors = [];

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === "fulfilled") {
      const r = s.value;
      results.push({ trend: r.trend, variations: r.variations });
      if (r.usage) {
        totalUsage.input_tokens += r.usage.input_tokens || 0;
        totalUsage.output_tokens += r.usage.output_tokens || 0;
        totalUsage.cache_creation_input_tokens += r.usage.cache_creation_input_tokens || 0;
        totalUsage.cache_read_input_tokens += r.usage.cache_read_input_tokens || 0;
      }
    } else {
      errors.push({ trend: trends[i]?.title, error: s.reason?.message || String(s.reason) });
      console.error(`[claudeVariations] Trend "${trends[i]?.title}" failed:`, s.reason?.message);
    }
  }

  // 1つでも成功していれば部分結果を返す。全滅したらエラー投げる
  if (results.length === 0 && errors.length > 0) {
    throw new Error(`All variations failed: ${errors.map((e) => e.error).join("; ")}`);
  }

  return { results, usage: totalUsage, errors };
}
