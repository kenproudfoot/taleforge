import { describe, expect, it } from 'vitest';
import { contrast, luminance, mix, parseHex, readableOn, themeStyle, toHex } from './theme';

describe('colour helpers', () => {
  it('parses and formats hex', () => {
    expect(parseHex('#c9a227')).toEqual([201, 162, 39]);
    expect(parseHex('nonsense')).toEqual([217, 180, 90]);
    expect(toHex([0, 128, 255])).toBe('#0080ff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('computes luminance and contrast', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
  });
  it('makes dim accents readable', () => {
    expect(contrast(readableOn('#3a2a10', '#0e0f14'), '#0e0f14')).toBeGreaterThanOrEqual(4.5);
    expect(readableOn('#f1d58a', '#0e0f14')).toBe('#f1d58a');
  });
});

describe('themeStyle', () => {
  it('derives a full set of variables', () => {
    const style = themeStyle({ accent: '#c9a227', background: '#0d0f12', display_font: 'Limelight', bubble: 'smoke' }) as Record<string, string>;
    expect(style['--accent']).toBe('#c9a227');
    expect(style['--bg']).toBe('#0d0f12');
    expect(style['--font-display']).toMatch(/Limelight/);
    expect(style['--accent-soft']).toBe('rgba(201, 162, 39, 0.14)');
    expect(contrast(style['--accent-ink']!, style['--accent']!)).toBeGreaterThan(4.5);
  });
  it('darkens light backgrounds and falls back on unknown fonts', () => {
    const style = themeStyle({ accent: '#224466', background: '#f4f0e6', display_font: 'Comic Sans', bubble: 'plain' }) as Record<string, string>;
    expect(luminance(style['--bg']!)).toBeLessThan(0.08);
    expect(contrast(style['--accent']!, style['--bg']!)).toBeGreaterThanOrEqual(4.5);
    expect(style['--font-display']).toMatch(/Cinzel/);
    expect(style['--accent-ink']).toBe('#ffffff');
  });
});
