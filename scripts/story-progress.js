// Reusable DataviewJS view for story-level task stats.
// Usage from a story note:
//   ```dataviewjs
//   await dv.view("scripts/story-progress")
//   ```

const TASK_PATTERN = /^-\s+\[([ x\/?>*-])\]\s+(.+)$/i;
const SIZE_PATTERN = /#s-(XS|S|M|L|XL)\b/i;
const DUE_PATTERN = /📅\s*(\d{4}-\d{2}-\d{2})/i;
const SIZE_WEIGHT = { XL: 4, L: 3, M: 2, S: 1.5, XS: 1, unsized: 1 };

function parseTaskLine(line) {
  const match = String(line || "").trim().match(TASK_PATTERN);
  if (!match) return null;

  const state = match[1];
  const body = match[2];
  const size = body.match(SIZE_PATTERN)?.[1] || "unsized";
  const dueDate = body.match(DUE_PATTERN)?.[1] || "";

  return {
    raw: line,
    state,
    size,
    dueDate,
    isDone: state.toLowerCase() === "x",
    isInProgress: state === "/",
    isCancelled: state === "*" || state === "-",
    isNotDone: [" ", "/", ">", "?"].includes(state),
    isExternal: false,
    sourcePath: "",
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

function getDueRisk(task, today) {
  if (!task.dueDate || task.isDone || task.isCancelled) return "";
  if (task.dueDate < today) return "🔴 overdue";
  const delta = Math.round((new Date(`${task.dueDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
  if (delta <= 3) return "🟠 due soon";
  return "";
}

// ── Gather local tasks ──
const storyPath = dv.current().file.path;
const storyName = dv.current().file.name;
const file = app.vault.getAbstractFileByPath(storyPath);
if (!file) {
  dv.paragraph("Story file not found.");
  return;
}

const content = await app.vault.cachedRead(file);
const localTasks = content.split("\n").map(parseTaskLine).filter(Boolean);

// ── Gather external tasks linking to this story ──
const externalTasks = [];
const resolved = app.metadataCache.resolvedLinks || {};
const candidatePaths = [];
for (const [sourcePath, targets] of Object.entries(resolved)) {
  if (sourcePath === storyPath) continue;
  if (targets?.[storyPath]) candidatePaths.push(sourcePath);
}

const escapedName = storyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const storyLinkRegex = new RegExp(`\\[\\[\\s*(?:[^\\]]*\\/)?${escapedName}(?:\\|[^\\]]+)?\\s*\\]\\]`, "i");

for (const candidatePath of candidatePaths) {
  const f = app.vault.getAbstractFileByPath(candidatePath);
  if (!f || !candidatePath.endsWith(".md")) continue;
  const extContent = await app.vault.cachedRead(f);
  for (const line of extContent.split("\n")) {
    if (!line.trimStart().startsWith("- [")) continue;
    if (!storyLinkRegex.test(line)) continue;
    const parsed = parseTaskLine(line);
    if (parsed) {
      parsed.isExternal = true;
      parsed.sourcePath = candidatePath;
      externalTasks.push(parsed);
    }
  }
}

// ── Deduplicate: external task skipped if identical text exists locally ──
const localTexts = new Set(localTasks.map((t) => t.raw.trim()));
const uniqueExternal = externalTasks.filter((t) => !localTexts.has(t.raw.trim()));

const tasks = [...localTasks, ...uniqueExternal];
const today = new Date().toISOString().slice(0, 10);

const activeTasks = tasks.filter((task) => !task.isCancelled);
const doneTasks = activeTasks.filter((task) => task.isDone);
const inProgressTasks = activeTasks.filter((task) => task.isInProgress);
const notDoneTasks = activeTasks.filter((task) => task.isNotDone);
const completionPct = activeTasks.length ? Math.round((doneTasks.length / activeTasks.length) * 100) : null;

const bySize = ["XS", "S", "M", "L", "XL", "unsized"].map((size) => {
  const sizeTasks = activeTasks.filter((task) => task.size === size);
  const done = sizeTasks.filter((task) => task.isDone).length;
  const inProg = sizeTasks.filter((task) => task.isInProgress).length;
  const open = sizeTasks.filter((task) => task.isNotDone && !task.isInProgress).length;
  return { size, done, inProg, open, total: done + inProg + open };
}).filter((entry) => entry.total > 0);

const getWeight = (task) => SIZE_WEIGHT[task.size] || 1;
const donePoints = activeTasks.filter((t) => t.isDone).reduce((sum, t) => sum + getWeight(t), 0);
const inProgressPoints = activeTasks.filter((t) => t.isInProgress).reduce((sum, t) => sum + getWeight(t), 0);
const totalPoints = activeTasks.reduce((sum, t) => sum + getWeight(t), 0);
const pointsPct = totalPoints ? Math.round((donePoints / totalPoints) * 100) : null;

if (!activeTasks.length) {
  dv.paragraph("*No tasks yet.*");
  return;
}

// ── Due date risk summary ──
const overdueTasks = activeTasks.filter((t) => getDueRisk(t, today) === "🔴 overdue");
const dueSoonTasks = activeTasks.filter((t) => getDueRisk(t, today) === "🟠 due soon");

// ── Summary bar ──
dv.el("div", progressBar(donePoints, inProgressPoints, totalPoints));

const ptsLabel = pointsPct === null ? "" : ` **${pointsPct}%**`;
const extLabel = uniqueExternal.length ? ` · 🔗 ${uniqueExternal.filter((t) => !t.isCancelled).length} external` : "";
const riskLabel = (overdueTasks.length ? ` · 🔴 ${overdueTasks.length} overdue` : "") + (dueSoonTasks.length ? ` · 🟠 ${dueSoonTasks.length} due soon` : "");
dv.paragraph(
  `✅ ${donePoints}/${totalPoints} pts${ptsLabel} · ${doneTasks.length} done · ⏳ ${inProgressTasks.length} in progress · 📋 ${notDoneTasks.length - inProgressTasks.length} open · **${activeTasks.length}** total${extLabel}${riskLabel}`
);

// Size breakdown (only if multiple sizes)
if (bySize.length > 1) {
  const sizeRows = bySize.map((entry) => {
    const miniPct = entry.total ? Math.round((entry.done / entry.total) * 100) : 0;
    const sizePts = entry.total ? ((SIZE_WEIGHT[entry.size] || 1) * entry.done).toFixed(1) + "/" + ((SIZE_WEIGHT[entry.size] || 1) * entry.total).toFixed(1) : "-";
    return [
      `**${entry.size}**`,
      `${entry.done}/${entry.total}`,
      miniPct + "%",
      sizePts,
      entry.inProg || "-",
      entry.open || "-",
    ];
  });
  dv.table(["Size", "Done", "%", "Points", "In Prog", "Open"], sizeRows);
}

// ── External tasks detail (only if any) ──
if (uniqueExternal.filter((t) => !t.isCancelled).length) {
  const extRows = uniqueExternal.filter((t) => !t.isCancelled).map((t) => {
    const risk = getDueRisk(t, today);
    const sourceLink = t.sourcePath.replace(/\.md$/, "").split("/").pop();
    return [
      t.raw.replace(TASK_PATTERN, "$2").replace(storyLinkRegex, "").trim().slice(0, 60),
      t.isDone ? "✅" : t.isInProgress ? "⏳" : "📋",
      t.dueDate || "-",
      risk || "✅",
      `[[${sourceLink}]]`,
    ];
  });
  dv.header(4, `🔗 External Tasks (${extRows.length})`);
  dv.table(["Task", "Status", "Due", "Risk", "Source"], extRows);
}