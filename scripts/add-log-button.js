// DataviewJS view: renders "📝 Log" button inside a story note.
// Usage: ```dataviewjs await dv.view("scripts/add-log-button"); ```
const current = dv.current();
const storyBasename = current?.file?.name || "";

const btn = dv.el("button", "📝 Log");
btn.style.cssText = "cursor:pointer;padding:4px 14px;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-secondary);color:var(--text-muted);font-size:0.9em;margin:4px 0;";

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

  const entry = await qa.inputPrompt("Progress log entry");
  if (!entry || !String(entry).trim()) return;

  const now = h.moment ? h.moment() : null;
  const ts = now ? now.format("YYYY-MM-DD HH:mm") : new Date().toISOString().slice(0, 16).replace("T", " ");
  const day = now ? now.format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);

  const logPath = `${targetStory.parent.path}/${targetStory.basename} - log.md`;
  const exists = await app.vault.adapter.exists(logPath);
  if (!exists) {
    const content = [
      "---",
      "type: story-log",
      `story: "[[${targetStory.basename}]]"`,
      "---",
      "",
      `# ${targetStory.basename} - log`,
      "",
    ].join("\n");
    await app.vault.adapter.write(logPath, content);
  }

  const heading = `## ${day}`;
  await h.appendUnderHeading(logPath, heading, `- ${ts} - ${String(entry).trim()}`, true);
  await h.updateFrontmatterField(targetStory, "last_ping", day);

  new Notice("Progress log saved.");
});
