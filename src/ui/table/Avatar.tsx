import type { CastRole } from '@/engine/types';
import { ArchetypeIcon } from '../ArchetypeIcon';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { cx } from '../cx';
import { useStoredImage } from '../useStoredImage';
import styles from './Avatar.module.css';

const ROLE_ICON: Record<CastRole, IconName> = { ally: 'shield', neutral: 'users', enemy: 'swords', boss: 'star' };

interface Props {
  name: string;
  imageKey?: string | null;
  /** Party members: their archetype id and player colour. */
  archetypeId?: string;
  color?: string;
  /** NPCs and enemies. */
  role?: CastRole;
  size?: number;
  className?: string;
  dimmed?: boolean;
}

/** Round portrait. Falls back to the archetype glyph (party) or a role glyph (NPCs) until art exists. */
export function Avatar({ name, imageKey, archetypeId, color, role, size = 40, className, dimmed }: Props) {
  const url = useStoredImage(imageKey);
  const ring = color ?? (role === 'enemy' || role === 'boss' ? 'var(--bad)' : role === 'ally' ? 'var(--good)' : 'var(--line-strong)');
  return (
    <span className={cx(styles.avatar, dimmed && styles.dimmed, className)} style={{ width: size, height: size, borderColor: ring }} title={name}>
      {url ? (
        <img src={url} alt="" />
      ) : archetypeId ? (
        <ArchetypeIcon archetypeId={archetypeId} size={Math.round(size * 0.58)} color={color ?? 'var(--accent)'} />
      ) : (
        <Icon name={ROLE_ICON[role ?? 'neutral']} size={Math.round(size * 0.5)} style={{ color: ring }} />
      )}
    </span>
  );
}

/** The Dungeon Master's avatar: the TaleForge emblem. */
export function DmAvatar({ size = 40 }: { size?: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, borderColor: 'var(--accent)' }} title="Dungeon Master">
      <img src={`${import.meta.env.BASE_URL}icons/taleforge.svg`} alt="" />
    </span>
  );
}
