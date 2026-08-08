/**
 * Stand-in for CodexExecutor: records every call so tests can assert on the
 * prompt (history JSON, document list) and the cwd (tenant isolation).
 */
export class FakeExecutor {
  constructor(reply = 'This is the assistant reply.') {
    this.reply = reply;
    this.calls = [];
  }

  async execute(prompt, options = {}) {
    this.calls.push({ prompt, ...options });
    // Mimic CodexExecutor: stdout arrives in chunks before the promise
    // resolves, so SSE tests can assert on streamed progress.
    if (typeof options.onProgress === 'function') {
      for (const chunk of this.reply.split(/(?<= )/)) {
        options.onProgress({ stream: 'stdout', chunk });
      }
    }
    return { output: this.reply, executionTime: 1 };
  }

  get lastCall() {
    return this.calls[this.calls.length - 1];
  }
}
