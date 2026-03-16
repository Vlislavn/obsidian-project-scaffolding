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

module.exports = async ({ app, quickAddApi, variables }) => {
  const commonFactory = await _load(app, '99_Archive/templates/scripts/_central/common.js');
  const h = commonFactory({ app });

  const active = app.workspace.getActiveFile();
  const deliverables = h.getDeliverableNotes();
  const stories = h.getStoryNotes();
  const employees = h.getEmployeeNotes();

  if (!stories.length) {
    new Notice('No story notes found. Create story first.');
    return '';
  }
  if (!employees.length) {
    new Notice('No employee notes identified. Create @Employee notes in 04_People first.');
    return '';
  }

  const activeStoryName = active && String(h.getFrontmatter(active).type || '').toLowerCase() === 'story'
    ? active.basename
    : '';

  const dateFieldType = h.getPreferredDateFieldType();

  const inputConfig = [
    { id: 'taskName', label: 'Task', type: 'textarea', placeholder: 'What needs to be done?' },
    { id: 'benefit', label: 'Benefit', type: 'textarea', placeholder: 'Why is this important? (optional)' },
    {
      id: 'deliverable',
      label: 'Deliverable',
      type: 'suggester',
      options: deliverables.map((d) => d.basename).sort(),
      suggesterConfig: { multiSelect: false },
      placeholder: 'Select deliverable...'
    },
    {
      id: 'story',
      label: 'Story',
      type: 'suggester',
      options: stories.map((s) => s.basename).sort(),
      suggesterConfig: { multiSelect: false },
      placeholder: activeStoryName || 'Select story...'
    },
    {
      id: 'assignee',
      label: 'Assignee',
      type: 'suggester',
      options: employees.map((e) => e.basename).sort(),
      suggesterConfig: { multiSelect: false },
      placeholder: 'Select employee...'
    },
    {
      id: 'taskSize',
      label: 'Task size',
      type: 'suggester',
      options: ['#s-XS', '#s-S', '#s-M', '#s-L', '#s-XL'],
      suggesterConfig: { multiSelect: false },
      placeholder: 'Select size...'
    },
    {
      id: 'dueDate',
      label: 'Due date',
      type: dateFieldType,
      dateFormat: 'YYYY-MM-DD',
      placeholder: 'today, tomorrow, YYYY-MM-DD'
    },
    {
      id: 'scheduledDate',
      label: 'Scheduled date',
      type: dateFieldType,
      dateFormat: 'YYYY-MM-DD',
      placeholder: 'today, tomorrow, YYYY-MM-DD'
    },
    {
      id: 'notes',
      label: 'Notes',
      type: 'textarea',
      placeholder: 'Additional context (optional)'
    }
  ];

  const inputs = await quickAddApi.requestInputs(inputConfig);
  if (!inputs) return '';

  const taskName = String(inputs.taskName || '').trim();
  if (!taskName) {
    new Notice('Task name is required.');
    return '';
  }

  const selectedStoryName = String(inputs.story || activeStoryName || '').trim();
  const targetStory = stories.find((s) => s.basename === selectedStoryName) || null;
  if (!targetStory) {
    new Notice('Select a valid story.');
    return '';
  }

  const fm = h.getFrontmatter(targetStory);
  const storyDeliverable = String(fm.deliverable || '').replace(/^"|"$/g, '').trim();
  const selectedDeliverable = String(inputs.deliverable || '').trim();
  if (selectedDeliverable && storyDeliverable && !storyDeliverable.includes(selectedDeliverable)) {
    new Notice('Selected story does not belong to selected deliverable.');
    return '';
  }

  const deliverableLink = storyDeliverable || (selectedDeliverable ? `[[${selectedDeliverable}]]` : '');
  const sizeToken = String(inputs.taskSize || '').trim() || '#s-S';
  const due = h.parseAndFormatDate(inputs.dueDate);
  const scheduled = h.parseAndFormatDate(inputs.scheduledDate);
  const assignee = String(inputs.assignee || '').trim();

  const notes = String(inputs.notes || '').trim();
  const benefit = String(inputs.benefit || '').trim();
  const createdDate = h.moment ? h.moment().format('YYYY-MM-DD') : new Date().toISOString().slice(0, 10);

  const line = h.buildInlineTaskLine({
    storyFile: targetStory,
    taskName,
    assignee,
    deliverableLink: '',
    createdDate,
    scheduledDate: scheduled.valid ? scheduled.formatted : '',
    dueDate: due.valid ? due.formatted : '',
    taskSize: sizeToken,
    benefit,
    notes,
  });

  const heading = await h.ensureHeading(targetStory.path, ['### Tasks', '## Tasks']);
  const content = await app.vault.read(targetStory);
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.trim() === heading.trim());
  lines.splice(idx + 1, 0, line);
  await app.vault.modify(targetStory, lines.join('\n'));
  await h.touchStoryLastPing(targetStory);

  variables.line = line;
  new Notice('Task created in Story.md');
  return '';
};
