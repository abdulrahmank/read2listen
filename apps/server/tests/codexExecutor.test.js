import { describe, test, expect } from '@jest/globals';
import os from 'os';
import { CodexExecutor } from '../src/CodexExecutor.js';

/**
 * These tests exercise the subprocess harness itself, not the codex CLI:
 * PATH is emptied so `codex` never resolves, proving the promise settles
 * (rejects) instead of hanging when the binary is missing or wrong-arch.
 */
describe('CodexExecutor harness', () => {
  test('requires a cwd', async () => {
    const executor = new CodexExecutor();
    await expect(executor.execute('hi', {})).rejects.toThrow('requires a cwd');
  });

  test('a missing codex binary rejects instead of hanging', async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = '/nonexistent';
    try {
      const executor = new CodexExecutor({ timeoutMs: 5000 });
      await expect(executor.execute('hi', { cwd: os.tmpdir() }))
        .rejects.toMatchObject({ error: expect.stringContaining('Failed to start the Codex CLI') });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test('sandbox mode prefers explicit config over env, defaulting to read-only', () => {
    process.env.CODEX_SANDBOX = 'danger-full-access';
    try {
      expect(new CodexExecutor({ sandboxMode: 'workspace-write' }).sandboxMode).toBe('workspace-write');
      expect(new CodexExecutor().sandboxMode).toBe('danger-full-access');
    } finally {
      delete process.env.CODEX_SANDBOX;
    }
    expect(new CodexExecutor().sandboxMode).toBe('read-only');
  });

  test('timeout configuration prefers explicit config over env', () => {
    process.env.CODEX_TIMEOUT_MS = '9999';
    try {
      expect(new CodexExecutor({ timeoutMs: 1234 }).timeoutMs).toBe(1234);
      expect(new CodexExecutor().timeoutMs).toBe(9999);
    } finally {
      delete process.env.CODEX_TIMEOUT_MS;
    }
    expect(new CodexExecutor().timeoutMs).toBe(600000);
  });
});
