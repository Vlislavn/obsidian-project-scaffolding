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

module.exports = async ({ app, quickAddApi }) => {
  const commonFactory = await _load(app, '99_Archive/templates/scripts/_central/common.js');
  const h = commonFactory({ app });

  const deliverables = h.getDeliverableNotes();
  if (!deliverables.length) {
    new Notice('No deliverables found.');
    return '';
  }

  const deliverable = await quickAddApi.suggester(
    deliverables.map((d) => d.basename),
    deliverables,
    'Select Deliverable'
  );
  if (!deliverable) return '';

  const openMode = await quickAddApi.suggester(
    ['Open deliverable note', 'Open story under this deliverable'],
    ['deliverable', 'story'],
    'Navigate mode'
  );
  if (!openMode) return '';

  if (openMode === 'deliverable') {
    await app.workspace.getLeaf(true).openFile(deliverable);
    return '';
  }

  const stories = h
    .getStoryNotes()
    .filter((s) => s.path.startsWith(`${deliverable.parent.path}/stories/`));

  if (!stories.length) {
    new Notice('No stories found under selected deliverable.');
    return '';
  }

  const story = await quickAddApi.suggester(
    stories.map((s) => s.basename),
    stories,
    'Select Story'
  );
  if (!story) return '';

  await app.workspace.getLeaf(true).openFile(story);
  return '';
};
