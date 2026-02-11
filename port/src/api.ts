/**
 * Public API — the two main functions users of this library call.
 *
 * 1. `renderOutputFormat(schema)` — produce the prompt snippet from a JSON Schema
 * 2. `coerceToSchema(text, schema)` — parse + coerce LLM output against a JSON Schema
 */

import { parse, type ParseOptions } from './parser/parse.js';
import { schemaToType, type SchemaConversionOptions } from './schema-to-types.js';
import { coerce } from './coercer/coerce.js';
import { ParsingContext } from './coercer/context.js';
import { totalScore } from './flags.js';
import type { CoercionResult, ParseError } from './result.js';
import type { FieldType as FieldTypeT } from './types.js';

// Re-export renderOutputFormat directly — it's already a complete public API.
export { renderOutputFormat, renderOutputFormatFromType } from './output-format.js';
export type { RenderOptions } from './output-format.js';

// ---------------------------------------------------------------------------
// coerceToSchema — the main parse+validate function
// ---------------------------------------------------------------------------

export interface CoerceOptions {
  /** Options for the structural parser. */
  parse?: ParseOptions;
  /** Options for schema-to-type conversion. */
  schema?: SchemaConversionOptions;
}

/**
 * Parse LLM text and coerce it into a value conforming to the given JSON Schema.
 *
 * This is the primary entry point for validating LLM output.
 *
 * @param text    Raw LLM output text.
 * @param schema  JSON Schema defining the expected structure.
 * @param options Optional configuration for parsing and schema conversion.
 * @returns       A CoercionResult with the coerced value, quality score, flags, and errors.
 */
export function coerceToSchema(
  text: string,
  schema: Record<string, unknown>,
  options?: CoerceOptions,
): CoercionResult {
  const errors: ParseError[] = [];

  // Phase 1: Convert JSON Schema → internal type representation
  let targetType: FieldTypeT;
  let definitions: Map<string, FieldTypeT>;
  try {
    const conversion = schemaToType(schema, options?.schema);
    targetType = conversion.type;
    definitions = conversion.definitions;
  } catch (err) {
    return {
      value: undefined,
      success: false,
      score: Infinity,
      flags: [],
      errors: [{
        scope: '<root>',
        message: `Schema conversion failed: ${err instanceof Error ? err.message : String(err)}`,
        causes: [],
      }],
    };
  }

  // Phase 2: Structural parse — extract jsonish values from raw text
  const parsed = parse(text, options?.parse);

  // Phase 3: Schema-aware coercion
  const ctx = new ParsingContext(definitions);
  const result = coerce(parsed, targetType, ctx);

  if (result === null) {
    return {
      value: undefined,
      success: false,
      score: Infinity,
      flags: [],
      errors: [{
        scope: '<root>',
        message: `Failed to coerce value to target type`,
        causes: errors,
      }],
    };
  }

  const score = totalScore(result.flags);

  return {
    value: result.value,
    success: true,
    score,
    flags: result.flags,
    errors,
  };
}
