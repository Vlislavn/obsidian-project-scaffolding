# Obsidian Project Scaffolding

Minimal vault scaffold for deliverable -> story -> task workflow in Obsidian.

## Use This First

1. Open the vault in Obsidian.
2. Read [01_Basic_Info/$Technical_Reference.md](01_Basic_Info/$Technical_Reference.md) for macro and format details.
3. Start from these notes:
- [01_Basic_Info/backlog/$Backlog.md](01_Basic_Info/backlog/$Backlog.md)
- [01_Basic_Info/timeline/$Timeline.md](01_Basic_Info/timeline/$Timeline.md)

## Keep (Core)

- [03_Deliverables/](03_Deliverables/) -> deliverables, stories, inline tasks
- [04_People/](04_People/) -> employee notes used for task assignment
- [scripts/](scripts/) -> DataviewJS views and in-note buttons
- [99_Archive/templates/scripts/_central/](99_Archive/templates/scripts/_central/) -> QuickAdd user scripts
- [scripts/templates/](scripts/templates/) -> note templates
- [bases/](bases/) -> Obsidian Bases views
- [.obsidian/](.obsidian/) -> plugin and macro configuration

## Safe To Remove Or Reset

- [attachments/](attachments/) if you do not store files there
- [00_Inbox/](00_Inbox/) sample content if you do not use inbox flow
- [02_Meeting/](02_Meeting/) sample notes
- [99_Archive/](99_Archive/) old sample notes (keep templates/scripts paths above)
- any placeholder demo notes in deliverables/people

## Before First Real Use

1. Create your own people notes in [04_People/](04_People/).
2. Create your first deliverable and stories.
3. Verify QuickAdd macros in [.obsidian/plugins/quickadd/data.json](.obsidian/plugins/quickadd/data.json).
4. Run the "Update Gantt" macro to refresh timeline.
