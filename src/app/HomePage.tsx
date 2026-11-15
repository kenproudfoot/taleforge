import { Link } from 'react-router-dom';
import { Icon } from '@/ui/Icon';
import controls from '@/ui/controls.module.css';
import { UnlockPanel } from '@/ui/settings/DataSection';
import type { IconName } from '@/ui/Icon';
import { cx } from '@/ui/cx';
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
  { to: '/library', icon: 'book', title: 'Campaign library', text: 'Browse the bundled adventures or import your own campaign pack.' },
  { to: '/settings', icon: 'settings', title: 'Settings', text: 'API keys, models, voices, pictures, music and backups.' },
];

export function HomePage() {
  const setupComplete = useSettings((s) => s.settings.setupComplete);
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
    </div>
  );
}
