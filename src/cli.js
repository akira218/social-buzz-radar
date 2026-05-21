import { collectTrends } from "./lib/trendSources.js";
import { scoreTrends } from "./lib/scoring.js";
import { buildContentPlans } from "./lib/contentPlanner.js";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const context = {
  query: argValue("--query", ""),
  niche: argValue("--niche", "AIアバター、SNSマーケティング、クリエイター支援"),
  audience: argValue("--audience", "経営者、マーケ担当、クリエイター"),
  brandStance: argValue("--stance", "公式情報を根拠に、実務で使える形まで落とし込む"),
  manualTrends: argValue("--manual", ""),
  includeSample: process.argv.includes("--sample"),
  live: !process.argv.includes("--no-live"),
  platforms: ["note", "x", "instagram"]
};

const collected = await collectTrends(context);
const scored = await scoreTrends(collected.trends, context);
const plans = buildContentPlans(scored, context, 5);

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  top: plans.map((plan) => ({
    topic: plan.trend.title,
    buzzScore: Math.round(plan.trend.buzzScore),
    bestPlatform: plan.bestPlatform,
    x: Math.round(plan.trend.platformScores.x),
    instagram: Math.round(plan.trend.platformScores.instagram),
    note: Math.round(plan.trend.platformScores.note),
    firstAction: plan.action.publishOrder[0],
    draft: plan.plans[plan.bestPlatform].draft || plan.plans[plan.bestPlatform].title || plan.plans[plan.bestPlatform].reelHook
  }))
}, null, 2));
