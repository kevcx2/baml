/**
 * Public API
 *
 * Three levels of usage:
 *   1. `parseSchema(text, schema)` — one-shot parse, returns ParseResult<T>
 *   2. `prompt(schema)` — render an output format prompt snippet
 *   3. `parser(schema)` — factory: bundles schema+options, exposes .parse() / .prompt()
 *
 * Legacy (still exported for backward compat):
 *   - `coerceToSchema(text, schema)` — original API returning CoercionResult
 *   - `renderOutputFormat(schema)` / `renderOutputFormatFromType(type)`
 */

import { parse as structuralParse, type ParseOptions } from './parser/parse.js';
import { schemaToType, type SchemaConversionOptions } from './schema-to-types.js';
import { coerce } from './coercer/coerce.js';
import { ParsingContext } from './coercer/context.js';
import { totalScore } from './flags.js';
import type { CoercionResult, ParseError } from './result.js';
import type { FieldType as FieldTypeT } from './types.js';
import { ParseResult } from './parse-result.js';
import {
  renderOutputFormat,
  renderOutputFormatFromType,
  type RenderOptions,
} from './output-format.js';
import { validateSchemaConstraints, type ConstraintViolation } from './constraints.js';
import { normalizeSchema, isZodSchema } from './zod-support.js';
import { StreamParser, type StreamParserOptions, type StreamResult } from './stream-parser.js';

// Re-export legacy API unchanged.
export { renderOutputFormat, renderOutputFormatFromType } from './output-format.js';
export type { RenderOptions } from './output-format.js';

// ---------------------------------------------------------------------------
// Validation rule
// ---------------------------------------------------------------------------

/**
 * A custom validation rule.
 * Receives the coerced value and returns:
 *   - true / undefined / null  → passes
 *   - string                   → fails with that error message
 */
export type ValidationRule<T = unknown> = (value: T) => true | string | undefined | null;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CoerceOptions {
  /** Options for the structural parser. */
  parse?: ParseOptions;
  /** Options for schema-to-type conversion. */
  schema?: SchemaConversionOptions;
}

/**
 * Schema input: either a JSON Schema object or a Zod schema.
 * Zod schemas are detected by duck-typing (_def + parse method).
 */
export type SchemaInput = Record<string, unknown> | { _def: unknown; parse: Function };

export interface ParseSchemaOptions extends CoerceOptions {
  /** Options for prompt rendering. */
  render?: RenderOptions;
  /** Custom validation rules run after coercion. */
  rules?: ValidationRule[];
  /**
   * Whether to validate JSON Schema constraints (min, max, pattern, format, etc.).
   * Default: true.
   */
  validateConstraints?: boolean;
}

// ============================================================================
// NEW PRIMARY API
// ============================================================================

// ---------------------------------------------------------------------------
// parseSchema() — one-shot parse
// ---------------------------------------------------------------------------

/**
 * Parse LLM text against a JSON Schema (or Zod schema) and return a ParseResult<T>.
 *
 * @param text    Raw LLM output text.
 * @param schema  JSON Schema object or Zod schema defining the expected structure.
 * @param options Optional configuration.
 */
export function parseSchema<T = unknown>(
  text: string,
  schema: SchemaInput,
  options?: ParseSchemaOptions,
): ParseResult<T> {
  const jsonSchema = normalizeSchema(schema);
  const outputFormat = renderOutputFormat(jsonSchema, options?.render);
  const result = coerceToSchema(text, jsonSchema, options);

  // Run constraint validation if coercion succeeded
  const constraintErrors: string[] = [];
  if (result.success && (options?.validateConstraints ?? true)) {
    const violations = validateSchemaConstraints(result.value, jsonSchema);
    for (const v of violations) {
      constraintErrors.push(v.path ? `${v.path}: ${v.message}` : v.message);
    }
  }

  // Run custom rules if coercion succeeded
  const ruleErrors: string[] = [];
  if (result.success && options?.rules) {
    for (const rule of options.rules) {
      const verdict = rule(result.value);
      if (typeof verdict === 'string') {
        ruleErrors.push(verdict);
      }
    }
  }

  const allErrors = [...constraintErrors, ...ruleErrors];
  const ok = result.success && allErrors.length === 0;
  const errorMessage = !result.success
    ? result.errors.map((e) => e.message).join('; ')
    : allErrors.length > 0
      ? allErrors.join('; ')
      : undefined;

  return new ParseResult<T>({
    ok,
    data: result.value as T | undefined,
    error: errorMessage,
    score: result.score,
    flags: result.flags,
    raw: text,
    outputFormat,
  });
}

// ---------------------------------------------------------------------------
// prompt() — one-shot prompt render
// ---------------------------------------------------------------------------

/**
 * Render an output format prompt snippet from a JSON Schema (or Zod schema).
 * Alias for `renderOutputFormat()` with a shorter name.
 */
export function prompt(
  schema: SchemaInput,
  options?: RenderOptions,
): string {
  return renderOutputFormat(normalizeSchema(schema), options);
}

// ---------------------------------------------------------------------------
// stream() — one-shot stream creation
// ---------------------------------------------------------------------------

/**
 * Create a streaming parser for the given schema.
 *
 * Equivalent to `parser(schema, options).stream()` but without
 * requiring you to create a parser factory first.
 */
export function stream<T = unknown>(
  schema: SchemaInput,
  options?: ParserOptions,
): StreamParser<T> {
  const p = parser<T>(schema, options);
  return p.stream();
}

// ---------------------------------------------------------------------------
// parser() — factory
// ---------------------------------------------------------------------------

export interface ParserOptions extends ParseSchemaOptions {
  /** Options for prompt rendering. */
  render?: RenderOptions;
}

export interface Parser<T = unknown> {
  /** Parse LLM text against the bound schema. */
  parse(text: string): ParseResult<T>;
  /** Render the output format prompt snippet for the bound schema. */
  prompt(): string;
  /**
   * Create a streaming parser for incremental LLM output.
   * Call .feed(chunk) as tokens arrive, then .done() when complete.
   */
  stream(options?: StreamParserOptions): StreamParser<T>;
  /** The JSON Schema this parser was created with. */
  schema: Record<string, unknown>;
}

/**
 * Create a reusable parser bound to a specific JSON Schema (or Zod schema).
 *
 * The schema is compiled once; subsequent .parse() calls skip re-compilation.
 */
export function parser<T = unknown>(
  schema: SchemaInput,
  options?: ParserOptions,
): Parser<T> {
  const jsonSchema = normalizeSchema(schema);
  // Pre-compile: convert schema → internal types once.
  const schemaConversion = schemaToType(jsonSchema, options?.schema);
  const outputFormat = renderOutputFormat(jsonSchema, options?.render);

  return {
    schema: jsonSchema,

    parse(text: string): ParseResult<T> {
      const parsed = structuralParse(text, options?.parse);
      const ctx = new ParsingContext(schemaConversion.definitions);
      const result = coerce(parsed, schemaConversion.type, ctx);

      if (result === null) {
        return new ParseResult<T>({
          ok: false,
          data: undefined,
          error: 'Failed to coerce value to target type',
          score: Infinity,
          flags: [],
          raw: text,
          outputFormat,
        });
      }

      const score = totalScore(result.flags);

      // Run constraint validation
      const constraintErrors: string[] = [];
      if (options?.validateConstraints ?? true) {
        const violations = validateSchemaConstraints(result.value, jsonSchema);
        for (const v of violations) {
          constraintErrors.push(v.path ? `${v.path}: ${v.message}` : v.message);
        }
      }

      // Run custom rules
      const ruleErrors: string[] = [];
      if (options?.rules) {
        for (const rule of options.rules) {
          const verdict = rule(result.value);
          if (typeof verdict === 'string') {
            ruleErrors.push(verdict);
          }
        }
      }

      const allErrors = [...constraintErrors, ...ruleErrors];
      const ok = allErrors.length === 0;
      const errorMessage = allErrors.length > 0
        ? allErrors.join('; ')
        : undefined;

      return new ParseResult<T>({
        ok,
        data: result.value as T | undefined,
        error: errorMessage,
        score,
        flags: result.flags,
        raw: text,
        outputFormat,
      });
    },

    prompt(): string {
      return outputFormat;
    },

    stream(streamOpts?: StreamParserOptions): StreamParser<T> {
      return new StreamParser<T>({
        targetType: schemaConversion.type,
        definitions: schemaConversion.definitions,
        jsonSchema,
        outputFormat,
        parseOptions: streamOpts?.parse ?? options?.parse,
        rules: streamOpts?.rules ?? options?.rules,
        validateConstraints: streamOpts?.validateConstraints ?? options?.validateConstraints,
      });
    },
  };
}

// ============================================================================
// LEGACY API (preserved for backward compat)
// ============================================================================

/**
 * Parse LLM text and coerce it into a value conforming to the given JSON Schema.
 *
 * @deprecated Use `parseSchema()` or `parser()` instead.
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
  const parsed = structuralParse(text, options?.parse);

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
