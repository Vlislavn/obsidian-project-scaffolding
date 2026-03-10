const _load = async (app, relPath) => {
  let code = "";
  const af = app.vault.getAbstractFileByPath(relPath);
  if (af) {
    try { code = await app.vault.read(af); } catch (_) {}
  }
  if (!code?.trim()) {
    try { code = await app.vault.adapter.read(relPath); } catch (_) {}
  }
  if (!code || !code.trim()) throw new Error(`Empty file: ${relPath}`);
  const g = globalThis;
  const evalFn = (typeof g.eval === 'function') ? g.eval : null;
  if (!evalFn) throw new Error('eval unavailable');
  const exports = {};
  const module = { exports };
  const req = (id) => (typeof g.require === 'function' ? g.require(id) : undefined);
  const wrapped = `(function(require, module, exports){\n${code}\n;return module.exports;})`;
  const fn = evalFn(wrapped);
  const loaded = fn(req, module, exports);
  return loaded ?? module.exports ?? exports;
};

module.exports = async ({ app }) => {
  const commonFactory = await _load(app, '99_Archive/templates/scripts/_central/common.js');
  const h = commonFactory({ app });
  const stories = h.getStoryNotes().filter((s) => s.path.startsWith('03_Deliverables/'));

  const rows = [];
  const blockedByMap = new Map(); // storyBasename → [blockerBasename, ...]
  const blockingMap = new Map();  // storyBasename → [blocked, ...]

  for (const s of stories) {
    const fm = h.getFrontmatter(s);
    const deliverable = String(fm.deliverable || 'Deliverable').replace(/[[\]]/g, '') || 'Deliverable';
    const start = h.parseNaturalDate(fm.start_date || fm.last_ping || 'today', h.moment().format('YYYY-MM-DD'));
    const end = h.parseNaturalDate(fm.deadline || 'in 14 days', h.moment().add(14, 'days').format('YYYY-MM-DD'));
    const durationDays = Math.max(1, h.moment(end).diff(h.moment(start), 'days'));

    // Parse blocking / blocked_by wikilinks
    const parseLinks = (raw) =>
      String(raw || '').replace(/"/g, '').match(/\[\[([^\]]+)\]\]/g)?.map((m) => m.replace(/[[\]]/g, '').replace(/^\$/, '')) || [];

    const blockers = parseLinks(fm.blocked_by);
    const blocking = parseLinks(fm.blocking);
    const cleanName = s.basename.replace(/^\$/, '');

    if (blockers.length) blockedByMap.set(cleanName, blockers);
    if (blocking.length) blockingMap.set(cleanName, blocking);

    rows.push({
      deliverable,
      story: cleanName,
      storyId: cleanName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
      start,
      durationDays,
      status: String(fm.status || 'backlog').toLowerCase(),
      blockers,
    });
  }

  rows.sort((a, b) => a.deliverable.localeCompare(b.deliverable) || a.start.localeCompare(b.start));

  const lines = [
    '---',
    'type: dashboard',
    'status: active',
    '---',
    '',
    '# Timeline',
    '',
    'Auto-generated from story frontmatter (`start_date`, `deadline`, `status`).',
    '',
    '```mermaid',
    'gantt',
    '    title Deliverable Timeline',
    '    dateFormat YYYY-MM-DD',
    '    axisFormat %d %b',
    '    tickInterval 1week',
  ];

  // Build a set of known story IDs for dependency resolution
  const idLookup = new Map(rows.map((r) => [r.story, r.storyId]));

  let lastSection = null;
  for (const r of rows) {
    if (r.deliverable !== lastSection) {
      lines.push('');
      lines.push(`    section ${r.deliverable}`);
      lastSection = r.deliverable;
    }
    const tag = r.status === 'completed' ? 'done' : r.status === 'execution' ? 'active' : '';
    const tagPart = tag ? `${tag}, ` : '';

    // Check if this story is blocked by another that exists in the gantt
    const afterIds = (r.blockers || [])
      .map((name) => idLookup.get(name.replace(/^\$/, '')))
      .filter(Boolean);

    if (afterIds.length) {
      // Use 'after' syntax — Mermaid places the bar after the blocker ends
      lines.push(`    ${r.story} : ${tagPart}${r.storyId}, after ${afterIds[0]}, ${r.durationDays}d`);
    } else {
      lines.push(`    ${r.story} : ${tagPart}${r.storyId}, ${r.start}, ${r.durationDays}d`);
    }
  }

  lines.push('```');

  // ── Dependency legend ──
  const deps = [];
  for (const [story, blockers] of blockedByMap) {
    for (const blocker of blockers) deps.push(`⛔ **${blocker}** → blocks → **${story}**`);
  }
  if (deps.length) {
    lines.push('');
    lines.push('### Dependencies');
    lines.push('');
    for (const d of deps) lines.push(`- ${d}`);
  }

  lines.push('');
  lines.push(`Updated: ${h.moment().format('YYYY-MM-DD HH:mm')}`);

  const path = '01_Basic_Info/timeline/$Timeline.md';
  await app.vault.adapter.write(path, lines.join('\n'));
  const f = app.vault.getAbstractFileByPath(path);
  if (f) await app.workspace.getLeaf(true).openFile(f);
  new Notice(`Gantt updated from ${rows.length} stories.`);
  return '';
};
