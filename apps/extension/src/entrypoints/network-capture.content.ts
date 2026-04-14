/**
 * MAIN world content script — captures fetch() and XHR requests.
 * Relays HAR-like entries to ISOLATED world via postMessage.
 */
import type { NetworkEntry, NetworkPostMessage } from '@/lib/network-types';
import { PII_HEADERS, MAX_BODY_SIZE } from '@/lib/network-types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    let requestCounter = 0;

    /** Generate a unique request ID */
    function nextId(): string {
      return `nr_${Date.now()}_${++requestCounter}`;
    }

    /** Mask PII headers */
    function maskHeaders(headers: Record<string, string>): Record<string, string> {
      const masked: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        if (PII_HEADERS.has(key.toLowerCase())) {
          masked[key] = '[REDACTED]';
        } else {
          masked[key] = value;
        }
      }
      return masked;
    }

    /** Truncate body to max size */
    function truncateBody(body: string | null): string | null {
      if (!body) return null;
      if (body.length > MAX_BODY_SIZE) {
        return body.slice(0, MAX_BODY_SIZE) + '... [truncated]';
      }
      return body;
    }

    /** Extract headers from a Headers object */
    function headersToRecord(headers: Headers): Record<string, string> {
      const record: Record<string, string> = {};
      headers.forEach((value, key) => {
        record[key] = value;
      });
      return record;
    }

    /** Safely get body size */
    function bodySize(body: BodyInit | null | undefined): number {
      if (!body) return 0;
      if (typeof body === 'string') return body.length;
      if (body instanceof Blob) return body.size;
      if (body instanceof ArrayBuffer) return body.byteLength;
      if (body instanceof FormData) return 0; // Can't easily measure
      return 0;
    }

    function relay(entry: NetworkEntry) {
      const msg: NetworkPostMessage = {
        type: '__NOBUG_NETWORK__',
        entry,
      };
      window.postMessage(msg, '*');
    }

    // =====================================================================
    // Patch fetch()
    // =====================================================================
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const id = nextId();
      const startTime = performance.now();
      const wallTime = Date.now();

      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input instanceof Request
              ? input.url
              : String(input);

      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      // Extract request headers
      let reqHeaders: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          reqHeaders = headersToRecord(init.headers);
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) reqHeaders[k] = v;
        } else {
          reqHeaders = { ...(init.headers as Record<string, string>) };
        }
      } else if (input instanceof Request) {
        reqHeaders = headersToRecord(input.headers);
      }

      const reqSize = bodySize(init?.body);

      try {
        const response = await originalFetch(input, init);
        const endTime = performance.now();

        // Clone response to read headers without consuming
        const resHeaders = headersToRecord(response.headers);

        // Get response size from content-length header
        const contentLength = response.headers.get('content-length');
        const resSize = contentLength ? parseInt(contentLength, 10) : 0;

        const entry: NetworkEntry = {
          id,
          wallTime,
          timestamp: startTime,
          url,
          method: method.toUpperCase(),
          requestHeaders: maskHeaders(reqHeaders),
          requestBody: null, // Opt-in, off by default
          requestSize: reqSize,
          status: response.status,
          statusText: response.statusText,
          responseHeaders: maskHeaders(resHeaders),
          responseBody: null, // Opt-in, off by default
          responseSize: resSize,
          initiator: 'fetch',
          failed: response.status >= 400,
          timing: {
            startTime,
            endTime,
            duration: endTime - startTime,
          },
        };

        relay(entry);
        return response;
      } catch (error) {
        const endTime = performance.now();

        const entry: NetworkEntry = {
          id,
          wallTime,
          timestamp: startTime,
          url,
          method: method.toUpperCase(),
          requestHeaders: maskHeaders(reqHeaders),
          requestBody: null,
          requestSize: reqSize,
          status: 0,
          statusText: error instanceof Error ? error.message : 'Network Error',
          responseHeaders: {},
          responseBody: null,
          responseSize: 0,
          initiator: 'fetch',
          failed: true,
          timing: {
            startTime,
            endTime,
            duration: endTime - startTime,
          },
        };

        relay(entry);
        throw error; // Re-throw to preserve original behavior
      }
    };

    // =====================================================================
    // Patch XMLHttpRequest
    // =====================================================================
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;
    const originalSetRequestHeader = XHR.setRequestHeader;

    XHR.open = function (
      method: string,
      url: string | URL,
      async?: boolean,
      user?: string | null,
      password?: string | null,
    ) {
      (this as any).__nobug = {
        id: nextId(),
        method: method.toUpperCase(),
        url: typeof url === 'string' ? url : url.href,
        requestHeaders: {} as Record<string, string>,
        startTime: 0,
      };
      return originalOpen.call(this, method, url, async ?? true, user, password);
    };

    XHR.setRequestHeader = function (name: string, value: string) {
      const meta = (this as any).__nobug;
      if (meta) {
        meta.requestHeaders[name] = value;
      }
      return originalSetRequestHeader.call(this, name, value);
    };

    XHR.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const meta = (this as any).__nobug;
      if (!meta) {
        return originalSend.call(this, body);
      }

      meta.startTime = performance.now();
      const wallTime = Date.now();
      const reqSize = body ? (typeof body === 'string' ? body.length : 0) : 0;

      this.addEventListener('loadend', function () {
        const endTime = performance.now();

        // Extract response headers
        const rawHeaders = this.getAllResponseHeaders();
        const resHeaders: Record<string, string> = {};
        if (rawHeaders) {
          for (const line of rawHeaders.trim().split(/[\r\n]+/)) {
            const idx = line.indexOf(': ');
            if (idx > 0) {
              resHeaders[line.slice(0, idx)] = line.slice(idx + 2);
            }
          }
        }

        const contentLength = resHeaders['content-length'];
        const resSize = contentLength ? parseInt(contentLength, 10) : 0;

        const entry: NetworkEntry = {
          id: meta.id,
          wallTime,
          timestamp: meta.startTime,
          url: meta.url,
          method: meta.method,
          requestHeaders: maskHeaders(meta.requestHeaders),
          requestBody: null, // Opt-in
          requestSize: reqSize,
          status: this.status,
          statusText: this.statusText || '',
          responseHeaders: maskHeaders(resHeaders),
          responseBody: null, // Opt-in
          responseSize: resSize,
          initiator: 'xhr',
          failed: this.status >= 400 || this.status === 0,
          timing: {
            startTime: meta.startTime,
            endTime,
            duration: endTime - meta.startTime,
          },
        };

        relay(entry);
      });

      return originalSend.call(this, body);
    };
  },
});
