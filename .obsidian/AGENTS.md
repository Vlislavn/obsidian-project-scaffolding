# Vault Automation Agent Policy

## Scope
- Agent purpose: maintain vault JS automation and Obsidian config only.
- This policy does not authorize edits to regular vault notes.

## Allowed
- `.obsidian/`
- `scripts/`
- `scripts/templates/`
- `99_Archive/templates/scripts/_central/`
- `bases/`

## Script And Template Locations
- Main QuickAdd scripts live in `99_Archive/templates/scripts/_central/`.
- Dataview/button scripts live in `scripts/`.
- Note templates live in `scripts/templates/`.
- Agent expectation: help write, fix, and refactor scripts in these locations while keeping existing macro wiring and paths stable.

## Forbidden
- Do not edit deliverable, story, meeting, people, inbox, backlog, or docs notes.
- Do not rename frontmatter keys, folder structure, macro labels, IDs, template paths, or view paths unless explicitly requested.
- Do not run broad refactors.

## Source Of Truth
- `01_Basic_Info/$Technical_Reference.md`
- `.obsidian/plugins/quickadd/data.json`

## Verification
- No build/test pipeline. Validate syntax, references, and paths.
- If wiring changes, report the exact macro/view/template to test in Obsidian.
