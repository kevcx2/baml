/**
 * Diagnostic: prints exact results for every date edge case.
 * Run with: npx vitest run src/__tests__/date-diagnostic.test.ts
 */

import { describe, it } from 'vitest';
import {
  shape,
  extractConstraints,
  validateConstraints,
} from '../index.js';

// ---------------------------------------------------------------------------
// 1. validateConstraints() — unit-level format checks
// ---------------------------------------------------------------------------

describe('Date validation results', () => {
  const dc = extractConstraints({ format: 'date' });
  const dtc = extractConstraints({ format: 'date-time' });
  const tc = extractConstraints({ format: 'time' });

  const dateCases = [
    // Valid ISO dates
    '2024-01-15',
    '2024-12-31',
    '2024-01-01',
    '2024-02-29',       // leap year
    '2100-01-01',

    // Wrong format
    '01-15-2024',       // MM-DD-YYYY
    '15-01-2024',       // DD-MM-YYYY
    '01/15/2024',       // slashes
    '2024/01/15',       // YYYY slashes
    'January 15, 2024', // prose
    'Jan 15, 2024',     // abbreviated
    '2024.01.15',       // dots
    '20240115',         // compact
    '2024-1-15',        // single-digit month
    '2024-01-5',        // single-digit day

    // Ambiguous / invalid calendar dates
    '2024-02-31',       // Feb 31
    '2023-02-29',       // Feb 29 non-leap
    '2024-13-01',       // month 13
    '2024-00-01',       // month 0
    '2024-01-00',       // day 0
    '2024-01-32',       // day 32
    '2024-06-31',       // June 31 (June has 30 days)
    '2024-04-31',       // April 31
    '0000-01-01',       // year zero
    '9999-12-31',       // far future
  ];

  it('date format results', () => {
    console.log('\n=== format: "date" — validateConstraints() ===');
    console.log('%-25s  %-8s  %s', 'INPUT', 'VALID?', 'ERROR');
    console.log('-'.repeat(75));
    for (const input of dateCases) {
      const v = validateConstraints(input, dc);
      const valid = v.length === 0;
      const err = v.length > 0 ? v[0].message : '';
      console.log('%-25s  %-8s  %s', input, valid ? 'PASS' : 'FAIL', err);
    }
  });

  const dateTimeCases = [
    '2024-01-15T10:30:00Z',
    '2024-01-15T10:30:00+05:30',
    '2024-01-15T10:30:00-05:00',
    '2024-01-15T00:00:00Z',
    '2024-01-15T23:59:59Z',
    '2024-01-15T10:30:00.123Z',
    '2024-01-15T10:30:00.123456Z',
    '2024-01-15',                    // date only
    '10:30:00Z',                     // time only
    '2024-01-15 10:30:00',           // space instead of T
    'January 15, 2024 10:30 AM',     // prose
    '2024-02-31T10:00:00Z',          // impossible date with time
    '2024-13-01T10:00:00Z',          // month 13 with time
  ];

  it('date-time format results', () => {
    console.log('\n=== format: "date-time" — validateConstraints() ===');
    console.log('%-40s  %-8s  %s', 'INPUT', 'VALID?', 'ERROR');
    console.log('-'.repeat(85));
    for (const input of dateTimeCases) {
      const v = validateConstraints(input, dtc);
      const valid = v.length === 0;
      const err = v.length > 0 ? v[0].message : '';
      console.log('%-40s  %-8s  %s', input, valid ? 'PASS' : 'FAIL', err);
    }
  });

  const timeCases = [
    '10:30:00',
    '00:00:00',
    '23:59:59',
    '10:30:00.123',
    '10:30:00Z',
    '10:30:00+05:30',
    '10:30',           // no seconds
    '10:30 AM',        // 12-hour
    '25:00:00',        // hour 25
    '99:99:99',        // all invalid
  ];

  it('time format results', () => {
    console.log('\n=== format: "time" — validateConstraints() ===');
    console.log('%-25s  %-8s  %s', 'INPUT', 'VALID?', 'ERROR');
    console.log('-'.repeat(65));
    for (const input of timeCases) {
      const v = validateConstraints(input, tc);
      const valid = v.length === 0;
      const err = v.length > 0 ? v[0].message : '';
      console.log('%-25s  %-8s  %s', input, valid ? 'PASS' : 'FAIL', err);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. shape() — full pipeline (LLM text → parsed value)
// ---------------------------------------------------------------------------

describe('Date through shape() pipeline', () => {
  it('format: date — full pipeline results', () => {
    const schema = { type: 'string' as const, format: 'date' };

    const cases = [
      '"2024-06-15"',                    // JSON-quoted
      '2024-06-15',                      // bare
      '"06/15/2024"',                     // wrong format, quoted
      '"June 15, 2024"',                 // prose, quoted
      '```\n"2024-06-15"\n```',          // markdown block
      'The date is 2024-06-15.',         // surrounding text
      '{"date": "2024-06-15"}',          // embedded in JSON
      '2024-02-31',                      // impossible date, bare
      '"2024-02-31"',                    // impossible date, quoted
      '"2023-02-29"',                    // non-leap Feb 29
      'Sure! The answer is "2024-06-15"', // chatty LLM
    ];

    console.log('\n=== shape({type:"string", format:"date"}, input) ===');
    console.log('%-45s  %-5s  %-20s  %s', 'INPUT', 'OK?', 'DATA', 'ERRORS');
    console.log('-'.repeat(100));
    for (const input of cases) {
      const r = shape(schema, input);
      const display = input.replace(/\n/g, '\\n');
      console.log(
        '%-45s  %-5s  %-20s  %s',
        display.substring(0, 45),
        r.ok ? 'OK' : 'FAIL',
        r.ok ? JSON.stringify(r.data) : '-',
        r.ok ? '' : r.errors.join('; ').substring(0, 50),
      );
    }
  });

  it('format: date — in object field', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        birthday: { type: 'string', format: 'date' },
      },
      required: ['name', 'birthday'],
    };

    const cases = [
      '{"name": "Alice", "birthday": "2024-06-15"}',
      '{"name": "Bob", "birthday": "June 15, 2024"}',
      '{"name": "Carol", "birthday": "06/15/2024"}',
      '{"name": "Dave", "birthday": "2024-02-31"}',
    ];

    console.log('\n=== shape(object with format:"date" field) ===');
    console.log('%-55s  %-5s  %s', 'INPUT', 'OK?', 'ERRORS');
    console.log('-'.repeat(100));
    for (const input of cases) {
      const r = shape(schema, input);
      console.log(
        '%-55s  %-5s  %s',
        input.substring(0, 55),
        r.ok ? 'OK' : 'FAIL',
        r.ok ? '' : r.errors.join('; ').substring(0, 60),
      );
    }
  });
});
