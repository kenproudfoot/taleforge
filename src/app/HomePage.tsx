import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatClock } from '@/game/session';
import type { SessionSummary } from '@/game/session';
import { deleteSession, listSessions } from '@/storage/sessions';
import { Icon } from '@/ui/Icon';
import type { IconName } from '@/ui/Icon';
import controls from '@/ui/controls.module.css';
import { cx } from '@/ui/cx';
import { UnlockPanel } from '@/ui/settings/DataSection';
import styles from './HomePage.module.css';
import { useSettings } from './settingsStore';

interface Action {
  to: string;
  icon: IconName;
  title: string;
  text: string;
  primary?: boolean;
}

const ACTIONS: Action[] = [
  { to: '/new', icon: 'play', title: 'New game', text: 'Pick a campaign, create your characters and begin.', primary: true },
  { to: '/library', icon: 'book', title: 'Campaign library', text: 'Browse the bundled adventures or import your own campaign pack.' },
  { to: '/settings', icon: 'settings', title: 'Settings', text: 'API keys, models, voices, pictures, music and backups.' },
];

function when(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function HomePage() {
  const setupComplete = useSettings((s) => s.settings.setupComplete);
  const [saves, setSaves] = useState<SessionSummary[]>([]);
  const refresh = useCallback(() => {
    listSessions()
      .then(setSaves)
      .catch(() => setSaves([]));
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>An AI Dungeon Master for your table</p>
        <h1 className={styles.title}>Gather your party. The tale begins.</h1>
        <p className={styles.lede}>
          One to four players, one computer, and a Dungeon Master who narrates aloud, paints every scene and keeps the
          dice honest. A full adventure in under an hour.
        </p>
      </section>
      {!setupComplete && (
        <div className={styles.notice}>
          <span>
            <strong>First time here?</strong> Add your API keys and pick your Dungeon Master. It takes about two minutes.
          </span>
          <Link to="/setup" className={cx(controls.btn, controls.primary)}>
            <Icon name="sparkle" /> Start setup
          </Link>
        </div>
      )}
      <UnlockPanel />
      <nav className={styles.actions} aria-label="Start">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className={cx(styles.action, a.primary && styles.actionPrimary)}>
            <Icon name={a.icon} size={28} className={styles.icon} />
            <span className={styles.actionTitle}>{a.title}</span>
            <span className={styles.actionText}>{a.text}</span>
          </Link>
        ))}
      </nav>
      {saves.length > 0 && (
        <section className={styles.saves} aria-labelledby="saves-heading">
          <h2 id="saves-heading">Continue a saved game</h2>
          <ul className={styles.saveList}>
            {saves.map((s) => (
              <li key={s.id} className={styles.save}>
                <div className={styles.saveText}>
                  <strong>{s.campaignTitle}</strong>
                  <span>
                    {s.party.join(', ')} · {s.ended ? 'Finished' : `Act ${s.act}`} · {formatClock(s.elapsedMs)} played · {when(s.updatedAt)}
                  </span>
                </div>
                <Link to={`/play/${s.id}`} className={cx(controls.btn, !s.ended && controls.primary)}>
                  <Icon name={s.ended ? 'book' : 'play'} /> {s.ended ? 'Read' : 'Continue'}
                </Link>
                <button type="button" className={cx(controls.btn, controls.icon, controls.danger)} aria-label={`Delete the saved game of ${s.campaignTitle}`} onClick={() => void deleteSession(s.id).then(refresh)}>
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
