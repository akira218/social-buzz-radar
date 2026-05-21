import { refreshAlgorithmSummary } from "../../src/lib/algorithmTracker.js";

export const config = {
  maxDuration: 300
};

// Vercel Cron で叩く専用エンドポイント
// Vercel は CRON_SECRET ヘッダー（または Authorization: Bearer）で認証する
export default async function handler(request, response) {
  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を送ってくる
  const authHeader = request.headers["authorization"] || request.headers["Authorization"];
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("[cron] Refreshing algorithm summary...");
    const data = await refreshAlgorithmSummary();
    console.log(`[cron] Done. Engine: ${data.engine}`);
    return response.status(200).json({
      ok: true,
      engine: data.engine,
      lastChecked: data.lastChecked
    });
  } catch (error) {
    console.error("[cron] refresh failed:", error);
    return response.status(500).json({ error: error.message });
  }
}
