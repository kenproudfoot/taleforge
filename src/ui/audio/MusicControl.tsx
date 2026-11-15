import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/app/settingsStore';
import { MOODS } from '@/engine/types';
import type { Mood } from '@/engine/types';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import styles from './audio.module.css';
import type { MusicState } from './useMusic';

const MOOD_LABEL: Record<Mood, string> = {
  title: 'Title',
  exploration: 'Exploration',
  tension: 'Tension',
  combat: 'Combat',
  calm: 'Calm',
  mystery: 'Mystery',
  triumph: 'Triumph',
  defeat: 'Defeat',
};

/** Top-bar music control: the track playing, a mood override, volumes and mute. */
export function MusicControl({ music }: { music: MusicState }) {
  const audio = useSettings((s) => s.settings.audio);
  const update = useSettings((s) => s.update);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className={styles.wrap} ref={root}>
      <button type="button" className={cx(controls.btn, controls.small)} aria-expanded={open} aria-label={`Music: ${music.title || 'none'}`} onClick={() => setOpen(!open)} title="Music">
        <Icon name="music" size={14} /> <span className={styles.title}>{music.title || 'Music'}</span> <Icon name="chevronDown" size={13} />
      </button>
      <button
        type="button"
        className={cx(controls.btn, controls.small, controls.icon)}
        aria-pressed={audio.muted}
        aria-label={audio.muted ? 'Unmute music and sound' : 'Mute music and sound'}
        onClick={() => void update((d) => void (d.audio.muted = !d.audio.muted))}
      >
        <Icon name={audio.muted ? 'mute' : 'volume'} size={14} />
      </button>
      {open && (
        <div className={styles.pop} role="dialog" aria-label="Music settings">
          <label className={controls.field}>
            <span className={controls.label}>Mood</span>
            <select className={controls.select} value={music.override ?? ''} onChange={(e) => music.setOverride((e.target.value || null) as Mood | null)}>
              <option value="">Follow the story ({MOOD_LABEL[music.mood]})</option>
              {MOODS.map((m) => (
                <option key={m} value={m}>
                  {MOOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className={controls.field}>
            <span className={controls.label}>Music volume</span>
            <input type="range" min={0} max={1} step={0.05} value={audio.musicVolume} onChange={(e) => void update((d) => void (d.audio.musicVolume = Number(e.target.value)))} />
          </label>
          <label className={controls.field}>
            <span className={controls.label}>Sound effects volume</span>
            <input type="range" min={0} max={1} step={0.05} value={audio.sfxVolume} onChange={(e) => void update((d) => void (d.audio.sfxVolume = Number(e.target.value)))} />
          </label>
        </div>
      )}
    </div>
  );
}
