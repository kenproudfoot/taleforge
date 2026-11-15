import { useState } from 'react';
import type { CampaignPack } from '@/content/pack';
import type { Question } from '@/content/schemas';
import { STAT_CAP } from '@/engine/rules';
import { STATS } from '@/engine/types';
import type { Archetype, Stat } from '@/engine/types';
import { PLAYER_COLORS, SURPRISE_FIELDS } from '@/game/characters';
import type { CharacterAnswers, SurpriseField } from '@/game/characters';
import { suggestNames, surpriseFields } from '@/game/surprise';
import { ArchetypeIcon } from '../ArchetypeIcon';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import styles from './newgame.module.css';

interface Props {
  index: number;
  answers: CharacterAnswers;
  onChange(next: CharacterAnswers): void;
  questions: Question[];
  archetypes: Archetype[];
  pack: CampaignPack;
  /** Shown when the table chose "per player" dice. */
  diceChoice?: { value: 'digital' | 'physical'; onChange(v: 'digital' | 'physical'): void };
}

const STAT_NAMES: Record<Stat, string> = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intellect', WIS: 'Wisdom', CHA: 'Charisma' };
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const isSurprise = (id: string): id is SurpriseField => (SURPRISE_FIELDS as readonly string[]).includes(id);

export function CharacterForm({ index, answers, onChange, questions, archetypes, pack, diceChoice }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const archetype = archetypes.find((a) => a.id === answers.archetype);
  const set = <K extends keyof CharacterAnswers>(key: K, value: CharacterAnswers[K]) => onChange({ ...answers, [key]: value });
  const uid = (id: string) => `p${index}-${id}`;

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const surprise = (fields: SurpriseField[]) =>
    run(fields.length === 1 ? fields[0]! : 'all', async () => {
      const filled = await surpriseFields(pack, archetype, answers, fields);
      onChange({ ...answers, ...filled });
    });

  const emptySurprisable = questions.filter((q) => q.surprise && isSurprise(q.id) && !answers[q.id].trim()).map((q) => q.id as SurpriseField);

  const surpriseButton = (q: Question) =>
    q.surprise && isSurprise(q.id) ? (
      <button type="button" className={cx(controls.btn, controls.small)} disabled={busy !== null} onClick={() => void surprise([q.id as SurpriseField])}>
        <Icon name="sparkle" size={14} /> {busy === q.id ? 'Thinking…' : 'Surprise me'}
      </button>
    ) : null;

  const field = (q: Question) => {
    const label = (
      <div className={styles.qHead}>
        <label className={controls.label} htmlFor={uid(q.id)}>
          {q.label}
          {q.required ? <span className={styles.req}> (required)</span> : null}
        </label>
        {q.id === 'name' && (
          <button
            type="button"
            className={cx(controls.btn, controls.small)}
            disabled={busy !== null}
            onClick={() => void run('names', async () => setNames(await suggestNames(pack, archetype, answers)))}
          >
            <Icon name="sparkle" size={14} /> {busy === 'names' ? 'Thinking…' : 'Suggest names'}
          </button>
        )}
        {q.id !== 'name' && surpriseButton(q)}
      </div>
    );
    const help = q.help ? <span className={controls.hint}>{q.help}</span> : null;

    switch (q.type) {
      case 'color':
        return (
          <fieldset key={q.id} className={styles.q}>
            <legend className={controls.label}>{q.label}</legend>
            <div className={styles.swatches}>
              {PLAYER_COLORS.map((c) => (
                <label key={c} className={cx(styles.swatch, answers.playerColor === c && styles.swatchOn)} style={{ background: c }}>
                  <input type="radio" name={uid('color')} className="sr-only" checked={answers.playerColor === c} onChange={() => set('playerColor', c)} />
                  <span className="sr-only">Color {c}</span>
                </label>
              ))}
            </div>
            {help}
          </fieldset>
        );
      case 'archetype':
        return (
          <fieldset key={q.id} className={styles.q}>
            <legend className={controls.label}>
              {q.label}
              <span className={styles.req}> (required)</span>
            </legend>
            {help}
            <div className={styles.archetypes}>
              {archetypes.map((a) => (
                <label key={a.id} className={cx(styles.archetype, answers.archetype === a.id && styles.archetypeOn)}>
                  <input type="radio" name={uid('archetype')} className="sr-only" checked={answers.archetype === a.id} onChange={() => set('archetype', a.id)} />
                  <span className={styles.archHead}>
                    <ArchetypeIcon archetypeId={a.id} size={30} />
                    <strong>{a.name}</strong>
                  </span>
                  <span className={styles.archSummary}>{a.summary}</span>
                  <span className={styles.archStats}>
                    {STATS.filter((s) => a.stats[s] >= 2)
                      .map((s) => `${s} ${signed(a.stats[s])}`)
                      .join(' · ')}
                  </span>
                  <span className={styles.archAbility}>
                    <Icon name="star" size={13} /> {a.signature.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      case 'stat':
        return (
          <fieldset key={q.id} className={styles.q}>
            <legend className={controls.label}>
              {q.label}
              <span className={styles.req}> (required)</span>
            </legend>
            {help}
            <div className={styles.stats}>
              {STATS.map((s) => {
                const base = archetype?.stats[s] ?? 0;
                const on = answers.bump === s;
                return (
                  <label key={s} className={cx(styles.stat, on && styles.statOn)} title={STAT_NAMES[s]}>
                    <input type="radio" name={uid('bump')} className="sr-only" checked={on} onChange={() => set('bump', s)} />
                    <span className={styles.statName}>{s}</span>
                    <span className={styles.statValue}>{archetype ? signed(Math.min(STAT_CAP, base + (on ? 1 : 0))) : '+1'}</span>
                    <span className="sr-only">{STAT_NAMES[s]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      case 'hook': {
        const custom = answers.hook && !pack.manifest.hooks.includes(answers.hook);
        return (
          <fieldset key={q.id} className={styles.q}>
            <div className={styles.qHead}>
              <legend className={controls.label}>{q.label}</legend>
              {surpriseButton(q)}
            </div>
            {help}
            <div className={styles.hooks}>
              {pack.manifest.hooks.map((h) => (
                <label key={h} className={cx(styles.hook, answers.hook === h && styles.hookOn)}>
                  <input type="radio" name={uid('hook')} checked={answers.hook === h} onChange={() => set('hook', h)} />
                  <span>{h}</span>
                </label>
              ))}
            </div>
            <input
              id={uid('hook')}
              className={controls.input}
              value={custom ? answers.hook : ''}
              placeholder="Or write your own"
              aria-label="Your own backstory hook"
              onChange={(e) => set('hook', e.target.value)}
            />
          </fieldset>
        );
      }
      case 'companion': {
        const c = answers.companion;
        return (
          <fieldset key={q.id} className={styles.q}>
            <legend className={controls.label}>{q.label}</legend>
            {help}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={c !== null}
                onChange={(e) => set('companion', e.target.checked ? { name: '', description: '', fullMember: false, archetype: '' } : null)}
              />
              <span>This character has a companion</span>
            </label>
            {c && (
              <div className={styles.companion}>
                <div className={controls.field}>
                  <label className={controls.label} htmlFor={uid('companion-name')}>
                    Companion name
                  </label>
                  <input id={uid('companion-name')} className={controls.input} value={c.name} placeholder="e.g. Biscuit" onChange={(e) => set('companion', { ...c, name: e.target.value })} />
                </div>
                <div className={controls.field}>
                  <label className={controls.label} htmlFor={uid('companion-desc')}>
                    What is it?
                  </label>
                  <input
                    id={uid('companion-desc')}
                    className={controls.input}
                    value={c.description}
                    placeholder="e.g. a scruffy terrier with one torn ear"
                    onChange={(e) => set('companion', { ...c, description: e.target.value })}
                  />
                </div>
                <label className={styles.check}>
                  <input type="checkbox" checked={c.fullMember} onChange={(e) => set('companion', { ...c, fullMember: e.target.checked, archetype: e.target.checked ? c.archetype || 'bruiser' : '' })} />
                  <span>Play the companion as a full party member with its own turns and rolls</span>
                </label>
                {c.fullMember && (
                  <div className={controls.field}>
                    <label className={controls.label} htmlFor={uid('companion-role')}>
                      Companion role
                    </label>
                    <select id={uid('companion-role')} className={controls.select} value={c.archetype} onChange={(e) => set('companion', { ...c, archetype: e.target.value })}>
                      {archetypes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </fieldset>
        );
      }
      case 'choice': {
        const key = q.id as 'pronouns' | 'age' | 'build';
        const value = answers[key] ?? '';
        return (
          <div key={q.id} className={styles.q}>
            {label}
            <div className={styles.choices}>
              {q.options.map((o) => (
                <button key={o} type="button" className={cx(styles.choice, value === o && styles.choiceOn)} aria-pressed={value === o} onClick={() => set(key, value === o ? '' : o)}>
                  {o}
                </button>
              ))}
              <input
                id={uid(q.id)}
                className={cx(controls.input, styles.choiceInput)}
                value={q.options.includes(value) ? '' : value}
                placeholder="Or type your own"
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
            {help}
          </div>
        );
      }
      default: {
        const key = q.id as 'playerName' | 'name' | 'features' | 'strikingFeature' | 'outfit' | 'signatureItem' | 'trait' | 'flaw';
        const common = { id: uid(q.id), value: answers[key] ?? '', placeholder: q.placeholder, required: q.required };
        return (
          <div key={q.id} className={styles.q}>
            {label}
            {q.type === 'longtext' ? (
              <textarea className={controls.textarea} rows={2} {...common} onChange={(e) => set(key, e.target.value)} />
            ) : (
              <input className={controls.input} {...common} onChange={(e) => set(key, e.target.value)} />
            )}
            {q.id === 'name' && names.length > 0 && (
              <div className={styles.choices} aria-label="Suggested names">
                {names.map((n) => (
                  <button key={n} type="button" className={cx(styles.choice, answers.name === n && styles.choiceOn)} onClick={() => set('name', n)}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {help}
          </div>
        );
      }
    }
  };

  return (
    <div className={styles.form}>
      {diceChoice && (
        <fieldset className={styles.q}>
          <legend className={controls.label}>Dice for this player</legend>
          <div className={styles.choices}>
            {(['digital', 'physical'] as const).map((mode) => (
              <button key={mode} type="button" className={cx(styles.choice, diceChoice.value === mode && styles.choiceOn)} aria-pressed={diceChoice.value === mode} onClick={() => diceChoice.onChange(mode)}>
                {mode === 'digital' ? 'Digital dice' : 'Physical dice'}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {questions.map(field)}
      <div className={styles.surpriseAll}>
        <button type="button" className={controls.btn} disabled={busy !== null || emptySurprisable.length === 0} onClick={() => void surprise(emptySurprisable)}>
          <Icon name="sparkle" /> {busy === 'all' ? 'Thinking…' : 'Surprise me with everything left blank'}
        </button>
        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
