/** Log levels matching console methods + exceptions */
export type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug' | 'exception' | 'unhandledrejection';

/** A captured console log entry */
export interface ConsoleEntry {
  /** Monotonic timestamp from performance.now() — aligns with rrweb timeline */
  timestamp: number;
  /** Wall clock time (Date.now()) */
  wallTime: number;
  /** Log level */
  level: LogLevel;
  /** Serialized message string */
  message: string;
  /** Serialized arguments */
  args: string[];
  /** Stack trace (for errors/exceptions) */
  stack: string | null;
}

/** Message sent from MAIN world to ISOLATED world via postMessage */
export interface ConsolePostMessage {
  type: '__NOBUG_CONSOLE__';
  entry: ConsoleEntry;
}

/** Max serialized size per argument (bytes) */
export const MAX_ARG_SIZE = 10_240; // 10KB

/** Max log entries in buffer */
export const MAX_LOG_ENTRIES = 500;
