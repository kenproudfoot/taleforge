import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTitleMusic } from '@/ui/audio/useMusic';
import { Icon } from '@/ui/Icon';
import { cx } from '@/ui/cx';
import styles from './AppShell.module.css';
import { useSettings } from './settingsStore';

export function AppShell() {
  const loaded = useSettings((s) => s.loaded);
  const load = useSettings((s) => s.load);
  const muted = useSettings((s) => s.settings.audio.muted);
  const update = useSettings((s) => s.update);
  const location = useLocation();
  const navigate = useNavigate();
  useTitleMusic();
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
        {location.pathname !== '/' && (
          <button
            type="button"
            className={cx(styles.navLink, styles.back)}
            onClick={() => {
              // Back to wherever the player came from (the game, the library…); home when the page was opened directly.
              const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
              if (idx > 0) navigate(-1);
              else navigate('/');
            }}
            aria-label="Back"
            title="Back"
          >
            <Icon name="chevronLeft" /> <span className={styles.navText}>Back</span>
          </button>
        )}
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
          <button type="button" className={styles.navLink} style={{ background: 'none', border: 0, cursor: 'pointer' }} aria-pressed={muted} aria-label={muted ? 'Unmute music' : 'Mute music'} onClick={() => void update((d) => void (d.audio.muted = !d.audio.muted))}>
            <Icon name={muted ? 'mute' : 'volume'} />
          </button>
        </nav>
      </header>
      <main id="main" className={styles.main}>
        {loaded ? <Outlet /> : null}
      </main>
    </div>
  );
}
