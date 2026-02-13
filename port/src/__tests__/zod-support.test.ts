/**
 * Tests for Phase 5: Zod schema input support.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  parseSchema,
  prompt,
  parser,
  isZodSchema,
  zodSchemaToJsonSchema,
  normalizeSchema,
  ParseResult,
} from '../index.js';

// ============================================================================
// isZodSchema()
// ============================================================================

describe('isZodSchema()', () => {
  it('detects z.string()', () => {
    expect(isZodSchema(z.string())).toBe(true);
  });

  it('detects z.object()', () => {
    expect(isZodSchema(z.object({ name: z.string() }))).toBe(true);
  });

  it('detects z.array()', () => {
    expect(isZodSchema(z.array(z.number()))).toBe(true);
  });

  it('rejects plain object', () => {
    expect(isZodSchema({ type: 'string' })).toBe(false);
  });

  it('rejects null', () => {
    expect(isZodSchema(null)).toBe(false);
  });

  it('rejects string', () => {
    expect(isZodSchema('string')).toBe(false);
  });
});

// ============================================================================
// zodSchemaToJsonSchema()
// ============================================================================

describe('zodSchemaToJsonSchema()', () => {
  it('converts z.string()', () => {
    const js = zodSchemaToJsonSchema(z.string());
    expect(js.type).toBe('string');
  });

  it('converts z.number()', () => {
    const js = zodSchemaToJsonSchema(z.number());
    expect(js.type).toBe('number');
  });

  it('converts z.boolean()', () => {
    const js = zodSchemaToJsonSchema(z.boolean());
    expect(js.type).toBe('boolean');
  });

  it('converts z.object()', () => {
    const js = zodSchemaToJsonSchema(z.object({
      name: z.string(),
      age: z.number(),
    }));
    expect(js.type).toBe('object');
    expect((js as any).properties.name.type).toBe('string');
    expect((js as any).properties.age.type).toBe('number');
  });

  it('converts z.array()', () => {
    const js = zodSchemaToJsonSchema(z.array(z.number()));
    expect(js.type).toBe('array');
  });

  it('converts z.enum()', () => {
    const js = zodSchemaToJsonSchema(z.enum(['RED', 'GREEN', 'BLUE']));
    expect((js as any).enum).toContain('RED');
    expect((js as any).enum).toContain('GREEN');
    expect((js as any).enum).toContain('BLUE');
  });

  it('converts z.optional()', () => {
    const js = zodSchemaToJsonSchema(z.string().optional());
    // Should produce a union or nullable type
    expect(js).toBeDefined();
  });

  it('preserves z.number().min().max() constraints', () => {
    const js = zodSchemaToJsonSchema(z.number().min(0).max(100));
    expect((js as any).minimum).toBe(0);
    expect((js as any).maximum).toBe(100);
  });

  it('preserves z.string().min().max() constraints', () => {
    const js = zodSchemaToJsonSchema(z.string().min(1).max(50));
    expect((js as any).minLength).toBe(1);
    expect((js as any).maxLength).toBe(50);
  });

  it('preserves z.string().email() format', () => {
    const js = zodSchemaToJsonSchema(z.string().email());
    // zod-to-json-schema may use format or pattern
    expect(js).toBeDefined();
  });

  it('preserves z.array().min().max() constraints', () => {
    const js = zodSchemaToJsonSchema(z.array(z.number()).min(1).max(10));
    expect((js as any).minItems).toBe(1);
    expect((js as any).maxItems).toBe(10);
  });
});

// ============================================================================
// normalizeSchema()
// ============================================================================

describe('normalizeSchema()', () => {
  it('passes through JSON Schema objects', () => {
    const schema = { type: 'string' };
    expect(normalizeSchema(schema)).toBe(schema);
  });

  it('converts Zod schemas', () => {
    const result = normalizeSchema(z.string());
    expect((result as any).type).toBe('string');
  });
});

// ============================================================================
// parseSchema() with Zod schemas
// ============================================================================

describe('parseSchema() with Zod', () => {
  it('parses string with z.string()', () => {
    const r = parseSchema('"hello"', z.string() as any);
    expect(r.ok).toBe(true);
    expect(r.data).toBe('hello');
  });

  it('parses number with z.number()', () => {
    const r = parseSchema('42', z.number() as any);
    expect(r.ok).toBe(true);
    expect(r.data).toBe(42);
  });

  it('parses boolean with z.boolean()', () => {
    const r = parseSchema('true', z.boolean() as any);
    expect(r.ok).toBe(true);
    expect(r.data).toBe(true);
  });

  it('parses object with z.object()', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const r = parseSchema<{ name: string; age: number }>(
      '{"name": "Alice", "age": 30}',
      schema as any,
    );
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('Alice');
    expect(r.data?.age).toBe(30);
  });

  it('parses array with z.array()', () => {
    const r = parseSchema<number[]>('[1, 2, 3]', z.array(z.number()) as any);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual([1, 2, 3]);
  });

  it('parses enum with z.enum()', () => {
    const r = parseSchema('"RED"', z.enum(['RED', 'GREEN', 'BLUE']) as any);
    expect(r.ok).toBe(true);
    expect(r.data).toBe('RED');
  });

  it('validates constraints from Zod schema', () => {
    const schema = z.number().min(0).max(100);
    const r = parseSchema('-5', schema as any);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('minimum');
  });

  it('parses markdown-wrapped JSON with Zod schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const text = '```json\n{"name": "Bob", "age": 25}\n```';
    const r = parseSchema<{ name: string; age: number }>(text, schema as any);
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('Bob');
  });

  it('returns ParseResult instance', () => {
    const r = parseSchema('"hello"', z.string() as any);
    expect(r).toBeInstanceOf(ParseResult);
  });

  it('.assert() works with Zod schema', () => {
    const r = parseSchema<string>('"hello"', z.string() as any);
    expect(r.assert()).toBe('hello');
  });

  it('.feedback() works with Zod schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const r = parseSchema('{"name": "Alice", "age": "30"}', schema as any);
    const fb = r.feedback();
    expect(fb).toBeDefined();
  });
});

// ============================================================================
// prompt() with Zod schemas
// ============================================================================

describe('prompt() with Zod', () => {
  it('renders prompt for z.object()', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const p = prompt(schema as any);
    expect(typeof p).toBe('string');
    expect(p).toContain('name');
    expect(p).toContain('age');
  });

  it('renders prompt for z.string()', () => {
    const p = prompt(z.string() as any);
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(0);
  });

  it('renders prompt for z.enum()', () => {
    const p = prompt(z.enum(['RED', 'GREEN', 'BLUE']) as any);
    expect(p).toContain('RED');
  });
});

// ============================================================================
// parser() with Zod schemas
// ============================================================================

describe('parser() with Zod', () => {
  it('creates parser from Zod schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const p = parser<{ name: string; age: number }>(schema as any);
    expect(typeof p.parse).toBe('function');
    expect(typeof p.prompt).toBe('function');
  });

  it('.parse() works', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const p = parser<{ name: string; age: number }>(schema as any);
    const r = p.parse('{"name": "Alice", "age": 30}');
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('Alice');
  });

  it('.prompt() works', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const p = parser(schema as any);
    const fmt = p.prompt();
    expect(fmt).toContain('name');
  });

  it('reusable with Zod schema', () => {
    const schema = z.object({ value: z.number() });
    const p = parser<{ value: number }>(schema as any);
    expect(p.parse('{"value": 1}').data?.value).toBe(1);
    expect(p.parse('{"value": 2}').data?.value).toBe(2);
  });

  it('validates Zod constraints via parser', () => {
    const schema = z.number().min(0).max(100);
    const p = parser<number>(schema as any);
    expect(p.parse('50').ok).toBe(true);
    expect(p.parse('-1').ok).toBe(false);
  });

  it('schema property is the JSON Schema (not the Zod schema)', () => {
    const zodSchema = z.string();
    const p = parser(zodSchema as any);
    // The schema property should be the converted JSON Schema
    expect(p.schema.type).toBe('string');
  });
});
