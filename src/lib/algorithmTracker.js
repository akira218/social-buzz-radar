import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { rootDir } from "./utils.js";

const SOURCES = [
  {
    platform: "x",
    label: "X (xAI公式)",
    urls: [
      { name: "x-algorithm README (旧twitter)", url: "https://raw.githubusercontent.com/twitter/the-algorithm/main/README.md" },
      { name: "xAI x-algorithm README", url: "https://raw.githubusercontent.com/xai-org/x-algorithm/main/README.md" },
      { name: "Phoenix README", url: "https://raw.githubusercontent.com/xai-org/x-algorithm/main/phoenix/README.md" }
    ]
  },
  {
    platform: "instagram",
    label: "Instagram (Meta公式 + Mosseri氏発信)",
    urls: [
      { name: "Feed Ranking System Card", url: "https://ai.meta.com/tools/system-cards/instagram-feed-ranking/" },
      { name: "Explore Engineering", url: "https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/" },
      { name: "Creators公式 (Mosseri氏発信ハブ)", url: "https://creators.instagram.com/" },
      { name: "Instagram Ranking Explained (Mosseri公式記事)", url: "https://about.instagram.com/blog/announcements/instagram-ranking-explained" }
    ]
  },
  {
    platform: "tiktok",
    label: "TikTok (公式)",
    urls: [
      { name: "TikTok Newsroom", url: "https://newsroom.tiktok.com/en-us" },
      { name: "Creative Center インスピレーション", url: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en" },
      { name: "How TikTok Recommends Content", url: "https://newsroom.tiktok.com/en-us/how-tiktok-recommends-content" }
    ]
  },
  {
    platform: "note",
    label: "note (公式)",
    urls: [
      { name: "レコメンド刷新発表", url: "https://note.jp/n/nce2c203cc6fb" },
      { name: "システム設計", url: "https://note.jp/n/nce0a239e3c40" },
      { name: "舞台裏記事", url: "https://note.jp/n/nf016d2c0bc2f" }
    ]
  }
];

const CACHE_PATH = "data/algorithm-summary.json";
const SNAPSHOT_DIR = "data/algorithm-snapshots";
const CHECK_INTERVAL_HOURS = 24;
const FETCH_TIMEOUT_MS = 15000;

let cachedClient = null;
function getLlmClient() {
  if (cachedClient) return cachedClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  cachedClient = new Anthropic();
  return cachedClient;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; social-buzz-radar/0.1; algorithm-tracker)",
        accept: "text/html,application/xhtml+xml,text/markdown,*/*",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8",
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Vercel KV が利用可能ならそちらを優先、ない場合はファイルベース
const KV_KEY = "algorithm-summary:latest";

async function tryGetKvClient() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const mod = await import("@vercel/kv");
    return mod.kv;
  } catch {
    return null;
  }
}

async function loadCache() {
  const kv = await tryGetKvClient();
  if (kv) {
    try {
      return await kv.get(KV_KEY);
    } catch (error) {
      console.warn("[algorithm-tracker] KV read failed:", error.message);
    }
  }
  // ファイルベースフォールバック（ローカル開発用）
  try {
    const text = await readFile(path.join(rootDir, CACHE_PATH), "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function saveCache(data) {
  const kv = await tryGetKvClient();
  if (kv) {
    try {
      await kv.set(KV_KEY, data);
      return;
    } catch (error) {
      console.warn("[algorithm-tracker] KV write failed:", error.message);
    }
  }
  // ファイルベースフォールバック
  try {
    await mkdir(path.join(rootDir, "data"), { recursive: true });
    await writeFile(path.join(rootDir, CACHE_PATH), JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn("[algorithm-tracker] file write failed:", error.message);
  }
}

async function loadStaticAnalysis() {
  try {
    return await readFile(path.join(rootDir, "docs/algorithm-analysis.md"), "utf8");
  } catch {
    return null;
  }
}

const SUMMARY_SYSTEM_PROMPT = `あなたは、SNSアルゴリズム研究の専門家で、上場準備中の企業のコンプライアンス文化に精通しています。X (xAI)、Instagram (Meta)、TikTok、note各社の公式ドキュメントを読み、SNSコンテンツ作成者が今知るべき「実務に効く要点」を抜き出す役割を担います。

# あなたの仕事
渡された複数の公式ソース（GitHub README、System Card、公式発信、Newsroom等）を読んで、各プラットフォームについて指定のJSON形式でまとめます。

# 絶対遵守ルール（法務・コンプラ）

## 1. 著作権・引用ルール
- **15語超の逐語引用は絶対に避ける**（必ず自分の言葉に書き換える）
- ソースの主張を要約・解釈する形にする
- 一段落をそのままコピーすることは絶対NG

## 2. 出典明記必須
- 各要点には根拠となるソース名を内包させる
- 例: "Mosseri氏が公開記事で言及している通り..." のように出典を文中に織り込む

## 3. 時期の明示必須
- 各プラットフォームの要約に「2026年X月時点」「直近の公式発信によれば」など時期表現を必ず含める
- 「現時点の公開情報に基づく解釈」であることを明示

## 4. 断定表現の禁止（景表法・優良誤認回避）
- ❌「○○すれば必ず伸びる」「○○は確実に効果あり」「100%」「絶対」
- ✅「○○の傾向があるとされる」「公式情報では○○と説明されている」「○○が重要視されているとされる」

## 5. 規約抵触表現の禁止
- ❌「アルゴリズム攻略」「抜け道」「裏技」「ハック」「グロースハック」
- ✅「公開情報に基づく投稿設計」「公式仕様を踏まえた制作」

## 6. 推測の禁止
- 公式情報に書かれていないことは書かない
- 「おそらく」「と思われる」が必要になったらその項目自体を出さない

# 出力JSON形式

{
  "x": {
    "summary": "Xのランキングシステムの現在の全体像を3-5文で。必ず時期表現を含めること。",
    "key_points": [
      "公式情報に基づく投稿者が意識すべきポイント1（出典内包）",
      "ポイント2",
      "ポイント3-6"
    ],
    "what_to_avoid": [
      "公式・専門報告で指摘されているマイナス行動1",
      "行動2"
    ],
    "as_of": "2026年X月時点"
  },
  "instagram": { ...同じ構造 },
  "tiktok": { ...同じ構造 },
  "note": { ...同じ構造 }
}

# 注意
- 説明文や前置きは一切不要
- マークダウンのコードブロック記号は使わない
- JSONのみを出力
- 4プラットフォームすべて（x / instagram / tiktok / note）を必ず含める`;

const CHANGE_DETECTION_SYSTEM_PROMPT = `あなたはSNSアルゴリズム変化の差分検知の専門家です。
2つの時点で取得した公開情報の要約を比較し、「何が変わったか」「投稿戦略にどう影響するか」を整理します。

# 絶対遵守ルール
- 15語超の逐語引用は避ける
- 断定表現を使わない（「〜の傾向がある」「〜と説明されている」）
- 「攻略」「裏技」など規約抵触語を使わない
- 公開情報に書かれていない推測は出さない
- 変化が観察できない場合は素直に「明確な変化なし」と書く

# 出力JSON形式

{
  "has_changes": true|false,
  "period_label": "前回(2026-XX-XX)→今回(2026-XX-XX)",
  "highlights": [
    {
      "platform": "x|instagram|tiktok|note",
      "title": "変化の見出し（30字以内）",
      "description": "公開情報の解釈として、何が変わったかを自分の言葉で。出典名を内包。100-200字。",
      "implication": "投稿者として意識すべきこと（断定回避）。50-100字。"
    }
  ],
  "no_change_platforms": ["変化が観察できなかったプラットフォーム名"]
}

説明文や前置きは一切不要です。JSONのみを出力してください。`;

function extractJsonFromText(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonText = fence ? fence[1] : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  return JSON.parse(jsonText);
}

async function summarizeWithClaude(rawSources) {
  const client = getLlmClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set");

  const today = new Date().toISOString().slice(0, 10);
  const userMessage = rawSources.map((src) => {
    const sections = src.contents
      .filter((c) => !c.error)
      .map((c) => `## ${c.name}\nURL: ${c.url}\n\n${c.text.slice(0, 12000)}`)
      .join("\n\n---\n\n");
    return `# プラットフォーム: ${src.platform} (${src.label})\n\n${sections}`;
  }).join("\n\n========================================\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    system: [
      { type: "text", text: SUMMARY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
    ],
    messages: [
      { role: "user", content: `以下の公式ソースを読んで、指定のJSON形式で要約してください。今日の日付は ${today} です。各プラットフォームの \`as_of\` には現時点での年月を必ず含めてください。\n\n${userMessage}` }
    ]
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text response from Claude");

  return { summaries: extractJsonFromText(textBlock.text), usage: response.usage };
}

async function detectChangesWithClaude(previousSummaries, currentSummaries, previousDate, currentDate) {
  const client = getLlmClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: [
      { type: "text", text: CHANGE_DETECTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
    ],
    messages: [
      {
        role: "user",
        content: `# 前回 (${previousDate}) の要約\n\n${JSON.stringify(previousSummaries, null, 2)}\n\n# 今回 (${currentDate}) の要約\n\n${JSON.stringify(currentSummaries, null, 2)}\n\n上記2時点の要約を比較し、指定のJSON形式で差分をまとめてください。`
      }
    ]
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return null;
  try {
    return extractJsonFromText(textBlock.text);
  } catch {
    return null;
  }
}

async function loadPreviousSnapshot() {
  return await loadCache();
}

async function saveSnapshot(data) {
  // ファイルシステム書き込み可能な環境（ローカル）のみ
  if (process.env.VERCEL) return;
  try {
    const dir = path.join(rootDir, SNAPSHOT_DIR);
    await mkdir(dir, { recursive: true });
    const timestamp = data.lastChecked.replace(/[:.]/g, "-");
    const filePath = path.join(dir, `snapshot-${timestamp}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn("[algorithm-tracker] snapshot save failed:", error.message);
  }
}

async function fetchAllSources() {
  const results = [];
  for (const source of SOURCES) {
    const contents = [];
    for (const u of source.urls) {
      try {
        const raw = await fetchWithTimeout(u.url);
        const isMarkdown = u.url.endsWith(".md") || u.url.includes("raw.githubusercontent.com");
        const text = isMarkdown ? raw : stripHtml(raw);
        contents.push({ name: u.name, url: u.url, text });
      } catch (error) {
        contents.push({ name: u.name, url: u.url, error: error.message });
      }
    }
    results.push({ platform: source.platform, label: source.label, contents });
  }
  return results;
}

export async function getAlgorithmSummary({ force = false } = {}) {
  const cache = await loadCache();
  if (!force && cache?.lastChecked) {
    const ageHours = (Date.now() - new Date(cache.lastChecked).getTime()) / 3600000;
    if (ageHours < CHECK_INTERVAL_HOURS) return cache;
  }
  return await refreshAlgorithmSummary();
}

export async function refreshAlgorithmSummary() {
  // 前回のスナップショットを保存しておく（変化検知用）
  const previousSnapshot = await loadPreviousSnapshot();

  const rawSources = await fetchAllSources();
  const sourceStatus = rawSources.map((r) => ({
    platform: r.platform,
    label: r.label,
    urls: r.contents.map((c) => ({
      name: c.name,
      url: c.url,
      status: c.error ? "error" : "ok",
      error: c.error || null
    }))
  }));

  let summaries = null;
  let engine = "static";
  let usage = null;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await summarizeWithClaude(rawSources);
      summaries = result.summaries;
      usage = result.usage;
      engine = "claude-sonnet-4-6";
    } catch (error) {
      console.error("[algorithm-tracker] Claude要約失敗、staticにフォールバック:", error.message);
    }
  }

  if (!summaries) {
    const staticContent = await loadStaticAnalysis();
    summaries = {
      static_markdown: staticContent || "(docs/algorithm-analysis.md が読み込めませんでした)"
    };
  }

  // 変化検知（前回のスナップショットと比較）
  let changes = null;
  if (
    process.env.ANTHROPIC_API_KEY &&
    previousSnapshot &&
    previousSnapshot.summaries &&
    !previousSnapshot.summaries.static_markdown &&
    !summaries.static_markdown
  ) {
    try {
      const previousDate = previousSnapshot.lastChecked.slice(0, 10);
      const currentDate = new Date().toISOString().slice(0, 10);
      changes = await detectChangesWithClaude(
        previousSnapshot.summaries,
        summaries,
        previousDate,
        currentDate
      );
    } catch (error) {
      console.error("[algorithm-tracker] 変化検知失敗:", error.message);
    }
  }

  const data = {
    lastChecked: new Date().toISOString(),
    engine,
    usage,
    sourceStatus,
    summaries,
    changes,
    disclaimer: "本情報は各プラットフォームの公開情報（公式GitHub、System Card、公式発信、Newsroom等）の解釈です。各SNSのアルゴリズムは頻繁に更新されるため、投稿前に最新の公式情報も併せてご確認ください。"
  };

  await saveCache(data);
  // スナップショット保存（変化追跡用）
  try {
    await saveSnapshot(data);
  } catch (error) {
    console.error("[algorithm-tracker] スナップショット保存失敗:", error.message);
  }
  return data;
}

export async function getCurrentSummaryForContext() {
  // 文章生成時にコンテキストとして使うため、簡潔な要約を返す
  const cache = await loadCache();
  if (!cache || !cache.summaries || cache.summaries.static_markdown) return null;
  return {
    asOf: cache.lastChecked,
    summaries: cache.summaries
  };
}

export function startAlgorithmTracking() {
  // Vercel環境では setInterval は使えない（Cron Jobs を使う）
  if (process.env.VERCEL) return;

  // ローカル開発時のみ起動時チェック＋定期更新
  getAlgorithmSummary().catch((err) => {
    console.error("[algorithm-tracker] 初回チェック失敗:", err.message);
  });
  setInterval(() => {
    refreshAlgorithmSummary().catch((err) => {
      console.error("[algorithm-tracker] 定期チェック失敗:", err.message);
    });
  }, CHECK_INTERVAL_HOURS * 3600 * 1000);
}
