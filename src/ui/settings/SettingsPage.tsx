import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { CostsSection } from './CostsSection';
import { DataSection, UnlockPanel } from './DataSection';
import styles from './settings.module.css';
import { SETTINGS_STEPS } from './steps';

export function SettingsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <p className={controls.eyebrow}>Settings</p>
        <h1>Set up your table</h1>
        <div className={controls.row}>
          <Link to="/setup" className={controls.btn}>
            <Icon name="sparkle" /> Run the setup wizard again
          </Link>
        </div>
      </header>
      <UnlockPanel />
      {SETTINGS_STEPS.map(({ id, Component }) => (
        <Component key={id} />
      ))}
      <CostsSection />
      <DataSection />
    </div>
  );
}
