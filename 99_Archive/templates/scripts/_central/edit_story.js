/**
 * Unified "Edit Story" macro — select a story note, then pick a frontmatter action:
 *   Change owner / size / status / MoSCoW / deadline / blocking / blocked_by / last_ping
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

  /* ── story selection ─────────────────────────────────────── */
  const stories = h.getStoryNotes();
  if (!stories.length) { new Notice("No active stories found."); return ""; }

  const selected = await quickAddApi.suggester(
    stories.map((s) => s.basename),
    stories,
    "Select story to edit"
  );
  if (!selected) return "";

  /* ── action picker ───────────────────────────────────────── */
  const actions = [
    { label: "👤 Change owner",      key: "owner" },
    { label: "📏 Change size",       key: "size" },
    { label: "🔄 Change status",     key: "status" },
    { label: "🎯 Change MoSCoW",     key: "moscow" },
    { label: "📅 Change deadline",   key: "deadline" },
    { label: "🔗 Change blocking",   key: "blocking" },
    { label: "⛔ Change blocked_by", key: "blocked_by" },
    { label: "📋 Update last_ping",  key: "last_ping" },
  ];

  const action = await quickAddApi.suggester(
    actions.map((a) => a.label),
    actions.map((a) => a.key),
    "Pick action"
  );
  if (!action) return "";

  /* ── action handlers ─────────────────────────────────────── */

  if (action === "owner") {
    const employees = h.getEmployeeNotes();
    if (!employees.length) { new Notice("No employees found."); return ""; }
    const name = await quickAddApi.suggester(
      employees.map((e) => e.basename),
      employees.map((e) => e.basename),
      "New owner"
    );
    if (!name) return "";
    await h.updateFrontmatterField(selected, "owner", `"${h.normalizeAssigneeLink(name)}"`);
  }

  if (action === "size") {
    const sizes = ["XS", "S", "M", "L", "XL"];
    const newSize = await quickAddApi.suggester(sizes, sizes, "New size");
    if (!newSize) return "";
    await h.updateFrontmatterField(selected, "size", newSize);
  }

  if (action === "status") {
    const statuses = ["backlog", "active", "completed", "done", "cancelled"];
    const newStatus = await quickAddApi.suggester(statuses, statuses, "New status");
    if (!newStatus) return "";
    await h.updateFrontmatterField(selected, "status", newStatus);
  }

  if (action === "moscow") {
    const priorities = ["must", "should", "could", "wont"];
    const newPriority = await quickAddApi.suggester(priorities, priorities, "New MoSCoW priority");
    if (!newPriority) return "";
    await h.updateFrontmatterField(selected, "moscow", newPriority);
  }

  if (action === "deadline") {
    const dateFieldType = h.getPreferredDateFieldType();
    const inputs = await quickAddApi.requestInputs([
      { id: "deadline", label: "New deadline", type: dateFieldType, dateFormat: "YYYY-MM-DD", placeholder: "YYYY-MM-DD" }
    ]);
    if (!inputs) return "";
    const parsed = h.parseAndFormatDate(inputs.deadline);
    if (!parsed.valid) { new Notice("Invalid date."); return ""; }
    await h.updateFrontmatterField(selected, "deadline", parsed.formatted);
  }

  if (action === "blocking") {
    const otherStories = stories.filter((s) => s.path !== selected.path);
    if (!otherStories.length) { new Notice("No other stories available."); return ""; }
    const inputs = await quickAddApi.requestInputs([{
      id: "blocking",
      label: "Stories this blocks",
      type: "suggester",
      options: otherStories.map((s) => s.basename).sort(),
      suggesterConfig: { multiSelect: true },
      placeholder: "Select stories…"
    }]);
    if (!inputs) return "";
    const selectedStories = String(inputs.blocking || "").split(", ").filter(Boolean);
    const formatted = selectedStories.map((s) => `[[${s}]]`).join(", ");
    await h.updateFrontmatterField(selected, "blocking", `"${formatted}"`);
  }

  if (action === "blocked_by") {
    const otherStories = stories.filter((s) => s.path !== selected.path);
    if (!otherStories.length) { new Notice("No other stories available."); return ""; }
    const inputs = await quickAddApi.requestInputs([{
      id: "blockedBy",
      label: "Stories blocking this one",
      type: "suggester",
      options: otherStories.map((s) => s.basename).sort(),
      suggesterConfig: { multiSelect: true },
      placeholder: "Select stories…"
    }]);
    if (!inputs) return "";
    const selectedStories = String(inputs.blockedBy || "").split(", ").filter(Boolean);
    const formatted = selectedStories.map((s) => `[[${s}]]`).join(", ");
    await h.updateFrontmatterField(selected, "blocked_by", `"${formatted}"`);
  }

  if (action === "last_ping") {
    const today = h.moment ? h.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);
    await h.updateFrontmatterField(selected, "last_ping", today);
  }

  /* ── done ────────────────────────────────────────────────── */
  new Notice(`Story updated (${action}).`);
  app.workspace.openLinkText(selected.path, "", false);
  return "";
};
