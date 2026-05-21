import { getAlgorithmSummary, refreshAlgorithmSummary } from "../src/lib/algorithmTracker.js";
import { requireAuth } from "./_lib/auth.js";

export const config = {
  maxDuration: 60
};

export default async function handler(request, response) {
  if (!requireAuth(request, response)) return;
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const force = url.searchParams.get("refresh") === "1";
    const data = force ? await refreshAlgorithmSummary() : await getAlgorithmSummary();
    return response.status(200).json(data);
  } catch (error) {
    console.error("algorithm-summary error:", error);
    return response.status(500).json({ error: error.message });
  }
}
