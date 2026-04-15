import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  namespace: string;
  message: string;
  context?: LogContext;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

const isProduction = process.env.NODE_ENV === 'production';
const minLevel: LogLevel = isProduction ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

function formatDev(entry: LogEntry): string {
  const color = LOG_COLORS[entry.level];
  const prefix = `${color}[${entry.level.toUpperCase()}]${RESET}`;
  const ns = `\x1b[35m[${entry.namespace}]${RESET}`;
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  return `${prefix} ${ns} ${entry.message}${ctx}`;
}

function formatProd(entry: LogEntry): string {
  return JSON.stringify(entry);
}

class Logger {
  constructor(private namespace: string) {}

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      namespace: this.namespace,
      message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };

    const formatted = isProduction ? formatProd(entry) : formatDev(entry);

    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        if (context?.error instanceof Error) {
          Sentry.captureException(context.error, {
            extra: { ...context, namespace: this.namespace, message },
          });
        } else {
          Sentry.captureMessage(message, {
            level: 'error',
            extra: { ...context, namespace: this.namespace },
          });
        }
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }
}

/**
 * Create a scoped logger instance.
 *
 * @example
 * const log = createLogger('auth');
 * log.info('User logged in', { userId: '123' });
 * log.error('Login failed', { error: new Error('bad credentials') });
 */
export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}

/** Default logger for general use */
export const logger = createLogger('app');
