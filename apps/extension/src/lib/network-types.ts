/** A captured network request entry (HAR-like) */
export interface NetworkEntry {
  /** Unique request ID */
  id: string;
  /** Wall clock time */
  wallTime: number;
  /** performance.now() timestamp — aligns with rrweb timeline */
  timestamp: number;
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Request headers (PII-masked) */
  requestHeaders: Record<string, string>;
  /** Request body (opt-in, null if disabled) */
  requestBody: string | null;
  /** Request body size in bytes */
  requestSize: number;
  /** Response status code */
  status: number;
  /** Response status text */
  statusText: string;
  /** Response headers (PII-masked) */
  responseHeaders: Record<string, string>;
  /** Response body (opt-in, null if disabled) */
  responseBody: string | null;
  /** Response body size in bytes */
  responseSize: number;
  /** Request type: 'fetch' | 'xhr' */
  initiator: 'fetch' | 'xhr';
  /** Whether the request failed (4xx/5xx) */
  failed: boolean;
  /** Timing */
  timing: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

/** Message sent from MAIN world to ISOLATED world */
export interface NetworkPostMessage {
  type: '__NOBUG_NETWORK__';
  entry: NetworkEntry;
}

/** Headers that contain PII and should be auto-masked */
export const PII_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

/** Max body size before truncation (50KB) */
export const MAX_BODY_SIZE = 50 * 1024;

/** Max entries in the network buffer */
export const MAX_NETWORK_ENTRIES = 200;
