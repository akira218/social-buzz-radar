import { clamp, normalizeText, readJson, scoreFromAge, tokenize, uniq } from "./utils.js";

let cachedRules = null;

async function getRules() {
  if (!cachedRules) cachedRules = await readJson("config/platform-rules.json");
  return cachedRules;
}

function includesAny(text, terms) {
  return terms.filter((term) => text.includes(normalizeText(term)));
}

function volumeScore(volumeText = "", growth = 0) {
  const digits = String(volumeText).replace(/[^\d]/g, "");
  const volume = digits ? Math.min(100, Math.log10(Number(digits) + 1) * 22) : 44;
  return clamp(Math.max(volume, Number(growth || 0) * 100));
}

function keywordScore(text, keywords) {
  const hits = includesAny(text, keywords);
  return clamp(34 + hits.length * 13);
}

function creatorFitScore(trend, context = {}) {
  const contextText = normalizeText([
    context.niche,
    context.audience,
    context.brandStance,
    context.keywords
  ].join(" "));
  const contextTokens = tokenize(contextText);
  if (!contextTokens.length) return 56;
  const trendText = normalizeText(`${trend.title} ${trend.signals?.related || ""}`);
  const hits = contextTokens.filter((token) => trendText.includes(token));
  return clamp(42 + (hits.length / Math.max(1, contextTokens.length)) * 80);
}

function visualPotential(text) {
  const visualWords = [
    "動画",
    "reels",
    "写真",
    "比較",
    "ランキング",
    "ビフォー",
    "after",
    "事例",
    "画面",
    "デザイン",
    "ai",
    "生成ai",
    "炎上",
    "発表"
  ];
  return keywordScore(text, visualWords);
}

function shareSavePotential(text) {
  const words = ["まとめ", "比較", "理由", "手順", "テンプレート", "チェックリスト", "保存", "ランキング", "失敗", "事例"];
  return keywordScore(text, words);
}

function originalityPotential(text, context = {}) {
  const hasFirstPerson = normalizeText(context.brandStance || "").length > 0;
  const originalWords = ["体験", "事例", "検証", "現場", "一次情報", "レポート", "実録", "レビュー"];
  return clamp(keywordScore(text, originalWords) + (hasFirstPerson ? 10 : 0));
}

function depthPotential(text) {
  const words = ["なぜ", "仕組み", "分析", "背景", "比較", "検証", "事例", "公式", "github", "発表", "解説"];
  return keywordScore(text, words);
}

function evergreenPotential(text) {
  const words = ["仕組み", "やり方", "比較", "テンプレート", "保存版", "事例", "入門", "チェックリスト", "解説"];
  return keywordScore(text, words);
}

function riskPenalty(text, rules) {
  const riskHits = includesAny(text, rules.riskTerms || []);
  const spamHits = includesAny(text, rules.spamSignals || []);
  return {
    penalty: clamp(riskHits.length * 12 + spamHits.length * 18, 0, 60),
    riskHits,
    spamHits
  };
}

function weighted(values, weights) {
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + (values[key] || 0) * weight, 0);
}

function explainTopFactors(values, platform, risks) {
  const sorted = Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => `${key}:${Math.round(value)}`);
  if (risks.penalty) sorted.push(`riskPenalty:-${Math.round(risks.penalty)}`);
  return [`${platform} ${sorted.join(" / ")}`];
}

export async function scoreTrends(trends, context = {}) {
  const rules = await getRules();
  return trends.map((trend) => {
    const text = normalizeText(`${trend.title} ${trend.signals?.related || ""}`);
    const recency = scoreFromAge(trend.publishedAt);
    const source = clamp(trend.signals?.sourceQuality || 55);
    const volume = volumeScore(trend.signals?.volumeText, trend.signals?.growth);
    const novelty = keywordScore(text, rules.highIntentTerms || []);
    const crossSource = clamp(38 + ((trend.sources?.length || trend.sourceKeys?.length || 1) - 1) * 22);
    const creatorFit = creatorFitScore(trend, context);
    const risks = riskPenalty(text, rules);

    const common = {
      recency,
      source,
      volume,
      novelty,
      crossSource,
      creatorFit,
      conversation: clamp(keywordScore(text, ["なぜ", "炎上", "賛否", "発表", "比較", "変化", "理由"]) + volume * 0.15),
      topicMatch: clamp(creatorFit * 0.65 + novelty * 0.25 + crossSource * 0.10),
      visual: visualPotential(text),
      shareSave: shareSavePotential(text),
      originality: originalityPotential(text, context),
      depth: depthPotential(text),
      searchEvergreen: evergreenPotential(text)
    };

    const xRaw = weighted(common, rules.platforms.x.weights);
    const instagramRaw = weighted(common, rules.platforms.instagram.weights);
    const noteRaw = weighted(common, rules.platforms.note.weights);
    const platformScores = {
      x: clamp(xRaw - risks.penalty),
      instagram: clamp(instagramRaw - risks.penalty),
      note: clamp(noteRaw - risks.penalty)
    };
    const selected = context.platforms?.length ? context.platforms : ["note", "x", "instagram"];
    const buzzScore = clamp(
      selected.reduce((sum, key) => sum + (platformScores[key] || 0), 0) / selected.length
    );

    return {
      ...trend,
      title: trend.title.trim(),
      sources: trend.sources || [trend.sourceLabel || trend.source],
      sourceKeys: trend.sourceKeys || [trend.source],
      evidenceUrls: uniq(trend.evidenceUrls || [trend.url].filter(Boolean)),
      platformScores,
      buzzScore,
      metrics: common,
      risk: risks,
      why: [
        ...explainTopFactors(common, "X", risks),
        ...explainTopFactors(common, "Instagram", risks),
        ...explainTopFactors(common, "note", risks)
      ]
    };
  }).sort((a, b) => b.buzzScore - a.buzzScore);
}
