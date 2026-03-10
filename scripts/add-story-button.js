// DataviewJS view: renders "➕ Add Story" button inside a deliverable note.
// Usage: ```dataviewjs await dv.view("scripts/add-story-button"); ```
const current = dv.current();
const deliverableName = current?.file?.name || "";

const btn = dv.el("button", "➕ Add Story");
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
  const deliverables = h.getDeliverableNotes();
  const d = deliverables.find((x) => x.basename === deliverableName);
  if (!d) { new Notice("Can't resolve deliverable."); return; }

  const employees = h.getEmployeeNotes();
  const dateFieldType = h.getPreferredDateFieldType();
  const allStories = h.getStoryNotes();
  const existingStoryOptions = allStories.map((s) => s.basename).sort();

  const inputs = await qa.requestInputs([
    { id: "storyName", label: "Story name", type: "text", placeholder: "Story title…" },
    {
      id: "owner", label: "Owner", type: "suggester",
      options: employees.map((e) => e.basename).sort(),
      suggesterConfig: { multiSelect: false }, placeholder: "Select owner…"
    },
    {
      id: "size", label: "Story size", type: "suggester",
      options: ["XS", "S", "M", "L", "XL"],
      suggesterConfig: { multiSelect: false }, placeholder: "M"
    },
    {
      id: "moscow", label: "MoSCoW priority", type: "suggester",
      options: ["must", "should", "could", "wont"],
      suggesterConfig: { multiSelect: false }, placeholder: "must"
    },
    { id: "deadline", label: "Deadline", type: dateFieldType, dateFormat: "YYYY-MM-DD", placeholder: "YYYY-MM-DD" },
    {
      id: "blocking", label: "Blocking (this story blocks…)", type: "suggester",
      options: existingStoryOptions, suggesterConfig: { multiSelect: true },
      placeholder: "Select stories this blocks…"
    },
    {
      id: "blockedBy", label: "Blocked by", type: "suggester",
      options: existingStoryOptions, suggesterConfig: { multiSelect: true },
      placeholder: "Select stories blocking this…"
    },
  ]);
  if (!inputs) return;

  const storyName = String(inputs.storyName || "").trim();
  if (!storyName) { new Notice("Story name is required."); return; }
  const safe = h.sanitizeFileName(storyName);
  const ownerLink = h.normalizeAssigneeLink(inputs.owner) || "[[@Name]]";
  const size = String(inputs.size || "M").trim();
  const moscow = String(inputs.moscow || "must").trim();
  const deadlineParsed = h.parseAndFormatDate(inputs.deadline);
  const blockingRaw = String(inputs.blocking || "").split(", ").filter(Boolean);
  const blockedByRaw = String(inputs.blockedBy || "").split(", ").filter(Boolean);
  const blocking = blockingRaw.map((s) => `[[${s}]]`).join(", ");
  const blockedBy = blockedByRaw.map((s) => `[[${s}]]`).join(", ");

  const storiesFolder = `${d.parent.path}/stories`;
  await h.ensureFolder(storiesFolder);
  const path = `${storiesFolder}/$${safe}.md`;

  const content = [
    "---", "type: story", "status: backlog",
    `owner: "${ownerLink}"`, `deliverable: "[[${d.basename}]]"`,
    `size: ${size}`, `blocking: "${blocking}"`, `blocked_by: "${blockedBy}"`,
    `deadline: ${deadlineParsed.valid ? deadlineParsed.formatted : ""}`,
    `moscow: ${moscow}`, "last_ping: ", "---", "",
    `# ${storyName}`, "", "## Description", "",
    "```dataviewjs", 'await dv.view("scripts/add-task-button");', "```", "",
    "### Tasks", "",
    "## Task Stats", "", "```dataviewjs", 'await dv.view("scripts/story-progress");', "```", ""
  ].join("\n");

  await app.vault.adapter.write(path, content);
  const f = app.vault.getAbstractFileByPath(path);
  if (f) await app.workspace.getLeaf(true).openFile(f);
  new Notice("Story created.");
});
