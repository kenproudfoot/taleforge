import { useEffect, useState } from 'react';
import { DEFAULT_IMAGE_MODEL, getImageProvider, resolveImageProvider } from '@/ai/art/providers';
import { describeProviderError } from '@/ai/providers';
import type { ModelInfo } from '@/ai/providers';
import { useSettings } from '@/app/settingsStore';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import styles from './settings.module.css';

const NAMES = { openai: 'OpenAI', gemini: 'Google Gemini', custom: 'your custom endpoint' } as const;

export function ImageSection() {
  const image = useSettings((s) => s.settings.image);
  const keys = useSettings((s) => s.settings.keys);
  const update = useSettings((s) => s.update);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'bad'; text?: string; url?: string }>({ state: 'idle' });
  const active = resolveImageProvider(image, keys);

  useEffect(() => {
    let live = true;
    setModels([]);
    const provider = getImageProvider(image, keys);
    provider
      ?.listModels()
      .then((list) => live && setModels(list))
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
  }, [active, keys.openai, keys.gemini]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => void (test.url && URL.revokeObjectURL(test.url)), [test.url]);

  const runTest = async () => {
    const provider = getImageProvider(image, keys);
    if (!provider || !active) return;
    setTest({ state: 'testing' });
    try {
      const blob = await provider.generate({ prompt: 'A small brass lantern glowing on a weathered wooden table, painterly, warm light. No text.', size: 'square' });
      setTest({ state: 'ok', text: 'It works. This is the test picture:', url: URL.createObjectURL(blob) });
    } catch (e) {
      setTest({ state: 'bad', text: describeProviderError(e, NAMES[active]) });
    }
  };

  const set = (change: (d: ReturnType<typeof useSettings.getState>['settings']['image']) => void) => void update((d) => change(d.image));
  const model = image.model || (active ? DEFAULT_IMAGE_MODEL[active] : '');

  return (
    <section className={styles.section} aria-labelledby="image-heading">
      <h2 id="image-heading">Pictures</h2>
      <p className={styles.sectionLede}>
        Portraits of every character, a party picture, the places you visit and big story moments, painted in the campaign&apos;s art style while you play. Without an image service, campaigns use their key art and emblem cards.
      </p>
      <div className={styles.pickerRow}>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="image-provider">
            Image service
          </label>
          <select id="image-provider" className={controls.select} value={image.provider} onChange={(e) => set((d) => void ((d.provider = e.target.value as typeof d.provider), (d.model = '')))}>
            <option value="auto">Automatic (OpenAI, then Gemini)</option>
            <option value="openai">OpenAI{keys.openai ? '' : ' (no key)'}</option>
            <option value="gemini">Google Gemini{keys.gemini ? '' : ' (no key)'}</option>
            <option value="custom">Custom endpoint</option>
            <option value="none">No pictures</option>
          </select>
          <span className={controls.hint}>{active ? `Now using ${NAMES[active]}.` : 'No pictures will be painted.'}</span>
        </div>
        {active && active !== 'custom' && (
          <div className={controls.field}>
            <label className={controls.label} htmlFor="image-model">
              Image model
            </label>
            {models.length > 0 ? (
              <select id="image-model" className={controls.select} value={model} onChange={(e) => set((d) => void (d.model = e.target.value))}>
                {!models.some((m) => m.id === model) && <option value={model}>{model}</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <input id="image-model" className={controls.input} value={image.model} placeholder={DEFAULT_IMAGE_MODEL[active]} onChange={(e) => set((d) => void (d.model = e.target.value.trim()))} />
            )}
          </div>
        )}
        {active === 'openai' && /^(gpt-image|chatgpt-image)/.test(model) && (
          <div className={controls.field}>
            <label className={controls.label} htmlFor="image-quality">
              Picture quality
            </label>
            <select id="image-quality" className={controls.select} value={image.quality} onChange={(e) => set((d) => void (d.quality = e.target.value as typeof d.quality))}>
              <option value="low">Low (cheapest)</option>
              <option value="medium">Medium (recommended)</option>
              <option value="high">High (about four times medium)</option>
            </select>
            <span className={controls.hint}>The biggest cost lever for pictures. With gpt-image-2, a square picture is roughly $0.01 low, $0.05 medium, $0.21 high; tall and wide ones a little more.</span>
          </div>
        )}
      </div>

      {image.provider === 'custom' && (
        <fieldset className={styles.group}>
          <legend>Custom endpoint</legend>
          <p className={controls.hint}>Connect any image service that accepts a JSON request. Use {'{{prompt}}'}, {'{{width}}'} and {'{{height}}'} in the template.</p>
          <div className={controls.field}>
            <label className={controls.label} htmlFor="custom-url">
              URL
            </label>
            <input id="custom-url" className={controls.input} value={image.custom.url} placeholder="https://…" onChange={(e) => set((d) => void (d.custom.url = e.target.value.trim()))} />
          </div>
          <div className={styles.pickerRow}>
            <div className={controls.field}>
              <label className={controls.label} htmlFor="custom-auth-header">
                Auth header name
              </label>
              <input id="custom-auth-header" className={controls.input} value={image.custom.authHeader} onChange={(e) => set((d) => void (d.custom.authHeader = e.target.value.trim()))} />
            </div>
            <div className={controls.field}>
              <label className={controls.label} htmlFor="custom-auth-value">
                Auth header value
              </label>
              <input id="custom-auth-value" type="password" className={controls.input} value={image.custom.authValue} placeholder="Bearer …" autoComplete="off" onChange={(e) => set((d) => void (d.custom.authValue = e.target.value))} />
            </div>
          </div>
          <div className={controls.field}>
            <label className={controls.label} htmlFor="custom-body">
              Request body template
            </label>
            <textarea id="custom-body" className={controls.textarea} spellCheck={false} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }} value={image.custom.bodyTemplate} onChange={(e) => set((d) => void (d.custom.bodyTemplate = e.target.value))} />
          </div>
          <div className={controls.field}>
            <label className={controls.label} htmlFor="custom-path">
              Where the image is in the response
            </label>
            <input id="custom-path" className={controls.input} value={image.custom.responsePath} onChange={(e) => set((d) => void (d.custom.responsePath = e.target.value.trim()))} />
            <span className={controls.hint}>A dot path to base64 data, a data: URL or an image URL, for example data.0.b64_json. A response that is itself an image also works.</span>
          </div>
        </fieldset>
      )}

      <div className={styles.pickerRow}>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="image-concurrency">
            Pictures painted at once: {image.concurrency}
          </label>
          <div className={styles.slider}>
            <input id="image-concurrency" type="range" min={1} max={4} step={1} value={image.concurrency} onChange={(e) => set((d) => void (d.concurrency = Number(e.target.value)))} />
          </div>
        </div>
        <div className={controls.field}>
          <span className={controls.label}>Check it works</span>
          <div>
            <button type="button" className={controls.btn} disabled={!active || test.state === 'testing'} onClick={() => void runTest()}>
              <Icon name="image" /> {test.state === 'testing' ? 'Painting…' : 'Paint a test picture'}
            </button>
          </div>
        </div>
      </div>
      <div aria-live="polite">
        {test.text && <p className={test.state === 'bad' ? styles.bad : styles.ok}>{test.text}</p>}
        {test.url && <img src={test.url} alt="Test picture" style={{ width: 160, borderRadius: 10, marginTop: 8, display: 'block' }} />}
      </div>
    </section>
  );
}
