---
type: documentation
---

# Lab Vault — Technical Reference

> Auto-generated reference for the KatherLab Project Management Vault.
> Covers all QuickAdd macros, DataviewJS views, warning systems, and conventions.

---

## 1. Architecture Overview

```
Project_scaffold/
├── 01_Basic_Info/          ← dashboards: backlog, timeline
├── 02_Meeting/             ← meeting notes
├── 03_Deliverables/        ← deliverable → stories → inline tasks
│   └── $DeliverableName/
│       ├── $DeliverableName.md
│       ├── stories/
│       │   └── $StoryName.md   (tasks live as inline checkboxes here)
│       └── docs/
├── 04_People/              ← @Employee.md notes
├── 05_Inbox/               ← unprocessed notes
├── bases/                  ← Obsidian Bases (.base files)
├── scripts/                ← DataviewJS views
│   ├── story-progress.js
│   ├── deliverable-progress.js
│   ├── add-story-button.js
│   └── add-task-button.js
└── 99_Archive/templates/scripts/_central/  ← QuickAdd User Scripts
    ├── common.js           ← shared helpers
    ├── create_entity.js    ← create Deliverable/Story/Task/Employee
    ├── task.js             ← create task (full form)
    ├── edit_task.js        ← edit existing task properties
    ├── complete_task.js    ← mark tasks done
    ├── delegate.js         ← reassign task
    ├── update_gantt.js     ← regenerate Mermaid timeline
    └── ...
```

### Data Flow

- **Tasks** = inline checkboxes in Story `.md` files (emoji format)
- **Stories** = notes with YAML frontmatter under `03_Deliverables/*/stories/`
- **Deliverables** = parent notes under `03_Deliverables/`
- **No database** — the vault IS the database (SSOT)

---

## 2. QuickAdd Macros (Command Palette)

| Macro | What it does |
|---|---|
| **Create Entity** | Wizard: pick Deliverable / Story / Task / Employee. Each opens a single form. |
| **Edit Task** | Fuzzy-search any task → pick action: change assignee, size, due/scheduled date, add dependency, move to another story. |
| **Complete Task** | If inside a deliverable/story file: offers current-file scope. Otherwise searches all `03_Deliverables/`. Batch or individual mode. |
| **Assign Task** | Pick employee → fuzzy-search task → reassign. Single or batch. |
| **Meeting Create** | Creates meeting note from template in `02_Meeting/`. Filename: `Title DD-MM-YYYY`. |
| **Update Gantt** | Regenerates `01_Basic_Info/timeline/$Timeline.md` Mermaid gantt from story frontmatter. |
| **Navigate** | Quick jump Deliverable → Story hierarchy. |
| **Process Inbox** | Routes notes from `05_Inbox/` to proper locations. |
| **Escalate Task → Story** | Promotes an inline task to its own Story note. |
| **Progress Log** | Append a timestamped progress entry. |
| **Route Note** | Move a note to its correct folder based on type. |
| **Vault Health** | Scan for structural issues (orphans, missing fields, etc). |

### Using Edit Task

1. Open Command Palette → "Edit Task"
2. Type a fuzzy search query (matches task description text)
3. Pick the task from the result list (labels show clean text + parent file)
4. Choose an action:
   - **👤 Change assignee** — pick from employee list
   - **📏 Change size** — pick XS / S / M / L / XL
   - **📅 Change due date** — enter or pick date
   - **⏳ Change scheduled date** — enter or pick date
   - **🔗 Add / change dependency** — multi-select from tasks that have IDs
   - **📂 Move to another story** — removes task line from source, inserts in target

---

## 3. Inline Task Format (Emoji)

Tasks are checkbox lines inside Story notes using the Tasks Plugin emoji format:

```
- [ ] Task description #s-M [[@Assignee]] ➕ 2026-03-09 ⏳ 2026-03-12 📅 2026-03-20 🆔 story-task-id ⛔ other-task-id
```

| Token | Meaning |
|---|---|
| `- [ ]` | Open task (space = todo, `/` = in progress, `x` = done, `-` = cancelled) |
| `#s-XS` through `#s-XL` | T-shirt size tag |
| `[[@Name]]` | Assignee (wikilink to employee note) |
| `➕ YYYY-MM-DD` | Created date |
| `⏳ YYYY-MM-DD` | Scheduled date |
| `📅 YYYY-MM-DD` | Due date |
| `✅ YYYY-MM-DD` | Completion date (auto-added) |
| `<br>` | Extra lines (benefit, notes — rendered in reading view) |

---

## 4. Warning & Alert System

### 4.1 Deliverable Progress View (`scripts/deliverable-progress.js`)

Embedded in each deliverable note. Scans all stories under the deliverable's `stories/` folder.

#### Flags (per story)

| Flag | Emoji | Trigger condition |
|---|---|---|
| **Overdue** | 🔴 | `deadline < today` AND status ≠ completed/done |
| **At risk** | 🟡 | `deadline` is within 7 days AND status ≠ completed/done |
| **Stale** | 🟡 | status = `active` AND (`last_ping` is empty OR older than 14 days) |
| **Blocked** | ⚠️ | Story has `blocked_by` set |

#### Sections rendered

1. **📊 Deliverable Summary** — owner, status, deadline, progress bars for stories and tasks
2. **🚨 Attention Required** — table of flagged stories with issue type, deadline, owner
3. **📋 Story Breakdown** — table per story: progress %, done/open counts, status, deadline, flags
4. **📦 Task Load by Size** — T-shirt size distribution across all stories

### 4.2 Story Progress View (`scripts/story-progress.js`)

Embedded in each story note. Scans inline tasks within the current file only.

#### Renders

1. **Progress bar** — green (done) / yellow (in progress) / gray (open)
2. **Summary line** — `✅ X done · ⏳ Y in progress · 📋 Z open · N total · XX%`
3. **Size breakdown table** (only if tasks use multiple sizes)

### 4.3 How to act on warnings

| Warning | What to do |
|---|---|
| 🔴 Overdue | Update `deadline` in story frontmatter, or change status to `completed` |
| 🟡 At risk | Prioritize; consider reducing scope or reassigning |
| 🟡 Stale | Update `last_ping` field in story frontmatter to today's date |
| ⚠️ Blocked | Resolve story-level dependency or remove `blocked_by` |

**Updating `last_ping`:** Open the story note → edit frontmatter → set `last_ping: YYYY-MM-DD`. This resets the stale timer. The system also auto-updates `last_ping` when tasks are created, edited, moved, or completed.

---

## 5. Buttons (In-Note Actions)

### ➕ Add Story (inside deliverable notes)

A styled button rendered by `scripts/add-story-button.js`. When clicked:
- Auto-detects the parent deliverable from the current note
- Opens a form: story name, owner, size, MoSCoW priority, deadline, blocking/blocked_by (multi-select from existing stories)
- Creates the story note under the deliverable's `stories/` folder with all metadata pre-filled

### ➕ Add Task (inside story notes)

A styled button rendered by `scripts/add-task-button.js`. When clicked:
- Auto-detects the parent story from the current note
- Opens a form: task description, benefit, assignee (optional), size, due/scheduled dates, notes
- Inserts the task as an inline checkbox under the `### Tasks` heading

---

## 6. Gantt Timeline

Generated by the **Update Gantt** macro into `01_Basic_Info/timeline/$Timeline.md`.

**Data source:** Story frontmatter fields:
- `start_date` (or `last_ping`, or defaults to today)
- `deadline` (or defaults to +14 days)
- `status` — `completed` → done bar, `execution` → active bar

**Format:** Mermaid gantt with `axisFormat %d %b` and weekly tick intervals. Grouped by deliverable sections.

**To refresh:** Run `Update Gantt` from Command Palette.

---

## 7. Obsidian Bases

Located in `bases/` folder. Embedded via `![[FileName.base]]`.

| Base | Purpose | Filter |
|---|---|---|
| `DeliverableStories.base` | Per-deliverable story table (embedded inside deliverable notes) | `file.folder == this.file.folder + "/stories"` AND `type == "story"` |
| `Stories.base` | Global stories overview | `file.inFolder("03_Deliverables")` AND `file.folder.endsWith("/stories")` |
| `Deliverables.base` | Global deliverables overview | `file.inFolder("03_Deliverables")` AND `type == "deliverable"` |

---

## 8. Story & Deliverable Frontmatter Schema

### Deliverable

```yaml
type: deliverable
status: backlog          # backlog | execution | completed | archived
owner: "[[@Name]]"
responsible: "[[working_group]]"
start_date: YYYY-MM-DD
deadline: YYYY-MM-DD
```

### Story

```yaml
type: story
status: backlog          # backlog | execution | completed | archived
owner: "[[@Name]]"
deliverable: "[[$DeliverableName]]"
size: M                  # XS | S | M | L | XL
blocking: "[[OtherStory]]"
blocked_by: "[[OtherStory]]"
deadline: YYYY-MM-DD
moscow: must             # must | should | could | wont
last_ping: YYYY-MM-DD   # last activity date (reset to clear stale warning)
```

### Meeting

```yaml
type: meeting
deliverable: "[[$Deliverable]]"
story:
attendees:
  - "[[@Name]]"
date: YYYY-MM-DD
```

### Employee

```yaml
type: employee
fte: 1.0
background: "[]"
task_preferences: "[]"
```

---

## 9. Key Conventions

- **File naming:** Structural notes prefixed with `$` (e.g., `$Example_Deliverable.md`)
- **Employee notes:** Prefixed with `@` (e.g., `@Vlad.md`) in `04_People/`
- **Assignee links:** Always `[[@Name]]` format
- **Size tags:** `#s-XS` through `#s-XL` (inline, not frontmatter)
- **Task IDs:** Auto-generated as `storyslug-taskslug` via `🆔` token
- **Dependencies:** Reference task IDs via `⛔ id1, id2`
- **Blocking/blocked_by (stories):** Wikilinks to other story notes
- **Templates:** In `99_Archive/templates/` — used by QuickAdd for note creation
- **Date aliases in QuickAdd prompts:** `t` = today, `tm` = tomorrow, `yd` = yesterday, `nw` = next week

---

## 10. React Dashboard Integration

This vault is the SSOT for a companion React dashboard ([az_collab_tracker](https://github.com/Agent-Societies-Collaborative-Space/az_collab_tracker)). A Node.js parser converts the vault into `data.json`.

### Running the parser

```bash
node scripts/parse-vault.js /path/to/this-vault src/data.json
node scripts/validate-data.js src/data.json   # referential-integrity check
```

### What the parser extracts

| Vault file | Dashboard entity | Key frontmatter |
|---|---|---|
| `00_Project.md` / `$Home.md` | Project header | `name`, `phase`, `deadline` |
| `03_Deliverables/$Name/$Name.md` | Build card | `status`, `owner`, `start_date`, `deadline` |
| `stories/*.md` | Action card + Tackling tasks | `status`, `owner`, `moscow`, `deadline`, `size`, `last_ping` |
| Inline `- [ ]` tasks in stories | Task list per member | `#s-*`, `[[@Name]]`, `📅`, `⏳` |
| `04_People/@Name.md` | Member card | `fte`, `role`, `background` |
| `05_Insights/*.md` | Insight card | `type: insight\|risk`, `priority` |

### What must be correct for full rendering

1. **Deliverable folders** must contain a `.md` with `type: deliverable` frontmatter.
2. **Stories** must live under `stories/` sub-folders of deliverables.
3. **Tasks** must be root-level (no indentation) `- [ ]` lines with emoji metadata.
4. **Assignees** (`[[@Name]]`) must match the filename in `04_People/` exactly (e.g., `[[@Vlad]]` → `@Vlad.md`).
5. **Dates** must be `YYYY-MM-DD` format in frontmatter and inline.
6. **MoSCoW** (`must`/`should`/`could`) determines the action card category (priority / formal / sprint).
7. **Insights** folder (`05_Insights/`) is optional — if missing, insights are auto-derived from overdue/stale/unassigned stories.

### Common issues

| Dashboard shows | Root cause | Fix |
|---|---|---|
| Empty member cards | `@Name.md` filename doesn't match `[[@Name]]` in tasks | Use exact matching names |
| "TBD" everywhere | `owner` frontmatter is template placeholder `[[@Name]]` | Replace with actual person |
| Missing task badges | Tasks lack `📅` or `#s-*` tokens | Add due date and size to task line |
| Stale insight keeps firing | `last_ping` not updated | Set `last_ping: YYYY-MM-DD` in story frontmatter |
