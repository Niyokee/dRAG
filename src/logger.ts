/**
 * Simple logger for MCP server
 * Uses stderr for logs (stdout reserved for MCP protocol)
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";
const isProduction = process.env.NODE_ENV === "production";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: object): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: object): void {
    if (shouldLog("debug")) {
      console.error(formatMessage("debug", message, meta));
    }
  },

  info(message: string, meta?: object): void {
    if (shouldLog("info")) {
      console.error(formatMessage("info", message, meta));
    }
  },

  warn(message: string, meta?: object): void {
    if (shouldLog("warn")) {
      console.error(formatMessage("warn", message, meta));
    }
  },

  error(message: string, error?: unknown, meta?: object): void {
    if (shouldLog("error")) {
      let errorMeta: object;
      if (error instanceof Error) {
        // In production, omit stack traces to avoid leaking internal paths
        errorMeta = isProduction
          ? { ...meta, error: error.message }
          : { ...meta, error: error.message, stack: error.stack };
      } else {
        errorMeta = { ...meta, error: String(error) };
      }
      console.error(formatMessage("error", message, errorMeta));
    }
  },
};
