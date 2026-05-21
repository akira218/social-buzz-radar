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

// note API v3: 指定ハッシュタグの最新記事を取得（最大50件）
async function fetchNoteHashtag(hashtag) {
  const encoded = encodeURIComponent(hashtag);
  const apiUrl = `https://note.com/api/v3/hashtags/${encoded}/notes?page=1`;
  const response = await fetchWithTimeout(apiUrl, {
    headers: { accept: "application/json" }
  });
  const json = await response.json();
  const notes = json?.data?.notes || [];
  return notes.map((note) => ({
    title: note.name,
    key: note.key,
    publishedAt: note.publish_at ? new Date(note.publish_at).toISOString() : new Date().toISOString(),
    userUrlName: note.user?.urlname || "",
    likeCount: Number(note.likeCount || 0),
    hashtag
  }));
}

function defaultHashtags(query = "") {
  const tokens = tokenize(query)
    .map((token) => token.toUpperCase())
    .filter((token) => token.length >= 2 && token.length <= 16);
  if (tokens.length > 0) return tokens.slice(0, 3);
  return ["AI", "生成AI", "SNSマーケティング"];
}

function extractNoteTopics(html, sourceUrl = "https://note.com/") {
  // 1次戦略: note記事のURLパターン (/[user]/n/[id]) を含む<a>タグから本物の記事タイトルを抽出
  const articleLinkRegex = /<a[^>]*href=["']?(\/[^"'\s\/]+\/n\/[a-zA-Z0-9_-]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  const articles = [];
  const seen = new Set();
  let match;

  while ((match = articleLinkRegex.exec(html)) !== null) {
    const url = `https://note.com${match[1]}`;
    const titleHtml = match[2];
    const title = decodeHtml(titleHtml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || title.length < 5 || title.length > 100) continue;
    if (/^(note|ログイン|会員登録|もっとみる|フォロー)$/.test(title)) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    articles.push({ title, url });
  }

  // 構造化抽出で5件以上見つかればそれを使う
  if (articles.length >= 5) {
    return articles.slice(0, 20).map((article, index) => ({
      id: `note_public_page:${normalizeText(article.title).slice(0, 80)}`,
      title: article.title,
      source: "note_public_page",
      sourceLabel: "note公開ページ",
      url: article.url,
      publishedAt: new Date().toISOString(),
      signals: {
        rank: index + 1,
        growth: Math.max(0.4, 1 - index * 0.04),
        volumeText: `note_article_rank:${index + 1}`,
        sourceQuality: SOURCE_QUALITY.note_public_page
      }
    }));
  }

  // 2次戦略 (フォールバック): 単語頻度
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
      url: sourceUrl,
      publishedAt: new Date().toISOString(),
      signals: {
        rank: index + 1,
        growth: Math.min(1, count / 10),
        volumeText: `page_count:${count}`,
        sourceQuality: SOURCE_QUALITY.note_public_page
      }
    }));
}

async function fetchNotePublicPage(query = "") {
  // デフォルトで有効。明示的に "0" を指定したときだけスキップ
  if (process.env.ENABLE_NOTE_PUBLIC_PAGE === "0") {
    return {
      source: "note_public_page",
      ok: false,
      skipped: true,
      message: "ENABLE_NOTE_PUBLIC_PAGE is set to 0."
    };
  }

  // 1次戦略: noteの公式APIから複数ハッシュタグを並列取得
  try {
    const hashtags = defaultHashtags(query);
    const settled = await Promise.allSettled(hashtags.map((h) => fetchNoteHashtag(h)));
    const allItems = [];
    const seenTitles = new Set();

    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const note of result.value) {
        if (!note.title || seenTitles.has(note.title)) continue;
        seenTitles.add(note.title);
        allItems.push(note);
      }
    }

    if (allItems.length > 0) {
      // いいね数が多いものを上位に
      allItems.sort((a, b) => b.likeCount - a.likeCount);
      return {
        source: "note_public_page",
        ok: true,
        items: allItems.slice(0, 30).map((note, index) => ({
          id: `note_public_page:${normalizeText(note.title).slice(0, 80)}`,
          title: note.title,
          source: "note_public_page",
          sourceLabel: "note公開記事",
          url: note.userUrlName && note.key ? `https://note.com/${note.userUrlName}/n/${note.key}` : "https://note.com/",
          publishedAt: note.publishedAt,
          signals: {
            rank: index + 1,
            growth: Math.min(1, note.likeCount / 100),
            volumeText: `note_likes:${note.likeCount}`,
            related: `#${note.hashtag}`,
            sourceQuality: SOURCE_QUALITY.note_public_page
          }
        }))
      };
    }
  } catch (error) {
    // API失敗時はHTMLフォールバックへ
  }

  // 2次戦略 (フォールバック): HTMLスクレイピング
  const url = process.env.NOTE_TREND_URL || "https://note.com/";
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8"
      }
    });
    const html = await response.text();
    return {
      source: "note_public_page",
      ok: true,
      items: extractNoteTopics(html, url)
    };
  } catch (error) {
    return {
      source: "note_public_page",
      ok: false,
      error: error.message
    };
  }
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
      fetchNotePublicPage(options.query || "")
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
