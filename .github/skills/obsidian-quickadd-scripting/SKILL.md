---
name: obsidian-quickadd-scripting
description: 'Build, edit, and debug Obsidian QuickAdd macros, DataviewJS views, and vault automation scripts. USE WHEN: creating/modifying QuickAdd UserScript commands, DataviewJS inline views, Obsidian Tasks plugin integrations, Mermaid gantt generation, Obsidian Bases files, or vault frontmatter manipulation. COVERS: module loader pattern, requestInputs API, suggester conventions, task emoji format, common.js helpers, in-note button pattern, QuickAdd data.json config.'
---

# Obsidian QuickAdd Scripting

## When to Use

- Creating or modifying QuickAdd UserScript macros
- Building DataviewJS inline views (`dv.view()`, `dv.el()`)
- Working with Obsidian Tasks plugin (emoji format)
- Generating Mermaid gantt charts from frontmatter
- Creating or editing Obsidian Bases (`.base` YAML files)
- Manipulating note frontmatter programmatically

## Architecture Overview

This vault uses a centralized script architecture:

```
99_Archive/templates/scripts/_central/   ← QuickAdd UserScript macros
  common.js         ← shared helpers (factory pattern)
  create_entity.js  ← deliverable/story/task/employee creation
  task.js           ← task creation form
  edit_task.js      ← unified task editor
  complete_task.js  ← mark tasks done
  update_gantt.js   ← mermaid gantt generation
  delegate.js       ← task assignment
  ...

scripts/                                 ← DataviewJS views (dv.view targets)
  add-story-button.js   ← in-note button for deliverables
  add-task-button.js    ← in-note button for stories
  story-progress.js     ← progress bars
  deliverable-progress.js
  ...

bases/                                   ← Obsidian Bases (.base YAML)
  DeliverableStories.base

.obsidian/plugins/quickadd/data.json     ← macro registry
```

## Critical Patterns

### 1. Universal Module Loader (`_load`)

Every macro must use this loader — it works on both desktop (require) and mobile (vault.adapter.read):

```javascript
const _load = async (app, relPath) => {
  let code = "";
  const af = app.vault.getAbstractFileByPath(relPath);
  if (af) { try { code = await app.vault.read(af); } catch (_) {} }
  if (!code?.trim()) { try { code = await app.vault.adapter.read(relPath); } catch (_) {} }
  if (!code?.trim()) throw new Error(`Empty file: ${relPath}`);
  const exports = {}, module = { exports };
  const wrapped = `(function(require,module,exports){\n${code}\n;return module.exports;})`;
  const fn = (typeof globalThis.eval === 'function' ? globalThis.eval : eval)(wrapped);
  return fn(typeof require === "function" ? require : () => {}, module, exports) ?? module.exports ?? exports;
};
```

**Rules:**
- Path is always relative to vault root (e.g. `99_Archive/templates/scripts/_central/common.js`)
- In DataviewJS views (`scripts/`), the `_load` signature drops the `app` param — `app` is already global
- Always load common.js first, then call the factory: `const h = (await _load(..., 'common.js'))({ app });`

### 2. common.js Factory Pattern

common.js exports a factory function, not raw helpers:

```javascript
// common.js
module.exports = ({ app }) => {
  // ... all helpers close over `app`
  return { sanitizeFileName, getStoryNotes, cleanTaskLabel, /* etc */ };
};
```

**Usage in macros:**
```javascript
const commonFactory = await _load(app, '99_Archive/templates/scripts/_central/common.js');
const h = commonFactory({ app });
// then: h.getStoryNotes(), h.cleanTaskLabel(line), etc.
```

**Key helpers available on `h`:**
- `getStoryNotes()`, `getDeliverableNotes()`, `getEmployeeNotes()`, `findNotesByType(type)`
- `cleanTaskLabel(raw)` — strips checkbox, `<br>` content, assignee links, size tags, emoji tokens
- `buildInlineTaskLine({...})` — constructs a complete task line in emoji format
- `buildTaskId(storyFile, taskName)` — generates slug-based task IDs
- `parseAndFormatDate(str)`, `parseNaturalDate(input, fallback)` — date handling with nldates
- `getPreferredDateFieldType()` — returns `"date"` or `"text"` based on platform
- `ensureFolder(path)`, `ensureHeading(filePath, headings)`, `appendUnderHeading(...)`
- `updateFrontmatterField(file, key, value)` — safe frontmatter mutation
- `sanitizeFileName(name)`, `slugify(value)`, `normalizeAssigneeLink(assignee)`
- `getFrontmatter(file)`, `getOpenTaskCandidates()`
- `similarity(a, b)` — Levenshtein-based string similarity (0–1)

### 3. QuickAdd Macro Export Signature

Every QuickAdd UserScript must export this shape:

```javascript
module.exports = async ({ app, quickAddApi, variables }) => {
  // ...
  return ''; // return empty string when done
};
```

- `app` — Obsidian App instance
- `quickAddApi` — QuickAdd API (suggesters, prompts, inputs)
- `variables` — QuickAdd template variables (rarely used directly)

### 4. `requestInputs` Over Sequential Prompts

**ALWAYS** prefer `quickAddApi.requestInputs([...])` over chaining `quickAddApi.inputPrompt()` / `quickAddApi.suggester()`. The single-form approach:
- Shows all fields at once (better UX)
- Returns `null` on cancel (single check instead of per-field)
- Has built-in fuzzy filtering on suggesters

```javascript
const inputs = await quickAddApi.requestInputs([
  { id: "name", label: "Name", type: "text", placeholder: "..." },
  { id: "owner", label: "Owner", type: "suggester",
    options: employees.map(e => e.basename).sort(),
    suggesterConfig: { multiSelect: false }, placeholder: "..." },
  { id: "due", label: "Due", type: dateFieldType,
    dateFormat: "YYYY-MM-DD", placeholder: "YYYY-MM-DD" },
  { id: "blockers", label: "Blocked by", type: "suggester",
    options: blockerOptions, suggesterConfig: { multiSelect: true },
    placeholder: "..." },
]);
if (!inputs) return '';
// Access: inputs.name, inputs.owner, inputs.due, inputs.blockers
```

**Input types:** `text`, `textarea`, `date`, `suggester`, `field-suggest`
**Suggester options:** `multiSelect: true/false` in `suggesterConfig`

### 5. Task Emoji Format (Tasks Plugin)

Tasks use these emoji tokens inline — **order matters**:

```
- [ ] Task description [[@Assignee]] #s-M <br>Benefit text ➕ 2025-03-04 ⏳ 2025-03-10 📅 2025-03-15 🆔 task-id ⛔ blocker-id
```

| Token | Meaning |
|-------|---------|
| `➕ YYYY-MM-DD` | Created date |
| `⏳ YYYY-MM-DD` | Scheduled date |
| `📅 YYYY-MM-DD` | Due date |
| `✅ YYYY-MM-DD` | Done date |
| `❌ YYYY-MM-DD` | Cancelled date |
| `🆔 id` | Task ID |
| `⛔ id` | Depends on (blocked by) |

**Checkbox states:** `[ ]` todo, `[/]` in-progress, `[>]` deferred, `[?]` question, `[x]` done, `[X]` done (alt), `[-]` cancelled

**`cleanTaskLabel(raw)`** strips all of the above for display in suggesters. Always use it when showing tasks to users.

### 6. In-Note DataviewJS Buttons

Pattern for buttons that live inside notes (via `dv.view()`):

```javascript
// scripts/add-task-button.js
const current = dv.current();           // the embedding note
const parentName = current?.file?.name;  // basename of the note embedding this view

const btn = dv.el("button", "➕ Add Task");
btn.style.cssText = "cursor:pointer;padding:4px 14px;...";

btn.addEventListener("click", async () => {
  const qa = app.plugins.plugins.quickadd?.api;
  if (!qa) { new Notice("QuickAdd plugin required."); return; }

  // _load inline (no `app` param — it's global in DataviewJS)
  const _load = async (relPath) => { /* same loader, without app param */ };

  const h = (await _load("99_Archive/templates/scripts/_central/common.js"))({ app });
  // ... build form, write task
});
```

**Key difference from macros:** In DataviewJS, `app` is a global — don't pass it to `_load`. The `_load` function is inlined because DataviewJS views can't use `require`.

Embed in templates:
````markdown
```dataviewjs
await dv.view("scripts/add-task-button");
```
````

### 7. Obsidian Bases (`.base` YAML files)

**Format rules:**
- Use 2-space indentation (NOT tabs — tabs cause silent parse failures)
- Embed via `![[file.base]]` in notes
- `this` keyword refers to the embedding note (for relative paths)

```yaml
filters:
  and:
    - file.folder == this.file.folder + "/stories"
    - type == "story"
properties:
  file.name:
    displayName: Story
  status:
    displayName: Status
views:
  - type: table
    name: Stories
    order:
      - status
      - deadline
    sort: []
```

### 8. Frontmatter Schema Conventions

| Note type | Required fields |
|-----------|----------------|
| Deliverable | `type: deliverable`, `status`, `owner`, `start_date`, `deadline` |
| Story | `type: story`, `status`, `deliverable`, `owner`, `size`, `moscow`, `deadline`, `blocking`, `blocked_by` |
| Employee | `type: employee`, `fte`, `background`, `task_preferences` |
| Meeting | `type: meeting`, `date`, `participants`, `deliverable`, `action_items` |

**Wikilink fields:** `blocking` and `blocked_by` store arrays of `[[StoryName]]` wikilinks. Parse with: `String(raw).match(/\[\[([^\]]+)\]\]/g)`.

### 9. QuickAdd `data.json` Configuration

Macros are registered in `.obsidian/plugins/quickadd/data.json`:

```json
{
  "choices": [
    {
      "id": "...",
      "name": "Create Entity",
      "type": "Macro",
      "command": true,
      "macroId": "..."
    }
  ],
  "macros": [
    {
      "name": "Create Entity",
      "id": "...",
      "commands": [
        {
          "name": "create_entity",
          "type": "UserScript",
          "id": "...",
          "path": "99_Archive/templates/scripts/_central/create_entity.js",
          "settings": {}
        }
      ]
    }
  ]
}
```

**CRITICAL:** QuickAdd caches `data.json` in memory. External edits (from agent/editor) require **restarting Obsidian or toggling the QuickAdd plugin** for changes to take effect.

## Validated Bug Prevention Checklist

Before delivering any script change, verify:

- [ ] **Variables declared before use** — especially in `requestInputs` options. If options depend on API calls (e.g. `getStoryNotes()`), declare them BEFORE the `requestInputs` call.
- [ ] **`cleanTaskLabel()` used for all user-facing task display** — raw task lines contain emoji metadata that confuses users
- [ ] **Correct `_load` signature** — macro: `_load(app, relPath)`, DataviewJS: `_load(relPath)` (app is global)
- [ ] **`requestInputs` over sequential prompts** — don't use `inputPrompt` chains; use single-form `requestInputs`
- [ ] **`suggester` for selection, not `inputPrompt`** — QuickAdd suggesters have built-in fuzzy filtering; no manual fuzzy logic needed
- [ ] **Empty/null guards on form results** — `if (!inputs) return '';` after every `requestInputs` call
- [ ] **Task search scope** — search `03_Deliverables/` (not just stories) when looking for tasks across deliverables
- [ ] **Open task states** — `[" ", "/", ">", "?"]` are open; `["x", "X", "-"]` are closed. Don't include closed in "open tasks" queries.
- [ ] **Bases use 2-space YAML** — tabs cause silent failures
- [ ] **QuickAdd data.json external edits** — warn user to restart Obsidian or toggle plugin
- [ ] **Date fields use `getPreferredDateFieldType()`** — returns `"date"` on desktop, `"text"` on mobile
- [ ] **`node --check filename.js`** — validate JS syntax before delivering
- [ ] **`JSON.parse()` validation** — if editing data.json, validate it parses correctly
- [ ] **Mermaid IDs alphanumeric** — gantt task IDs must be `[a-zA-Z0-9_]` only; use `.replace(/[^a-zA-Z0-9]/g, '_')`
- [ ] **`formatMultilineHtml()`** — if notes/benefit fields may be multiline, join with `<br>` for inline task format
- [ ] **Wikilinks in frontmatter** — store as `"[[Name]]"` (quoted YAML), parse with regex `\[\[([^\]]+)\]\]`

## Common Mistakes from Past Sessions

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `existingStoryOptions is not defined` | Variable used in `requestInputs` but declared after the call | Move data-fetching calls ABOVE `requestInputs` |
| Meeting creation crash (null extension) | Empty `fileNameFormat.format` in data.json | Set proper format: `"{{VALUE:Meeting title}} {{DATE:DD-MM-YYYY}}"` |
| Gantt dates overlapping | No Mermaid axis formatting | Add `axisFormat %d %b` and `tickInterval 1week` |
| Suggester shows raw emoji metadata | Task labels not cleaned | Always use `h.cleanTaskLabel()` |
| `complete_task` misses tasks | Only searched story files | Search all `03_Deliverables/` |
| Edit task shows done tasks | `openStates` included `x`/`X` | Only include `[" ", "/", ">", "?"]` |
| Bases table empty | Tab indentation in `.base` YAML | Convert to 2-space indentation |
| Macro changes not reflected | QuickAdd caches data.json in memory | Restart Obsidian or toggle plugin |
| `inputPrompt` UX poor | Sequential single prompts | Replace with `requestInputs([...])` single form |
| Manual fuzzy search code | Re-implementing fuzzy filtering | QuickAdd `suggester` has built-in fuzzy; just use it |
| Gantt includes meeting notes | No path filter on vault files | Filter: `.filter(s => s.path.startsWith('03_Deliverables/'))` |

## Step-by-Step: Adding a New Macro

1. **Create the script** in `99_Archive/templates/scripts/_central/new_macro.js`
2. **Use the standard export:** `module.exports = async ({ app, quickAddApi, variables }) => { ... };`
3. **Load common.js** at the top via `_load`
4. **Build UI** with `requestInputs` (preferred) or `suggester`
5. **Write output** via `app.vault.adapter.write()` or `app.vault.modify()`
6. **Validate syntax:** `node --check new_macro.js`
7. **Register in data.json:** Add a Macro choice + UserScript command entry
8. **Warn user:** Restart Obsidian or toggle QuickAdd to pick up the new macro

## Step-by-Step: Adding a DataviewJS View

1. **Create the script** in `scripts/new_view.js`
2. **Use `dv.current()`** to get the embedding note context
3. **Inline the `_load` function** (without `app` parameter)
4. **Load common.js:** `const h = (await _load("99_Archive/templates/scripts/_central/common.js"))({ app });`
5. **Render HTML** via `dv.el("div", content)` or `dv.paragraph()`
6. **Embed in templates:**
   ````markdown
   ```dataviewjs
   await dv.view("scripts/new_view");
   ```
   ````

## Reference Files

- [Frontmatter schemas and detailed conventions](./references/frontmatter-schemas.md)
- [Complete common.js helper reference](./references/common-helpers.md)
