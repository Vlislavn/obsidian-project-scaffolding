# common.js Helper Reference

Factory export: `module.exports = ({ app }) => { return { ...helpers }; };`

Usage: `const h = commonFactory({ app });`

## File & Path Helpers

### `sanitizeFileName(name) → string`
Strips `\/:*?"<>|`, collapses whitespace.

### `slugify(value) → string`
Lowercases, strips `$` prefix, removes non-alphanumeric (except spaces/hyphens), joins with hyphens.

### `ensureFolder(folderPath) → Promise<void>`
Creates folder (and parents) if it doesn't exist.

### `ensureHeading(filePath, headings) → Promise<string>`
Checks if any heading from the list exists in file; if not, appends the first one. Returns the heading found/created.

### `appendUnderHeading(filePath, heading, block, createHeading?) → Promise<void>`
Inserts `block` text immediately below `heading` in the file. If heading doesn't exist and `createHeading=true`, creates it.

## Frontmatter Helpers

### `getFrontmatter(file) → object`
Returns frontmatter object (from metadata cache). Empty object if none.

### `updateFrontmatterField(file, key, value) → Promise<boolean>`
Safely updates a single frontmatter field. Returns false if file has no frontmatter.

### `normalizeType(raw) → string`
Handles array-wrapped YAML values (e.g. `[deliverable]` → `"deliverable"`).

### `getStatus(raw) → string`
Same normalization as `normalizeType`, for status fields.

## Note Discovery

### `findNotesByType(typeName, excludedStatuses?) → TFile[]`
Finds all markdown files with `type: <typeName>` in frontmatter, excluding templates and specified statuses. Default excludes: `["completed", "done", "archived", "cancelled"]`.

### `getDeliverableNotes() → TFile[]`
Shorthand for `findNotesByType("deliverable")`.

### `getStoryNotes() → TFile[]`
Shorthand for `findNotesByType("story", ["archived"])`.

### `getEmployeeNotes() → TFile[]`
First tries `findNotesByType("employee")`, falls back to scanning `04_People/@*.md`.

### `getOpenTaskCandidates() → Promise<{file, lineIndex, line, taskText, taskId}[]>`
Scans all files under `*/stories/` for open task lines. Returns parsed task metadata.

## Task Helpers

### `cleanTaskLabel(raw) → string`
Strips checkbox prefix, `<br>` content, `[[@assignee]]` links, `#s-*` size tags, and all emoji metadata tokens. Essential for user-facing display.

### `buildInlineTaskLine({...}) → string`
Constructs a complete inline task in emoji format from named parameters:
- `storyFile`, `taskName`, `assignee`, `deliverableLink`
- `createdDate`, `scheduledDate`, `dueDate`
- `taskSize`, `blockedBy`, `benefit`, `notes`, `taskId`

### `buildTaskId(storyFile, taskName) → string`
Generates a slug from story basename + task name for use as `🆔`.

### `formatMultilineHtml(value) → string`
Joins multiline text with `<br>` for inline task format.

### `normalizeDependsOnIds(value) → string`
Splits comma-separated IDs, trims, and re-joins.

## Date Helpers

### `parseAndFormatDate(dateStr) → {formatted, valid, original}`
Parses via nldates plugin (natural language) or falls back to string parsing. Returns YYYY-MM-DD format.

### `parseNaturalDate(input, fallback?) → string`
Convenience wrapper: returns YYYY-MM-DD or fallback.

### `getPreferredDateFieldType() → "date" | "text"`
Returns `"date"` on desktop (native date picker), `"text"` on mobile.

## String Helpers

### `similarity(a, b) → number`
Levenshtein-based similarity score between 0 (no match) and 1 (identical).

### `normalizeAssigneeLink(assignee) → string`
Normalizes to `[[@ Name]]` format — strips existing brackets, ensures `@` prefix.
