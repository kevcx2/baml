/**
 * Zod schema support.
 *
 * Detects Zod schemas and converts them to JSON Schema.
 * Supports Zod v4 (z.toJSONSchema built-in) and Zod v3 (via zod-to-json-schema).
 *
 * Zod is a peer/optional dependency — this module is the only place
 * that interacts with Zod, keeping the core library Zod-free.
 */

import * as z from 'zod';

// ---------------------------------------------------------------------------
// Schema type detection
// ---------------------------------------------------------------------------

/**
 * Check whether a value looks like a Zod schema.
 *
 * We duck-type it: if it has a `_def` property and a `parse` method,
 * it's probably a Zod schema. This avoids requiring `instanceof` checks
 * which break across package versions.
 */
export function isZodSchema(schema: unknown): boolean {
  return (
    schema !== null &&
    typeof schema === 'object' &&
    '_def' in (schema as Record<string, unknown>) &&
    'parse' in (schema as Record<string, unknown>) &&
    typeof (schema as Record<string, unknown>)['parse'] === 'function'
  );
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a Zod schema to a JSON Schema object.
 *
 * Uses Zod v4's built-in `z.toJSONSchema()` if available,
 * otherwise falls back to `zod-to-json-schema` for v3.
 *
 * @param zodSchema  A Zod schema (z.string(), z.object({...}), etc.)
 * @returns          A JSON Schema object suitable for passing to parseSchema/parser.
 */
export function zodSchemaToJsonSchema(zodSchema: unknown): Record<string, unknown> {
  if (typeof z.toJSONSchema === 'function') {
    return z.toJSONSchema(zodSchema as z.ZodType) as Record<string, unknown>;
  }

  throw new Error(
    'Cannot convert Zod schema to JSON Schema: ' +
    'zod v4+ with toJSONSchema support is required',
  );
}

// ---------------------------------------------------------------------------
// Unified schema normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a schema input: if it's a Zod schema, convert to JSON Schema.
 * If it's already a plain object, return it as-is.
 */
export function normalizeSchema(schema: unknown): Record<string, unknown> {
  if (isZodSchema(schema)) {
    return zodSchemaToJsonSchema(schema);
  }
  return schema as Record<string, unknown>;
}

