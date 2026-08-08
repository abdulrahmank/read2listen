import { describe, test, expect, beforeAll } from '@jest/globals';
import os from 'os';
import path from 'path';
import { sanitizeFilename, documentPath, tenantRoot } from '../src/tenantDir.js';

describe('Tenant directory isolation', () => {
  beforeAll(() => {
    process.env.DATA_DIR = path.join(os.tmpdir(), 'chatify-tenantdir-test');
  });

  test('sanitizeFilename strips path components and hostile characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('/absolute/path/report.pdf')).toBe('report.pdf');
    expect(sanitizeFilename('nice name (final).pdf')).toBe('nice name _final_.pdf');
    expect(sanitizeFilename('..')).toBe('document');
    expect(sanitizeFilename('.env')).toBe('document');
    expect(sanitizeFilename('')).toBe('document');
  });

  test('sanitizeFilename reserves AGENTS.md for the generated file', () => {
    expect(sanitizeFilename('AGENTS.md')).toBe('document.md');
    expect(sanitizeFilename('agents.MD')).toBe('document.md');
  });

  test('documentPath refuses anything that escapes the tenant root', () => {
    expect(() => documentPath('tenant-a', '../tenant-b/steal.txt')).toThrow('Invalid document filename');
    expect(() => documentPath('tenant-a', 'nested/child.txt')).toThrow('Invalid document filename');
    expect(() => documentPath('tenant-a', '/etc/passwd')).toThrow('Invalid document filename');
  });

  test('documentPath accepts plain filenames inside the tenant root', () => {
    const p = documentPath('tenant-a', 'report.pdf');
    expect(p).toBe(path.join(tenantRoot('tenant-a'), 'report.pdf'));
  });

  test('tenantRoot rejects ids that change under path resolution', () => {
    expect(() => tenantRoot('../escape')).toThrow('Invalid tenant id');
    expect(() => tenantRoot('a/b')).toThrow('Invalid tenant id');
  });
});
