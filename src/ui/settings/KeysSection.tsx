import { useState } from 'react';
import { describeProviderError } from '@/ai/providers';
import { testKey } from '@/ai/testConnection';
import { useSettings } from '@/app/settingsStore';
import type { ApiKeyName } from '@/storage/settings';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import styles from './settings.module.css';

interface KeyInfo {
  name: ApiKeyName;
  label: string;
  purpose: string;
  url: string;
  placeholder: string;
}

export const KEY_INFO: KeyInfo[] = [
  { name: 'anthropic', label: 'Anthropic', purpose: 'Runs the Dungeon Master with Claude. Recommended.', url: 'https://platform.claude.com/settings/keys', placeholder: 'sk-ant-…' },
  { name: 'openai', label: 'OpenAI', purpose: 'Natural voices, speech recognition and images. Can also run the DM.', url: 'https://platform.openai.com/api-keys', placeholder: 'sk-…' },
  { name: 'gemini', label: 'Google Gemini', purpose: 'Optional. Another choice for the DM and for images.', url: 'https://aistudio.google.com/apikey', placeholder: 'AIza…' },
  { name: 'openrouter', label: 'OpenRouter', purpose: 'Optional. One key for many different DM models.', url: 'https://openrouter.ai/keys', placeholder: 'sk-or-…' },
  { name: 'elevenlabs', label: 'ElevenLabs', purpose: 'Optional. Premium narrator and character voices.', url: 'https://elevenlabs.io/app/settings/api-keys', placeholder: 'sk_…' },
];

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; message: string } | { status: 'failed'; message: string };

function KeyRow({ info }: { info: KeyInfo }) {
  const value = useSettings((s) => s.settings.keys[info.name]);
  const locked = useSettings((s) => s.locked);
  const update = useSettings((s) => s.update);
  const [shown, setShown] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const inputId = `key-${info.name}`;

  const runTest = async () => {
    setTest({ status: 'testing' });
    try {
      setTest({ status: 'ok', message: await testKey(info.name, value) });
    } catch (e) {
      setTest({ status: 'failed', message: describeProviderError(e, info.label) });
    }
  };

  return (
    <div className={styles.keyRow}>
      <div className={styles.keyHead}>
        <label htmlFor={inputId} className={styles.keyLabel}>
          {info.label} API key
        </label>
        <a href={info.url} target="_blank" rel="noreferrer" className={styles.keyLink}>
          Get a key
        </a>
      </div>
      <p className={controls.hint}>{info.purpose}</p>
      <div className={styles.keyInputRow}>
        <input
          id={inputId}
          className={controls.input}
          type={shown ? 'text' : 'password'}
          value={value}
          disabled={locked}
          placeholder={locked ? 'Locked: enter your passphrase to edit' : info.placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setTest({ status: 'idle' });
            void update((d) => void (d.keys[info.name] = e.target.value.trim()));
          }}
        />
        <button type="button" className={cx(controls.btn, controls.icon)} onClick={() => setShown(!shown)} aria-label={shown ? `Hide ${info.label} key` : `Show ${info.label} key`}>
          <Icon name="eye" />
        </button>
        <button type="button" className={controls.btn} onClick={() => void runTest()} disabled={!value || test.status === 'testing'}>
          {test.status === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      <div aria-live="polite" className={styles.keyStatus}>
        {test.status === 'ok' && (
          <span className={styles.ok}>
            <Icon name="check" size={15} /> {test.message}
          </span>
        )}
        {test.status === 'failed' && (
          <span className={styles.bad}>
            <Icon name="alert" size={15} /> {test.message}
          </span>
        )}
      </div>
    </div>
  );
}

export function KeysSection() {
  return (
    <section className={styles.section} aria-labelledby="keys-heading">
      <h2 id="keys-heading">API keys</h2>
      <p className={styles.sectionLede}>
        Keys are stored only in this browser and sent only to the provider they belong to. You need at least one key that can run the Dungeon
        Master. Do not use TaleForge with your keys on a shared computer.
      </p>
      <div className={styles.keys}>
        {KEY_INFO.map((info) => (
          <KeyRow key={info.name} info={info} />
        ))}
      </div>
    </section>
  );
}
