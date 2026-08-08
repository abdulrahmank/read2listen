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
    return { output: this.reply, executionTime: 1 };
  }

  get lastCall() {
    return this.calls[this.calls.length - 1];
  }
}
