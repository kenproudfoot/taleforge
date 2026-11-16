import { useEffect, useState } from 'react';
import { useSettings } from '@/app/settingsStore';
import { PLAYTEST_ENDPOINT, playtestServerAvailable } from '@/storage/playtestSync';
import styles from './settings.module.css';

/** The playtest log switch, and where the logs go. */
export function PlaytestSection() {
  const enabled = useSettings((s) => s.settings.playtest.enabled);
  const update = useSettings((s) => s.update);
  const [where, setWhere] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void playtestServerAvailable().then(async (ok) => {
      if (!live) return;
      if (!ok) return setWhere(null);
      const info = (await (await fetch(PLAYTEST_ENDPOINT)).json().catch(() => ({}))) as { dir?: string };
      if (live) setWhere(info.dir ?? 'playtests/');
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className={styles.section} aria-labelledby="playtest-heading">
      <h2 id="playtest-heading">Playtesting</h2>
      <p className={styles.sectionLede}>
        A private playtest log of each game: what was said, how long each reply took, rolls and tools the Dungeon Master used, anything that went wrong, and
        your 👍/👎 on its messages plus the notes from Pause → Playtest notes. It stays on this device, with the saved game, for improving TaleForge.
      </p>
      <label className={styles.check}>
        <input type="checkbox" checked={enabled} onChange={(e) => void update((d) => void (d.playtest.enabled = e.target.checked))} />
        <span>Record playtest logs and show the feedback buttons</span>
      </label>
      <p className={styles.sectionLede} role="status" style={{ overflowWrap: 'anywhere' }}>
        {where === undefined
          ? 'Checking where logs are saved…'
          : where
            ? `Logs are also written to ${where}`
            : 'To share a log, open a game and use Pause → Playtest notes → Download playtest log.'}
      </p>
    </section>
  );
}
