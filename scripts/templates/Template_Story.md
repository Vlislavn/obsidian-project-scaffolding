---
type: story
status: backlog
owner: "[[@Name]]"
deliverable: "[[$Deliverable]]"
size: M
blocking: 
blocked_by: 
deadline: 
moscow: must
last_ping: 
---

# {{title}}

## Description



## Tasks

> Tasks are the SSOT. Assignees see their tasks via query in `@Name.md`.
> Tasks use Tasks Emoji Format metadata. Recommended format: `- [ ] Task name #s-S [[@Assignee]] ➕ 2026-03-09 ⏳ 2026-03-12 📅 2026-03-15`

- [ ] Example task #s-S [[@Assignee]] ➕ 2026-03-09 📅 2026-04-01

## Task Stats

```dataviewjs
await dv.view("scripts/story-progress");
```

## Progress Log

```dataview
TABLE file.cday AS "Date"
FROM "03_Deliverables"
WHERE type = "story-log" AND story = this.file.link
SORT file.cday DESC
```
