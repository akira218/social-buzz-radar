import { readJson, decodeHtml, normalizeText, tokenize, uniq } from "./utils.js";

const RSS_SOURCES = [
  {
    key: "google_trends_jp",
    label: "Google Trends JP",
    url: "https://trends.google.com/trending/rss?geo=JP"
  },
  {
    key: "yahoo_news_top",
    label: "Yahoo!ニュース トピックス",
    url: "https://news.yahoo.co.jp/rss/topics/top-picks.xml"
  },
  {
    key: "yahoo_news_it",
    label: "Yahoo!ニュース IT",
    url: "https://news.yahoo.co.jp/rss/topics/it.xml"
  },
  {
    key: "yahoo_news_business",
    label: "Yahoo!ニュース 経済",
    url: "https://news.yahoo.co.jp/rss/topics/business.xml"
  }
];

const SOURCE_QUALITY = {
  yahoo_realtime_api: 94,
  google_trends_jp: 86,
  yahoo_news_top: 78,
  yahoo_news_it: 76,
  yahoo_news_business: 76,
  note_public_page: 70,
  manual: 62,
  sample: 42
};

async function fetchWithTimeout(url, options = {}) {
  const timeout = Number(process.env.FETCH_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": "social-buzz-radar/0.1 (+local research tool)",
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function getTag(block, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function parseRss(xml, source) {
  const items = [...xml.matchAll(/<item[\s\S]*?>([\s\S]*?)<\/item>/gi)];
  return items.slice(0, 30).map(([, block], index) => {
    const title = getTag(block, "title");
    const url = getTag(block, "link");
    const pubDate = getTag(block, "pubDate");
    const approxTraffic = getTag(block, "ht:approx_traffic");
    const related = getTag(block, "ht:news_item_title");
    return {
      id: `${source.key}:${normalizeText(title).slice(0, 80)}`,
      title,
      source: source.key,
      sourceLabel: source.label,
      url,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      signals: {
        rank: index + 1,
        volumeText: approxTraffic || "",
        related,
        sourceQuality: SOURCE_QUALITY[source.key] || 60
      }
    };
  }).filter((item) => item.title);
}

function parseYahooRealtimeJson(json) {
  const candidates = Array.isArray(json)
    ? json
    : json.items || json.results || json.ranking || json.rankings || json.data || [];

  return candidates.slice(0, 50).map((item, index) => {
    const title = item.keyword || item.title || item.name || item.query || item.text;
    return {
      id: `yahoo_realtime_api:${normalizeText(title).slice(0, 80)}`,
      title,
      source: "yahoo_realtime_api",
      sourceLabel: "Yahoo!リアルタイム検索API",
      url: item.url || item.link || "https://search.yahoo.co.jp/realtime",
      publishedAt: item.publishedAt || item.updatedAt || new Date().toISOString(),
      signals: {
        rank: item.rank || index + 1,
        growth: Number(item.growth || item.buzz || item.score || 0),
        volumeText: item.volumeText || item.volume || "",
        related: Array.isArray(item.related) ? item.related.join(", ") : item.related || "",
        sourceQuality: SOURCE_QUALITY.yahoo_realtime_api
      }
    };
  }).filter((item) => item.title);
}

async function fetchYahooRealtimeApi() {
  const endpoint = process.env.YAHOO_REALTIME_API_URL;
  if (!endpoint) {
    return {
      source: "yahoo_realtime_api",
      ok: false,
      skipped: true,
      message: "YAHOO_REALTIME_API_URL is not set."
    };
  }

  const headers = {};
  if (process.env.YAHOO_REALTIME_API_KEY) {
    headers.authorization = `Bearer ${process.env.YAHOO_REALTIME_API_KEY}`;
  }
  const response = await fetchWithTimeout(endpoint, { headers });
  const json = await response.json();
  return {
    source: "yahoo_realtime_api",
    ok: true,
    items: parseYahooRealtimeJson(json)
  };
}

async function fetchRssSource(source) {
  const response = await fetchWithTimeout(source.url);
  const xml = await response.text();
  return {
    source: source.key,
    ok: true,
    items: parseRss(xml, source)
  };
}

function extractNoteTopics(html) {
  const text = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
  const tokens = tokenize(text)
    .filter((token) => token.length >= 3 && token.length <= 28)
    .filter((token) => !/^(note|https|ログイン|会員登録|もっとみる|フォロー)$/.test(token));
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([title, count], index) => ({
      id: `note_public_page:${title}`,
      title,
      source: "note_public_page",
      sourceLabel: "note公開ページ",
      url: process.env.NOTE_TREND_URL || "https://note.com/",
      publishedAt: new Date().toISOString(),
      signals: {
        rank: index + 1,
        growth: Math.min(1, count / 10),
        volumeText: `page_count:${count}`,
        sourceQuality: SOURCE_QUALITY.note_public_page
      }
    }));
}

async function fetchNotePublicPage() {
  if (process.env.ENABLE_NOTE_PUBLIC_PAGE !== "1") {
    return {
      source: "note_public_page",
      ok: false,
      skipped: true,
      message: "ENABLE_NOTE_PUBLIC_PAGE is not enabled."
    };
  }
  const url = process.env.NOTE_TREND_URL || "https://note.com/";
  const response = await fetchWithTimeout(url);
  const html = await response.text();
  return {
    source: "note_public_page",
    ok: true,
    items: extractNoteTopics(html)
  };
}

export function parseManualTrends(text = "") {
  return String(text)
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line, index) => {
      const [title, source = "manual", url = ""] = line.split("|").map((value) => value.trim());
      return {
        id: `manual:${normalizeText(title).slice(0, 80)}`,
        title,
        source: "manual",
        sourceLabel: source || "手入力",
        url,
        publishedAt: new Date().toISOString(),
        signals: {
          rank: index + 1,
          sourceQuality: SOURCE_QUALITY.manual,
          volumeText: "manual"
        }
      };
    });
}

function mergeDuplicateTrends(items) {
  const merged = new Map();
  for (const item of items) {
    const key = normalizeText(item.title).replace(/^#/, "");
    if (!key) continue;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        ...item,
        sources: [item.sourceLabel || item.source],
        sourceKeys: [item.source],
        evidenceUrls: item.url ? [item.url] : []
      });
      continue;
    }
    current.sources = uniq([...current.sources, item.sourceLabel || item.source]);
    current.sourceKeys = uniq([...current.sourceKeys, item.source]);
    current.evidenceUrls = uniq([...current.evidenceUrls, item.url].filter(Boolean));
    current.signals = {
      ...current.signals,
      sourceQuality: Math.max(current.signals.sourceQuality || 0, item.signals.sourceQuality || 0),
      crossSourceCount: current.sources.length
    };
    if (!current.publishedAt || new Date(item.publishedAt) > new Date(current.publishedAt)) {
      current.publishedAt = item.publishedAt;
    }
  }
  return [...merged.values()];
}

function filterByQuery(items, query = "") {
  const terms = tokenize(query);
  if (!terms.length) return items;
  return items.map((item) => {
    const haystack = normalizeText(`${item.title} ${(item.signals && item.signals.related) || ""}`);
    const matchCount = terms.filter((term) => haystack.includes(term)).length;
    return {
      ...item,
      queryMatch: matchCount / terms.length
    };
  });
}

export async function collectTrends(options = {}) {
  const manualItems = parseManualTrends(options.manualTrends);
  const sourceResults = [];
  const liveDisabled = process.env.DISABLE_LIVE === "1" || options.live === false;

  if (!liveDisabled) {
    const tasks = [
      fetchYahooRealtimeApi(),
      ...RSS_SOURCES.map((source) => fetchRssSource(source)),
      fetchNotePublicPage()
    ];
    const settled = await Promise.allSettled(tasks);
    for (const result of settled) {
      if (result.status === "fulfilled") {
        sourceResults.push(result.value);
      } else {
        sourceResults.push({
          source: "unknown",
          ok: false,
          error: result.reason.message || String(result.reason)
        });
      }
    }
  }

  const liveItems = sourceResults.flatMap((result) => result.items || []);
  let items = [...manualItems, ...liveItems];

  if (options.includeSample || items.length === 0) {
    const sample = await readJson("data/sample-trends.json");
    items = [...items, ...sample.map((item) => ({
      ...item,
      id: `sample:${normalizeText(item.title).slice(0, 80)}`,
      sourceLabel: "サンプル",
      signals: {
        ...item.signals,
        sourceQuality: SOURCE_QUALITY.sample
      }
    }))];
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceResults,
    trends: filterByQuery(mergeDuplicateTrends(items), options.query)
  };
}
