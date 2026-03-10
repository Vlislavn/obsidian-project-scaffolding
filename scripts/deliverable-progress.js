// Reusable DataviewJS view for deliverable-level progress.
// Usage from a note:
//   ```dataviewjs
//   await dv.view("scripts/deliverable-progress")
//   ```

const TASK_PATTERN = /^-\s+\[([ x\/?>*-])\]\s+(.+)$/i;
const LINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const DUE_PATTERN = /📅\s*(\d{4}-\d{2}-\d{2})/i;
const BLOCKED_BY_PATTERN = /⛔\s*([A-Za-z0-9_\- ,]+)/i;
const SIZE_PATTERN = /#s-(XS|S|M|L|XL)\b/i;
const SIZE_WEIGHT = { XL: 4, L: 3, M: 2, S: 1.5, XS: 1, unsized: 1 };

function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "string") return value.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  if (typeof value.toISODate === "function") return value.toISODate() || "";
  return String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

function normalizeLinkValue(value) {
  return String(value || "").replace(/^"|"$/g, "").trim();
}

function parseTaskLine(line) {
  const match = String(line || "").trim().match(TASK_PATTERN);
  if (!match) return null;

  const state = match[1];
  const body = match[2];
  const links = [...body.matchAll(LINK_PATTERN)].map((entry) => entry[1]);
  const assignee = links.find((link) => link.startsWith("@")) || links[0] || "";
  const dueDate = body.match(DUE_PATTERN)?.[1] || "";
  const blockedBy = (body.match(BLOCKED_BY_PATTERN)?.[1] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    raw: line,
    state,
    assignee,
    dueDate,
    blockedBy,
    size: body.match(SIZE_PATTERN)?.[1] || "unsized",
    isDone: state.toLowerCase() === "x",
    isInProgress: state === "/",
    isCancelled: state === "*" || state === "-",
    isOpen: [" ", "/", ">", "?"].includes(state),
  };
}

function summarizeStoryTasks(content) {
  const tasks = content.split("\n").map(parseTaskLine).filter(Boolean);
  const activeTasks = tasks.filter((task) => !task.isCancelled);
  const doneTasks = activeTasks.filter((task) => task.isDone);
  const inProgressTasks = activeTasks.filter((task) => task.isInProgress);
  const openTasks = activeTasks.filter((task) => task.isOpen && !task.isInProgress);
  const blockedTasks = activeTasks.filter((task) => task.blockedBy.length > 0);
  const completionPct = activeTasks.length ? Math.round((doneTasks.length / activeTasks.length) * 100) : null;

  const getWeight = (task) => SIZE_WEIGHT[task.size] || 1;
  const donePoints = doneTasks.reduce((sum, t) => sum + getWeight(t), 0);
  const inProgressPoints = inProgressTasks.reduce((sum, t) => sum + getWeight(t), 0);
  const openPoints = openTasks.reduce((sum, t) => sum + getWeight(t), 0);
  const totalPoints = activeTasks.reduce((sum, t) => sum + getWeight(t), 0);
  const pointsPct = totalPoints ? Math.round((donePoints / totalPoints) * 100) : null;

  return {
    tasks,
    activeTotal: activeTasks.length,
    done: doneTasks.length,
    inProgress: inProgressTasks.length,
    open: openTasks.length,
    blocked: blockedTasks.length,
    completionPct,
    donePoints,
    inProgressPoints,
    openPoints,
    totalPoints,
    pointsPct,
  };
}

function progressBar(done, inProgress, total) {
  if (!total) return "";
  const pctDone = Math.round((done / total) * 100);
  const pctInProg = Math.round((inProgress / total) * 100);
  return `<div style="background:#3b3b3b;border-radius:6px;overflow:hidden;height:10px;width:100%;margin:4px 0">` +
    `<div style="display:flex;height:100%">` +
    `<div style="background:#4caf50;width:${pctDone}%"></div>` +
    `<div style="background:#ff9800;width:${pctInProg}%"></div>` +
    `</div></div>`;
}

function flagEmoji(flag) {
  if (flag === "overdue") return "🔴 overdue";
  if (flag === "at risk") return "🟡 at risk";
  if (flag === "stale") return "🟡 stale";
  if (flag === "blocked") return "⚠️ blocked";
  return flag;
}

const today = normalizeDate(new Date().toISOString());
const deliverable = dv.current();
const stories = dv.pages('"' + dv.current().file.folder + '/stories"')
  .where((story) => String(story.type || "").toLowerCase() === "story")
  .array();

const storyMetrics = [];
const sizeLoad = new Map();

for (const story of stories) {
  const file = app.vault.getAbstractFileByPath(story.file.path);
  if (!file) continue;

  const content = await app.vault.cachedRead(file);
  const metrics = summarizeStoryTasks(content);
  const deadline = normalizeDate(story.deadline);
  const lastPing = normalizeDate(story.last_ping);
  const status = String(story.status || "backlog").toLowerCase();
  const storyBlockedBy = String(story.blocked_by || "").trim();
  const flags = [];

  if (deadline && deadline < today && !["completed", "done"].includes(status)) flags.push("overdue");
  if (deadline && deadline >= today) {
    const deltaDays = Math.round((new Date(`${deadline}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
    if (deltaDays <= 7 && !["completed", "done"].includes(status)) flags.push("at risk");
  }
  if (!lastPing || lastPing < normalizeDate(new Date(Date.now() - 14 * 86400000).toISOString())) {
    if (!["completed", "done"].includes(status)) flags.push("stale");
  }
  if (storyBlockedBy || metrics.blocked > 0) flags.push("blocked");

  for (const task of metrics.tasks) {
    if (task.isCancelled) continue;
    const key = task.size || "unsized";
    const weight = SIZE_WEIGHT[key] || 1;
    if (!sizeLoad.has(key)) sizeLoad.set(key, { done: 0, inProgress: 0, open: 0, total: 0, donePoints: 0, inProgressPoints: 0, openPoints: 0, totalPoints: 0 });
    const entry = sizeLoad.get(key);
    entry.total += 1;
    entry.totalPoints += weight;
    if (task.isDone) { entry.done += 1; entry.donePoints += weight; }
    else if (task.isInProgress) { entry.inProgress += 1; entry.inProgressPoints += weight; }
    else { entry.open += 1; entry.openPoints += weight; }
  }

  storyMetrics.push({
    story,
    status,
    deadline,
    lastPing,
    owner: normalizeLinkValue(story.owner) || "-",
    size: String(story.size || "-") || "-",
    blocking: String(story.blocking || "").trim(),
    blockedBy: storyBlockedBy,
    ...metrics,
    flags,
  });
}

const totalStories = storyMetrics.length;
const doneStories = storyMetrics.filter((entry) => ["completed", "done"].includes(entry.status)).length;
const totalActiveTasks = storyMetrics.reduce((sum, entry) => sum + entry.activeTotal, 0);
const doneTasks = storyMetrics.reduce((sum, entry) => sum + entry.done, 0);
const inProgressTasks = storyMetrics.reduce((sum, entry) => sum + entry.inProgress, 0);
const openTasks = storyMetrics.reduce((sum, entry) => sum + entry.open, 0);
const blockedStories = storyMetrics.filter((entry) => entry.flags.includes("blocked")).length;
const staleStories = storyMetrics.filter((entry) => entry.flags.includes("stale")).length;
const overdueStories = storyMetrics.filter((entry) => entry.flags.includes("overdue")).length;
const totalDonePoints = storyMetrics.reduce((sum, e) => sum + e.donePoints, 0);
const totalInProgressPoints = storyMetrics.reduce((sum, e) => sum + e.inProgressPoints, 0);
const totalOpenPoints = storyMetrics.reduce((sum, e) => sum + e.openPoints, 0);
const totalAllPoints = storyMetrics.reduce((sum, e) => sum + e.totalPoints, 0);
const taskPointsPct = totalAllPoints ? Math.round((totalDonePoints / totalAllPoints) * 100) : 0;
const storyPct = totalStories ? Math.round((doneStories / totalStories) * 100) : 0;
const taskPct = totalActiveTasks ? Math.round((doneTasks / totalActiveTasks) * 100) : 0;

// ── Summary ──
dv.header(3, "📊 Deliverable Summary");

const summaryHtml = `<div style="padding:8px 0">` +
  `<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:6px">` +
  `<span>👤 ${normalizeLinkValue(deliverable.owner) || "-"}</span>` +
  `<span>🏷️ ${String(deliverable.status || "backlog")}</span>` +
  `<span>📅 ${normalizeDate(deliverable.deadline) || "no deadline"}</span>` +
  `</div>` +
  `<div style="margin:6px 0"><strong>Stories:</strong> ${storyPct}% (${doneStories}/${totalStories})</div>` +
  progressBar(doneStories, 0, totalStories) +
  `<div style="margin:6px 0"><strong>Tasks:</strong> ${taskPointsPct}% complete (${totalDonePoints}/${totalAllPoints} pts)</div>` +
  progressBar(totalDonePoints, totalInProgressPoints, totalAllPoints) +
  `<div style="margin-top:4px">` +
  `✅ ${doneTasks} done · ⏳ ${inProgressTasks} in progress · 📋 ${openTasks} open · <strong>${totalActiveTasks}</strong> total` +
  `</div></div>`;

dv.el("div", summaryHtml);

// ── Attention ──
const attentionItems = storyMetrics.filter((entry) => entry.flags.length);
if (attentionItems.length) {
  dv.header(3, "🚨 Attention Required");
  dv.table(
    ["Story", "Issue", "Deadline", "Owner"],
    attentionItems.map((entry) => [
      entry.story.file.link,
      entry.flags.map(flagEmoji).join(" · "),
      entry.deadline || "-",
      entry.owner,
    ])
  );
}

// ── Story Breakdown ──
dv.header(3, "📋 Story Breakdown");
dv.table(
  ["Story", "Progress", "Done", "Open", "Status", "Deadline", "Flags"],
  storyMetrics.map((entry) => {
    const pctLabel = entry.completionPct === null ? "-" : `${entry.completionPct}%`;
    return [
      entry.story.file.link,
      pctLabel,
      entry.done,
      entry.inProgress + entry.open,
      entry.status,
      entry.deadline || "-",
      entry.flags.length ? entry.flags.map(flagEmoji).join(" ") : "✅",
    ];
  })
);

// ── Task Load by Size ──
const sizeRows = ["XS", "S", "M", "L", "XL", "unsized"]
  .map((size) => ({
    size,
    ...(sizeLoad.get(size) || { done: 0, inProgress: 0, open: 0, total: 0 }),
  }))
  .filter((entry) => entry.total > 0);

if (sizeRows.length) {
  dv.header(3, "📦 Task Load by Size");
  dv.table(
    ["Size", "Done", "In Prog", "Open", "Total", "Points"],
    sizeRows.map((entry) => [
      `**${entry.size}**`,
      entry.done,
      entry.inProgress,
      entry.open,
      entry.total,
      `${entry.donePoints}/${entry.totalPoints}`,
    ])
  );
}
