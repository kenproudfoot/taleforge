import { Link } from 'react-router-dom';
import { Icon } from '@/ui/Icon';
import type { IconName } from '@/ui/Icon';
import { cx } from '@/ui/cx';
import styles from './HomePage.module.css';

interface Action {
  to: string;
  icon: IconName;
  title: string;
  text: string;
  primary?: boolean;
}

const ACTIONS: Action[] = [
  { to: '/library', icon: 'book', title: 'Campaign library', text: 'Browse the bundled adventures or import your own campaign pack.' },
];

export function HomePage() {
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
