import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectTrends } from "./lib/trendSources.js";
import { scoreTrends } from "./lib/scoring.js";
import { buildContentPlans } from "./lib/contentPlanner.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

async function serveStatic(request, response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/trends") {
    const query = url.searchParams.get("query") || "";
    const includeSample = url.searchParams.get("sample") !== "0";
    const live = url.searchParams.get("live") !== "0";
    const result = await collectTrends({ query, includeSample, live });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/analyze") {
    const body = await readBody(request);
    const collected = await collectTrends({
      query: body.query || body.niche || "",
      manualTrends: body.manualTrends || "",
      includeSample: body.includeSample !== false,
      live: body.live !== false
    });
    const scored = await scoreTrends(collected.trends, body);
    const plans = buildContentPlans(scored, body, Number(body.limit || 8));
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      context: body,
      sources: collected.sourceResults,
      scored,
      plans
    });
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found" });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    sendJson(response, 500, {
      error: error.message,
      note: "ライブ取得が失敗した場合は、手入力トレンドまたはサンプルで分析できます。"
    });
  }
});

server.listen(port, () => {
  console.log(`Social Buzz Radar: http://localhost:${port}`);
});
