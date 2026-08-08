import { spawn, execFile } from 'child_process';
import logger from './logger.js';

const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Default reasoning backend: shells out to Codex exec (`codex exec`).
 *
 * The layer is pluggable — ChatService takes any object with
 * execute(prompt, { cwd }) → Promise<{ output }>. Swap this class out by
 * injecting a different executor at composition time (src/index.js).
 *
 * cwd is the tenancy boundary: callers pass the tenant's directory, and the
 * agent examines the files there (documents + AGENTS.md).
 */
export class CodexExecutor {
  constructor(config = {}) {
    this.timeoutMs = config.timeoutMs
      || parseInt(process.env.CODEX_TIMEOUT_MS, 10)
      || DEFAULT_TIMEOUT_MS;
    // codex's own sandbox (bubblewrap/seatbelt). Inside Docker the container
    // is the isolation boundary and bubblewrap cannot create namespaces under
    // the default seccomp profile — the image sets CODEX_SANDBOX=danger-full-access.
    this.sandboxMode = config.sandboxMode || process.env.CODEX_SANDBOX || 'read-only';
  }

  async execute(prompt, { cwd, onProgress } = {}) {
    if (!cwd) {
      throw new Error('CodexExecutor.execute requires a cwd (the tenant directory)');
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let output = '';
      let errorOutput = '';
      let timedOut = false;

      logger.info('Executing codex', { promptLength: prompt.length, cwd, timeoutMs: this.timeoutMs });

      // --skip-git-repo-check: tenant dirs are plain data directories, not
      // git repos, and codex exec refuses to run outside one without it.
      const child = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', this.sandboxMode, prompt], {
        env: process.env,
        cwd,
        // stdin is closed on purpose: if codex ever stops to prompt for
        // input, it must fail immediately instead of hanging the request.
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // A stuck subprocess must never hang the HTTP request.
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, this.timeoutMs);

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        if (typeof onProgress === 'function') {
          onProgress({ stream: 'stdout', chunk });
        }
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        // info, not debug: codex explains its failures (auth, network,
        // unsupported dir) on stderr, and hiding that cost us a debugging
        // session once already.
        logger.info('codex stderr', { stderr: chunk.trim() });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        logger.error('Failed to start codex process:', error);
        reject({
          success: false,
          error: `Failed to start the Codex CLI: ${error.message}. Ensure it is installed for this platform and logged in.`
        });
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const executionTime = Date.now() - startTime;
        const stderrTail = errorOutput.trim().slice(-500);

        if (timedOut) {
          logger.error('codex timed out', { timeoutMs: this.timeoutMs, cwd });
          return reject({
            success: false,
            error: `codex timed out after ${this.timeoutMs}ms${stderrTail ? ` — last stderr: ${stderrTail}` : ''}`,
            executionTime
          });
        }

        if (code === 0) {
          logger.info(`codex completed in ${executionTime}ms`);
          return resolve({ output: output.trim(), executionTime });
        }

        logger.error('codex exited', { code, signal, executionTime, stderr: errorOutput.trim() });
        reject({
          success: false,
          error: `codex exited with code ${code}${stderrTail ? `: ${stderrTail}` : ''}`,
          executionTime
        });
      });
    });
  }
}

/**
 * Boot-time sanity check: surfaces a missing or wrong-architecture codex
 * binary at startup instead of on the first chat request.
 */
export function logCodexVersion() {
  execFile('codex', ['--version'], (error, stdout) => {
    if (error) {
      logger.warn(`Codex CLI check failed (${error.message}) — chat requests will fail until it is installed and logged in`);
    } else {
      logger.info(`Codex CLI: ${stdout.trim()}`);
    }
  });
}

export default CodexExecutor;
