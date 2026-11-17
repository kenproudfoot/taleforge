import { useId } from 'react';
import { mix } from './theme';
import type { CampaignTheme } from './theme';
import styles from './CampaignCover.module.css';

interface Props {
  title: string;
  genre: string;
  theme: CampaignTheme;
  /** Real key art, when the campaign ships some. Otherwise an illustrated cover is drawn. */
  imageUrl?: string | null;
  className?: string;
  /** Draws a "Bonus" sash across the top-right corner. */
  bonus?: boolean;
}

type Motif = 'fantasy' | 'noir' | 'space' | 'generic';

export function motifFor(genre: string): Motif {
  const g = genre.toLowerCase();
  if (/(noir|mystery|detective|crime|pulp)/.test(g)) return 'noir';
  if (/(space|sci|star|cyber|future)/.test(g)) return 'space';
  if (/(fantasy|medieval|myth|sword|fairy)/.test(g)) return 'fantasy';
  return 'generic';
}

/** Campaign card art: the pack's key art if present, otherwise a themed illustration drawn in SVG. */
export function CampaignCover({ bonus, className, ...props }: Props) {
  if (!bonus) return <Cover {...props} className={className} />;
  return (
    <div className={[styles.frame, className].filter(Boolean).join(' ')}>
      <Cover {...props} />
      <span className={styles.sash}>Bonus</span>
    </div>
  );
}

function Cover({ title, genre, theme, imageUrl, className }: Omit<Props, 'bonus'>) {
  const id = useId().replace(/:/g, '');
  if (imageUrl) {
    return <img className={[styles.cover, className].filter(Boolean).join(' ')} src={imageUrl} alt={`Key art for ${title}`} />;
  }
  const motif = motifFor(genre);
  const a = theme.accent;
  const bg = theme.background;
  const far = mix(bg, a, 0.22);
  const mid = mix(bg, a, 0.1);
  const near = mix(bg, '#000000', 0.45);
  return (
    <svg
      className={[styles.cover, className].filter(Boolean).join(' ')}
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`Illustrated cover for ${title}`}
    >
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(bg, a, 0.3)} />
          <stop offset="0.65" stopColor={mix(bg, a, 0.08)} />
          <stop offset="1" stopColor={near} />
        </linearGradient>
        <radialGradient id={`glow${id}`} cx="0.5" cy="0.42" r="0.5">
          <stop offset="0" stopColor={a} stopOpacity="0.75" />
          <stop offset="1" stopColor={a} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#sky${id})`} />
      {motif === 'fantasy' && (
        <>
          <circle cx="160" cy="84" r="74" fill={`url(#glow${id})`} />
          <circle cx="160" cy="80" r="26" fill={mix(a, '#ffffff', 0.55)} opacity="0.9" />
          <path d="M0 150 40 118l22 14 30-34 26 26 20-12 22 20 30-40 26 30 24-16 32 30 28-20v84H0Z" fill={far} />
          <path d="M118 200v-70l8-10v-22l6-10 6 10v16h8v-34l7-14 7 14v30h8v-18l6-10 6 10v24l8 10v74Z" fill={mid} />
          <path d="M139 96l8-22 8 22M131 118l6-12 6 12M163 110l6-12 6 12" fill={mid} />
          <rect x="143" y="150" width="8" height="14" rx="4" fill={a} opacity="0.85" />
          <path d="M0 172c40-10 80-10 120 0s80 10 120 0 60-8 80-4v32H0Z" fill={near} />
          <path d="M20 180c30-5 60-5 90 0M190 184c30-5 70-5 110 0" stroke={a} strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
        </>
      )}
      {motif === 'noir' && (
        <>
          <circle cx="232" cy="62" r="60" fill={`url(#glow${id})`} />
          <circle cx="232" cy="60" r="20" fill={mix(a, '#ffffff', 0.5)} opacity="0.85" />
          <path d="M0 200V96h26V74h22v40h18V58h30v62h16V88h24v44h18V70h14l8-14 8 14h10v70h20V98h26v40h16V82h28v118Z" fill={far} />
          <path d="M0 200v-60h34v-24h30v40h24v-56h36v70h30v-34h40v40h26v-58h34v44h30v-30h36v68Z" fill={mid} />
          {[58, 72, 100, 118, 196, 262, 276].map((x, i) => (
            <rect key={x} x={x} y={128 + (i % 3) * 12} width="5" height="7" fill={a} opacity={0.5 + (i % 2) * 0.35} />
          ))}
          <path d="M150 200v-66h4v-10h3v10h3v66Z" fill={near} />
          <circle cx="155" cy="122" r="5" fill={a} />
          <path d="M155 127 128 200h54Z" fill={a} opacity="0.13" />
          {Array.from({ length: 22 }, (_, i) => (
            <path key={i} d={`M${(i * 53) % 320} ${(i * 37) % 150}l-5 16`} stroke="#ffffff" strokeOpacity="0.16" strokeWidth="1" />
          ))}
        </>
      )}
      {motif === 'space' && (
        <>
          {Array.from({ length: 46 }, (_, i) => (
            <circle key={i} cx={(i * 73) % 320} cy={(i * 41) % 200} r={i % 7 === 0 ? 1.4 : 0.7} fill="#ffffff" opacity={0.35 + (i % 4) * 0.15} />
          ))}
          <circle cx="206" cy="92" r="92" fill={`url(#glow${id})`} opacity="0.7" />
          <circle cx="206" cy="92" r="46" fill={mid} />
          <path d="M162 80a46 46 0 0 1 80-18c-26-6-56 2-80 18Z" fill={mix(mid, a, 0.45)} />
          <path d="M165 108c30 6 62 2 86-12 2 8 1 16-2 24-26 10-60 8-84-12Z" fill={mix(mid, '#000000', 0.3)} />
          <ellipse cx="206" cy="92" rx="84" ry="16" fill="none" stroke={a} strokeWidth="3" opacity="0.8" transform="rotate(-16 206 92)" />
          <path d="M40 150l34-10 10 6-12 6 26 2-28 8-14-4-18 2Z" fill={mix(a, '#ffffff', 0.6)} />
          <path d="M40 152 12 160l26-2Z" fill={a} opacity="0.8" />
          <path d="M0 186c60-16 130-18 200-8s90 6 120 0v22H0Z" fill={near} />
        </>
      )}
      {motif === 'generic' && (
        <>
          <circle cx="160" cy="96" r="88" fill={`url(#glow${id})`} />
          <path d="M160 34l54 31v62l-54 31-54-31V65Z" fill={mid} stroke={a} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M160 34v32M106 65l28 18M214 65l-28 18M160 158v-30M106 127l28-16M214 127l-28-16M160 66l26 17v28l-26 17-26-17V83Z" stroke={a} strokeWidth="2" fill="none" strokeLinejoin="round" opacity="0.75" />
          <path d="M0 176c50-12 110-12 160 0s110 12 160 0v24H0Z" fill={near} />
        </>
      )}
      <rect width="320" height="200" fill={near} opacity="0.18" />
    </svg>
  );
}
