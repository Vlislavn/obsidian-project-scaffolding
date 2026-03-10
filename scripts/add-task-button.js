// DataviewJS view: renders "➕ Add Task" button inside a story note.
// Usage: ```dataviewjs await dv.view("scripts/add-task-button"); ```
const current = dv.current();
const storyBasename = current?.file?.name || "";

const btn = dv.el("button", "➕ Add Task");
btn.style.cssText = "cursor:pointer;padding:4px 14px;border:1px solid var(--interactive-accent);border-radius:6px;background:var(--interactive-accent);color:var(--text-on-accent);font-size:0.9em;margin:4px 0;";

btn.addEventListener("click", async () => {
  const qa = app.plugins.plugins.quickadd?.api;
  if (!qa) { new Notice("QuickAdd plugin required."); return; }

  const _load = async (relPath) => {
    let code = "";
    const af = app.vault.getAbstractFileByPath(relPath);
    if (af) { try { code = await app.vault.read(af); } catch (_) {} }
    if (!code?.trim()) { try { code = await app.vault.adapter.read(relPath); } catch (_) {} }
    if (!code?.trim()) throw new Error("Empty: " + relPath);
    const exports = {}, module = { exports };
    const wrapped = `(function(require,module,exports){\n${code}\n;return module.exports;})`;
    const fn = eval(wrapped);
    return fn(typeof require === "function" ? require : () => {}, module, exports) ?? module.exports ?? exports;
  };

  const h = (await _load("99_Archive/templates/scripts/_central/common.js"))({ app });
  const stories = h.getStoryNotes();
  const targetStory = stories.find((s) => s.basename === storyBasename);
  if (!targetStory) { new Notice("Can't resolve story."); return; }

  const employees = h.getEmployeeNotes();
  const dateFieldType = h.getPreferredDateFieldType();
  const openTaskCandidates = (await h.getOpenTaskCandidates())
    .filter((c) => c.taskId)
    .sort((a, b) => a.taskText.localeCompare(b.taskText));
  const blockerOptions = openTaskCandidates.map((c) => `${c.taskId} - ${h.cleanTaskLabel(c.line)}`);

  const inputs = await qa.requestInputs([
    { id: "taskName", label: "Task", type: "textarea", placeholder: "What needs to be done?" },
    { id: "benefit", label: "Benefit", type: "textarea", placeholder: "Why is this important? (optional)" },
    {
      id: "assignee", label: "Assignee", type: "suggester",
      options: employees.map((e) => e.basename).sort(),
      suggesterConfig: { multiSelect: false }, placeholder: "Select employee (optional)…"
    },
    {
      id: "taskSize", label: "Task size", type: "suggester",
      options: ["#s-XS", "#s-S", "#s-M", "#s-L", "#s-XL"],
      suggesterConfig: { multiSelect: false }, placeholder: "Select size…"
    },
    { id: "dueDate", label: "Due date", type: dateFieldType, dateFormat: "YYYY-MM-DD", placeholder: "YYYY-MM-DD" },
    { id: "scheduledDate", label: "Scheduled date", type: dateFieldType, dateFormat: "YYYY-MM-DD", placeholder: "YYYY-MM-DD" },
    {
      id: "blockedBy", label: "Blocked by", type: "suggester",
      options: blockerOptions, suggesterConfig: { multiSelect: true },
      placeholder: "Select task dependencies…"
    },
    { id: "notes", label: "Notes", type: "textarea", placeholder: "Additional context (optional)" },
  ]);
  if (!inputs) return;

  const taskName = String(inputs.taskName || "").trim();
  if (!taskName) { new Notice("Task name is required."); return; }

  const due = h.parseAndFormatDate(inputs.dueDate);
  const scheduled = h.parseAndFormatDate(inputs.scheduledDate);
  const sizeToken = String(inputs.taskSize || "").trim() || "#s-S";
  const blockedBy = String(inputs.blockedBy || "")
    .split(", ").map((item) => item.split(" - ")[0].trim()).filter(Boolean).join(", ");
  const createdDate = h.moment ? h.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);

  const line = h.buildInlineTaskLine({
    storyFile: targetStory,
    taskName,
    assignee: String(inputs.assignee || "").trim(),
    deliverableLink: "",
    createdDate,
    scheduledDate: scheduled.valid ? scheduled.formatted : "",
    dueDate: due.valid ? due.formatted : "",
    taskSize: sizeToken,
    blockedBy,
    benefit: String(inputs.benefit || "").trim(),
    notes: String(inputs.notes || "").trim(),
  });

  const heading = await h.ensureHeading(targetStory.path, ["### Tasks", "## Tasks"]);
  const content = await app.vault.read(targetStory);
  const lines = content.split("\n");
  const idx = lines.findIndex((l) => l.trim() === heading.trim());
  lines.splice(idx + 1, 0, line);
  await app.vault.modify(targetStory, lines.join("\n"));

  new Notice("Task created.");
});
