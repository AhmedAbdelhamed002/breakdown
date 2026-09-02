type Level = "info" | "warn" | "error";

/** Renders metadata as inline text instead of a collapsible console object — a collapsed object
 * copy-pastes as just the word "Object" unless it's manually expanded first in DevTools, which
 * loses the actual error content when someone pastes a console line into a bug report or chat. */
function formatMeta(meta: unknown): string {
  if (meta == null) return "";
  if (typeof meta === "string") return meta;
  // Error's own message/stack (and DOMException's, etc.) are non-enumerable, so JSON.stringify
  // silently drops them and yields "{}" no matter what the real failure was — walk own property
  // names instead so the actual message/stack/cause make it into the logged line.
  if (meta instanceof Error) {
    const err = meta as Error & { cause?: unknown };
    return JSON.stringify({ name: err.name, message: err.message, stack: err.stack, cause: err.cause != null ? formatMeta(err.cause) : undefined });
  }
  try {
    const json = JSON.stringify(meta);
    if (json !== "{}" || typeof meta !== "object") return json;
    const props = Object.getOwnPropertyNames(meta).reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = (meta as Record<string, unknown>)[k];
      return acc;
    }, {});
    return JSON.stringify(props);
  } catch {
    return String(meta);
  }
}

function log(level: Level, msg: string, meta?: unknown) {
  // Swap for App Insights / telemetry sink in production.
  // eslint-disable-next-line no-console
  console[level](`[${level.toUpperCase()}] ${msg}`, formatMeta(meta));
}
export const logger = {
  info: (m: string, meta?: unknown) => log("info", m, meta),
  warn: (m: string, meta?: unknown) => log("warn", m, meta),
  error: (m: string, meta?: unknown) => log("error", m, meta),
};
