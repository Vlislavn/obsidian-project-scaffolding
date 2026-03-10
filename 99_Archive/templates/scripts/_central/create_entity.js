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

  const type = await quickAddApi.suggester(
    ['Deliverable', 'Story', 'Task', 'Employee', 'Doc'],
    ['deliverable', 'story', 'task', 'employee', 'doc'],
    'Create Entity'
  );
  if (!type) return '';

  if (type === 'task') {
    const createTask = await _load(app, '99_Archive/templates/scripts/_central/task.js');
    return createTask({ app, quickAddApi, variables });
  }

  if (type === 'employee') {
    const raw = await quickAddApi.inputPrompt('Employee name (without @)');
    if (!raw) return '';
    const name = h.sanitizeFileName(raw).replace(/^@+/, '');
    await h.ensureFolder('04_People');
    const path = `04_People/@${name}.md`;
    if (await app.vault.adapter.exists(path)) {
      new Notice('Employee note already exists.');
      const f = app.vault.getAbstractFileByPath(path);
      if (f) await app.workspace.getLeaf(true).openFile(f);
      return '';
    }
    const content = [
      '---',
      'type: employee',
      'fte: 1.0',
      'background: "[]"',
      'task_preferences: "[]"',
      '---',
      '',
      `# @${name}`,
      '',
      '## Reference table',
      '',
      '```tasks',
      'not done',
      `description includes @${name}`,
      'sort by due',
      '```',
      ''
    ].join('\n');
    await app.vault.adapter.write(path, content);
    const f = app.vault.getAbstractFileByPath(path);
    if (f) await app.workspace.getLeaf(true).openFile(f);
    new Notice('Employee created.');
    return '';
  }

  if (type === 'doc') {
    const deliverables = h.getDeliverableNotes();
    if (!deliverables.length) {
      new Notice('No deliverables found. Create a deliverable first.');
      return '';
    }

    const inputs = await quickAddApi.requestInputs([
      {
        id: 'deliverable',
        label: 'Parent deliverable',
        type: 'suggester',
        options: deliverables.map((d) => d.basename).sort(),
        suggesterConfig: { multiSelect: false },
        placeholder: 'Select deliverable…'
      },
      { id: 'title', label: 'Doc title', type: 'text', placeholder: 'Document title…' },
    ]);
    if (!inputs) return '';

    const deliverableName = String(inputs.deliverable || '').trim();
    const d = deliverables.find((x) => x.basename === deliverableName);
    if (!d) { new Notice('Select a valid deliverable.'); return ''; }

    const title = String(inputs.title || '').trim();
    if (!title) { new Notice('Doc title is required.'); return ''; }

    const safe = h.sanitizeFileName(title);
    const docsFolder = `${d.parent.path}/docs`;
    await h.ensureFolder(docsFolder);
    const path = `${docsFolder}/${safe}.md`;

    if (await app.vault.adapter.exists(path)) {
      new Notice('Doc already exists.');
      const f = app.vault.getAbstractFileByPath(path);
      if (f) await app.workspace.getLeaf(true).openFile(f);
      return '';
    }

    const today = h.moment ? h.moment().format('YYYY-MM-DD') : new Date().toISOString().slice(0, 10);
    const content = [
      '---',
      'type: doc',
      `deliverable: "[[${d.basename}]]"`,
      `created: ${today}`,
      '---',
      '',
      `# ${title}`,
      '',
      `> Parent deliverable: [[${d.basename}]]`,
      ''
    ].join('\n');

    await app.vault.adapter.write(path, content);
    const f = app.vault.getAbstractFileByPath(path);
    if (f) await app.workspace.getLeaf(true).openFile(f);
    new Notice('Doc created.');
    return '';
  }

  if (type === 'deliverable') {
    const employees = h.getEmployeeNotes();
    const dateFieldType = h.getPreferredDateFieldType();

    const inputs = await quickAddApi.requestInputs([
      { id: 'title', label: 'Deliverable name', type: 'text', placeholder: 'Deliverable title…' },
      {
        id: 'owner',
        label: 'Owner',
        type: 'suggester',
        options: employees.map((e) => e.basename).sort(),
        suggesterConfig: { multiSelect: false },
        placeholder: 'Select owner…'
      },
      { id: 'responsible', label: 'Responsible group', type: 'text', placeholder: '[[working_group]]' },
      { id: 'startDate', label: 'Start date', type: dateFieldType, dateFormat: 'YYYY-MM-DD', placeholder: 'today, YYYY-MM-DD' },
      { id: 'deadline', label: 'Deadline', type: dateFieldType, dateFormat: 'YYYY-MM-DD', placeholder: 'YYYY-MM-DD' },
    ]);
    if (!inputs) return '';

    const title = String(inputs.title || '').trim();
    if (!title) { new Notice('Deliverable name is required.'); return ''; }

    const safe = h.sanitizeFileName(title);
    const folder = `03_Deliverables/$${safe}`;
    await h.ensureFolder(folder);
    await h.ensureFolder(`${folder}/stories`);
    await h.ensureFolder(`${folder}/docs`);

    const ownerLink = h.normalizeAssigneeLink(inputs.owner) || '[[@Name]]';
    const responsible = String(inputs.responsible || '[[working_group]]').trim();
    const start = h.parseAndFormatDate(inputs.startDate);
    const deadlineParsed = h.parseAndFormatDate(inputs.deadline);

    const path = `${folder}/$${safe}.md`;
    const content = [
      '---',
      'type: deliverable',
      'status: backlog',
      `owner: "${ownerLink}"`,
      `responsible: "${responsible}"`,
      `start_date: ${start.valid ? start.formatted : ''}`,
      `deadline: ${deadlineParsed.valid ? deadlineParsed.formatted : ''}`,
      '---',
      '',
      `# ${title}`,
      '',
      '## Description',
      '',
      '## Stories',
      '',
      '```dataviewjs',
      'await dv.view("scripts/add-story-button");',
      '```',
      '',
      '![[DeliverableStories.base]]',
      '',
      '## Progress',
      '',
      '```dataviewjs',
      'await dv.view("scripts/deliverable-progress");',
      '```',
      ''
    ].join('\n');

    if (!(await app.vault.adapter.exists(path))) {
      await app.vault.adapter.write(path, content);
    }

    const f = app.vault.getAbstractFileByPath(path);
    if (f) await app.workspace.getLeaf(true).openFile(f);
    new Notice('Deliverable created.');
    return '';
  }

  if (type === 'story') {
    const deliverables = h.getDeliverableNotes();
    if (!deliverables.length) {
      new Notice('No deliverables found. Create deliverable first.');
      return '';
    }
    const employees = h.getEmployeeNotes();
    const dateFieldType = h.getPreferredDateFieldType();
    const allStories = h.getStoryNotes();
    const existingStoryOptions = allStories.map((s) => s.basename).sort();

    const inputs = await quickAddApi.requestInputs([
      {
        id: 'deliverable',
        label: 'Parent deliverable',
        type: 'suggester',
        options: deliverables.map((x) => x.basename).sort(),
        suggesterConfig: { multiSelect: false },
        placeholder: 'Select deliverable…'
      },
      { id: 'storyName', label: 'Story name', type: 'text', placeholder: 'Story title…' },
      {
        id: 'owner',
        label: 'Owner',
        type: 'suggester',
        options: employees.map((e) => e.basename).sort(),
        suggesterConfig: { multiSelect: false },
        placeholder: 'Select owner…'
      },
      {
        id: 'size',
        label: 'Story size',
        type: 'suggester',
        options: ['XS', 'S', 'M', 'L', 'XL'],
        suggesterConfig: { multiSelect: false },
        placeholder: 'M'
      },
      {
        id: 'moscow',
        label: 'MoSCoW priority',
        type: 'suggester',
        options: ['must', 'should', 'could', 'wont'],
        suggesterConfig: { multiSelect: false },
        placeholder: 'must'
      },
      { id: 'deadline', label: 'Deadline', type: dateFieldType, dateFormat: 'YYYY-MM-DD', placeholder: 'YYYY-MM-DD' },
      {
        id: 'blocking',
        label: 'Blocking (this story blocks…)',
        type: 'suggester',
        options: existingStoryOptions,
        suggesterConfig: { multiSelect: true },
        placeholder: 'Select stories this blocks…'
      },
      {
        id: 'blockedBy',
        label: 'Blocked by',
        type: 'suggester',
        options: existingStoryOptions,
        suggesterConfig: { multiSelect: true },
        placeholder: 'Select stories blocking this…'
      },
    ]);
    if (!inputs) return '';

    const deliverableName = String(inputs.deliverable || '').trim();
    const d = deliverables.find((x) => x.basename === deliverableName);
    if (!d) { new Notice('Select a valid deliverable.'); return ''; }

    const storyName = String(inputs.storyName || '').trim();
    if (!storyName) { new Notice('Story name is required.'); return ''; }
    const safe = h.sanitizeFileName(storyName);

    const ownerLink = h.normalizeAssigneeLink(inputs.owner) || '[[@Name]]';
    const size = String(inputs.size || 'M').trim();
    const moscow = String(inputs.moscow || 'must').trim();
    const deadlineParsed = h.parseAndFormatDate(inputs.deadline);
    const blockingRaw = String(inputs.blocking || '').split(', ').filter(Boolean);
    const blockedByRaw = String(inputs.blockedBy || '').split(', ').filter(Boolean);
    const blocking = blockingRaw.map((s) => `[[${s}]]`).join(', ');
    const blockedBy = blockedByRaw.map((s) => `[[${s}]]`).join(', ');

    const storiesFolder = `${d.parent.path}/stories`;
    await h.ensureFolder(storiesFolder);
    const path = `${storiesFolder}/$${safe}.md`;

    const content = [
      '---',
      'type: story',
      'status: backlog',
      `owner: "${ownerLink}"`,
      `deliverable: "[[${d.basename}]]"`,
      `size: ${size}`,
      `blocking: "${blocking}"`,
      `blocked_by: "${blockedBy}"`,
      `deadline: ${deadlineParsed.valid ? deadlineParsed.formatted : ''}`,
      `moscow: ${moscow}`,
      'last_ping: ',
      '---',
      '',
      `# ${storyName}`,
      '',
      '## Description',
      '',
      '```dataviewjs',
      'await dv.view("scripts/add-task-button");',
      '```',
      '',
      '### Tasks',
      '',
      '## Task Stats',
      '',
      '```dataviewjs',
      'await dv.view("scripts/story-progress");',
      '```',
      ''
    ].join('\n');

    await app.vault.adapter.write(path, content);
    const f = app.vault.getAbstractFileByPath(path);
    if (f) await app.workspace.getLeaf(true).openFile(f);
    new Notice('Story created under deliverable.');
    return '';
  }

  return '';
};
