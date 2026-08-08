import { describe, test, expect } from '@jest/globals';
import { renderAgentsMd } from '../src/agentsMd.js';

describe('AGENTS.md rendering', () => {
  test('renders one table row per document', () => {
    const md = renderAgentsMd('acme', [
      { filename: 'a.pdf', name: 'Doc A', version: '1', date: '2026-01-01', use: 'testing' },
      { filename: 'b.md', name: 'Doc B', version: '2', date: '2026-02-01', use: 'more testing' }
    ]);

    expect(md).toContain('# Documents for acme');
    expect(md).toContain('| a.pdf | Doc A | 1 | 2026-01-01 | testing |');
    expect(md).toContain('| b.md | Doc B | 2 | 2026-02-01 | more testing |');
  });

  test('escapes pipes and newlines so metadata cannot break the table', () => {
    const md = renderAgentsMd('acme', [
      { filename: 'x.txt', name: 'A|B', version: '1', date: 'd', use: 'line1\nline2' }
    ]);

    expect(md).toContain('A\\|B');
    expect(md).toContain('line1 line2');
  });

  test('renders an explicit empty state', () => {
    expect(renderAgentsMd('acme', [])).toContain('_No documents have been uploaded yet._');
  });
});
