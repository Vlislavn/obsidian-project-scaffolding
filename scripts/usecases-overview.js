// ═══════════════════════════════════════════════════════════════════════════════
// 📦 UseCases Overview — Compact dashboard matching Feature Timeline style
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────────
// STATUS DEFINITIONS (SSOT) — mirrors feature-timeline.js
// ─────────────────────────────────────────────────────────────────────────────────
const STATUS = {
  extracted:   { done: false, actionable: true,  color: "#9E9E9E", icon: "○", label: "Extracted" },
  ready:       { done: false, actionable: true,  color: "#2196F3", icon: "◉", label: "Ready" },
  in_progress: { done: false, actionable: false, color: "#FF9800", icon: "⚡", label: "In Progress" },
  testing:     { done: false, actionable: true,  color: "#612161", icon: "🧪", label: "Testing" },
  done:        { done: true,  actionable: false, color: "#4CAF50", icon: "✓", label: "Done" },
  deferred:    { done: false, actionable: false, color: "#78909C", icon: "⏸", label: "Deferred" },
  archived:    { done: false, actionable: false, color: "#616161", icon: "📦", label: "Archived" },
  isolated:    { done: false, actionable: true,  color: "#FF5722", icon: "🔍", label: "Isolated" },
  fixed:       { done: true,  actionable: false, color: "#8BC34A", icon: "✅", label: "Fixed" },
};

const UC_STATUS = {
  definition:    { color: "#9E9E9E", icon: "📝", label: "Definition", order: 0 },
  ready:         { color: "#2196F3", icon: "◉",  label: "Ready", order: 1 },
  in_progress:   { color: "#FF9800", icon: "⚡", label: "In Progress", order: 2 },
  implementation:{ color: "#FF9800", icon: "🔧", label: "Implementation", order: 2 },
  done:          { color: "#4CAF50", icon: "✓",  label: "Done", order: 3 },
};

// MoSCoW for stacked bars
const MOSCOW = {
  must:    { color: "#E53935", icon: "M", label: "Must" },
  should:  { color: "#FB8C00", icon: "S", label: "Should" },
  could:   { color: "#43A047", icon: "C", label: "Could" },
  wont:    { color: "#78909C", icon: "W", label: "Won't" },
  unknown: { color: "#B0BEC5", icon: "?", label: "Unspecified" },
};

// ─────────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────────
const asOne = v => Array.isArray(v) ? v[0] : v;

const getStatusKey = f => {
  const raw = asOne(f.status);
  if (typeof raw === "string" && raw in STATUS) return raw;
  return "extracted";
};

const statusCfg = key => STATUS[key] || STATUS.extracted;
const ucStatusCfg = key => UC_STATUS[key] || UC_STATUS.definition;

const normalizeMoscow = v => {
  if (v == null) return "";
  const s = String(v).toLowerCase().trim().replace(/[_-]/g, " ");
  if (!s) return "";
  if (["m", "must", "must have"].includes(s) || s.startsWith("must")) return "must";
  if (["s", "should", "should have"].includes(s) || s.startsWith("should")) return "should";
  if (["c", "could", "could have", "nice to have"].includes(s) || s.startsWith("could")) return "could";
  if (["w", "wont", "won't", "wont have"].includes(s) || s.startsWith("won")) return "wont";
  return "";
};

const getPhaseNum = f => {
  const n = Number(asOne(f.phase));
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

const isMvpFlagTrue = f => {
  const val = asOne(f.mvp ?? f.MVP);
  return val === true || val === "true" || val === "yes";
};

const fallbackMoscowKey = (f, stKey) => {
  if (["deferred", "archived"].includes(stKey)) return "wont";
  const ph = getPhaseNum(f);
  if (isMvpFlagTrue(f) && ph < 2) return "must";
  if (ph === 1) return "should";
  if (ph >= 2) return "could";
  return "unknown";
};

const getMoscowKey = (f, stKey) => {
  const raw = asOne(f.moscow ?? f.MoSCoW ?? f.priority_moscow);
  if (raw) {
    const key = normalizeMoscow(raw);
    if (key) return key;
  }
  return fallbackMoscowKey(f, stKey);
};

const stripWikiLink = s => {
  if (!s) return "";
  const str = String(s);
  const match = str.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  return match ? match[1].split("/").pop() : str;
};

const resolveBlocker = b => {
  const rawName = b?.path
    ? b.path.split("/").pop().replace(/\.md$/, "")
    : stripWikiLink(b);

  let page = null;
  if (b?.path) {
    page = dv.page(b.path);
  } else {
    const bare = stripWikiLink(b);
    page = dv.page(bare) || dv.page(`Feature.${bare}`);
  }

  const stKey = page ? getStatusKey(page) : "unknown";
  return { stKey };
};

const isBlocked = f => {
  const b = f.blocked_by;
  if (!b || (Array.isArray(b) && b.length === 0)) return false;
  const items = (Array.isArray(b) ? b : [b]).map(resolveBlocker);
  return items.some(x => !statusCfg(x.stKey).done);
};

const normalizeRefName = ref => {
  if (!ref) return "";
  if (ref.path) return ref.path.split("/").pop().replace(/\.md$/, "");
  const raw = String(ref);
  const match = raw.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  const core = match ? match[1] : raw;
  return core.split("/").pop().replace(/\.md$/, "").trim();
};

const matchesUseCase = (feature, ucFileName, ucPath) => {
  const ref = feature.use_case_ref;
  if (!ref || !ucFileName) return false;
  const refName = normalizeRefName(ref);
  if (!refName) return false;
  if (ref.path && (ref.path === ucPath || ref.path.includes(`/${ucFileName}.md`))) return true;
  if (refName === ucFileName) return true;
  return refName.endsWith(`.${ucFileName}`) || ucFileName.endsWith(`.${refName}`);
};

const bg = (hex, a = "22") => `${hex}${a}`;
const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;

// ─────────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────────
const getUseCasePages = () => {
  const scoped = dv.pages('"10_Management/UseCases"')
    .where(p => p.file.name.startsWith("Mgmt.UseCases.") && !p.file.name.includes(".bak"));
  if (scoped && scoped.length) return scoped;
  return dv.pages()
    .where(p => p.file?.name?.startsWith("Mgmt.UseCases.") && !p.file?.name?.includes(".bak"));
};

const getFeaturePages = () => {
  const scoped = dv.pages('"02_Features" or "agents_done"');
  if (scoped && scoped.length) return scoped;
  return dv.pages()
    .where(p => p.file?.name?.startsWith("Feature.") || p.file?.path?.includes("/02_Features/") || p.file?.path?.includes("/agents_done/"));
};

const useCases = getUseCasePages()
  .sort(p => (p.benefit || 0), "desc");

const allFeatures = getFeaturePages()
  .where(p => !p.file.name.includes(".Research"));

// ─────────────────────────────────────────────────────────────────────────────────
// Aggregate Data
// ─────────────────────────────────────────────────────────────────────────────────
let totalFeatures = 0, totalDone = 0, totalActive = 0, totalBlocked = 0, totalNow = 0;
const ucData = [];

for (const uc of useCases) {
  const ucFileName = uc.file.name;
  const ucPath = uc.file.path;
  const shortName = ucFileName.replace("Mgmt.UseCases.", "");
  const features = allFeatures.where(f => matchesUseCase(f, ucFileName, ucPath));
  const total = features.length;

  const counts = { done: 0, in_progress: 0, ready: 0, testing: 0, isolated: 0, extracted: 0, deferred: 0, blocked: 0, now: 0 };
  const moscowCounts = { must: 0, should: 0, could: 0, wont: 0, unknown: 0 };
  let mvpDone = 0, mvpTotal = 0;

  for (const f of features) {
    const stKey = getStatusKey(f);
    const cfg = statusCfg(stKey);
    const blocked = isBlocked(f);
    const mk = getMoscowKey(f, stKey);

    if (cfg.done) counts.done++;
    else if (stKey === "in_progress") counts.in_progress++;
    else if (stKey === "ready") counts.ready++;
    else if (stKey === "testing") counts.testing++;
    else if (stKey === "isolated") counts.isolated++;
    else if (stKey === "deferred") counts.deferred++;
    else counts.extracted++;

    if (blocked) counts.blocked++;
    if (!blocked && cfg.actionable && !cfg.done) counts.now++;

    moscowCounts[mk]++;

    if (isMvpFlagTrue(f)) {
      mvpTotal++;
      if (cfg.done) mvpDone++;
    }
  }

  const completionPct = pct(counts.done, total);
  const ucStatus = asOne(uc.status) || "definition";
  const ucCfg = ucStatusCfg(ucStatus);

  totalFeatures += total;
  totalDone += counts.done;
  totalActive += counts.in_progress;
  totalBlocked += counts.blocked;
  totalNow += counts.now;

  ucData.push({ uc, shortName, total, counts, moscowCounts, mvpDone, mvpTotal, completionPct, ucStatus, ucCfg });
}

// Sort: active work first, then by completion, then by benefit
ucData.sort((a, b) => {
  // In progress first
  const aActive = a.counts.in_progress > 0 ? 0 : 1;
  const bActive = b.counts.in_progress > 0 ? 0 : 1;
  if (aActive !== bActive) return aActive - bActive;
  // Then by completion
  if (b.completionPct !== a.completionPct) return b.completionPct - a.completionPct;
  // Then by benefit
  return (b.uc.benefit || 0) - (a.uc.benefit || 0);
});

// ─────────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────────
const globalPct = pct(totalDone, totalFeatures);

// Global breakdown for top bars
const globalCounts = ucData.reduce((acc, d) => {
  for (const k of Object.keys(d.counts)) acc[k] = (acc[k] || 0) + (d.counts[k] || 0);
  return acc;
}, {});

const globalMoscowCounts = ucData.reduce((acc, d) => {
  for (const k of Object.keys(d.moscowCounts)) acc[k] = (acc[k] || 0) + (d.moscowCounts[k] || 0);
  return acc;
}, {});

const uid = Math.random().toString(36).slice(2, 8);

dv.container.innerHTML = `
<style>
  .uc-container-${uid} { font-family:var(--font-text); margin:16px 0; padding:12px; border-radius:10px; background:var(--background-primary); border:1px solid var(--background-modifier-border); }
  .uc-header-${uid} { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
  .uc-title-${uid} { font-size:1em; font-weight:700; display:flex; align-items:center; gap:8px; }
  .uc-substats-${uid} { font-size:0.8em; color:var(--text-muted); display:flex; gap:10px; flex-wrap:wrap; }

  .uc-controls-${uid} { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .uc-search-${uid} {
    height:28px; padding:0 10px; border-radius:8px;
    background:var(--background-secondary);
    border:1px solid var(--background-modifier-border);
    color:var(--text-normal);
    font-size:0.85em;
    width:220px;
  }
  .uc-search-${uid}:focus { outline: none; border-color: var(--interactive-accent); box-shadow: 0 0 0 2px ${bg("#2196F3", "22")}; }

  .uc-toggle-${uid} { font-size:0.8em; color:var(--text-muted); display:flex; align-items:center; gap:6px; user-select:none; }
  .uc-toggle-${uid} input { transform: translateY(1px); }

  .uc-cards-${uid} { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
  .uc-card-${uid} { padding:8px; border-radius:8px; background:var(--background-secondary); min-width:220px; flex:1; }
  .uc-card-title-${uid} { font-size:0.75em; color:var(--text-muted); margin-bottom:4px; display:flex; align-items:center; justify-content:space-between; gap:8px; }

  .uc-list-${uid} { margin-top:8px; }

  .uc-row-${uid} {
    display:grid;
    grid-template-columns: 3px minmax(160px, 1.4fr) 170px 110px auto;
    gap:10px;
    align-items:center;
    padding:8px 10px;
    margin:6px 0;
    border-radius:10px;
    background:var(--background-secondary);
    border:1px solid var(--background-modifier-border);
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }
  .uc-row-${uid}:hover { background:var(--background-secondary-alt); border-color:var(--background-modifier-border-hover); }
  .uc-accent-${uid} { width:3px; height:26px; border-radius:2px; opacity:0.95; }

  .uc-namewrap-${uid} { min-width:0; }
  .uc-name-${uid} { font-size:0.9em; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block; }
  .uc-meta-${uid} { font-size:0.75em; color:var(--text-muted); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .uc-bars-${uid} { display:flex; flex-direction:column; gap:5px; }
  .uc-bar-${uid} { height:7px; border-radius:4px; overflow:hidden; background:var(--background-modifier-border); display:flex; }
  .uc-barseg-${uid} { height:100%; min-width:1px; }
  .uc-barhint-${uid} { font-size:0.72em; color:var(--text-muted); display:flex; justify-content:space-between; gap:8px; }

  .uc-badges-${uid} { display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
  .uc-badge-${uid} { font-size:0.72em; padding:2px 6px; border-radius:6px; background:var(--background-modifier-border); color:var(--text-normal); }
  .uc-badge-strong-${uid} { font-weight:700; }

  .uc-empty-${uid} { opacity:0.55; }

  @media (max-width: 900px) {
    .uc-row-${uid} { grid-template-columns: 3px minmax(160px, 1fr) 1fr; grid-auto-rows:auto; }
    .uc-row-${uid} > :nth-child(3) { grid-column: 1 / -1; }
    .uc-row-${uid} > :nth-child(4) { grid-column: 1 / -1; }
    .uc-row-${uid} > :nth-child(5) { grid-column: 1 / -1; justify-content:flex-start; }
    .uc-badges-${uid} { justify-content:flex-start; }
    .uc-search-${uid} { width: 100%; max-width: 420px; }
  }
</style>

<div class="uc-container-${uid}" data-uc-root="${uid}">
  <div class="uc-header-${uid}">
    <div class="uc-title-${uid}">
      <span>📦</span>
      <span>UseCases Overview</span>
    </div>
    <div class="uc-controls-${uid}">
      <input class="uc-search-${uid}" type="search" placeholder="Filter use cases…" data-uc-filter="${uid}" />
      <label class="uc-toggle-${uid}">
        <input type="checkbox" checked data-uc-hide-empty="${uid}" />
        Hide empty
      </label>
    </div>
    <div class="uc-substats-${uid}" title="NOW = unblocked + actionable">
      <span style="color:#4CAF50;">✓</span> ${totalDone}/${totalFeatures} (${globalPct}%)
      <span style="margin-left:6px; color:#66BB6A;">▶</span> ${totalNow} now
      <span style="margin-left:6px; color:#FF9800;">⚡</span> ${totalActive} active
      <span style="margin-left:6px; color:#E53935;">🔒</span> ${totalBlocked} blocked
    </div>
  </div>

  <div class="uc-cards-${uid}">
    <div class="uc-card-${uid}">
      <div class="uc-card-title-${uid}"><span>Status</span><span style="font-size:0.7em; color:var(--text-muted);">(all features)</span></div>
      ${stackedBar([
        { label: "Done", count: globalCounts.done || 0, color: STATUS.done.color },
        { label: "In Progress", count: globalCounts.in_progress || 0, color: STATUS.in_progress.color },
        { label: "Ready", count: globalCounts.ready || 0, color: STATUS.ready.color },
        { label: "Testing", count: globalCounts.testing || 0, color: STATUS.testing.color },
        { label: "Isolated", count: globalCounts.isolated || 0, color: STATUS.isolated.color },
        { label: "Extracted", count: globalCounts.extracted || 0, color: STATUS.extracted.color },
        { label: "Deferred", count: globalCounts.deferred || 0, color: STATUS.deferred.color },
      ], totalFeatures)}
      <div class="uc-barhint-${uid}">
        <span>Done ${globalCounts.done || 0}</span>
        <span>Now ${totalNow} · Blocked ${totalBlocked}</span>
      </div>
    </div>

    <div class="uc-card-${uid}">
      <div class="uc-card-title-${uid}"><span>MoSCoW</span><span style="font-size:0.7em; color:var(--text-muted);">(all features)</span></div>
      ${stackedBar([
        { label: "Must", count: globalMoscowCounts.must || 0, color: MOSCOW.must.color },
        { label: "Should", count: globalMoscowCounts.should || 0, color: MOSCOW.should.color },
        { label: "Could", count: globalMoscowCounts.could || 0, color: MOSCOW.could.color },
        { label: "Won't", count: globalMoscowCounts.wont || 0, color: MOSCOW.wont.color },
        { label: "Unspecified", count: globalMoscowCounts.unknown || 0, color: MOSCOW.unknown.color },
      ], totalFeatures)}
      <div class="uc-barhint-${uid}">
        <span style="color:var(--text-muted);">M/S/C/W</span>
        <span>${(globalMoscowCounts.must || 0)}/${(globalMoscowCounts.should || 0)}/${(globalMoscowCounts.could || 0)}/${(globalMoscowCounts.wont || 0)}</span>
      </div>
    </div>
  </div>

  <div class="uc-list-${uid}" data-uc-list="${uid}"></div>
</div>
`;

const root = dv.container.querySelector(`[data-uc-root="${uid}"]`);
const listEl = root.querySelector(`[data-uc-list="${uid}"]`);
const filterEl = root.querySelector(`[data-uc-filter="${uid}"]`);
const hideEmptyEl = root.querySelector(`[data-uc-hide-empty="${uid}"]`);

filterEl.addEventListener("input", render);
hideEmptyEl.addEventListener("change", render);
render();

function render() {
  const q = (filterEl.value || "").trim().toLowerCase();
  const hideEmpty = !!hideEmptyEl.checked;

  const filtered = ucData.filter(d => {
    if (hideEmpty && d.total === 0) return false;
    if (!q) return true;
    const name = (d.shortName || "").toLowerCase();
    const full = (d.uc?.file?.name || "").toLowerCase();
    return name.includes(q) || full.includes(q);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:0.85em;">No matches.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(renderRow).join("");
}

function renderRow(d) {
  const { uc, shortName, total, counts, moscowCounts, mvpDone, mvpTotal, completionPct, ucCfg } = d;

  const accent = ucCfg.color;
  const benefit = (uc?.benefit != null) ? Number(uc.benefit) : null;
  const metaParts = [];
  if (benefit != null && Number.isFinite(benefit)) metaParts.push(`benefit ${benefit}`);
  metaParts.push(`${counts.done}/${total} done (${completionPct}%)`);
  const meta = metaParts.join(" · ");

  const statusBar = stackedBar([
    { label: "Done", count: counts.done || 0, color: STATUS.done.color },
    { label: "In Progress", count: counts.in_progress || 0, color: STATUS.in_progress.color },
    { label: "Ready", count: counts.ready || 0, color: STATUS.ready.color },
    { label: "Testing", count: counts.testing || 0, color: STATUS.testing.color },
    { label: "Isolated", count: counts.isolated || 0, color: STATUS.isolated.color },
    { label: "Extracted", count: counts.extracted || 0, color: STATUS.extracted.color },
    { label: "Deferred", count: counts.deferred || 0, color: STATUS.deferred.color },
  ], total);

  const moscowBar = stackedBar([
    { label: "Must", count: moscowCounts.must || 0, color: MOSCOW.must.color },
    { label: "Should", count: moscowCounts.should || 0, color: MOSCOW.should.color },
    { label: "Could", count: moscowCounts.could || 0, color: MOSCOW.could.color },
    { label: "Won't", count: moscowCounts.wont || 0, color: MOSCOW.wont.color },
    { label: "Unspecified", count: moscowCounts.unknown || 0, color: MOSCOW.unknown.color },
  ], total);

  const badges = [];
  if (counts.now) badges.push(badge(`▶ ${counts.now}`, "#4CAF50", "Ready to start now"));
  if (counts.in_progress) badges.push(badge(`⚡ ${counts.in_progress}`, STATUS.in_progress.color, "In progress"));
  if (counts.blocked) badges.push(badge(`🔒 ${counts.blocked}`, "#E53935", "Blocked"));
  if (mvpTotal > 0) badges.push(badge(`MVP ${mvpDone}/${mvpTotal}`, mvpDone === mvpTotal ? "#4CAF50" : "#78909C", "MVP completion"));
  badges.push(`<span class="uc-badge-${uid}" style="color:var(--text-muted);">Σ ${total}</span>`);

  const emptyCls = total === 0 ? ` uc-empty-${uid}` : "";

  return `
    <div class="uc-row-${uid}${emptyCls}" title="${shortName}">
      <div class="uc-accent-${uid}" style="background:${accent};"></div>
      <div class="uc-namewrap-${uid}">
        <a href="${uc.file.path}" class="internal-link uc-name-${uid}">${shortName}</a>
        <div class="uc-meta-${uid}">${meta}</div>
      </div>
      <div class="uc-bars-${uid}">${statusBar}</div>
      <div class="uc-bars-${uid}">${moscowBar}</div>
      <div class="uc-badges-${uid}">${badges.join("")}</div>
    </div>
  `;
}

function badge(text, color, title) {
  return `<span class="uc-badge-${uid} uc-badge-strong-${uid}" style="color:${color}; background:${bg(color, "18")};" title="${title}">${text}</span>`;
}

function stackedBar(segments, totalCount) {
  if (!totalCount) {
    return `<div class="uc-bar-${uid}" title="No data"></div>`;
  }
  const inner = segments
    .filter(s => (s.count || 0) > 0)
    .map(s => {
      const w = ((s.count / totalCount) * 100).toFixed(1);
      return `<div class="uc-barseg-${uid}" style="width:${w}%; background:${s.color};" title="${s.label}: ${s.count}"></div>`;
    })
    .join("");

  const hintLeft = `<span>${Math.round((segments[0]?.count || 0) / totalCount * 100)}%</span>`;
  const hintRight = `<span>${segments[0]?.count || 0}/${totalCount}</span>`;

  return `
    <div class="uc-bar-${uid}">${inner}</div>
    <div class="uc-barhint-${uid}">${hintLeft}${hintRight}</div>
  `;
}
