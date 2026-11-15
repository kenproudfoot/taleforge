import { useRef, useState } from 'react';
import { useSettings } from '@/app/settingsStore';
import { exportSettings, importSettings } from '@/storage/settings';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { downloadText } from '../download';
import styles from './settings.module.css';
import { clearModelCache } from './useModels';

type Note = { tone: 'ok' | 'bad'; text: string } | null;

export function DataSection() {
  const settings = useSettings((s) => s.settings);
  const locked = useSettings((s) => s.locked);
  const encrypted = useSettings((s) => s.encrypted);
  const replace = useSettings((s) => s.replace);
  const setPassphrase = useSettings((s) => s.setPassphrase);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [pass, setPass] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const doImport = async (file: File) => {
    try {
      await replace(importSettings(await file.text(), settings));
      clearModelCache();
      setNote({ tone: 'ok', text: 'Settings imported.' });
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const protect = async () => {
    try {
      await setPassphrase(pass);
      setPass('');
      setNote({ tone: 'ok', text: 'Keys are now encrypted. You will be asked for the passphrase each time you open TaleForge.' });
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className={styles.section} aria-labelledby="data-heading">
      <h2 id="data-heading">Backup and protection</h2>
      <p className={styles.sectionLede}>Export your setup so it is never lost, or move it to another browser.</p>

      <fieldset className={styles.group}>
        <legend>Export and import</legend>
        <label className={styles.check}>
          <input type="checkbox" checked={includeKeys} disabled={locked} onChange={(e) => setIncludeKeys(e.target.checked)} />
          <span>Include API keys in the export (keep the file private)</span>
        </label>
        <div className={controls.row}>
          <button
            type="button"
            className={controls.btn}
            onClick={() => {
              downloadText('taleforge-settings.json', exportSettings(settings, { includeKeys }), 'application/json');
              setNote({ tone: 'ok', text: includeKeys ? 'Exported with keys.' : 'Exported without keys.' });
            }}
          >
            <Icon name="download" /> Export settings
          </button>
          <button type="button" className={controls.btn} onClick={() => fileInput.current?.click()} disabled={locked}>
            <Icon name="upload" /> Import settings
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Settings file"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void doImport(file);
              e.target.value = '';
            }}
          />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Passphrase</legend>
        <p className={controls.hint}>
          Optional. Encrypts your stored API keys (AES-GCM). There is no recovery if you forget it: you would need to enter your keys again.
        </p>
        {encrypted ? (
          <div className={controls.row}>
            <span className={cx(controls.chip, controls.chipGood)}>
              <Icon name="shield" size={13} /> Keys are encrypted
            </span>
            <button type="button" className={controls.btn} disabled={locked} onClick={() => void setPassphrase(null).then(() => setNote({ tone: 'ok', text: 'Passphrase removed.' }))}>
              Remove passphrase
            </button>
          </div>
        ) : (
          <div className={styles.keyInputRow}>
            <input
              className={controls.input}
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Choose a passphrase"
              aria-label="New passphrase"
              autoComplete="new-password"
            />
            <button type="button" className={controls.btn} disabled={pass.length < 4} onClick={() => void protect()}>
              Encrypt keys
            </button>
          </div>
        )}
      </fieldset>
      <p aria-live="polite" className={note?.tone === 'bad' ? styles.bad : styles.ok}>
        {note?.text}
      </p>
    </section>
  );
}

/** Shown wherever keys are needed while they are still locked behind the passphrase. */
export function UnlockPanel() {
  const locked = useSettings((s) => s.locked);
  const unlock = useSettings((s) => s.unlock);
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!locked) return null;
  return (
    <form
      className={styles.unlock}
      onSubmit={(e) => {
        e.preventDefault();
        unlock(pass).then(
          () => setPass(''),
          (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
        );
      }}
    >
      <Icon name="key" size={22} />
      <div className={styles.unlockText}>
        <strong>Your API keys are locked</strong>
        <span>Enter your passphrase to use them in this session.</span>
      </div>
      <input className={controls.input} type="password" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passphrase" autoComplete="current-password" />
      <button type="submit" className={cx(controls.btn, controls.primary)} disabled={!pass}>
        Unlock
      </button>
      {error && (
        <span role="alert" className={styles.bad}>
          {error}
        </span>
      )}
    </form>
  );
}
