import { useSettings } from './useSettings.js';

/**
 * The single HTTP boundary: every composable talks to the API through
 * request/upload here, so auth headers and error shaping live in one place.
 */
export function useApi() {
  const { settings } = useSettings();

  async function send(path, { method = 'GET', body, formData, binary = false, signal } = {}) {
    const headers = { 'X-API-Key': settings.apiKey };
    let payload;

    if (formData) {
      payload = formData; // browser sets the multipart boundary itself
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(`${settings.apiBase}${path}`, {
      method,
      signal,
      headers,
      body: payload
    });

    if (response.ok && binary) return response.arrayBuffer();
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }

  /**
   * POST expecting an SSE response (fetch-based: EventSource can't send the
   * X-API-Key header). Emits parsed events through onEvent(name, data) and
   * resolves with the `done` event's payload. Falls back to plain JSON when
   * the server doesn't stream, so older servers keep working.
   */
  async function stream(path, { body, onEvent } = {}) {
    const headers = {
      'X-API-Key': settings.apiKey,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json'
    };

    const response = await fetch(`${settings.apiBase}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      return data;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = null;

    const handle = (raw) => {
      let event = 'message';
      const dataLines = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) return;
      const data = JSON.parse(dataLines.join('\n'));
      if (event === 'error') throw new Error(data.error || 'Chat failed');
      if (event === 'done') done = data;
      else onEvent?.(event, data);
    };

    for (;;) {
      const { done: eof, value } = await reader.read();
      if (eof) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (raw.trim()) handle(raw);
      }
    }

    if (!done) {
      throw new Error('Connection closed before the reply finished');
    }
    return done;
  }

  return {
    request: send,
    stream,
    upload: (path, formData) => send(path, { method: 'POST', formData })
  };
}
