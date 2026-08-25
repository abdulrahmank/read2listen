/**
 * Server-sent-events framing for Express responses, kept out of the routes so
 * transport handlers stay thin.
 */

/**
 * Lazy SSE writer over a response: headers are written on the first event, so
 * anything that throws before then (validation, unknown ids) can still
 * surface as ordinary 4xx JSON via the error middleware.
 *
 * @param {import('http').ServerResponse} res
 * @returns {{ sendEvent: (event: string, data: unknown) => void, isStreaming: () => boolean }}
 */
export function createSseWriter(res) {
  let streaming = false;

  const sendEvent = (event, data) => {
    if (!streaming) {
      streaming = true;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no' // tell reverse proxies not to buffer
      });
    }
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  return { sendEvent, isStreaming: () => streaming };
}
