import { useSettings } from '@/app/settingsStore';
import controls from '../controls.module.css';
import styles from './settings.module.css';

function PriceInput({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: number | null; onChange(v: number | null): void }) {
  return (
    <div className={controls.field}>
      <label className={controls.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={controls.input}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        placeholder="Built-in estimate"
        value={value ?? ''}
        onChange={(e) => {
          const n = e.target.value.trim() === '' ? null : Number(e.target.value);
          onChange(n === null || (Number.isFinite(n) && n >= 0) ? n : value);
        }}
      />
      <span className={controls.hint}>{hint}</span>
    </div>
  );
}

/** Price overrides for the usage panel, for services the built-in price list does not know. */
export function CostsSection() {
  const costs = useSettings((s) => s.settings.costs);
  const update = useSettings((s) => s.update);
  return (
    <section className={styles.section} aria-labelledby="costs-heading">
      <h2 id="costs-heading">Costs</h2>
      <p className={styles.sectionLede}>
        During a game, click the token count in the top bar (or open Pause) to see what the Dungeon Master, pictures and voices have used and an estimated cost. The
        estimates use list prices built into TaleForge. Set a price here for anything it does not know (a local image server is free: enter 0), or leave a box empty
        for the built-in estimate.
      </p>
      <div className={styles.pickerRow}>
        <PriceInput
          id="cost-picture"
          label="Price per picture (USD)"
          hint="Replaces the estimate for every picture, from any image service."
          value={costs.picture}
          onChange={(v) => void update((d) => void (d.costs.picture = v))}
        />
        <PriceInput
          id="cost-voice"
          label="Narration price per million characters (USD)"
          hint="For example, from your ElevenLabs plan. Built in: OpenAI voices."
          value={costs.voicePerMillionChars}
          onChange={(v) => void update((d) => void (d.costs.voicePerMillionChars = v))}
        />
      </div>
    </section>
  );
}
