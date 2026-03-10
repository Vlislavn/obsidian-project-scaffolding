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

  const stories = h.getStoryNotes();
  if (!stories.length) {
    new Notice('No story notes found.');
    return '';
  }

  const selectedStory = await quickAddApi.suggester(
    stories.map((s) => s.basename),
    stories,
    'Select story for progress log'
  );
  if (!selectedStory) return '';

  const entry = await quickAddApi.inputPrompt('Progress log entry');
  if (!entry) return '';

  const now = h.moment ? h.moment() : null;
  const ts = now ? now.format('YYYY-MM-DD HH:mm') : new Date().toISOString().slice(0, 16).replace('T', ' ');
  const day = now ? now.format('YYYY-MM-DD') : new Date().toISOString().slice(0, 10);

  const logPath = `${selectedStory.parent.path}/${selectedStory.basename} - log.md`;
  const exists = await app.vault.adapter.exists(logPath);
  if (!exists) {
    const content = [
      '---',
      'type: story-log',
      `story: "[[${selectedStory.basename}]]"`,
      '---',
      '',
      `# ${selectedStory.basename} - log`,
      '',
    ].join('\n');
    await app.vault.adapter.write(logPath, content);
  }

  const heading = `## ${day}`;
  await h.appendUnderHeading(logPath, heading, `- ${ts} - ${entry}`, true);
  await h.updateFrontmatterField(selectedStory, 'last_ping', day);

  const logFile = app.vault.getAbstractFileByPath(logPath);
  if (logFile) await app.workspace.getLeaf(true).openFile(logFile);
  new Notice('Progress log saved and last_ping updated.');
  return '';
};
