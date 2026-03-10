# Frontmatter Schemas

## Deliverable

```yaml
---
type: deliverable
status: active          # active | completed | on_hold | cancelled
owner: "[[Name]]"
start_date: YYYY-MM-DD
deadline: YYYY-MM-DD
tags: []
---
```

Folder structure: `03_Deliverables/$DeliverableName/`
- Stories go in: `03_Deliverables/$DeliverableName/stories/`
- Deliverable name is prefixed with `$`

## Story

```yaml
---
type: story
status: backlog         # backlog | active | review | completed | blocked
deliverable: "[[DeliverableName]]"
owner: "[[EmployeeName]]"
size: M                 # XS | S | M | L | XL
moscow: must            # must | should | could | wont
deadline: YYYY-MM-DD
start_date: YYYY-MM-DD
last_ping: YYYY-MM-DD
blocking: "[[StoryA]], [[StoryB]]"
blocked_by: "[[StoryC]]"
---
```

- Story name is prefixed with `$`
- `blocking`/`blocked_by` are comma-separated wikilinks (quoted YAML strings)
- Parse wikilinks: `String(raw).replace(/"/g, '').match(/\[\[([^\]]+)\]\]/g)`

## Employee

```yaml
---
type: employee
fte: 1.0
background: "[]"
task_preferences: "[]"
---
```

- Filename prefixed with `@` (e.g. `@JohnDoe.md`)
- Located in `04_People/`

## Meeting

```yaml
---
type: meeting
date: YYYY-MM-DD
participants: []
deliverable: "[[DeliverableName]]"
action_items: []
---
```

- Located in `02_Meeting/`
- Filename format: `{{VALUE:Meeting title}} {{DATE:DD-MM-YYYY}}.md`

## Inline Task Format

Tasks are inline inside story notes under `### Tasks` heading:

```
- [ ] Description [[@Assignee]] #s-M <br>Benefit ➕ 2025-03-04 ⏳ 2025-03-10 📅 2025-03-15 🆔 task-id ⛔ blocker-id
```

### Token Reference

| Token | Field | Format |
|-------|-------|--------|
| `[[@Name]]` | Assignee | Wikilink to employee note |
| `#s-XS/S/M/L/XL` | Size | Tag |
| `<br>text` | Benefit/notes | HTML line break, everything after is metadata |
| `➕ YYYY-MM-DD` | Created date | |
| `⏳ YYYY-MM-DD` | Scheduled date | |
| `📅 YYYY-MM-DD` | Due date | |
| `✅ YYYY-MM-DD` | Done date | |
| `❌ YYYY-MM-DD` | Cancelled date | |
| `🆔 slug` | Task ID | Alphanumeric + hyphens |
| `⛔ slug` | Blocked by task ID | References another task's 🆔 |

### Checkbox States

| State | Char | Meaning |
|-------|------|---------|
| Todo | ` ` | Not started |
| In-progress | `/` | Working on it |
| Deferred | `>` | Postponed |
| Question | `?` | Needs clarification |
| Done | `x` | Completed |
| Done (alt) | `X` | Completed (alternate) |
| Cancelled | `-` | Won't do |

**Open states** (for queries): `[" ", "/", ">", "?"]`
**Closed states**: `["x", "X", "-"]`
