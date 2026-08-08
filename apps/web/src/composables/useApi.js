import { useSettings } from './useSettings.js';

/**
 * The single HTTP boundary: every composable talks to the API through
 * request/upload here, so auth headers and error shaping live in one place.
 */
export function useApi() {
  const { settings } = useSettings();

  async function send(path, { method = 'GET', body, formData } = {}) {
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
      headers,
      body: payload
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }

  return {
    request: send,
    upload: (path, formData) => send(path, { method: 'POST', formData })
  };
}
