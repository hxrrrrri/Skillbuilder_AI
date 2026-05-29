// Tiny zero-dependency structured logger.
//
// - Levels: debug < info < warn < error (below threshold are dropped).
// - JSON lines in production (parseable by log shippers); pretty single line in
//   dev. Override format/level via LOG_FORMAT and LOG_LEVEL.
// - `child(bindings)` returns a logger that merges fixed fields (e.g. component,
//   requestId, runId) into every record.
// - Errors passed in fields are serialized to { name, message, stack }.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown> & { requestId?: string };

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Derive a logger that always includes `bindings`. */
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: "json" | "pretty";
  bindings?: LogFields;
  /** Test/transport seam: receives the fully-formatted line. Defaults to console. */
  sink?: (level: LogLevel, line: string) => void;
  now?: () => Date;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function serializeFields(fields: LogFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = serializeValue(v);
  return out;
}

const COLORLESS = !process.stdout?.isTTY;
const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "\x1b[90m", // grey
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

function defaultSink(level: LogLevel, line: string): void {
  // warn/error to stderr so they survive stdout redirection.
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

function resolveLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_WEIGHT) return env;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function resolveFormat(): "json" | "pretty" {
  const env = process.env.LOG_FORMAT;
  if (env === "json" || env === "pretty") return env;
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

class StructuredLogger implements Logger {
  private readonly level: LogLevel;
  private readonly format: "json" | "pretty";
  private readonly bindings: LogFields;
  private readonly sink: (level: LogLevel, line: string) => void;
  private readonly now: () => Date;

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? resolveLevel();
    this.format = opts.format ?? resolveFormat();
    this.bindings = opts.bindings ?? {};
    this.sink = opts.sink ?? defaultSink;
    this.now = opts.now ?? (() => new Date());
  }

  private write(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return;
    const merged = serializeFields({ ...this.bindings, ...fields });
    const time = this.now().toISOString();

    if (this.format === "json") {
      this.sink(level, JSON.stringify({ level, time, msg, ...merged }));
      return;
    }

    const parts = Object.entries(merged).map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${val}`;
    });
    const tag = COLORLESS ? level.toUpperCase() : `${LEVEL_COLOR[level]}${level.toUpperCase()}${RESET}`;
    const suffix = parts.length ? ` ${parts.join(" ")}` : "";
    this.sink(level, `${time} ${tag} ${msg}${suffix}`);
  }

  debug(msg: string, fields?: LogFields): void {
    this.write("debug", msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.write("info", msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.write("warn", msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.write("error", msg, fields);
  }

  child(bindings: LogFields): Logger {
    return new StructuredLogger({
      level: this.level,
      format: this.format,
      bindings: { ...this.bindings, ...bindings },
      sink: this.sink,
      now: this.now,
    });
  }
}

export function createLogger(opts?: LoggerOptions): Logger {
  return new StructuredLogger(opts);
}

export const logger: Logger = createLogger();
