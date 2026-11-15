import type { CSSProperties } from 'react';

export interface CampaignTheme {
  accent: string;
  background: string;
  display_font: string;
  bubble: string;
}

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [217, 180, 90];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * amount) as Rgb);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Lightens an accent until it is readable (4.5:1) on the given background. */
export function readableOn(color: string, background: string): string {
  let out = color;
  for (let i = 0; i < 12 && contrast(out, background) < 4.5; i++) out = mix(out, '#ffffff', 0.15);
  return out;
}

const FONT_STACKS: Record<string, string> = {
  Cinzel: "'Cinzel', 'Trajan Pro', Georgia, serif",
  Limelight: "'Limelight', 'Cinzel', Georgia, serif",
  Orbitron: "'Orbitron', 'Inter', system-ui, sans-serif",
  Spectral: "'Spectral', Georgia, serif",
  Inter: "'Inter', system-ui, sans-serif",
};

/**
 * CSS custom properties for a campaign theme. Spread onto a container's `style` to theme everything inside.
 * Backgrounds are always kept dark enough for the light text used throughout the app.
 */
export function themeStyle(theme: CampaignTheme): CSSProperties {
  const bg = luminance(theme.background) > 0.08 ? mix(theme.background, '#000000', 0.75) : theme.background;
  const accent = readableOn(theme.accent, bg);
  const [r, g, b] = parseHex(accent);
  const raised = mix(bg, '#ffffff', 0.055);
  const [rr, rg, rb] = parseHex(raised);
  const darkInk = mix(bg, '#000000', 0.4);
  return {
    '--bg': bg,
    '--bg-raised': raised,
    '--bg-sunken': mix(bg, '#000000', 0.32),
    '--bg-glass': `rgba(${rr}, ${rg}, ${rb}, 0.78)`,
    '--accent': accent,
    '--accent-strong': mix(accent, '#ffffff', 0.35),
    '--accent-soft': `rgba(${r}, ${g}, ${b}, 0.14)`,
    '--accent-ink': contrast(darkInk, accent) >= contrast('#ffffff', accent) ? darkInk : '#ffffff',
    '--font-display': FONT_STACKS[theme.display_font] ?? FONT_STACKS.Cinzel,
  } as CSSProperties;
}
