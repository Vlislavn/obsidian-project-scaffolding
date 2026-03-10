/**
 * process_inbox.js — Triage files in 00_Inbox/.
 * For each file: preview → route into SSOT folders or create an inline Story task.
 * Mobile-safe via universal loader.
 */

// === Universal Module Loader (mobile + desktop) ===
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
  // Detect simple wrapper: module.exports = require('...')
  const wrapperMatch = code.match(/^\s*module\.exports\s*=\s*require\((['"])(.+?)\1\)\s*;?\s*$/);
  if (wrapperMatch) {
    const normalizePath = (input) => {
      const parts = String(input || "").split("/");
      const stack = [];
      for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") stack.pop();
        else stack.push(part);
      }
      return stack.join("/");
    };
    const resolveRequest = (from, request) => {
      if (!request) return request;
      if (request.startsWith(".")) {
        const baseDir = String(from || "").split("/").slice(0, -1).join("/");
        const full = normalizePath(`${baseDir}/${request}`);
        return full.endsWith(".js") ? full : `${full}.js`;
      }
      return request;
    };
    const redirected = resolveRequest(relPath, wrapperMatch[2]);
    if (redirected) return _load(app, redirected);
  }
  // 3) Execute as CommonJS wrapper (same as QuickAdd internals)
  const g = globalThis;
  const evalFn = (typeof g.eval === "function") ? g.eval : null;
  if (!evalFn) throw new Error("eval is not available in this runtime");
  const exports = {};
  const module = { exports };
  const req = (id) => (typeof g.require === "function" ? g.require(id) : undefined);
  const wrapped = `(function(require, module, exports){\n${code}\n;return module.exports;})`;
  const fn = evalFn(wrapped);
  if (typeof fn !== "function") throw new Error(`Eval wrapper did not return function: ${typeof fn}`);
  const loaded = fn(req, module, exports);
  const finalExport = loaded ?? module.exports ?? exports.default ?? exports;
  if (finalExport == null) throw new Error("Module exported undefined/null");
  return finalExport;
};
// === End Loader ===

module.exports = async ({ app, quickAddApi }) => {
  const COMMON_PATH = "99_Archive/templates/scripts/_central/common.js";
  let commonFactory;
  try {
    commonFactory = await _load(app, COMMON_PATH);
  } catch (_) {}
  if (!commonFactory) {
    new Notice("Cannot load common.js");
    return "";
  }
  const h = commonFactory({ app });

  const inboxFolder = "00_Inbox";
  const inboxFiles = app.vault.getMarkdownFiles()
    .filter((f) => f.path.startsWith(inboxFolder + "/"))
    .sort((a, b) => b.stat.mtime - a.stat.mtime);

  if (!inboxFiles.length) {
    new Notice("Inbox is empty — nothing to process!");
    return "";
  }

  new Notice(`${inboxFiles.length} item(s) in inbox`);

  let processed = 0;
  let moved = 0;
  let deleted = 0;
  let tasked = 0;

  for (const file of inboxFiles) {
    const content = await app.vault.cachedRead(file);
    const preview = content.split("\n").slice(0, 15).join("\n");
    const previewTrunc = preview.length > 500 ? preview.slice(0, 500) + "…" : preview;

    const action = await quickAddApi.suggester(
      [
        `🔄 Move to Process`,
        `📝 Move to Backlog`,
        `🗓️ Move to Meeting`,
        `📎 Move to Deliverable docs`,
        `✅ Create Story task from this`,
        `📦 Move to Archive`,
        `🗑️ Delete`,
        `⏭️ Skip`,
        `🛑 Stop processing`
      ],
      ["process", "backlog", "meeting", "docs", "task", "archive", "delete", "skip", "stop"],
      `${file.basename}\n─────\n${previewTrunc}`
    );

    if (!action || action === "stop") break;
    if (action === "skip") {
      processed++;
      continue;
    }

    if (action === "delete") {
      await app.vault.trash(file, true);
      deleted++;
      processed++;
      continue;
    }

    if (action === "process" || action === "backlog" || action === "meeting" || action === "archive") {
      const targetFolderByAction = {
        process: "01_Basic_Info/process",
        backlog: "01_Basic_Info/backlog",
        meeting: "02_Meeting",
        archive: "99_Archive",
      };
      const targetFolder = targetFolderByAction[action];
      await h.ensureFolder(targetFolder);
      let newPath = `${targetFolder}/${file.name}`;
      if (await app.vault.adapter.exists(newPath)) {
        const stamp = h.moment ? h.moment().format('YYYYMMDD-HHmmss') : Date.now();
        newPath = `${targetFolder}/${file.basename}-${stamp}.md`;
      }
      await app.fileManager.renameFile(file, newPath);
      moved++;
      processed++;
      new Notice(`Moved to ${targetFolder}`);
      continue;
    }

    if (action === "docs") {
      const deliverables = h.getDeliverableNotes();
      if (!deliverables.length) {
        new Notice("No deliverables found");
        continue;
      }
      const deliverable = await quickAddApi.suggester(
        deliverables.map((item) => item.basename),
        deliverables,
        'Attach to which deliverable?'
      );
      if (!deliverable) continue;
      const docsFolder = `${deliverable.parent.path}/docs`;
      await h.ensureFolder(docsFolder);
      let newPath = `${docsFolder}/${file.name}`;
      if (await app.vault.adapter.exists(newPath)) {
        const stamp = h.moment ? h.moment().format('YYYYMMDD-HHmmss') : Date.now();
        newPath = `${docsFolder}/${file.basename}-${stamp}.md`;
      }
      await app.fileManager.renameFile(file, newPath);
      moved++;
      processed++;
      new Notice(`Attached to ${deliverable.basename}/docs`);
      continue;
    }

    if (action === "task") {
      const stories = h.getStoryNotes();
      const employees = h.getEmployeeNotes();
      if (!stories.length) {
        new Notice("No story notes found");
        continue;
      }
      if (!employees.length) {
        new Notice("No employee notes identified");
        continue;
      }

      const inputs = await quickAddApi.requestInputs([
        {
          id: 'taskName',
          label: 'Task name',
          type: 'text',
          defaultValue: file.basename,
          placeholder: 'Task name'
        },
        {
          id: 'story',
          label: 'Story',
          type: 'suggester',
          options: stories.map((story) => story.basename).sort(),
          suggesterConfig: { multiSelect: false }
        },
        {
          id: 'assignee',
          label: 'Assignee',
          type: 'suggester',
          options: employees.map((employee) => employee.basename).sort(),
          suggesterConfig: { multiSelect: false }
        },
        {
          id: 'taskSize',
          label: 'Task size',
          type: 'suggester',
          options: ['#s-XS', '#s-S', '#s-M', '#s-L', '#s-XL'],
          defaultValue: '#s-S',
          suggesterConfig: { multiSelect: false }
        },
        {
          id: 'dueDate',
          label: 'Due date',
          type: 'text',
          placeholder: 'today, tomorrow, YYYY-MM-DD'
        },
        {
          id: 'delegateNow',
          label: 'Delegate now',
          type: 'dropdown',
          options: ['No', 'Yes'],
          defaultValue: 'No'
        }
      ]);
      if (!inputs) continue;

      const selectedStory = stories.find((story) => story.basename === String(inputs.story || '').trim());
      if (!selectedStory) {
        new Notice('Select a valid story');
        continue;
      }

      const due = h.parseAndFormatDate(inputs.dueDate);
      const storyFrontmatter = h.getFrontmatter(selectedStory);
      const deliverableLink = String(storyFrontmatter.deliverable || '').replace(/^"|"$/g, '').trim();
      const line = h.buildInlineTaskLine({
        storyFile: selectedStory,
        taskName: String(inputs.taskName || '').trim() || file.basename,
        assignee: String(inputs.assignee || '').trim(),
        deliverableLink,
        dueDate: due.valid ? due.formatted : '',
        taskSize: String(inputs.taskSize || '#s-S').trim(),
        delegated: String(inputs.delegateNow || 'No') === 'Yes',
        notes: `From inbox: [[${file.basename}]]`
      });
      const heading = await h.ensureHeading(selectedStory.path, ['### Tasks', '## Tasks']);
      const storyContent = await app.vault.read(selectedStory);
      const storyLines = storyContent.split('\n');
      const headingIndex = storyLines.findIndex((lineItem) => lineItem.trim() === heading.trim());
      storyLines.splice(headingIndex + 1, 0, line);
      await app.vault.modify(selectedStory, storyLines.join('\n'));

      const docsFolder = selectedStory.parent?.parent?.path ? `${selectedStory.parent.parent.path}/docs` : '01_Basic_Info/process';
      await h.ensureFolder(docsFolder);
      let newPath = `${docsFolder}/${file.name}`;
      if (await app.vault.adapter.exists(newPath)) {
        const stamp = h.moment ? h.moment().format('YYYYMMDD-HHmmss') : Date.now();
        newPath = `${docsFolder}/${file.basename}-${stamp}.md`;
      }
      await app.fileManager.renameFile(file, newPath);
      tasked++;
      processed++;
      new Notice(`Task created in ${selectedStory.basename}`);
      continue;
    }
  }

  const summary = [
    `Processed: ${processed}`,
    moved ? `Moved: ${moved}` : null,
    deleted ? `Deleted: ${deleted}` : null,
    tasked ? `Tasks created: ${tasked}` : null,
    `Remaining: ${inboxFiles.length - processed}`
  ].filter(Boolean).join(" | ");

  new Notice(summary);
  return "";
};
