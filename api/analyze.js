import { collectTrends } from "../src/lib/trendSources.js";
import { scoreTrends } from "../src/lib/scoring.js";
import { buildContentPlans } from "../src/lib/contentPlanner.js";
import { requireAuth } from "./_lib/auth.js";

export const config = {
  maxDuration: 30
};

export default async function handler(request, response) {
  if (!requireAuth(request, response)) return;
  if (request.method !== "POST") {
    return response.status(405).json({ error: "POST only" });
  }
  try {
    const body = request.body || {};
    const collected = await collectTrends({
      query: body.query || body.niche || "",
      manualTrends: body.manualTrends || "",
      includeSample: body.includeSample !== false,
      live: body.live !== false
    });
    const scored = await scoreTrends(collected.trends, body);
    const plans = buildContentPlans(scored, body, Number(body.limit || 8));
    return response.status(200).json({
      generatedAt: new Date().toISOString(),
      context: body,
      sources: collected.sourceResults,
      scored,
      plans
    });
  } catch (error) {
    console.error("analyze error:", error);
    return response.status(500).json({ error: error.message });
  }
}
