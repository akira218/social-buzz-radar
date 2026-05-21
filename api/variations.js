import { generateVariations } from "../src/lib/contentPlanner.js";
import { isLLMEnabled, generateAllVariationsWithLLM } from "../src/lib/claudeVariations.js";
import { getCurrentSummaryForContext } from "../src/lib/algorithmTracker.js";
import { requireAuth } from "./_lib/auth.js";

export const config = {
  maxDuration: 60
};

export default async function handler(request, response) {
  if (!requireAuth(request, response)) return;
  if (request.method !== "POST") {
    return response.status(405).json({ error: "POST only" });
  }
  try {
    const body = request.body || {};
    const trends = Array.isArray(body.trends) ? body.trends : [];
    if (!trends.length) {
      return response.status(400).json({
        error: "trendsが空です。先に分析を実行してから呼び出してください。"
      });
    }
    // 1トピックだけ生成（クオリティ・スピード優先）
    const selectedTrends = trends.slice(0, 1);
    const context = {
      niche: body.niche || "",
      audience: body.audience || "",
      brandStance: body.brandStance || ""
    };

    if (isLLMEnabled()) {
      try {
        const algorithmContext = await getCurrentSummaryForContext();
        const llmResult = await generateAllVariationsWithLLM(selectedTrends, context, algorithmContext);
        return response.status(200).json({
          generatedAt: new Date().toISOString(),
          context,
          variations: llmResult.results,
          engine: "claude-haiku-4-5",
          usage: llmResult.usage,
          algorithmContextUsed: Boolean(algorithmContext)
        });
      } catch (error) {
        console.error("Claude API failed, falling back to templates:", error.message);
      }
    }

    const result = generateVariations(selectedTrends, context);
    return response.status(200).json({
      generatedAt: new Date().toISOString(),
      context,
      variations: result,
      engine: "templates"
    });
  } catch (error) {
    console.error("variations error:", error);
    return response.status(500).json({ error: error.message });
  }
}
