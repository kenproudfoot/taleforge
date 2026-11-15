import { useSettings } from '@/app/settingsStore';
import controls from '../controls.module.css';
import styles from './settings.module.css';

export function AudioSection() {
  const audio = useSettings((s) => s.settings.audio);
  const update = useSettings((s) => s.update);
  return (
    <section className={styles.section} aria-labelledby="audio-heading">
      <h2 id="audio-heading">Music and sound</h2>
      <p className={styles.sectionLede}>
        Music follows the mood of the story and quietens whenever the Dungeon Master speaks. Each campaign picks its own tracks; you can upload your own for any mood in the Campaign library.
      </p>
      <div className={styles.pickerRow}>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="music-volume">
            Music volume: {Math.round(audio.musicVolume * 100)}%
          </label>
          <div className={styles.slider}>
            <input id="music-volume" type="range" min={0} max={1} step={0.05} value={audio.musicVolume} onChange={(e) => void update((d) => void (d.audio.musicVolume = Number(e.target.value)))} />
          </div>
        </div>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="sfx-volume">
            Sound effects volume: {Math.round(audio.sfxVolume * 100)}%
          </label>
          <div className={styles.slider}>
            <input id="sfx-volume" type="range" min={0} max={1} step={0.05} value={audio.sfxVolume} onChange={(e) => void update((d) => void (d.audio.sfxVolume = Number(e.target.value)))} />
          </div>
        </div>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={audio.muted} onChange={(e) => void update((d) => void (d.audio.muted = e.target.checked))} />
        <span>Mute all music and sound effects</span>
      </label>
    </section>
  );
}
