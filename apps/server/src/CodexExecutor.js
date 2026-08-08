import { spawn } from 'child_process';
import logger from './logger.js';

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
  async execute(prompt, { cwd, onProgress } = {}) {
    if (!cwd) {
      throw new Error('CodexExecutor.execute requires a cwd (the tenant directory)');
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let output = '';
      let errorOutput = '';

      logger.info('Executing codex', { promptLength: prompt.length, cwd });

      const child = spawn('codex', ['exec', prompt], {
        env: process.env,
        cwd
      });

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
        logger.debug('codex stderr', { stderr: chunk.trim() });
      });

      child.on('error', (error) => {
        logger.error('Failed to start codex process:', error);
        reject({
          success: false,
          error: error.message,
          details: 'Failed to start the Codex CLI. Ensure it is installed and logged in.'
        });
      });

      child.on('close', (code, signal) => {
        const executionTime = Date.now() - startTime;

        if (code === 0) {
          logger.info(`codex completed in ${executionTime}ms`);
          resolve({ output: output.trim(), executionTime });
        } else {
          logger.error('codex exited', { code, signal, executionTime });
          reject({
            success: false,
            error: `codex exited with code ${code}`,
            stderr: errorOutput,
            executionTime
          });
        }
      });
    });
  }
}

export default CodexExecutor;
