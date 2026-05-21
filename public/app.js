const $ = (selector) => document.querySelector(selector);

const state = {
  lastPlans: [],
  autoRefresh: false,
  refreshIntervalMinutes: 5,
  refreshTimerId: null,
  countdownTimerId: null,
  nextRefreshAt: null
};

function selectedPlatforms() {
  return [...document.querySelectorAll('fieldset input[type="checkbox"]:checked')]
    .map((input) => input.value);
}

function payload(live = true) {
  return {
    niche: $("#niche").value,
    audience: $("#audience").value,
    brandStance: $("#brandStance").value,
    query: $("#query").value,
    manualTrends: $("#manualTrends").value,
    platforms: selectedPlatforms(),
    nicheFilter: $("#nicheFilter")?.checked !== false,
    live,
    includeSample: true,
    limit: 8
  };
}

function setStatus(text) {
  $("#status").textContent = text;
}

function formatTime(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function timeAgo(iso) {
  if (!iso) return "公開日不明";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "公開日不明";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return `${Math.floor(days / 7)}週間前`;
}

function freshnessClass(iso) {
  if (!iso) return "stale";
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (Number.isNaN(hours)) return "stale";
  if (hours < 1) return "fresh-hot";
  if (hours < 6) return "fresh-warm";
  if (hours < 24) return "fresh-cool";
  return "stale";
}

function planText(plan) {
  if (plan.draft) return plan.draft;
  if (plan.title) return `${plan.title}\n\n${plan.outline.join("\n")}`;
  return `${plan.reelHook}\n\n${plan.beats.join("\n")}`;
}

function renderCanvas(plans) {
  const canvas = $("#scoreCanvas");
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const max = Math.max(100, ...plans.map((plan) => plan.trend.buzzScore));
  const barWidth = Math.max(32, (width - 80) / Math.max(1, plans.length) - 12);
  const colors = ["#1a8f64", "#ff6b5a", "#f6b73c", "#7357c8"];

  ctx.strokeStyle = "#d9e1dc";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = 28 + i * 48;
    ctx.beginPath();
    ctx.moveTo(44, y);
    ctx.lineTo(width - 20, y);
    ctx.stroke();
  }

  plans.forEach((plan, index) => {
    const score = plan.trend.buzzScore;
    const h = Math.max(8, (score / max) * 150);
    const x = 52 + index * (barWidth + 12);
    const y = height - 38 - h;
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(x, y, barWidth, h);
    ctx.fillStyle = "#202124";
    ctx.font = "700 12px system-ui";
    ctx.fillText(Math.round(score), x, y - 8);
    ctx.fillStyle = "#66706b";
    ctx.font = "12px system-ui";
    const label = plan.trend.title.slice(0, 12);
    ctx.fillText(label, x, height - 16);
  });
}

function renderResults(data) {
  const plans = data.plans || [];
  state.lastPlans = plans;
  $("#trendCount").textContent = String(data.scored?.length || 0);
  $("#topScore").textContent = String(Math.round(plans[0]?.trend?.buzzScore || 0));
  $("#generatedAt").textContent = formatTime(data.generatedAt);
  renderCanvas(plans);

  const vBtn = $("#variationBtn");
  if (vBtn) {
    if (plans.length > 0) {
      vBtn.disabled = false;
      vBtn.title = "上位3トピックについて4種類のバリエーションを生成";
    } else {
      vBtn.disabled = true;
    }
  }

  const container = $("#results");
  const template = $("#resultTemplate");
  container.replaceChildren();

  plans.forEach((plan, index) => {
    const node = template.content.cloneNode(true);
    const trend = plan.trend;
    node.querySelector(".rank").textContent = `#${index + 1} / ${plan.bestPlatform.toUpperCase()}`;
    node.querySelector("h2").textContent = trend.title;
    node.querySelector(".score-pill").textContent = `${Math.round(trend.buzzScore)} pts`;
    node.querySelector(".source-line").textContent = `source: ${(trend.sources || []).join(" / ")}`;

    const publishedInfo = node.querySelector(".published-info");
    if (publishedInfo) {
      publishedInfo.textContent = timeAgo(trend.publishedAt);
      publishedInfo.className = `published-info ${freshnessClass(trend.publishedAt)}`;
    }

    const scoreGrid = node.querySelector(".score-grid");
    scoreGrid.innerHTML = ["note", "x", "instagram"].map((key) => (
      `<div>${key}<strong>${Math.round(trend.platformScores[key])}</strong></div>`
    )).join("");

    const planGrid = node.querySelector(".plan-grid");
    planGrid.innerHTML = ["note", "x", "instagram"].map((key) => {
      const item = plan.plans[key];
      return `
        <section class="plan">
          <h3>${item.platform}</h3>
          <p>${item.objective}</p>
          <p>${planText(item).replace(/\n/g, "<br>")}</p>
          <p>${(item.hashtags || item.tags || []).join(" ")}</p>
        </section>
      `;
    }).join("");

    const checklist = node.querySelector(".checklist");
    checklist.innerHTML = plan.action.safetyChecklist
      .map((item) => `<li>${item}</li>`)
      .join("");
    container.appendChild(node);
  });
}

async function analyze(live = true) {
  setStatus("分析中");
  $("#analyzeBtn").disabled = true;
  const vBtn = $("#variationBtn");
  if (vBtn) vBtn.disabled = true;
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(live))
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "分析に失敗しました");
    renderResults(data);
    setStatus("完了");
  } catch (error) {
    setStatus("エラー");
    $("#results").innerHTML = `<article class="topic-card"><h2>取得に失敗しました</h2><p>${error.message}</p></article>`;
  } finally {
    $("#analyzeBtn").disabled = false;
  }
}

function updateCountdown() {
  const el = $("#countdown");
  if (!el) return;
  if (!state.nextRefreshAt) {
    el.textContent = "停止中";
    el.classList.remove("countdown-active");
    return;
  }
  const remainingMs = state.nextRefreshAt - Date.now();
  if (remainingMs <= 0) {
    el.textContent = "更新中…";
    return;
  }
  const remainingS = Math.ceil(remainingMs / 1000);
  const m = Math.floor(remainingS / 60);
  const s = remainingS % 60;
  el.textContent = `次回更新まで ${m}:${String(s).padStart(2, "0")}`;
  el.classList.add("countdown-active");
}

function startAutoRefresh() {
  stopAutoRefresh(true);
  state.autoRefresh = true;
  const intervalMs = state.refreshIntervalMinutes * 60 * 1000;
  state.nextRefreshAt = Date.now() + intervalMs;
  state.refreshTimerId = setInterval(async () => {
    await analyze(true);
    state.nextRefreshAt = Date.now() + intervalMs;
  }, intervalMs);
  state.countdownTimerId = setInterval(updateCountdown, 1000);
  updateCountdown();
}

function stopAutoRefresh(keepToggle = false) {
  state.autoRefresh = false;
  if (state.refreshTimerId) clearInterval(state.refreshTimerId);
  if (state.countdownTimerId) clearInterval(state.countdownTimerId);
  state.refreshTimerId = null;
  state.countdownTimerId = null;
  state.nextRefreshAt = null;
  updateCountdown();
  if (!keepToggle) {
    const toggle = $("#autoRefreshToggle");
    if (toggle) toggle.checked = false;
  }
}

$("#analyzeBtn").addEventListener("click", () => analyze(true));

const variationBtn = $("#variationBtn");
if (variationBtn) {
  variationBtn.addEventListener("click", () => generateVariations());
}

async function generateVariations() {
  if (!state.lastPlans || state.lastPlans.length === 0) {
    setStatus("先に「分析」を押してください");
    return;
  }
  const topTrends = state.lastPlans.slice(0, 3).map((plan) => ({
    title: plan.trend.title,
    publishedAt: plan.trend.publishedAt,
    sources: plan.trend.sources,
    url: plan.trend.url
  }));
  setStatus("バリエーション生成中");
  $("#analyzeBtn").disabled = true;
  variationBtn.disabled = true;
  try {
    const response = await fetch("/api/variations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        trends: topTrends,
        niche: $("#niche").value,
        audience: $("#audience").value,
        brandStance: $("#brandStance").value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "バリエーション生成に失敗しました");
    renderVariations(data);
    setStatus("バリエーション完了");
  } catch (error) {
    setStatus("エラー");
    $("#results").innerHTML = `<article class="topic-card"><h2>バリエーション生成に失敗しました</h2><p>${error.message}</p></article>`;
  } finally {
    $("#analyzeBtn").disabled = false;
    variationBtn.disabled = false;
  }
}

function renderVariations(data) {
  const container = $("#results");
  container.replaceChildren();
  (data.variations || []).forEach((entry, index) => {
    const trend = entry.trend;
    const variations = entry.variations;
    const card = document.createElement("article");
    card.className = "topic-card variation-card";
    card.innerHTML = `
      <div class="topic-head">
        <div>
          <p class="rank">#${index + 1} / バリエーション</p>
          <h2>${trend.title}</h2>
        </div>
      </div>
      ${renderVariationGroup("note", variations.note, "記事構成")}
      ${renderVariationGroup("x", variations.x, "X投稿")}
      ${renderVariationGroup("instagram", variations.instagram, "Reels台本")}
    `;
    container.appendChild(card);
  });
}

function renderVariationGroup(platform, items, label) {
  const list = items.map((item, i) => {
    const body = item.draft
      ? item.draft.replace(/\n/g, "<br>")
      : item.title
        ? `<strong>${item.title}</strong><br>${(item.outline || []).join("<br>")}${item.lead ? `<br><br>${item.lead}` : ""}`
        : `<strong>${item.hook}</strong><br>${(item.beats || []).join("<br>")}${item.caption ? `<br><br>${item.caption}` : ""}`;
    return `
      <details class="variation-item" ${i === 0 ? "open" : ""}>
        <summary>${item.angle}${item.hook ? `: ${item.hook}` : ""}</summary>
        <p>${body}</p>
        ${item.hashtags ? `<p class="tags">${item.hashtags.join(" ")}</p>` : ""}
      </details>
    `;
  }).join("");
  return `
    <section class="variation-platform">
      <h3>${label}</h3>
      ${list}
    </section>
  `;
}

const autoRefreshToggle = $("#autoRefreshToggle");
if (autoRefreshToggle) {
  autoRefreshToggle.addEventListener("change", (event) => {
    if (event.target.checked) startAutoRefresh();
    else stopAutoRefresh(true);
  });
}

const refreshIntervalSelect = $("#refreshInterval");
if (refreshIntervalSelect) {
  refreshIntervalSelect.addEventListener("change", (event) => {
    state.refreshIntervalMinutes = Number(event.target.value);
    if (state.autoRefresh) startAutoRefresh();
  });
}

// ===== アルゴリズム情報モーダル =====

const algorithmState = {
  data: null,
  currentTab: "x"
};

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function renderAlgorithmTab() {
  const body = $("#algorithmBody");
  if (!body) return;
  const data = algorithmState.data;
  if (!data) {
    body.innerHTML = "<p>読み込み中...</p>";
    return;
  }

  const platform = algorithmState.currentTab;
  const summaries = data.summaries || {};

  // staticフォールバック（APIキー未設定時）
  if (summaries.static_markdown) {
    const escaped = summaries.static_markdown
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    body.innerHTML = `
      <div class="algorithm-static">
        <p class="hint">Claude APIキー未設定のため、ローカルの分析ファイルを表示しています。APIキーを設定すると公式情報の最新版が自動取得されます。</p>
        <pre class="static-md">${escaped}</pre>
      </div>
    `;
    return;
  }

  const summary = summaries[platform];
  if (!summary) {
    body.innerHTML = `<p>${platform} の情報がありません。</p>`;
    return;
  }

  const sources = (data.sourceStatus || [])
    .find((s) => s.platform === platform)?.urls || [];

  body.innerHTML = `
    <div class="algorithm-section">
      <h3>全体像</h3>
      <p class="algorithm-summary">${summary.summary || ""}</p>
    </div>
    <div class="algorithm-section">
      <h3>投稿時に意識すべきポイント</h3>
      <ul class="algorithm-list">
        ${(summary.key_points || []).map((p) => `<li>${p}</li>`).join("")}
      </ul>
    </div>
    ${summary.what_to_avoid?.length ? `
      <div class="algorithm-section">
        <h3>避けるべき行動</h3>
        <ul class="algorithm-list warn">
          ${summary.what_to_avoid.map((p) => `<li>${p}</li>`).join("")}
        </ul>
      </div>
    ` : ""}
    <div class="algorithm-section">
      <h3>情報源</h3>
      <ul class="algorithm-sources">
        ${sources.map((s) => `
          <li>
            <span class="source-status ${s.status}">${s.status === "ok" ? "✓" : "✗"}</span>
            <a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

async function loadAlgorithmSummary(force = false) {
  const body = $("#algorithmBody");
  if (body) body.innerHTML = "<p>読み込み中...</p>";
  try {
    const url = force ? "/api/algorithm-summary?refresh=1" : "/api/algorithm-summary";
    const response = await fetch(url);
    const data = await response.json();
    algorithmState.data = data;
    const sub = $("#algorithmModalSub");
    if (sub) {
      const engineLabel = data.engine === "claude-sonnet-4-6" ? "Claude Sonnet 4.6で要約" : "静的ファイル";
      sub.textContent = `最終確認: ${formatDateTime(data.lastChecked)}（${engineLabel}）`;
    }
    renderAlgorithmTab();
  } catch (error) {
    if (body) body.innerHTML = `<p>取得に失敗しました: ${error.message}</p>`;
  }
}

function openAlgorithmModal() {
  const modal = $("#algorithmModal");
  if (!modal) return;
  modal.hidden = false;
  if (!algorithmState.data) loadAlgorithmSummary(false);
}

function closeAlgorithmModal() {
  const modal = $("#algorithmModal");
  if (modal) modal.hidden = true;
}

const algorithmBtn = $("#algorithmBtn");
if (algorithmBtn) algorithmBtn.addEventListener("click", openAlgorithmModal);

document.querySelectorAll("#algorithmModal [data-close]").forEach((el) => {
  el.addEventListener("click", closeAlgorithmModal);
});

document.querySelectorAll("#algorithmTabs .tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#algorithmTabs .tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    algorithmState.currentTab = btn.dataset.tab;
    renderAlgorithmTab();
  });
});

const algorithmRefreshBtn = $("#algorithmRefreshBtn");
if (algorithmRefreshBtn) algorithmRefreshBtn.addEventListener("click", () => loadAlgorithmSummary(true));

analyze(false);
