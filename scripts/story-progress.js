// Reusable DataviewJS view for story-level task stats.
// Usage from a story note:
//   ```dataviewjs
//   await dv.view("scripts/story-progress")
//   ```

const TASK_PATTERN = /^-\s+\[([ x\/?>*-])\]\s+(.+)$/i;
const SIZE_PATTERN = /#s-(XS|S|M|L|XL)\b/i;
const SIZE_WEIGHT = { XL: 4, L: 3, M: 2, S: 1.5, XS: 1, unsized: 1 };

function parseTaskLine(line) {
  const match = String(line || "").trim().match(TASK_PATTERN);
  if (!match) return null;

  const state = match[1];
  const body = match[2];
  const size = body.match(SIZE_PATTERN)?.[1] || "unsized";

  return {
    raw: line,
    state,
    size,
    isDone: state.toLowerCase() === "x",
    isInProgress: state === "/",
    isCancelled: state === "*" || state === "-",
    isNotDone: [" ", "/", ">", "?"].includes(state),
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

const file = app.vault.getAbstractFileByPath(dv.current().file.path);
if (!file) {
  dv.paragraph("Story file not found.");
  return;
}

const content = await app.vault.cachedRead(file);
const tasks = content
  .split("\n")
  .map(parseTaskLine)
  .filter(Boolean);

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

// Summary bar
dv.el("div", progressBar(donePoints, inProgressPoints, totalPoints));

const ptsLabel = pointsPct === null ? "" : ` **${pointsPct}%**`;
dv.paragraph(
  `✅ ${donePoints}/${totalPoints} pts${ptsLabel} · ${doneTasks.length} done · ⏳ ${inProgressTasks.length} in progress · 📋 ${notDoneTasks.length - inProgressTasks.length} open · **${activeTasks.length}** total`
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