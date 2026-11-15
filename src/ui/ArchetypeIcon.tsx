import type { CSSProperties } from 'react';

interface Props {
  archetypeId: string;
  size?: number;
  color?: string;
  className?: string;
}

/** Archetype glyph drawn from the hand-built SVG in public/icons, tinted with the current theme. */
export function ArchetypeIcon({ archetypeId, size = 28, color = 'var(--accent)', className }: Props) {
  const url = `url("${import.meta.env.BASE_URL}icons/archetypes/${archetypeId}.svg")`;
  const style: CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    flex: 'none',
    backgroundColor: color,
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  };
  return <span className={className} style={style} aria-hidden="true" />;
}
