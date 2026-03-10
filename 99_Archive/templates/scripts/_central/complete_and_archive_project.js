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

module.exports = async ({ app }) => {
  const COMMON_PATH = "99_Archive/templates/scripts/_central/common.js";
  let commonFactory;
  try { commonFactory = await _load(app, COMMON_PATH); } catch (_) {}
  if (!commonFactory) { new Notice("Cannot load common.js"); return ""; }
  const common = commonFactory({ app });
  const { moment, getFrontmatter, updateFrontmatterField } = common;

  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice("Open a deliverable or story note first");
    return "";
  }

  const frontmatter = getFrontmatter(activeFile);
  const noteType = String(frontmatter.type || "").toLowerCase();
  if (!["deliverable", "story"].includes(noteType)) {
    new Notice("Active note must be a deliverable or story.");
    return "";
  }

  await updateFrontmatterField(activeFile, "status", "completed");
  if (!String(frontmatter.completed_at || "").trim()) {
    await updateFrontmatterField(activeFile, "completed_at", moment().format("YYYY-MM-DD"));
  }

  new Notice(`${noteType === 'deliverable' ? 'Deliverable' : 'Story'} marked as completed.`);
  return "";
};
