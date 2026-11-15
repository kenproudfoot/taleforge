import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Icon } from '@/ui/Icon';
import { cx } from '@/ui/cx';
import styles from './AppShell.module.css';
import { useSettings } from './settingsStore';

export function AppShell() {
  const loaded = useSettings((s) => s.loaded);
  const load = useSettings((s) => s.load);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const link = ({ isActive }: { isActive: boolean }) => cx(styles.navLink, isActive && styles.navLinkActive);
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link to="/" className={styles.brand} aria-label="TaleForge home">
          <img src={`${import.meta.env.BASE_URL}icons/taleforge.svg`} alt="" width={30} height={30} />
          <span>TaleForge</span>
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <NavLink to="/library" className={link}>
            <Icon name="book" /> <span className={styles.navText}>Campaigns</span>
          </NavLink>
          <NavLink to="/settings" className={link}>
            <Icon name="settings" /> <span className={styles.navText}>Settings</span>
          </NavLink>
        </nav>
      </header>
      <main id="main" className={styles.main}>
        {loaded ? <Outlet /> : null}
      </main>
    </div>
  );
}
