/**
 * Task assignment script for existing story tasks.
 * Updates assignee without rewriting Tasks metadata ordering.
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

  const employeeNotes = h.getEmployeeNotes();
  if (!employeeNotes.length) {
    new Notice("No employee notes identified. Create @Employee notes in 04_People first.");
    return "";
  }

  const selectedEmployee = await quickAddApi.suggester(
    employeeNotes.map((f) => f.basename),
    employeeNotes.map((f) => f.basename),
    "Assign to"
  );
  if (!selectedEmployee) {
    new Notice("Assignment cancelled — no changes made.");
    return "";
  }
  const mode = await quickAddApi.suggester(
    ["Assign existing (single)", "Assign existing (batch)"],
    ["single", "batch"],
    "Assignment mode"
  );
  if (!mode) {
    new Notice("Assignment cancelled — no changes made.");
    return "";
  }

  const employeeLink = h.normalizeAssigneeLink(selectedEmployee);

  // ===================== ASSIGN EXISTING =====================
  const taskRegex = /^(\s*[-*]\s+\[)([^\]])(\]\s+)(.*)$/;
  const openTaskMarkers = new Set([" ", "/", ">", "?"]);
  const candidates = [];
  const markdownFiles = app.vault.getMarkdownFiles();

  for (const file of markdownFiles) {
    if (!file.path.includes("/stories/") && !file.path.startsWith("03_Deliverables/")) continue;
    const content = await app.vault.cachedRead(file);
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(taskRegex);
      if (!match) continue;
      const marker = match[2];
      if (!openTaskMarkers.has(marker)) continue;
      const text = match[4].trim();
      if (!text) continue;

      candidates.push({ file, lineIndex: i, line, taskText: text });
    }
  }

  if (!candidates.length) {
    new Notice("No matching active tasks found");
    return "";
  }

  const makeLabel = (item) => {
    const cleaned = h.cleanTaskLabel(item.line);
    const preview = cleaned.length > 100 ? `${cleaned.slice(0, 100)}…` : cleaned;
    return `${preview}  ⸱  ${item.file.basename}`;
  };

  const assignCandidate = async (candidate) => {
    const fileContent = await app.vault.read(candidate.file);
    const lines = fileContent.split("\n");
    const originalLine = lines[candidate.lineIndex] || candidate.line;

    let patched = originalLine.replace(/\[\[@[^\]]+\]\]/g, employeeLink);
    if (!/\[\[@[^\]]+\]\]/.test(patched)) {
      patched = patched.replace(taskRegex, `$1$2$3${employeeLink} $4`);
    }
    patched = patched.replace(/\s+#delegated\b/g, '');

    lines[candidate.lineIndex] = patched;
    await app.vault.modify(candidate.file, lines.join("\n"));
  };

  let assignedCount = 0;
  let lastOpenedFile = null;

  if (mode === "single") {
    const selected = await quickAddApi.suggester(
      candidates.map(makeLabel), candidates, "Select task to assign"
    );
    if (!selected) {
      new Notice("Assignment cancelled — no changes made.");
      return "";
    }
    await assignCandidate(selected);
    assignedCount = 1;
    lastOpenedFile = selected.file;
  } else {
    // batch
    let remaining = [...candidates];
    while (remaining.length > 0) {
      const selected = await quickAddApi.suggester(
        remaining.map(makeLabel), remaining,
        `Select task to assign (${assignedCount} done)`
      );
      if (!selected) break;

      await assignCandidate(selected);
      assignedCount++;
      lastOpenedFile = selected.file;

      const key = `${selected.file.path}#${selected.lineIndex}`;
      remaining = remaining.filter((it) => `${it.file.path}#${it.lineIndex}` !== key);

      const next = await quickAddApi.suggester(
        ["Assign one more", "Finish"],
        ["more", "finish"],
        "Continue?"
      );
      if (next !== "more") break;
    }
  }

  if (lastOpenedFile) {
    app.workspace.openLinkText(lastOpenedFile.path, "", false);
  }

  new Notice(assignedCount ? `Assigned ${assignedCount} task${assignedCount === 1 ? "" : "s"}` : "No tasks assigned");
  return "";
};
