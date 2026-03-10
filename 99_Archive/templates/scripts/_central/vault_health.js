module.exports = async (params) => {
  const { app } = params;
  const files = app.vault.getMarkdownFiles();

  let conflicted = 0;
  let missingType = 0;

  for (const f of files) {
    if (f.name.toLowerCase().includes('conflicted copy')) conflicted++;
    const cache = app.metadataCache.getFileCache(f);
    const type = cache?.frontmatter?.type;
    if (!type && !f.path.startsWith('99_Archive/')) missingType++;
  }

  const msg = `Vault health: conflicted=${conflicted}, missing_type=${missingType}, files=${files.length}`;
  new Notice(msg, 8000);
  console.log(msg);
};
