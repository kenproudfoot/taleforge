import { Link, Outlet } from 'react-router-dom';
import styles from './AppShell.module.css';

export function AppShell() {
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
        <nav className={styles.nav} aria-label="Main" id="shell-nav" />
      </header>
      <main id="main" className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
