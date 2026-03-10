---
type: dashboard
status: active
---

# 🏠 Project Home

> Quick entry point. Use **Cmd+O** (Quick Switcher) for fast navigation.

## Active Deliverables

```dataview
TABLE owner, status, deadline
FROM "03_Deliverables"
WHERE type = "deliverable" AND status != "completed" AND status != "archived"
SORT deadline ASC
```

## Overdue Stories

```dataview
TABLE owner, status, deliverable, deadline
FROM "03_Deliverables"
WHERE type = "story" AND status != "completed" AND deadline < date(today)
SORT deadline ASC
```

## Conflicted Copies

```dataview
LIST
FROM ""
WHERE contains(file.name, "conflicted copy")
```

## Quick Links

- [[01_Basic_Info/backlog/$Backlog|📋 Backlog]]
- [[02_Meeting/|📅 Meetings]]
- [[04_People/|👥 People]]
