import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadCampaign } from '@/content/library';
import { parseRecap, sessionFromRecap } from '@/game/recap';
import { formatClock } from '@/game/session';
import type { SessionSummary } from '@/game/session';
import { exportSession, importSession } from '@/storage/backup';
import { deleteSession, listSessions, loadSession, saveSession } from '@/storage/sessions';
import { downloadText } from '@/ui/download';
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
  const settings = useSettings((s) => s.settings);
  const navigate = useNavigate();
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [saves, setSaves] = useState<SessionSummary[]>([]);
  const refresh = useCallback(() => {
    listSessions()
      .then(setSaves)
      .catch(() => setSaves([]));
  }, []);
  useEffect(refresh, [refresh]);

  const restoreRecap = async (file: File) => {
    setRestoreError(null);
    try {
      const recap = parseRecap(await file.text());
      const loaded = await loadCampaign(recap.campaignId).catch((cause: unknown) => {
        throw new Error(`This recap is for the campaign "${recap.title}", which is not in your library. Import that campaign first, then load the recap again.`, { cause });
      });
      const session = sessionFromRecap(recap, { dm: { provider: settings.dm.provider, model: settings.dm.model }, diceMode: settings.dice.mode, campaignTitle: loaded.pack.manifest.title });
      await saveSession(session);
      navigate(`/play/${session.id}`);
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : String(e));
    }
  };

  const restoreBackup = async (file: File) => {
    setRestoreError(null);
    try {
      const session = await importSession(await file.text());
      await saveSession(session);
      refresh();
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : String(e));
    }
  };

  const backup = async (id: string) => {
    const session = await loadSession(id);
    if (session) downloadText(`${session.campaignId}-backup.json`, await exportSession(session), 'application/json');
  };

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
                <button type="button" className={cx(controls.btn, controls.icon)} aria-label={`Download a backup of the ${s.campaignTitle} game`} title="Download a backup" onClick={() => void backup(s.id)}>
                  <Icon name="download" />
                </button>
                <button type="button" className={cx(controls.btn, controls.icon, controls.danger)} aria-label={`Delete the saved game of ${s.campaignTitle}`} onClick={() => void deleteSession(s.id).then(refresh)}>
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={styles.saves} aria-labelledby="restore-heading">
        <h2 id="restore-heading">Bring a game back</h2>
        <div className={controls.row}>
          <label className={controls.btn}>
            <Icon name="file" /> Load a recap file
            <input type="file" accept=".md,text/markdown,text/plain" className="sr-only" aria-label="Recap file" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void restoreRecap(file);
            }} />
          </label>
          <label className={controls.btn}>
            <Icon name="upload" /> Import a game backup
            <input type="file" accept=".json,application/json" className="sr-only" aria-label="Game backup file" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void restoreBackup(file);
            }} />
          </label>
        </div>
        <p className={styles.actionText}>A recap.md restores the exact game on any computer; a backup also brings the pictures.</p>
        {restoreError && (
          <p role="alert" className={styles.restoreError}>
            {restoreError}
          </p>
        )}
      </section>
    </div>
  );
}
