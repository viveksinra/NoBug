/**
 * MAIN world content script — captures console.*, uncaught exceptions,
 * and unhandled promise rejections. Relays to ISOLATED world via postMessage.
 */
import type { ConsoleEntry, ConsolePostMessage, LogLevel } from '@/lib/console-types';
import { MAX_ARG_SIZE } from '@/lib/console-types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const METHODS: LogLevel[] = ['log', 'warn', 'error', 'info', 'debug'];

    // Keep references to original console methods
    const originals: Record<string, (...args: unknown[]) => void> = {};
    for (const method of METHODS) {
      originals[method] = console[method].bind(console);
    }

    /**
     * Safely serialize a value, handling circular references,
     * DOM elements, Symbols, and large objects.
     */
    function safeSerialize(value: unknown, depth = 0): string {
      if (depth > 5) return '[Max depth]';

      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (typeof value === 'symbol') return value.toString();
      if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
      if (typeof value === 'bigint') return `${value}n`;

      if (value instanceof Error) {
        return `${value.name}: ${value.message}${value.stack ? '\n' + value.stack : ''}`;
      }

      // DOM elements
      if (value instanceof HTMLElement) {
        const tag = value.tagName.toLowerCase();
        const id = value.id ? `#${value.id}` : '';
        const cls = value.className
          ? `.${String(value.className).split(' ').filter(Boolean).join('.')}`
          : '';
        return `<${tag}${id}${cls}>`;
      }

      if (value instanceof Node) {
        return `[${value.constructor.name}]`;
      }

      // Primitives
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const str = String(value);
        if (str.length > MAX_ARG_SIZE) {
          return str.slice(0, MAX_ARG_SIZE) + '... [truncated]';
        }
        return str;
      }

      // Objects and arrays — safe stringify with circular reference detection
      try {
        const seen = new WeakSet();
        const json = JSON.stringify(value, (_key, val) => {
          if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
          }
          if (typeof val === 'bigint') return `${val}n`;
          if (typeof val === 'symbol') return val.toString();
          if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
          if (val instanceof HTMLElement) {
            return `<${val.tagName.toLowerCase()}>`;
          }
          return val;
        }, 2);

        if (json && json.length > MAX_ARG_SIZE) {
          return json.slice(0, MAX_ARG_SIZE) + '... [truncated]';
        }
        return json ?? 'undefined';
      } catch {
        return `[Object: ${Object.prototype.toString.call(value)}]`;
      }
    }

    function relay(entry: ConsoleEntry) {
      const msg: ConsolePostMessage = {
        type: '__NOBUG_CONSOLE__',
        entry,
      };
      window.postMessage(msg, '*');
    }

    function captureStack(): string | null {
      const err = new Error();
      if (!err.stack) return null;
      // Remove the first 3 lines (Error, captureStack, patchedMethod)
      const lines = err.stack.split('\n');
      return lines.slice(3).join('\n') || null;
    }

    // Monkey-patch console methods
    for (const method of METHODS) {
      (console as any)[method] = function (...args: unknown[]) {
        // Always call original to preserve DevTools output
        originals[method](...args);

        const entry: ConsoleEntry = {
          timestamp: performance.now(),
          wallTime: Date.now(),
          level: method as LogLevel,
          message: args.map((a) => safeSerialize(a)).join(' '),
          args: args.map((a) => safeSerialize(a)),
          stack: method === 'error' ? captureStack() : null,
        };
        relay(entry);
      };
    }

    // Capture uncaught exceptions
    window.addEventListener('error', (event) => {
      const entry: ConsoleEntry = {
        timestamp: performance.now(),
        wallTime: Date.now(),
        level: 'exception',
        message: event.message || 'Unknown error',
        args: [event.message || 'Unknown error'],
        stack: event.error?.stack ?? `at ${event.filename}:${event.lineno}:${event.colno}`,
      };
      relay(entry);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? `${reason.name}: ${reason.message}`
          : safeSerialize(reason);

      const entry: ConsoleEntry = {
        timestamp: performance.now(),
        wallTime: Date.now(),
        level: 'unhandledrejection',
        message: `Unhandled Promise Rejection: ${message}`,
        args: [safeSerialize(reason)],
        stack: reason instanceof Error ? reason.stack ?? null : null,
      };
      relay(entry);
    });
  },
});
