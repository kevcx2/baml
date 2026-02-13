/**
 * structured-output
 *
 * Parse and validate arbitrary LLM text into structured data using JSON Schema.
 *
 * Primary API:
 *   - `prompt(s)`           — Render an output format prompt snippet
 *   - `structure(s, text)`  — Parse + validate LLM text → StructuredResult<T>
 *   - `stream(s)`           — Streaming parser with .feed() / .close()
 *   - `parser(s)`           — Factory: pre-compiled schema, .structure() / .prompt() / .stream()
 *
 * Legacy API (still exported):
 *   - `coerceToSchema(text, schema)` — returns raw CoercionResult
 *   - `renderOutputFormat(schema)` / `renderOutputFormatFromType(type)`
 */

// ---------------------------------------------------------------------------
// Primary public API
// ---------------------------------------------------------------------------

export {
  // New API
  structure,
  prompt,
  parser,
  stream,
  type Parser,
  type StructureOptions,
  type ParserOptions,
  type ValidationRule,
  type SchemaInput,
  // Legacy API
  coerceToSchema,
  renderOutputFormat,
  renderOutputFormatFromType,
  type CoerceOptions,
  type RenderOptions,
} from './api.js';

// ---------------------------------------------------------------------------
// StructuredResult
// ---------------------------------------------------------------------------

export { StructuredResult, StructuredResultError } from './parse-result.js';
export type { Coercion, Repair } from './parse-result.js';

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

export {
  extractConstraints,
  validateConstraints,
  validateSchemaConstraints,
} from './constraints.js';
export type {
  Constraints,
  NumericConstraints,
  StringConstraints,
  ArrayConstraints,
  ObjectConstraints,
  ConstraintViolation,
} from './constraints.js';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type {
  FieldType,
  PrimitiveType,
  PrimitiveKind,
  EnumType,
  EnumValue,
  ClassType,
  ClassField,
  ListType,
  MapType,
  UnionType,
  LiteralType,
  RecursiveRef,
} from './types.js';
export { FieldType as F, isOptional, stripNull } from './types.js';

// ---------------------------------------------------------------------------
// Intermediate values (for advanced users)
// ---------------------------------------------------------------------------

export type { JsonishValue, Fix } from './values.js';
export { JsonishValue as V } from './values.js';

// ---------------------------------------------------------------------------
// Flags & scoring
// ---------------------------------------------------------------------------

export type { Flag } from './flags.js';
export { flagScore, totalScore } from './flags.js';

// ---------------------------------------------------------------------------
// Result types (legacy)
// ---------------------------------------------------------------------------

export type { CoercionResult, ParseError } from './result.js';

// ---------------------------------------------------------------------------
// Schema conversion (for advanced users)
// ---------------------------------------------------------------------------

export {
  schemaToType,
  type SchemaConversionOptions,
} from './schema-to-types.js';

// ---------------------------------------------------------------------------
// Parser (for advanced users)
// ---------------------------------------------------------------------------

export { parse, type ParseOptions } from './parser/parse.js';

// ---------------------------------------------------------------------------
// Coercion internals (for advanced users)
// ---------------------------------------------------------------------------

export { tryCast, coerce } from './coercer/coerce.js';
export { ParsingContext } from './coercer/context.js';
export type { CoercedValue } from './coercer/pick-best.js';

// ---------------------------------------------------------------------------
// Zod support
// ---------------------------------------------------------------------------

export {
  isZodSchema,
  zodSchemaToJsonSchema,
  normalizeSchema,
} from './zod-support.js';

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export { StreamParser } from './stream-parser.js';
export type {
  DeepPartial,
  StreamResult,
  StreamParserOptions,
} from './stream-parser.js';
