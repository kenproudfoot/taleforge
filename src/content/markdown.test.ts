import { describe, expect, it } from 'vitest';
import { parseFrontMatter, preamble, sectionText, splitSections, subsections } from './markdown';

const DOC = `---
id: demo
acts:
  - { id: a1, minutes: 5 }
  - id: a2
    minutes: 7
---
intro line

## Overview
Hello there.

## Beats
### first
One.

\`\`\`
## not a heading
\`\`\`
### second
Two.
`;

describe('parseFrontMatter', () => {
  it('splits data and body and maps paths to file lines', () => {
    const fm = parseFrontMatter(DOC)!;
    expect(fm.data).toEqual({ id: 'demo', acts: [{ id: 'a1', minutes: 5 }, { id: 'a2', minutes: 7 }] });
    expect(fm.bodyLine).toBe(8);
    expect(fm.lineOf(['id'])).toBe(2);
    expect(fm.lineOf(['acts', 0, 'minutes'])).toBe(4);
    expect(fm.lineOf(['acts', 1, 'minutes'])).toBe(6);
    expect(fm.lineOf(['acts', 1, 'missing'])).toBe(5);
    expect(fm.lineOf(['nope'])).toBe(2);
    expect(fm.errors).toEqual([]);
  });
  it('handles CRLF and a byte-order mark', () => {
    const fm = parseFrontMatter('﻿---\r\nid: x\r\n---\r\nbody\r\n')!;
    expect(fm.data).toEqual({ id: 'x' });
    expect(fm.body.trim()).toBe('body');
  });
  it('returns null without front matter', () => {
    expect(parseFrontMatter('# Just markdown')).toBeNull();
    expect(parseFrontMatter('---\nid: x\nnever closed')).toBeNull();
  });
  it('reports YAML syntax errors with file lines', () => {
    const fm = parseFrontMatter('---\nid: x\nacts: [1, 2\ntitle: y\n---\n')!;
    expect(fm.data).toBeUndefined();
    expect(fm.errors.length).toBeGreaterThan(0);
    expect(fm.errors[0]!.line).toBeGreaterThanOrEqual(3);
  });
});

describe('sections', () => {
  const body = parseFrontMatter(DOC)!.body;
  it('splits by heading depth and ignores fenced code', () => {
    expect(splitSections(body, 2).map((s) => s.heading)).toEqual(['Overview', 'Beats']);
    expect(splitSections(body, 2)[0]).toMatchObject({ content: 'Hello there.', line: 3 });
  });
  it('finds sections and subsections', () => {
    expect(sectionText(body, 'overview')).toBe('Hello there.');
    expect(sectionText(body, 'Missing')).toBe('');
    const subs = subsections(body, 'Beats');
    expect([...subs.keys()]).toEqual(['first', 'second']);
    expect(subs.get('second')?.text).toBe('Two.');
    expect(subs.get('first')?.text).toContain('## not a heading');
    expect(subsections(body, 'Missing').size).toBe(0);
  });
  it('returns the preamble', () => {
    expect(preamble(body, 2)).toBe('intro line');
  });
});
