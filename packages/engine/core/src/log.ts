/**
 * Logging.
 *
 * stdout is reserved for the single `HOUSTON_ENGINE_LISTENING` banner line the
 * desktop supervisor parses (see `engine/houston-engine-server/src/main.rs`).
 * Everything else MUST go to stderr, exactly like the Rust engine routes
 * `tracing` to stderr — otherwise the supervisor's stdout drain mis-parses log
 * lines as the banner and `engine.log` stays empty.
 */

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, args: unknown[]): void {
  const parts = args.map((a) =>
    typeof a === "string" ? a : a instanceof Error ? (a.stack ?? a.message) : safeJson(a),
  );
  process.stderr.write(`[${level}] ${parts.join(" ")}\n`);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const log = {
  debug: (...args: unknown[]) => write("debug", args),
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
};
