/**
 * Unified helpers for all QuickAdd scripts.
 * Merges life_ops_common.js + tasks/common.js.
 * Works on both desktop (require) and mobile (vault.adapter.read).
 *
 * Usage:  const helpers = commonFactory({ app });
 */
module.exports = ({ app }) => {
  const moment = window?.moment;
  const nldates = app?.plugins?.plugins?.["nldates-obsidian"];
  const quickAddApi = app?.plugins?.plugins?.quickadd?.api;

  const getFileCache = (file) => app.metadataCache.getFileCache(file) || {};
  const getFrontmatter = (file) => getFileCache(file)?.frontmatter || {};

  const normalizeType = (raw) => {
    if (Array.isArray(raw)) return String(raw[0] || "").toLowerCase();
    return String(raw || "").toLowerCase();
  };

  const getStatus = (raw) => {
    if (Array.isArray(raw)) return String(raw[0] || "").toLowerCase();
    return String(raw || "").toLowerCase();
  };

  const ensureFolder = async (folderPath) => {
    if (!folderPath) return;
    if (!(await app.vault.adapter.exists(folderPath))) {
      await app.vault.createFolder(folderPath);
    }
  };

  const sanitizeFileName = (name) =>
    String(name || "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

  const parseAndFormatDate = (dateStr) => {
    if (!dateStr) return { formatted: "", valid: false, original: "" };
    const parsed = nldates?.parseDate ? nldates.parseDate(dateStr) : null;
    let formatted = String(dateStr).trim();
    if (parsed?.date) {
      if (moment?.isMoment?.(parsed.date)) {
        formatted = parsed.date.format("YYYY-MM-DD");
      } else if (moment) {
        formatted = moment(parsed.date).format("YYYY-MM-DD");
      }
    }
    const valid = moment
      ? moment(formatted, "YYYY-MM-DD", true).isValid()
      : /^\d{4}-\d{2}-\d{2}$/.test(formatted);
    return { formatted, valid, original: dateStr };
  };

  const parseNaturalDate = (input, fallback = "") => {
    if (!input) return fallback;
    const result = parseAndFormatDate(input);
    if (result.valid) return result.formatted;
    return fallback || (moment ? moment().format("YYYY-MM-DD") : "");
  };

  const getPreferredDateFieldType = () => {
    try {
      const el = document.createElement("input");
      el.type = "date";
      const supportsDateInput = el.type === "date";
      return !app?.isMobile && supportsDateInput ? "date" : "text";
    } catch (_) {
      return "text";
    }
  };

  const appendUnderHeading = async (filePath, heading, block, createHeading = true) => {
    const raw = await app.vault.adapter.read(filePath);
    const lines = raw.split("\n");
    const idx = lines.findIndex((l) => l.trim() === heading.trim());
    if (idx !== -1) {
      let insertIdx = idx + 1;
      while (insertIdx < lines.length && lines[insertIdx].trim() === "") insertIdx++;
      lines.splice(insertIdx, 0, block);
      await app.vault.adapter.write(filePath, lines.join("\n"));
      return;
    }
    if (createHeading) {
      const suffix = raw.endsWith("\n") ? "" : "\n";
      await app.vault.adapter.write(filePath, `${raw}${suffix}\n${heading}\n${block}\n`);
    }
  };

  const ensureHeading = async (filePath, headings = ["### Tasks", "## Tasks"]) => {
    const raw = await app.vault.adapter.read(filePath);
    for (const h of headings) {
      if (raw.includes(`\n${h}\n`) || raw.trimEnd().endsWith(h)) return h;
    }
    const preferred = headings[0];
    const suffix = raw.endsWith("\n") ? "" : "\n";
    await app.vault.adapter.write(filePath, `${raw}${suffix}\n${preferred}\n`);
    return preferred;
  };

  const findNotesByType = (typeName, excludedStatuses = ["completed", "done", "archived", "cancelled"]) => {
    const target = String(typeName || "").toLowerCase();
    return app.vault
      .getMarkdownFiles()
      .filter((file) => !file.path.includes("templates/"))
      .filter((file) => {
        const fm = getFrontmatter(file);
        const t = normalizeType(fm.type);
        const s = getStatus(fm.status);
        return t === target && !excludedStatuses.includes(s);
      })
      .sort((a, b) => a.basename.localeCompare(b.basename));
  };

  const getEmployeeNotes = () => {
    const byType = findNotesByType("employee");
    if (byType.length) return byType;
    return app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith("04_People/") && f.basename.startsWith("@"))
      .sort((a, b) => a.basename.localeCompare(b.basename));
  };

  const getDeliverableNotes = () => findNotesByType("deliverable");
  const getStoryNotes = () => findNotesByType("story", ["archived"]);

  const getOpenTaskCandidates = async () => {
    const taskRegex = /^\s*-\s+\[([ \/?>])\]\s+(.+)$/;
    const candidates = [];
    for (const file of app.vault.getMarkdownFiles()) {
      if (!file.path.includes("/stories/")) continue;
      const content = await app.vault.cachedRead(file);
      const lines = content.split("\n");
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const match = lines[lineIndex].match(taskRegex);
        if (!match) continue;
        const taskText = match[2].trim();
        candidates.push({
          file,
          lineIndex,
          line: lines[lineIndex],
          taskText,
        });
      }
    }
    return candidates;
  };

  const similarity = (a, b) => {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return 1 - matrix[a.length][b.length] / Math.max(a.length, b.length);
  };

  const updateFrontmatterField = async (file, key, value) => {
    const raw = await app.vault.read(file);
    if (!raw.startsWith("---\n")) return false;
    const end = raw.indexOf("\n---", 4);
    if (end === -1) return false;
    const fm = raw.slice(4, end).split("\n");
    const body = raw.slice(end + 4);
    const line = `${key}: ${value}`;
    const idx = fm.findIndex((l) => l.trim().startsWith(`${key}:`));
    if (idx >= 0) fm[idx] = line;
    else fm.push(line);
    const out = `---\n${fm.join("\n")}\n---${body}`;
    await app.vault.modify(file, out);
    return true;
  };

  const normalizeAssigneeLink = (assignee) => {
    const raw = String(assignee || "")
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .trim();
    if (!raw) return "";
    const normalized = raw.startsWith("@") ? raw : `@${raw.replace(/^@+/, "")}`;
    return `[[${normalized}]]`;
  };

  const formatMultilineHtml = (value) =>
    String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("<br>");

  /** Strip inline metadata from a task line for clean display in suggesters. */
  const cleanTaskLabel = (raw) =>
    String(raw || "")
      .replace(/^\s*[-*]\s+\[[^\]]\]\s*/, "")   // checkbox
      .replace(/<br\s*\/?>.*/gi, "")              // everything after first <br>
      .replace(/\[\[@[^\]]*\]\]/g, "")            // [[@assignee]]
      .replace(/#s-(XS|S|M|L|XL)\b/g, "")        // size tags
      .replace(/[➕⏳📅✅❌🆔⛔]\s*[^\s]*/g, "")  // emoji metadata tokens
      .replace(/\s{2,}/g, " ")
      .trim();

  const touchStoryLastPing = async (storyFile) => {
    if (!storyFile) return false;
    const today = moment ? moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);
    return updateFrontmatterField(storyFile, "last_ping", today);
  };

  const buildInlineTaskLine = ({
    taskName,
    assignee,
    deliverableLink = "",
    createdDate = "",
    scheduledDate = "",
    dueDate = "",
    taskSize = "#s-S",
    benefit = "",
    notes = "",
  }) => {
    const taskLines = String(taskName || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const cleanTaskName = taskLines[0] || "";
    if (!cleanTaskName) return "";

    const cleanSize = String(taskSize || "").trim();
    const cleanDeliverableLink = String(deliverableLink || "").trim();
    const cleanCreatedDate = String(createdDate || "").trim();
    const cleanScheduledDate = String(scheduledDate || "").trim();
    const cleanDueDate = String(dueDate || "").trim();
    const cleanBenefit = formatMultilineHtml(benefit);
    const cleanNotes = formatMultilineHtml(notes);
    const assigneeLink = normalizeAssigneeLink(assignee);
    const extraTaskText = formatMultilineHtml(taskLines.slice(1).join("\n"));

    const parts = [`- [ ] ${cleanTaskName}${cleanSize ? ` ${cleanSize}` : ""}`];
    if (assigneeLink) parts.push(assigneeLink);
    if (cleanDeliverableLink) parts.push(cleanDeliverableLink);
    if (cleanCreatedDate) parts.push(`➕ ${cleanCreatedDate}`);
    if (cleanScheduledDate) parts.push(`⏳ ${cleanScheduledDate}`);
    if (cleanDueDate) parts.push(`📅 ${cleanDueDate}`);
    if (extraTaskText) parts.push(`<br>${extraTaskText}`);
    if (cleanBenefit) parts.push(`<br>Benefit: ${cleanBenefit}`);
    if (cleanNotes) parts.push(`<br>${cleanNotes}`);
    return parts.join(" ");
  };

  return {
    app,
    moment,
    ensureFolder,
    sanitizeFileName,
    parseAndFormatDate,
    parseNaturalDate,
    getPreferredDateFieldType,
    appendUnderHeading,
    ensureHeading,
    findNotesByType,
    getEmployeeNotes,
    getDeliverableNotes,
    getStoryNotes,
    getOpenTaskCandidates,
    getFrontmatter,
    similarity,
    updateFrontmatterField,
    touchStoryLastPing,
    buildInlineTaskLine,
    normalizeAssigneeLink,
    formatMultilineHtml,
    cleanTaskLabel,
    quickAddApi,
  };
};
