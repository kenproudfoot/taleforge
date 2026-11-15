import { useEffect } from 'react';
import { PROVIDER_LABELS, TEXT_PROVIDER_IDS } from '@/ai/providers';
import type { TextProviderId } from '@/ai/providers';
import { formatCost } from '@/ai/pricing';
import { useSettings } from '@/app/settingsStore';
import controls from '../controls.module.css';
import styles from './settings.module.css';
import { useModels } from './useModels';

interface PickerProps {
  idPrefix: string;
  provider: TextProviderId;
  model: string;
  onProvider(p: TextProviderId): void;
  onModel(m: string): void;
  /** Preferred model when none is chosen yet, e.g. /sonnet/ for the DM. */
  suggest?: RegExp;
}

/** Provider + model selects backed by the provider's live model list, with free text as a fallback. */
export function ModelPicker({ idPrefix, provider, model, onProvider, onModel, suggest }: PickerProps) {
  const keys = useSettings((s) => s.settings.keys);
  const { models, loading, error } = useModels(provider, keys);
  const hasKey = provider === 'mock' || !!keys[provider];
  const known = models.some((m) => m.id === model);
  useEffect(() => {
    // After a provider switch the model is blank: pick a sensible one from the live list.
    if (model === '' && models.length > 0) onModel((suggest && models.find((m) => suggest.test(m.id))?.id) || models[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, models]);
  return (
    <div className={styles.pickerRow}>
      <div className={controls.field}>
        <label className={controls.label} htmlFor={`${idPrefix}-provider`}>
          Provider
        </label>
        <select id={`${idPrefix}-provider`} className={controls.select} value={provider} onChange={(e) => onProvider(e.target.value as TextProviderId)}>
          {TEXT_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {PROVIDER_LABELS[id]}
              {keys[id as keyof typeof keys] ? '' : ' (no key)'}
            </option>
          ))}
        </select>
      </div>
      <div className={controls.field}>
        <label className={controls.label} htmlFor={`${idPrefix}-model`}>
          Model
        </label>
        {models.length > 0 ? (
          <select id={`${idPrefix}-model`} className={controls.select} value={model} onChange={(e) => onModel(e.target.value)}>
            {!known && <option value={model}>{model || 'Choose a model'}</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.pricing ? ` · ${formatCost(m.pricing.inputPerM)} in / ${formatCost(m.pricing.outputPerM)} out per 1M` : ''}
              </option>
            ))}
          </select>
        ) : (
          <input id={`${idPrefix}-model`} className={controls.input} value={model} onChange={(e) => onModel(e.target.value.trim())} placeholder="model id" spellCheck={false} />
        )}
        <span className={controls.hint} aria-live="polite">
          {!hasKey && `Add a ${PROVIDER_LABELS[provider]} key to load its model list.`}
          {hasKey && loading && 'Loading the model list…'}
          {hasKey && error}
          {hasKey && !loading && !error && models.length > 0 && `${models.length} models available.`}
        </span>
      </div>
    </div>
  );
}

export function ModelsSection() {
  const dm = useSettings((s) => s.settings.dm);
  const helper = useSettings((s) => s.settings.helper);
  const update = useSettings((s) => s.update);
  return (
    <section className={styles.section} aria-labelledby="models-heading">
      <h2 id="models-heading">Models</h2>
      <p className={styles.sectionLede}>Two models, two jobs. Lists come live from each provider, so new models appear as soon as they are released.</p>

      <fieldset className={styles.group}>
        <legend>Dungeon Master</legend>
        <p className={controls.hint}>Narrates and runs the game. A fast, creative mid-size model works best. You can switch it mid-game from the top bar.</p>
        <ModelPicker
          idPrefix="dm"
          provider={dm.provider}
          model={dm.model}
          suggest={/sonnet|gpt-5(?!.*(nano|mini))|pro/}
          onProvider={(p) => void update((d) => void ((d.dm.provider = p as typeof d.dm.provider), (d.dm.model = '')))}
          onModel={(m) => void update((d) => void (d.dm.model = m))}
        />
        <div className={styles.pickerRow}>
          <div className={controls.field}>
            <label className={controls.label} htmlFor="dm-effort">
              Thinking effort
            </label>
            <select id="dm-effort" className={controls.select} value={dm.effort} onChange={(e) => void update((d) => void (d.dm.effort = e.target.value as typeof d.dm.effort))}>
              <option value="low">Low: fastest replies (recommended)</option>
              <option value="medium">Medium</option>
              <option value="high">High: slower, more deliberate</option>
            </select>
            <span className={controls.hint}>Used by models that support it. Lower effort keeps the spoken game snappy.</span>
          </div>
          <div className={controls.field}>
            <label className={controls.label} htmlFor="dm-toolmode">
              Tool calling
            </label>
            <select id="dm-toolmode" className={controls.select} value={dm.toolMode} onChange={(e) => void update((d) => void (d.dm.toolMode = e.target.value as typeof d.dm.toolMode))}>
              <option value="native">Native (recommended)</option>
              <option value="json">JSON fallback, for models without tool calling</option>
            </select>
            <span className={controls.hint}>How the DM asks for rolls and updates the game state.</span>
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Helper</legend>
        <p className={controls.hint}>Writes image prompts, recaps, summaries and name suggestions in the background. Pick something small and cheap.</p>
        <ModelPicker
          idPrefix="helper"
          provider={helper.provider}
          model={helper.model}
          suggest={/haiku|mini|flash|nano/}
          onProvider={(p) => void update((d) => void ((d.helper.provider = p as typeof d.helper.provider), (d.helper.model = '')))}
          onModel={(m) => void update((d) => void (d.helper.model = m))}
        />
      </fieldset>
    </section>
  );
}
