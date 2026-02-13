/**
 * ParseResult<T> — the user-facing result type.
 *
 * Wraps the internal CoercionResult with a clean DX:
 *   - .ok / .data / .error  — status + value
 *   - .assert()             — throw on failure
 *   - .feedback()           — LLM-readable repair prompt
 *   - .coercions            — list of transformations applied
 *   - .score                — numeric quality score
 */

import type { Flag } from './flags.js';
import { flagScore } from './flags.js';

// ---------------------------------------------------------------------------
// Coercion description — user-friendly view of what was transformed
// ---------------------------------------------------------------------------

export interface Coercion {
  /** Dot-path to the value that was coerced, e.g. "person.age". */
  path: string;
  /** Human-readable description of the transformation. */
  message: string;
  /** Penalty score for this coercion. */
  penalty: number;
}

// ---------------------------------------------------------------------------
// ParseResult
// ---------------------------------------------------------------------------

export class ParseResult<T = unknown> {
  /** Whether parsing + coercion fully succeeded. */
  readonly ok: boolean;

  /**
   * The coerced value, shaped to match the target schema.
   * Defined when `ok` is true. May be partially defined when `ok` is false.
   */
  readonly data: T | undefined;

  /**
   * Error message when `ok` is false. undefined when `ok` is true.
   */
  readonly error: string | undefined;

  /**
   * Aggregate quality score (0 = perfect match, higher = more coercion).
   */
  readonly score: number;

  /**
   * Every transformation applied during coercion, as user-friendly objects.
   */
  readonly coercions: Coercion[];

  /**
   * Raw flags from the coercion engine (for advanced introspection).
   */
  readonly flags: Flag[];

  /**
   * The original raw LLM text that was parsed.
   */
  readonly raw: string;

  /**
   * The output format prompt that was used (if available).
   * Set by the parser() factory so .feedback() can include it.
   */
  readonly _outputFormat: string | undefined;

  constructor(opts: {
    ok: boolean;
    data: T | undefined;
    error: string | undefined;
    score: number;
    flags: Flag[];
    raw: string;
    outputFormat?: string;
  }) {
    this.ok = opts.ok;
    this.data = opts.data;
    this.error = opts.error;
    this.score = opts.score;
    this.flags = opts.flags;
    this.raw = opts.raw;
    this._outputFormat = opts.outputFormat;
    this.coercions = flagsToCoercions(opts.flags);
  }

  /**
   * Assert that parsing succeeded. Throws if it did not.
   *
   * @returns The coerced data value (typed as T).
   */
  assert(): T {
    if (!this.ok || this.data === undefined) {
      throw new ParseResultError(
        this.error ?? 'Parse failed with no error message',
        this,
      );
    }
    return this.data;
  }

  /**
   * Generate an LLM-readable feedback prompt describing what went wrong
   * and what the expected format is. Useful for retry loops.
   *
   * Returns undefined if the result is perfect (no coercions, no errors).
   */
  feedback(): string | undefined {
    if (this.ok && this.score === 0) {
      return undefined;
    }

    const sections: string[] = [];

    // Section 1: What went wrong
    if (!this.ok && this.error) {
      sections.push(`Error: ${this.error}`);
    }

    if (this.coercions.length > 0) {
      sections.push('The following corrections were needed:');
      for (const c of this.coercions) {
        const path = c.path ? ` at "${c.path}"` : '';
        sections.push(`  - ${c.message}${path}`);
      }
    }

    // Section 2: Expected format reminder
    if (this._outputFormat) {
      sections.push('');
      sections.push('Please respond using exactly this format:');
      sections.push(this._outputFormat);
    }

    if (sections.length === 0) {
      return undefined;
    }

    return sections.join('\n');
  }
}

// ---------------------------------------------------------------------------
// ParseResultError — thrown by .assert()
// ---------------------------------------------------------------------------

export class ParseResultError extends Error {
  readonly result: ParseResult;

  constructor(message: string, result: ParseResult) {
    super(message);
    this.name = 'ParseResultError';
    this.result = result;
  }
}

// ---------------------------------------------------------------------------
// Flag → Coercion mapping
// ---------------------------------------------------------------------------

function flagsToCoercions(flags: Flag[]): Coercion[] {
  return flags.map(flagToCoercion);
}

function flagToCoercion(flag: Flag): Coercion {
  const penalty = flagScore(flag);

  switch (flag.kind) {
    case 'object-from-markdown':
      return { path: '', message: 'Extracted JSON from markdown code block', penalty };
    case 'object-from-fixed-json':
      return {
        path: '',
        message: `Repaired malformed JSON (fixes: ${flag.fixes.join(', ')})`,
        penalty,
      };
    case 'default-but-had-unparseable-value':
      return { path: '', message: `Used default: ${flag.reason}`, penalty };
    case 'object-to-string':
      return { path: '', message: 'Converted object to string', penalty };
    case 'object-to-primitive':
      return { path: '', message: 'Converted object to primitive', penalty };
    case 'object-to-map':
      return { path: '', message: 'Converted typed object to map', penalty };
    case 'extra-key':
      return { path: '', message: `Ignored extra key "${flag.key}"`, penalty };
    case 'stripped-non-alphanumeric':
      return {
        path: '',
        message: `Stripped non-alphanumeric characters from "${flag.original}"`,
        penalty,
      };
    case 'substring-match':
      return {
        path: '',
        message: `Matched substring "${flag.original}" to enum value`,
        penalty,
      };
    case 'single-to-array':
      return { path: '', message: 'Wrapped single value into array', penalty };
    case 'array-item-parse-error':
      return {
        path: `[${flag.index}]`,
        message: `Array item parse error: ${flag.reason}`,
        penalty,
      };
    case 'map-key-parse-error':
      return {
        path: `[key ${flag.index}]`,
        message: `Map key parse error: ${flag.reason}`,
        penalty,
      };
    case 'map-value-parse-error':
      return {
        path: flag.key,
        message: `Map value parse error: ${flag.reason}`,
        penalty,
      };
    case 'json-to-string':
      return { path: '', message: 'Serialized JSON value to string', penalty };
    case 'implied-key':
      return { path: '', message: `Inferred object key "${flag.key}"`, penalty };
    case 'inferred-object':
      return { path: '', message: 'Inferred object structure', penalty };
    case 'first-match':
      return { path: '', message: `Picked first match (index ${flag.index})`, penalty };
    case 'union-match':
      return { path: '', message: `Matched union variant ${flag.index}`, penalty };
    case 'str-match-one-from-many':
      return {
        path: '',
        message: `Ambiguous string matched from ${flag.matches.length} candidates`,
        penalty,
      };
    case 'default-from-no-value':
      return { path: '', message: 'Used default value (required field missing)', penalty };
    case 'default-but-had-value':
      return { path: '', message: 'Used default (could not parse provided value)', penalty };
    case 'optional-default-from-no-value':
      return { path: '', message: 'Used null for missing optional field', penalty };
    case 'string-to-bool':
      return { path: '', message: `Converted "${flag.original}" to boolean`, penalty };
    case 'string-to-null':
      return { path: '', message: `Converted "${flag.original}" to null`, penalty };
    case 'string-to-char':
      return { path: '', message: `Converted "${flag.original}" to char`, penalty };
    case 'string-to-float':
      return { path: '', message: `Converted "${flag.original}" to number`, penalty };
    case 'float-to-int':
      return { path: '', message: `Rounded ${flag.original} to integer`, penalty };
    case 'no-fields':
      return { path: '', message: 'Object has no fields', penalty };
  }
}
