/**
 * Escalate a task into a full story note.
 * Selects a task via suggester, pre-fills metadata from the task line,
 * creates a story under the parent deliverable, and cancels the original task.
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

  // ── 1. Select task to escalate (same pattern as edit_task.js) ──
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

  const selected = await quickAddApi.suggester(
    candidates.map(makeLabel), candidates, "Select task to escalate"
  );
  if (!selected) return "";

  // ── 2. Extract metadata from the task line ──
  const taskText = selected.taskText;
  const cleanTitle = h.cleanTaskLabel(selected.line);
  const dueDateMatch = taskText.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
  const dueDate = dueDateMatch ? dueDateMatch[1] : "";
  const assigneeMatch = taskText.match(/\[\[@([^\]]+)\]\]/);
  const parsedAssignee = assigneeMatch ? assigneeMatch[1].trim() : "";

  // ── 3. Show one full form with parsed defaults ──
  const deliverables = h.getDeliverableNotes();
  const employees = h.getEmployeeNotes();
  const dateFieldType = h.getPreferredDateFieldType();

  // Detect parent deliverable from source story path
  let parsedDeliverable = "";
  if (selected.file.parent?.path.endsWith("/stories")) {
    const deliverableFolderPath = selected.file.parent.parent?.path;
    const matchedDeliverable = deliverables.find(
      (d) => d.parent?.path === deliverableFolderPath
    );
    if (matchedDeliverable) parsedDeliverable = matchedDeliverable.basename;
  }

  // Reorder deliverables so parsed one appears first
  const deliverableNames = deliverables.map((d) => d.basename).sort();
  if (parsedDeliverable) {
    const idx = deliverableNames.findIndex(
      (n) => n.toLowerCase() === parsedDeliverable.toLowerCase()
    );
    if (idx > 0) {
      const [found] = deliverableNames.splice(idx, 1);
      deliverableNames.unshift(found);
    }
  }

  // Reorder employees so the parsed assignee appears first
  const employeeNames = employees.map((e) => e.basename).sort();
  if (parsedAssignee) {
    const matchName = `@${parsedAssignee.replace(/^@+/, "")}`;
    const idx = employeeNames.findIndex(
      (n) => n.toLowerCase() === matchName.toLowerCase()
    );
    if (idx > 0) {
      const [found] = employeeNames.splice(idx, 1);
      employeeNames.unshift(found);
    }
  }

  const inputs = await quickAddApi.requestInputs([
    {
      id: "storyTitle",
      label: "Story title",
      type: "text",
      placeholder: "Story title…",
      defaultValue: cleanTitle,
    },
    {
      id: "deliverable",
      label: "Parent deliverable",
      type: "suggester",
      options: deliverableNames,
      suggesterConfig: { multiSelect: false },
      placeholder: "Select deliverable…",
      defaultValue: parsedDeliverable || undefined,
    },
    {
      id: "owner",
      label: "Owner",
      type: "suggester",
      options: employeeNames,
      suggesterConfig: { multiSelect: false },
      placeholder: "Select owner…",
      defaultValue: parsedAssignee ? `@${parsedAssignee.replace(/^@+/, "")}` : undefined,
    },
    {
      id: "deadline",
      label: "Deadline",
      type: dateFieldType,
      dateFormat: "YYYY-MM-DD",
      placeholder: "YYYY-MM-DD",
      defaultValue: dueDate,
    },
  ]);
  if (!inputs) return "";

  const storyTitle = String(inputs.storyTitle || "").trim();
  if (!storyTitle) { new Notice("Story title is required."); return ""; }

  const deliverableName = String(inputs.deliverable || "").trim();
  const d = deliverables.find((x) => x.basename === deliverableName);
  if (!d) { new Notice("Select a valid deliverable."); return ""; }

  const ownerLink = h.normalizeAssigneeLink(inputs.owner) || '[[@Name]]';
  const deadlineParsed = h.parseAndFormatDate(inputs.deadline);

  // ── 4. Cancel original task ──
  const today = h.moment ? h.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);
  const fileContent = await app.vault.read(selected.file);
  const lines = fileContent.split("\n");
  let cancelledLine = lines[selected.lineIndex];
  // Change checkbox to cancelled [*]
  cancelledLine = cancelledLine.replace(/^(\s*[-*]\s+\[)[^\]]/, "$1*");
  // Append cancelled date if not present
  if (!/❌\s*\d{4}-\d{2}-\d{2}/.test(cancelledLine)) {
    cancelledLine += ` ❌ ${today}`;
  }
  lines[selected.lineIndex] = cancelledLine;
  await app.vault.modify(selected.file, lines.join("\n"));

  // ── 5. Create story file ──
  const safe = h.sanitizeFileName(storyTitle);
  const storiesFolder = `${d.parent.path}/stories`;
  await h.ensureFolder(storiesFolder);
  const newPath = `${storiesFolder}/$${safe}.md`;

  const source = `[[${selected.file.basename}]]`;
  const body = [
    '---',
    'type: story',
    'status: backlog',
    `owner: "${ownerLink}"`,
    `deliverable: "[[${d.basename}]]"`,
    'size: S',
    'blocking: ""',
    'blocked_by: ""',
    `deadline: ${deadlineParsed.valid ? deadlineParsed.formatted : ''}`,
    'moscow: must',
    'last_ping: ',
    '---',
    '',
    `# ${storyTitle}`,
    '',
    '## Description',
    '',
    `Escalated from task in ${source}.`,
    '',
    '```dataviewjs',
    'await dv.view("scripts/add-task-button");',
    '```',
    '',
    '### Tasks',
    '',
    '- [ ] Define first implementation task',
    '',
    '## Task Stats',
    '',
    '```dataviewjs',
    'await dv.view("scripts/story-progress");',
    '```',
    ''
  ].join('\n');

  await app.vault.create(newPath, body);
  const created = app.vault.getAbstractFileByPath(newPath);
  if (created) await app.workspace.getLeaf(true).openFile(created);
  new Notice("Task escalated into new Story note.");
  return "";
};
