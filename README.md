# Obsidian Project Scaffolding

Minimal vault scaffold for **deliverable → story → task** workflow in Obsidian.  
Serves as the **Single Source of Truth (SSOT)** for the companion React dashboard ([az_collab_tracker](https://github.com/Agent-Societies-Collaborative-Space/az_collab_tracker)).

---

## Quick Start

1. Open the vault in Obsidian.
2. Read [01_Basic_Info/$Technical_Reference.md](01_Basic_Info/$Technical_Reference.md) for macro and format details.
3. Start from these notes:
   - [01_Basic_Info/backlog/$Backlog.md](01_Basic_Info/backlog/$Backlog.md)
   - [01_Basic_Info/timeline/$Timeline.md](01_Basic_Info/timeline/$Timeline.md)

---

## Vault Structure — What the Dashboard Reads

The parser (`parse-vault.js`) converts this vault into `data.json` for the React tracker.  
Below is what gets read and what must be present for full rendering.

```
Vault Root/
├── 00_Project.md  OR  $Home.md      ← project metadata (name, phase, deadline)
├── 03_Deliverables/                  ← each sub-folder = one "Build" card
│   └── $DeliverableName/
│       ├── $DeliverableName.md       ← deliverable note (frontmatter = build metadata)
│       ├── stories/
│       │   └── StoryName.md          ← story note (frontmatter + inline tasks → "Action" card)
│       └── docs/                     ← optional supporting documents (not parsed)
├── 04_People/                        ← each file = one team member card
│   └── @Name.md                      ← employee note (frontmatter → member metadata)
├── 05_Insights/                      ← (optional) manually curated insights
│   └── InsightName.md                ← must have type: insight or type: risk
└── scripts/                          ← DataviewJS views (Obsidian-only, not parsed)
```

### What maps where in the dashboard

| Vault entity | Dashboard view | Key fields |
|---|---|---|
| `00_Project.md` / `$Home.md` | Header bar (project name, phase, deadline) | `name`, `phase`, `deadline` in frontmatter |
| `03_Deliverables/*/` folder | **"What We're Building"** → Build cards | frontmatter of deliverable `.md` |
| `stories/*.md` under a deliverable | **"What to Do"** → Action cards; **"Building"** → Tackling section | frontmatter + inline task checkboxes |
| `04_People/@Name.md` | **"Building"** → Member cards | frontmatter; auto-linked via task assignees |
| `05_Insights/*.md` | **"Why it Matters"** → Insight cards | `type: insight`, `priority`, body text |
| Inline task checkboxes in stories | Task counts, member "Tackling" lists, progress bars | emoji-format metadata |

---

## Frontmatter Requirements

All frontmatter fields use YAML. Missing **required** fields cause the entity to render with defaults or "TBD".

### Project (`00_Project.md` or `$Home.md`)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | string | ✅ | — | Must be `project` or `dashboard` |
| `name` | string | — | H1 title or vault folder name | Displayed in header bar |
| `subtitle` | string | — | `""` | Displayed below project name |
| `phase` | string | — | `"Development"` | Current phase label |
| `phase_range` | string | — | `""` | e.g. `"Q1 2026"` |
| `deadline` | date | — | Latest deliverable deadline | Overall project deadline |

### Deliverable (`03_Deliverables/$Name/$Name.md`)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | string | ✅ | — | Must be `deliverable` |
| `status` | string | ✅ | `"backlog"` | `backlog` · `execution` · `completed` · `archived` |
| `owner` | wikilink | — | `"TBD"` | `"[[@Name]]"` — displayed as build team |
| `responsible` | wikilink | — | — | Working group or team link |
| `start_date` | date | — | — | Used for Gantt + auto-status derivation |
| `deadline` | date | — | — | Used for Gantt, timeline, overdue detection |

**Status mapping:** `backlog` → **Planned**, `execution` → **In Progress**, `completed` → **Done**  
**Auto-derive:** If status is `backlog` but `start_date ≤ today` and stories exist, status auto-promotes to `in-progress`.

### Story (`03_Deliverables/$Name/stories/StoryName.md`)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | string | ✅ | — | Must be `story` |
| `status` | string | ✅ | `"backlog"` | `backlog` · `execution` · `completed` · `archived` |
| `owner` | wikilink | ✅ | `"TBD"` | `"[[@Name]]"` — story owner shown on action card |
| `deliverable` | wikilink | — | Auto-detected from folder | `"[[$DeliverableName]]"` |
| `size` | string | — | `null` | `XS` · `S` · `M` · `L` · `XL` |
| `moscow` | string | — | `"should"` | `must` · `should` · `could` · `wont` |
| `deadline` | date | — | — | Story deadline — used for overdue detection |
| `blocking` | wikilink | — | — | Other story this blocks |
| `blocked_by` | wikilink | — | — | Dependency |
| `last_ping` | date | — | — | Last activity — used for stale detection (>7d) |

**MoSCoW → category mapping:**  
`must` → **Priority** (red)  ·  `should` → **Formal scope** (blue)  ·  `could` → **48-hr sprint** (amber)

### Employee (`04_People/@Name.md`)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | string | ✅ | — | Must be `employee` |
| `fte` | number | — | `null` | Full-time equivalent (0.0–1.0) |
| `role` | string | — | First item in `background` | Job title shown on member card |
| `background` | list | — | `[]` | Skills/domain list |
| `task_preferences` | list | — | `[]` | Not parsed by tracker |

**Auto-linking:** Members are linked to builds automatically via:
1. Story-level: if `owner` matches the `@Name` filename
2. Task-level: if any inline task has `[[@Name]]` assignee

### Insight (`05_Insights/InsightName.md`)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | string | ✅ | — | `insight` or `risk` |
| `priority` | string | — | `"medium"` | `critical` · `high` · `medium` · `low` |

Body text = first paragraph or `## Description` section.

**Auto-derived insights:** If `05_Insights/` is empty or missing, the parser auto-generates insights from:
- Overdue stories (due < today, not done)
- Unassigned stories (owner = TBD)
- Stale stories (no `last_ping` update in >7 days)
- Empty deliverables (no stories)
- Task completion rate

---

## Inline Task Format

Tasks are checkbox lines inside Story notes using the **Tasks Plugin emoji format**.  
The parser only reads **root-level** tasks (no indentation).

```
- [ ] Task description #s-M [[@Assignee]] ➕ 2026-03-09 ⏳ 2026-03-12 📅 2026-03-20 🆔 story-task1 ⛔ other-task-id
```

| Token | Meaning | Rendered in dashboard |
|---|---|---|
| `- [ ]` | Open task (`space`=todo, `/`=in-progress, `x`=done, `-`=cancelled) | Status dot color |
| `#s-XS` … `#s-XL` | T-shirt size | Gray size tag badge |
| `[[@Name]]` | Assignee (wikilink to employee note) | Links task to member card |
| `➕ YYYY-MM-DD` | Created date | Not shown (metadata only) |
| `⏳ YYYY-MM-DD` | Scheduled date | Not shown (metadata only) |
| `📅 YYYY-MM-DD` | Due date | Amber "📅 date" tag badge |
| `✅ YYYY-MM-DD` | Completion date | Not shown (metadata only) |
| `🆔 id` | Task ID | Used for dependency references |
| `⛔ id` | Depends-on (blocks) | Not shown (metadata only) |
| `<br>` | Line break in description | Rendered as line break; trimmed to 2 lines |
| Text after metadata | Benefit, notes, etc. | Part of description (visible on hover) |

**Dashboard rendering:** Task descriptions are trimmed to **2 lines** with CSS line-clamp. Hover over a task to see the full text. Emoji metadata (📅, ⏳, etc.) is stripped from the display; due date and size are shown as separate tag badges.

---

## Running the Parser

```bash
# From the tracker repo (az_collab_tracker):
node scripts/parse-vault.js /path/to/this-vault src/data.json

# Then validate:
node scripts/validate-data.js src/data.json
```

The parser outputs:
- **builds** — from `03_Deliverables/` folders
- **actions** — from `stories/*.md` under each deliverable
- **members** — from `04_People/@*.md` files
- **insights** — from `05_Insights/*.md` (or auto-derived)
- **project** — from `00_Project.md` / `$Home.md`

---

## Keep (Core)

- [03_Deliverables/](03_Deliverables/) → deliverables, stories, inline tasks
- [04_People/](04_People/) → employee notes used for task assignment
- [scripts/](scripts/) → DataviewJS views and in-note buttons
- [99_Archive/templates/scripts/_central/](99_Archive/templates/scripts/_central/) → QuickAdd user scripts
- [scripts/templates/](scripts/templates/) → note templates
- [bases/](bases/) → Obsidian Bases views
- [.obsidian/](.obsidian/) → plugin and macro configuration

## Safe to Remove or Reset

- [attachments/](attachments/) — if you do not store files there
- [00_Inbox/](00_Inbox/) — sample content if you do not use inbox flow
- [02_Meeting/](02_Meeting/) — sample notes
- [99_Archive/](99_Archive/) — old sample notes (keep `templates/scripts/` paths above)
- Any placeholder demo notes in deliverables/people

## Before First Real Use

1. Create your own people notes in [04_People/](04_People/).
2. Create your first deliverable and stories.
3. Verify QuickAdd macros in [.obsidian/plugins/quickadd/data.json](.obsidian/plugins/quickadd/data.json).
4. Run the "Update Gantt" macro to refresh timeline.
5. Run the parser to generate `data.json` and verify with `validate-data.js`.

---

## Checklist — "My Dashboard Shows Nothing"

| Symptom | Likely cause | Fix |
|---|---|---|
| No build cards | `03_Deliverables/` is empty or sub-folders have no `.md` file | Create a deliverable folder + note |
| Build shows "TBD" team | `owner` or `responsible` missing in deliverable frontmatter | Add `owner: "[[@Name]]"` |
| No action cards | No `stories/*.md` files under any deliverable | Create a story with the template |
| Action shows "TBD" owner | `owner` field missing or is `[[@Name]]` placeholder | Set `owner: "[[@Your Name]]"` |
| Member has no builds | No story ownership or task assignment matches `@Name.md` filename | Assign stories/tasks using `[[@Name]]` |
| No tasks in Tackling | Story has no inline `- [ ]` task lines | Add tasks in emoji format |
| Tasks missing due/size tags | Tasks lack `📅` / `#s-` tokens | Add tokens to the task line |
| No insights | No `05_Insights/` folder and no overdue/unassigned stories | Create insight notes or add story data |
| Dates not shown | `deadline`, `start_date` not in YAML or not `YYYY-MM-DD` format | Use ISO date format in frontmatter |
