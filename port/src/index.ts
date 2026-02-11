/**
 * structured-output-coercer
 *
 * Parse and validate arbitrary LLM text into structured data using JSON Schema.
 *
 * Primary API:
 *   - `renderOutputFormat(schema)` — Generate a prompt snippet for LLM output format
 *   - `coerceToSchema(text, schema)` — Parse + validate LLM text against a JSON Schema
 */

// ---------------------------------------------------------------------------
// Primary public API
// ---------------------------------------------------------------------------

export {
  coerceToSchema,
  renderOutputFormat,
  renderOutputFormatFromType,
  type CoerceOptions,
  type RenderOptions,
} from './api.js';

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
// Result types
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
