/**
 * Unified "Edit Task" macro — find a task by fuzzy search, then pick an action:
 *   Change assignee / Change size / Change due date / Change scheduled date /
 *   Change status / Move to another story
 */

const _load = async (app, relPath) => {
  let code = "";
  const af = app.vault.getAbstractFileByPath(relPath);
  if (af) {
    try { code = await app.vault.read(af); } catch (_) {}
  }
  if (!code?.trim()) {
    try { code = await app.vault.adapter.read(relPath); } catch (_) {}
  }
  if (!code || !code.trim()) throw new Error(`Empty file: ${relPath}`);
  const g = globalThis;
  const evalFn = (typeof g.eval === 'function') ? g.eval : null;
  if (!evalFn) throw new Error('eval unavailable');
  const exports = {};
  const module = { exports };
  const req = (id) => (typeof g.require === 'function' ? g.require(id) : undefined);
  const wrapped = `(function(require, module, exports){\n${code}\n;return module.exports;})`;
  const fn = evalFn(wrapped);
  const loaded = fn(req, module, exports);
  return loaded ?? module.exports ?? exports;
};

module.exports = async ({ app, quickAddApi }) => {
  const commonFactory = await _load(app, '99_Archive/templates/scripts/_central/common.js');
  const h = commonFactory({ app });

  // ── Find the task ──
  const taskRegex = /^(\s*[-*]\s+\[)([^\]])(\]\s+)(.*)$/;
  const openStates = new Set([" ", "/", ">", "?"]);
  const candidates = [];

  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith("03_Deliverables/")) continue;
    const content = await app.vault.cachedRead(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(taskRegex);
      if (!match) continue;
      if (!openStates.has(match[2])) continue;
      const text = match[4].trim();
      if (!text) continue;
      candidates.push({ file, lineIndex: i, line: lines[i], taskText: text });
    }
  }

  if (!candidates.length) {
    new Notice("No open tasks found.");
    return "";
  }

  const makeLabel = (item) => {
    const clean = h.cleanTaskLabel(item.line);
    const preview = clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
    return `${preview}  ⸱  ${item.file.basename}`;
  };

  const selected = await quickAddApi.suggester(candidates.map(makeLabel), candidates, "Select task to edit");
  if (!selected) return "";

  // ── Pick action ──
  const actions = [
    { label: "👤 Change assignee", value: "assignee" },
    { label: "📏 Change size", value: "size" },
    { label: "📅 Change due date", value: "due" },
    { label: "⏳ Change scheduled date", value: "scheduled" },
    { label: "🔄 Change status", value: "status" },
    { label: "📂 Move to another story", value: "move" },
  ];

  const action = await quickAddApi.suggester(
    actions.map((a) => a.label),
    actions.map((a) => a.value),
    "What to change?"
  );
  if (!action) return "";

  // Read fresh content for the file
  const fileContent = await app.vault.read(selected.file);
  const lines = fileContent.split("\n");
  let taskLine = lines[selected.lineIndex];

  // ── Action handlers ──

  if (action === "assignee") {
    const employees = h.getEmployeeNotes();
    if (!employees.length) { new Notice("No employees found."); return ""; }
    const newAssignee = await quickAddApi.suggester(
      employees.map((e) => e.basename),
      employees.map((e) => e.basename),
      "New assignee"
    );
    if (!newAssignee) return "";
    const link = h.normalizeAssigneeLink(newAssignee);
    if (/\[\[@[^\]]+\]\]/.test(taskLine)) {
      taskLine = taskLine.replace(/\[\[@[^\]]+\]\]/g, link);
    } else {
      // Insert after checkbox
      taskLine = taskLine.replace(taskRegex, `$1$2$3${link} $4`);
    }
  }

  if (action === "size") {
    const sizes = ["#s-XS", "#s-S", "#s-M", "#s-L", "#s-XL"];
    const newSize = await quickAddApi.suggester(sizes, sizes, "New size");
    if (!newSize) return "";
    if (/#s-(XS|S|M|L|XL)\b/.test(taskLine)) {
      taskLine = taskLine.replace(/#s-(XS|S|M|L|XL)\b/, newSize);
    } else {
      // Insert after checkbox text, before first emoji marker
      const insertPos = taskLine.search(/\s[➕⏳📅✅❌]/);
      if (insertPos > 0) {
        taskLine = taskLine.slice(0, insertPos) + ` ${newSize}` + taskLine.slice(insertPos);
      } else {
        taskLine += ` ${newSize}`;
      }
    }
  }

  if (action === "due") {
    const dateFieldType = h.getPreferredDateFieldType();
    const dateInputs = await quickAddApi.requestInputs([
      { id: "dueDate", label: "New due date", type: dateFieldType, dateFormat: "YYYY-MM-DD", placeholder: "today, tomorrow, YYYY-MM-DD" }
    ]);
    if (!dateInputs) return "";
    const parsed = h.parseAndFormatDate(dateInputs.dueDate);
    if (!parsed.valid) { new Notice("Invalid date."); return ""; }
    if (/📅\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
      taskLine = taskLine.replace(/📅\s*\d{4}-\d{2}-\d{2}/, `📅 ${parsed.formatted}`);
    } else {
      taskLine += ` 📅 ${parsed.formatted}`;
    }
  }

  if (action === "scheduled") {
    const dateFieldType = h.getPreferredDateFieldType();
    const dateInputs = await quickAddApi.requestInputs([
      { id: "scheduledDate", label: "New scheduled date", type: dateFieldType, dateFormat: "YYYY-MM-DD", placeholder: "today, tomorrow, YYYY-MM-DD" }
    ]);
    if (!dateInputs) return "";
    const parsed = h.parseAndFormatDate(dateInputs.scheduledDate);
    if (!parsed.valid) { new Notice("Invalid date."); return ""; }
    if (/⏳\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
      taskLine = taskLine.replace(/⏳\s*\d{4}-\d{2}-\d{2}/, `⏳ ${parsed.formatted}`);
    } else {
      const duePos = taskLine.indexOf("📅");
      const insertBefore = duePos > 0 ? duePos : -1;
      if (insertBefore > 0) {
        taskLine = taskLine.slice(0, insertBefore) + `⏳ ${parsed.formatted} ` + taskLine.slice(insertBefore);
      } else {
        taskLine += ` ⏳ ${parsed.formatted}`;
      }
    }
  }

  if (action === "status") {
    const statusOptions = [
      { label: "[ ] Todo", marker: " " },
      { label: "[/] In progress", marker: "/" },
      { label: "[?] Review", marker: "?" },
      { label: "[x] Done", marker: "x" },
      { label: "[*] Cancelled", marker: "*" },
    ];
    const picked = await quickAddApi.suggester(
      statusOptions.map((s) => s.label),
      statusOptions,
      "New status"
    );
    if (!picked) return "";

    const today = h.moment ? h.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);

    // Update checkbox marker
    taskLine = taskLine.replace(/^(\s*[-*]\s+\[)[^\]]/, `$1${picked.marker}`);

    // Append completion/cancellation date if marking done or cancelled
    if (picked.marker === "x" && !/✅\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
      taskLine += ` ✅ ${today}`;
    }
    if (picked.marker === "*" && !/❌\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
      taskLine += ` ❌ ${today}`;
    }
    if (picked.marker === "/" && !/🛫\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
      taskLine += ` 🛫 ${today}`;
    }
  }

  if (action === "move") {
    const stories = h.getStoryNotes();
    if (!stories.length) { new Notice("No stories found."); return ""; }
    const targetStoryName = await quickAddApi.suggester(
      stories.map((s) => s.basename),
      stories.map((s) => s.basename),
      "Move task to story"
    );
    if (!targetStoryName) return "";
    const targetStory = stories.find((s) => s.basename === targetStoryName);
    if (!targetStory) return "";

    if (targetStory.path === selected.file.path) {
      new Notice("Task is already in that story.");
      return "";
    }

    const confirm = await quickAddApi.suggester(
      ["Yes — move task", "Cancel"],
      ["yes", "no"],
      `Move to ${targetStoryName}?`
    );
    if (confirm !== "yes") return "";

    // Remove from source
    const removedLine = lines.splice(selected.lineIndex, 1)[0];
    await app.vault.modify(selected.file, lines.join("\n"));

    // Add to target
    const heading = await h.ensureHeading(targetStory.path, ["### Tasks", "## Tasks"]);
    const targetContent = await app.vault.read(targetStory);
    const targetLines = targetContent.split("\n");
    const headingIdx = targetLines.findIndex((l) => l.trim() === heading.trim());
    targetLines.splice(headingIdx + 1, 0, removedLine);
    await app.vault.modify(targetStory, targetLines.join("\n"));
    await h.touchStoryLastPing(selected.file);
    await h.touchStoryLastPing(targetStory);

    new Notice(`Task moved to ${targetStoryName}.`);
    app.workspace.openLinkText(targetStory.path, "", false);
    return "";
  }

  // Write change back (for non-move actions)
  lines[selected.lineIndex] = taskLine;
  await app.vault.modify(selected.file, lines.join("\n"));
  await h.touchStoryLastPing(selected.file);

  new Notice(`Task updated (${action}).`);
  app.workspace.openLinkText(selected.file.path, "", false);
  return "";
};
