/**
 * Streaming parser support.
 *
 * Provides incremental parsing of LLM output as tokens arrive.
 * On each .feed(chunk), the accumulated text is re-parsed and coerced,
 * producing a partial result (DeepPartial<T>).
 *
 * Design:
 *   - Accumulates raw text chunks
 *   - On each feed(), runs the full parse+coerce pipeline on accumulated text
 *   - Returns StreamResult with partial data that converges toward final shape
 *   - .done() performs final validation (constraints + rules) and returns ParseResult<T>
 */

import { parse as structuralParse, type ParseOptions } from './parser/parse.js';
import { coerce } from './coercer/coerce.js';
import { ParsingContext } from './coercer/context.js';
import { totalScore } from './flags.js';
import type { Flag } from './flags.js';
import type { FieldType as FieldTypeT } from './types.js';
import { ParseResult } from './parse-result.js';
import { validateSchemaConstraints } from './constraints.js';
import type { ValidationRule } from './api.js';

// ---------------------------------------------------------------------------
// DeepPartial type — makes all nested fields optional
// ---------------------------------------------------------------------------

/**
 * Recursively makes all fields optional, including nested objects and arrays.
 * Arrays become arrays of partial items.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

// ---------------------------------------------------------------------------
// StreamResult — returned by .feed()
// ---------------------------------------------------------------------------

export interface StreamResult<T = unknown> {
  /** The partially-coerced value so far. May be incomplete. */
  data: DeepPartial<T> | undefined;

  /** Whether parsing produced any usable data. */
  hasData: boolean;

  /** The accumulated raw text so far. */
  raw: string;

  /** Quality score of the current partial parse (0 = perfect). */
  score: number;

  /** Flags from the current parse attempt. */
  flags: Flag[];
}

// ---------------------------------------------------------------------------
// StreamParser
// ---------------------------------------------------------------------------

export interface StreamParserOptions {
  /** Options for the structural parser. */
  parse?: ParseOptions;
  /** Custom validation rules (only run on .done()). */
  rules?: ValidationRule[];
  /** Whether to validate constraints (only on .done()). Default: true. */
  validateConstraints?: boolean;
}

export class StreamParser<T = unknown> {
  private accumulated = '';
  private lastResult: StreamResult<T> = {
    data: undefined,
    hasData: false,
    raw: '',
    score: Infinity,
    flags: [],
  };

  private readonly targetType: FieldTypeT;
  private readonly definitions: Map<string, FieldTypeT>;
  private readonly jsonSchema: Record<string, unknown>;
  private readonly outputFormat: string;
  private readonly parseOptions: ParseOptions | undefined;
  private readonly rules: ValidationRule[];
  private readonly shouldValidateConstraints: boolean;
  private isDone = false;

  constructor(opts: {
    targetType: FieldTypeT;
    definitions: Map<string, FieldTypeT>;
    jsonSchema: Record<string, unknown>;
    outputFormat: string;
    parseOptions?: ParseOptions;
    rules?: ValidationRule[];
    validateConstraints?: boolean;
  }) {
    this.targetType = opts.targetType;
    this.definitions = opts.definitions;
    this.jsonSchema = opts.jsonSchema;
    this.outputFormat = opts.outputFormat;
    this.parseOptions = opts.parseOptions;
    this.rules = opts.rules ?? [];
    this.shouldValidateConstraints = opts.validateConstraints ?? true;
  }

  /**
   * Feed a chunk of text from the LLM stream.
   *
   * Returns the current partial parse result. The result improves as more
   * text is accumulated.
   */
  feed(chunk: string): StreamResult<T> {
    if (this.isDone) {
      throw new Error('StreamParser.feed() called after done()');
    }

    this.accumulated += chunk;

    // Try to parse the accumulated text
    try {
      const parsed = structuralParse(this.accumulated, this.parseOptions);
      const ctx = new ParsingContext(this.definitions);
      const result = coerce(parsed, this.targetType, ctx);

      if (result !== null) {
        const score = totalScore(result.flags);
        this.lastResult = {
          data: result.value as DeepPartial<T>,
          hasData: true,
          raw: this.accumulated,
          score,
          flags: result.flags,
        };
      } else {
        this.lastResult = {
          ...this.lastResult,
          raw: this.accumulated,
        };
      }
    } catch {
      // Parse failed on partial text — that's expected during streaming.
      // Keep the last successful result.
      this.lastResult = {
        ...this.lastResult,
        raw: this.accumulated,
      };
    }

    return this.lastResult;
  }

  /**
   * Get the current partial result without feeding new data.
   */
  current(): StreamResult<T> {
    return this.lastResult;
  }

  /**
   * Get the accumulated raw text so far.
   */
  text(): string {
    return this.accumulated;
  }

  /**
   * Finalize the stream and return a full ParseResult<T>.
   *
   * Runs constraint validation and custom rules on the final value.
   * After calling done(), no more feed() calls are allowed.
   */
  done(): ParseResult<T> {
    if (this.isDone) {
      throw new Error('StreamParser.done() called more than once');
    }
    this.isDone = true;

    // Final parse on complete accumulated text
    const parsed = structuralParse(this.accumulated, this.parseOptions);
    const ctx = new ParsingContext(this.definitions);
    const result = coerce(parsed, this.targetType, ctx);

    if (result === null) {
      return new ParseResult<T>({
        ok: false,
        data: undefined,
        error: 'Failed to coerce value to target type',
        score: Infinity,
        flags: [],
        raw: this.accumulated,
        outputFormat: this.outputFormat,
      });
    }

    const score = totalScore(result.flags);

    // Run constraint validation
    const constraintErrors: string[] = [];
    if (this.shouldValidateConstraints) {
      const violations = validateSchemaConstraints(result.value, this.jsonSchema);
      for (const v of violations) {
        constraintErrors.push(v.path ? `${v.path}: ${v.message}` : v.message);
      }
    }

    // Run custom rules
    const ruleErrors: string[] = [];
    for (const rule of this.rules) {
      const verdict = rule(result.value);
      if (typeof verdict === 'string') {
        ruleErrors.push(verdict);
      }
    }

    const allErrors = [...constraintErrors, ...ruleErrors];
    const ok = allErrors.length === 0;
    const errorMessage = allErrors.length > 0 ? allErrors.join('; ') : undefined;

    return new ParseResult<T>({
      ok,
      data: result.value as T | undefined,
      error: errorMessage,
      score,
      flags: result.flags,
      raw: this.accumulated,
      outputFormat: this.outputFormat,
    });
  }
}
