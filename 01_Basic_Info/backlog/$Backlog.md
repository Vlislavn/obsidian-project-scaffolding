---
type: dashboard
status: active
---

# 📋 Backlog

All open tasks across the project, sorted by priority.

## Not Done Tasks

```tasks
not done
path includes 03_Deliverables
group by function task.file.folder.replace(/\/stories$/, "").split("/").pop().replace(/^\$/, "")
sort by priority
```

## Stories in Backlog

```dataview
TABLE owner, deliverable, size, moscow, deadline
FROM "03_Deliverables"
WHERE type = "story" AND status = "backlog"
SORT moscow ASC, deadline ASC
```
