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

  // Collect open tasks from the entire 03_Deliverables tree
  const taskRegex = /^(\s*[-*]\s+\[)([^\]])(\]\s+)(.*)$/;
  const openStates = new Set([" ", "/", ">", "?"]);
  const checkboxRegex = /^(\s*-\s+\[)[^\]](\])/;

  // Optionally scope to active file if it's inside Deliverables
  const activeFile = app.workspace.getActiveFile();
  const scopeToActive = activeFile && activeFile.path.startsWith("03_Deliverables/");

  let targetFile = null;
  let lines = [];
  let candidates = [];

  if (scopeToActive) {
    // Offer: current file or pick any
    const scope = await quickAddApi.suggester(
      [`Current file (${activeFile.basename})`, "Pick from all deliverables"],
      ["current", "all"],
      "Where to complete tasks?"
    );
    if (!scope) return "";

    if (scope === "current") {
      targetFile = activeFile;
      const content = await app.vault.read(targetFile);
      lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(taskRegex);
        if (m && openStates.has(m[2])) {
          candidates.push({ line: i, text: lines[i].trim(), raw: lines[i], label: h.cleanTaskLabel(lines[i]) });
        }
      }
    }
  }

  if (!targetFile) {
    // Scan all deliverable files
    const allCandidates = [];
    for (const file of app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith("03_Deliverables/")) continue;
      const content = await app.vault.cachedRead(file);
      const fileLines = content.split("\n");
      for (let i = 0; i < fileLines.length; i++) {
        const m = fileLines[i].match(taskRegex);
        if (m && openStates.has(m[2])) {
          allCandidates.push({
            file,
            line: i,
            text: fileLines[i].trim(),
            raw: fileLines[i],
            label: `${h.cleanTaskLabel(fileLines[i])}  ⸱  ${file.basename}`,
          });
        }
      }
    }

    if (!allCandidates.length) {
      new Notice("No open tasks found.");
      return "";
    }

    const today = h.moment ? h.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);

    const selectedLabels = await quickAddApi.checkboxPrompt(
      allCandidates.map((c) => c.label),
      []
    );
    if (!selectedLabels || !selectedLabels.length) return "";
    const selected = new Set(selectedLabels);
    // Group by file for efficient writes
    const byFile = new Map();
    for (const c of allCandidates) {
      if (!selected.has(c.label)) continue;
      if (!byFile.has(c.file.path)) byFile.set(c.file.path, []);
      byFile.get(c.file.path).push(c);
    }
    for (const [filePath, tasks] of byFile) {
      const file = app.vault.getAbstractFileByPath(filePath);
      const content = await app.vault.read(file);
      const fl = content.split("\n");
      for (const t of tasks) {
        let updated = fl[t.line].replace(checkboxRegex, "$1x$2");
        if (!/✅\s*\d{4}-\d{2}-\d{2}/.test(updated)) updated += ` ✅ ${today}`;
        fl[t.line] = updated;
      }
      await app.vault.modify(file, fl.join("\n"));
      await h.touchStoryLastPing(file);
    }

    new Notice("Task(s) completed.");
    return "";
  }

  // Single-file mode (current file)
  if (!candidates.length) {
    new Notice("No open tasks in current file.");
    return "";
  }

  const today = h.moment ? h.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);
  const markDone = (candidate) => {
    let updated = lines[candidate.line].replace(checkboxRegex, "$1x$2");
    if (!/✅\s*\d{4}-\d{2}-\d{2}/.test(updated)) updated += ` ✅ ${today}`;
    lines[candidate.line] = updated;
  };

  const selectedLabels = await quickAddApi.checkboxPrompt(
    candidates.map((c) => c.label),
    []
  );
  if (!selectedLabels || !selectedLabels.length) return "";
  const selected = new Set(selectedLabels);
  for (const c of candidates) {
    if (selected.has(c.label)) markDone(c);
  }

  await app.vault.modify(targetFile, lines.join("\n"));
  await h.touchStoryLastPing(targetFile);
  new Notice("Task(s) completed.");
  return "";
};
