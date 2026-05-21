import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { rootDir } from "./utils.js";

const SOURCES = [
  {
    platform: "x",
    label: "X (xAI公式)",
    urls: [
      { name: "x-algorithm README", url: "https://raw.githubusercontent.com/xai-org/x-algorithm/main/README.md" },
      { name: "Phoenix README", url: "https://raw.githubusercontent.com/xai-org/x-algorithm/main/phoenix/README.md" }
    ]
  },
  {
    platform: "instagram",
    label: "Instagram (Meta公式)",
    urls: [
      { name: "Feed Ranking System Card", url: "https://ai.meta.com/tools/system-cards/instagram-feed-ranking/" },
      { name: "Explore Engineering", url: "https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/" }
    ]
  },
  {
    platform: "note",
    label: "note公式",
    urls: [
      { name: "レコメンド刷新発表", url: "https://note.jp/n/nce2c203cc6fb" },
      { name: "システム設計", url: "https://note.jp/n/nce0a239e3c40" }
    ]
  }
];

const CACHE_PATH = "data/algorithm-summary.json";
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

async function loadCache() {
  try {
    const text = await readFile(path.join(rootDir, CACHE_PATH), "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function saveCache(data) {
  await mkdir(path.join(rootDir, "data"), { recursive: true });
  await writeFile(path.join(rootDir, CACHE_PATH), JSON.stringify(data, null, 2), "utf8");
}

async function loadStaticAnalysis() {
  try {
    return await readFile(path.join(rootDir, "docs/algorithm-analysis.md"), "utf8");
  } catch {
    return null;
  }
}

const SUMMARY_SYSTEM_PROMPT = `あなたは、SNSアルゴリズム研究の専門家です。X (xAI)、Instagram (Meta)、note各社の公式ドキュメントを読み、SNSコンテンツ作成者が今知るべき「実務に効く要点」を抜き出す役割を担います。

# あなたの仕事
渡された複数の公式ソース（GitHub README、System Card、公式記事等）を読んで、各プラットフォームについて以下のJSON形式でまとめてください。

# 重要な原則
1. 一般論ではなく、ソースに書かれている具体的な内容を抜き出すこと
2. 「投稿者が何を意識すべきか」という実務目線で要約
3. 推測や脚色は一切入れない（書かれていないことは書かない）
4. 専門用語は平易な日本語に置き換える（例: "Embedding" → "意味の特徴量"）
5. 一つのプラットフォームにつき、要点は3-6個に絞る

# 出力JSON形式

{
  "x": {
    "summary": "Xのランキングシステムの現在の全体像を3-5文で。",
    "key_points": [
      "投稿者が意識すべき具体的なポイント1",
      "ポイント2",
      "ポイント3-6"
    ],
    "what_to_avoid": [
      "アルゴリズム的にマイナスになる行動1",
      "行動2"
    ]
  },
  "instagram": { ...同じ構造 },
  "note": { ...同じ構造 }
}

説明文や前置きは一切不要です。JSONのみを出力してください。`;

async function summarizeWithClaude(rawSources) {
  const client = getLlmClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set");

  const userMessage = rawSources.map((src) => {
    const sections = src.contents
      .filter((c) => !c.error)
      .map((c) => `## ${c.name}\nURL: ${c.url}\n\n${c.text.slice(0, 12000)}`)
      .join("\n\n---\n\n");
    return `# プラットフォーム: ${src.platform} (${src.label})\n\n${sections}`;
  }).join("\n\n========================================\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: [
      { type: "text", text: SUMMARY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
    ],
    messages: [
      { role: "user", content: `以下の公式ソースを読んで、指定のJSON形式で要約してください。\n\n${userMessage}` }
    ]
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text response from Claude");

  const trimmed = textBlock.text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonText = fence ? fence[1] : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  return { summaries: JSON.parse(jsonText), usage: response.usage };
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

  const data = {
    lastChecked: new Date().toISOString(),
    engine,
    usage,
    sourceStatus,
    summaries
  };

  await saveCache(data);
  return data;
}

export function startAlgorithmTracking() {
  // 起動時に1回（古かったら更新）
  getAlgorithmSummary().catch((err) => {
    console.error("[algorithm-tracker] 初回チェック失敗:", err.message);
  });
  // 24時間ごとに再チェック
  setInterval(() => {
    refreshAlgorithmSummary().catch((err) => {
      console.error("[algorithm-tracker] 定期チェック失敗:", err.message);
    });
  }, CHECK_INTERVAL_HOURS * 3600 * 1000);
}
