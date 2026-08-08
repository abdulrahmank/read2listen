/**
 * Renders the tenant's AGENTS.md — the file Codex exec reads to learn what
 * each document in the directory is for, without opening everything.
 * Pure function: DocumentService owns writing it to disk.
 */
export function renderAgentsMd(tenantName, documents) {
  const lines = [
    `# Documents for ${tenantName}`,
    '',
    'You are running inside this tenant\'s document directory. Each file below',
    'was uploaded by an administrator with a declared purpose ("use"). Consult',
    'the files relevant to the conversation; ignore files that are not.',
    ''
  ];

  if (documents.length === 0) {
    lines.push('_No documents have been uploaded yet._');
  } else {
    lines.push('| File | Name | Version | Date | Use |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const doc of documents) {
      lines.push(
        `| ${escapeCell(doc.filename)} | ${escapeCell(doc.name)} | ${escapeCell(doc.version)} | ${escapeCell(doc.date)} | ${escapeCell(doc.use)} |`
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

const escapeCell = (value) =>
  String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
