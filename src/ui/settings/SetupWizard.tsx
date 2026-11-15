import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PROVIDER_LABELS, TEXT_PROVIDER_IDS } from '@/ai/providers';
import { useSettings } from '@/app/settingsStore';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { UnlockPanel } from './DataSection';
import styles from './settings.module.css';
import { SETTINGS_STEPS } from './steps';

export function SetupWizard() {
  const navigate = useNavigate();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  // Step 0 is the welcome screen; the last step is the summary.
  const [index, setIndex] = useState(0);
  const titles = ['Welcome', ...SETTINGS_STEPS.map((s) => s.title), 'Ready'];
  const last = titles.length - 1;
  const step = SETTINGS_STEPS[index - 1];
  const hasTextKey = TEXT_PROVIDER_IDS.some((id) => id !== 'mock' && settings.keys[id as keyof typeof settings.keys]);
  const blocked = step?.id === 'keys' && !hasTextKey;

  const finish = async () => {
    await update((d) => void (d.setupComplete = true));
    navigate('/');
  };

  return (
    <div className={styles.wizard}>
      <ol className={styles.steps} aria-label="Setup progress">
        {titles.map((title, i) => (
          <li key={title} className={cx(styles.step, i === index && styles.stepCurrent, i < index && styles.stepDone)} aria-current={i === index ? 'step' : undefined}>
            <span className={styles.stepNum}>{i < index ? <Icon name="check" size={13} /> : i + 1}</span>
            {title}
          </li>
        ))}
      </ol>

      {index === 0 && (
        <section className={cx(styles.section, styles.welcome)}>
          <h1>Welcome to TaleForge</h1>
          <p>
            TaleForge runs entirely in your browser. To bring the Dungeon Master to life it talks directly to AI providers using your own API
            keys, which stay on this device.
          </p>
          <p>
            This takes about two minutes. You need one key that can run the Dungeon Master (Anthropic is recommended). An OpenAI key adds natural
            voices, speech recognition and pictures. Everything can be changed later in Settings.
          </p>
        </section>
      )}

      {step && (
        <>
          <UnlockPanel />
          <step.Component />
        </>
      )}

      {index === last && (
        <section className={styles.section}>
          <h2>You are ready to play</h2>
          <dl className={styles.summary}>
            <dt>Dungeon Master</dt>
            <dd>
              {settings.dm.model || 'not chosen'} · {PROVIDER_LABELS[settings.dm.provider]}
            </dd>
            <dt>Helper</dt>
            <dd>
              {settings.helper.model || 'not chosen'} · {PROVIDER_LABELS[settings.helper.provider]}
            </dd>
            <dt>Keys saved</dt>
            <dd>
              {Object.entries(settings.keys)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(', ') || 'none'}
            </dd>
          </dl>
          <p className={styles.sectionLede}>Tip: Settings → Backup lets you export this setup to a file.</p>
        </section>
      )}

      <div className={styles.wizardNav}>
        <button type="button" className={controls.btn} onClick={() => (index === 0 ? navigate('/') : setIndex(index - 1))}>
          <Icon name="chevronLeft" /> {index === 0 ? 'Not now' : 'Back'}
        </button>
        {index < last ? (
          <div className={controls.row}>
            {blocked && <span className={controls.hint}>Add a key for Anthropic, OpenAI, Gemini or OpenRouter to continue.</span>}
            <button type="button" className={cx(controls.btn, controls.primary)} disabled={blocked} onClick={() => setIndex(index + 1)}>
              {index === 0 ? 'Get started' : 'Next'} <Icon name="chevronRight" />
            </button>
          </div>
        ) : (
          <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => void finish()}>
            <Icon name="check" /> Finish setup
          </button>
        )}
      </div>
    </div>
  );
}
