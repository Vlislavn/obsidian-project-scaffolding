/**
 * route_note.js — route a note into the SSOT vault structure.
 * Supports inbox, backlog, process, meetings, people, deliverable docs/stories, archive.
 * Mobile-safe via universal loader.
 */

// === Universal Module Loader (mobile + desktop) ===
const _load = async (app, relPath) => {
  let code = "";
  const af = app.vault.getAbstractFileByPath(relPath);
  if (af) { try { code = await app.vault.read(af); } catch (_) {} }
  if (!code?.trim()) { try { code = await app.vault.adapter.read(relPath); } catch (_) {} }
  if (!code || !code.trim()) throw new Error(`Empty file: ${relPath}`);
  const wrapperMatch = code.match(/^\s*module\.exports\s*=\s*require\((['"])(.+?)\1\)\s*;?\s*$/);
  if (wrapperMatch) {
    const normalizePath = (input) => { const parts = String(input||"").split("/"); const stack = []; for (const part of parts) { if (!part || part === ".") continue; if (part === "..") stack.pop(); else stack.push(part); } return stack.join("/"); };
    const resolveRequest = (from, request) => { if (!request) return request; if (request.startsWith(".")) { const baseDir = String(from||"").split("/").slice(0,-1).join("/"); const full = normalizePath(`${baseDir}/${request}`); return full.endsWith(".js") ? full : `${full}.js`; } return request; };
    const redirected = resolveRequest(relPath, wrapperMatch[2]);
    if (redirected) return _load(app, redirected);
  }
  const g = globalThis;
  const evalFn = (typeof g.eval === "function") ? g.eval : null;
  if (!evalFn) throw new Error("eval is not available in this runtime");
  const exports = {}; const module = { exports };
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
  try { commonFactory = await _load(app, COMMON_PATH); } catch (_) {}
  if (!commonFactory) { new Notice("Cannot load common.js"); return ""; }
  const h = commonFactory({ app });

  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice("No active file to route");
    return "";
  }

  // --- Read current note's type ---
  const cache = app.metadataCache.getFileCache(activeFile);
  const noteType = String(cache?.frontmatter?.type ?? "").toLowerCase();

  const destinations = [
    { label: "📥 Move to 00_Inbox", action: "inbox" },
    { label: "📝 Move to 01_Basic_Info/backlog", action: "backlog" },
    { label: "🔄 Move to 01_Basic_Info/process", action: "process" },
    { label: "🗓️ Move to 02_Meeting", action: "meeting" },
    { label: "📎 Move to Deliverable docs", action: "deliverable-docs" },
    { label: "📚 Move to Deliverable stories", action: "deliverable-stories" },
    { label: "👤 Move to 04_People", action: "people" },
    { label: "📦 Move to 99_Archive", action: "archive" }
  ];

  // --- Show current note info ---
  const currentInfo = `${activeFile.basename} (type: ${noteType || "none"}, in: ${activeFile.parent?.path || "root"})`;
  const destChoice = await quickAddApi.suggester(
    destinations.map((d) => d.label),
    destinations,
    `Route: ${currentInfo}`
  );
  if (!destChoice) return "";

  let targetFolder = "";

  if (destChoice.action === "inbox") {
    targetFolder = "00_Inbox";
  } else if (destChoice.action === "backlog") {
    targetFolder = "01_Basic_Info/backlog";
  } else if (destChoice.action === "process") {
    targetFolder = "01_Basic_Info/process";
  } else if (destChoice.action === "meeting") {
    targetFolder = "02_Meeting";
  } else if (destChoice.action === "people") {
    targetFolder = "04_People";
  } else if (destChoice.action === "archive") {
    targetFolder = "99_Archive";
  } else if (destChoice.action === "deliverable-docs" || destChoice.action === "deliverable-stories") {
    const deliverables = h.getDeliverableNotes();
    if (!deliverables.length) {
      new Notice("No deliverables found.");
      return "";
    }

    let deliverable = null;
    if (noteType === "story" && activeFile.parent?.path.endsWith("/stories")) {
      const deliverableFolder = activeFile.parent.parent?.path;
      deliverable = deliverables.find((item) => item.parent?.path === deliverableFolder) || null;
    }
    if (!deliverable) {
      deliverable = await quickAddApi.suggester(
        deliverables.map((item) => item.basename),
        deliverables,
        "Select deliverable"
      );
    }
    if (!deliverable) return "";
    const childFolder = destChoice.action === "deliverable-stories" ? "stories" : "docs";
    targetFolder = `${deliverable.parent.path}/${childFolder}`;
  }

  if (!targetFolder) return "";

  if (activeFile.parent?.path === targetFolder) {
    new Notice(`Already in ${targetFolder}`);
    return "";
  }

  // --- Perform the move ---
  await h.ensureFolder(targetFolder);
  const newPath = `${targetFolder}/${activeFile.name}`;

  if (await app.vault.adapter.exists(newPath)) {
    new Notice(`File already exists at ${newPath} — aborting`);
    return "";
  }

  await app.fileManager.renameFile(activeFile, newPath);
  new Notice(`Moved to ${targetFolder}`);
  return "";
};
