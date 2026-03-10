---
type: employee
fte: 1.0
background:
  - 
task_preferences:
  - 
---

# {{title}}

## Reference Table — My Tasks

```tasks
not done
description includes {{title}}
group by function task.file.folder
sort by due
```

## Active Deliverables

```dataview
TABLE status, deadline
FROM "03_Deliverables"
WHERE type = "story" AND contains(string(owner), this.file.name)
SORT deadline ASC
```
