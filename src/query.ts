import type { ListOptions } from "./types.js";

/** Flatten keyset list options into the query map (undefined values are dropped). */
export function listQuery(
  options?: ListOptions,
): Record<string, string | number | undefined> | undefined {
  if (!options) return undefined;
  return { limit: options.limit, after: options.after, before: options.before };
}

/** A boolean filter as the API reads it: "true" or "false"; undefined stays off the wire. */
export function bool(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

/** A list filter as the API reads it: comma-separated. An empty list stays off the wire, since `labels=` is not "no labels". */
export function csv(values: readonly string[] | undefined): string | undefined {
  return values?.length ? values.join(",") : undefined;
}
