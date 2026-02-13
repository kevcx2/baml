/**
 * Zod schema support.
 *
 * Detects Zod schemas and converts them to JSON Schema.
 * Supports Zod v4 (z.toJSONSchema built-in) and Zod v3 (via zod-to-json-schema).
 *
 * Zod is a peer/optional dependency — this module is the only place
 * that interacts with Zod, keeping the core library Zod-free.
 */

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
  // Try Zod v4 built-in: import zod and call z.toJSONSchema()
  try {
    const zod = tryRequire('zod');
    if (zod && typeof zod.toJSONSchema === 'function') {
      return zod.toJSONSchema(zodSchema) as Record<string, unknown>;
    }
  } catch {
    // zod not available or toJSONSchema failed
  }

  // Try zod-to-json-schema (for Zod v3)
  try {
    const lib = tryRequire('zod-to-json-schema');
    if (lib && typeof lib.zodToJsonSchema === 'function') {
      return lib.zodToJsonSchema(zodSchema, { $refStrategy: 'none' }) as Record<string, unknown>;
    }
  } catch {
    // zod-to-json-schema not available
  }

  throw new Error(
    'Cannot convert Zod schema to JSON Schema: ' +
    'install zod (v4+) or zod-to-json-schema (for v3)',
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe require that returns null if module not found. */
function tryRequire(id: string): any {
  try {
    return require(id);
  } catch {
    return null;
  }
}
