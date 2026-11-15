import { useState } from 'react';
import { heroicOptions } from '@/engine/rolls';
import { describeCheck } from '@/engine/rules';
import type { GameState, PendingRoll } from '@/engine/types';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import styles from './RollPrompt.module.css';

interface Props {
  state: GameState;
  physical: boolean;
  onDice(dice: number[]): void;
  onHeroic(choice: 'accept' | 'reroll' | 'plus5'): void;
  /** Digital dice: asks the dice tray for the given dice and resolves with the faces that landed. */
  rollDigital(die: number, count: number): Promise<number[]>;
}

/** "Brann, roll a d20 for a STR check, DC 13" */
export function describeRequest(p: PendingRoll): string {
  const who = p.rollerName.split(' ')[0];
  if (p.stage === 'damage') return `${who} hits! Roll a d${p.die} for damage.`;
  const dice = p.diceCount === 2 ? `two d20 and keep the ${p.mode === 'advantage' ? 'higher' : 'lower'}` : 'a d20';
  if (p.kind === 'attack') return `${who}, roll ${dice} to attack ${p.targetName ?? 'the target'}.`;
  if (p.purpose === 'stabilize') return `${who}, roll ${dice} for a WIS check (DC ${p.dc}) to stabilize ${p.targetName}.`;
  return `${who}, roll ${dice} for a ${p.stat} ${p.kind}${p.dc !== null ? `, DC ${p.dc}` : ''}.`;
}

function NumberPad({ die, count, onDone }: { die: number; count: number; onDone(values: number[]): void }) {
  const [values, setValues] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const add = (n: number) => {
    const next = [...values, n];
    if (next.length >= count) onDone(next);
    else setValues(next);
  };
  const typedValue = Number(typed);
  const typedValid = /^\d{1,3}$/.test(typed) && typedValue >= 1 && typedValue <= die;
  return (
    <div className={styles.pad}>
      {count > 1 && (
        <p className={styles.padStep} aria-live="polite">
          {values.length === 0 ? 'First die' : `First die: ${values[0]}. Now the second die`}
        </p>
      )}
      {die <= 20 ? (
        <div className={styles.keys} style={{ gridTemplateColumns: `repeat(${die <= 10 ? Math.min(die, 5) : 5}, 1fr)` }}>
          {Array.from({ length: die }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={styles.key} onClick={() => add(n)} aria-label={`I rolled ${n}`}>
              {n}
            </button>
          ))}
        </div>
      ) : (
        <form
          className={styles.typed}
          onSubmit={(e) => {
            e.preventDefault();
            if (typedValid) {
              add(typedValue);
              setTyped('');
            }
          }}
        >
          <input
            className={cx(controls.input, styles.typedInput)}
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
            aria-label={`Result on the d${die} (1 to ${die})`}
            placeholder={`1-${die}`}
            autoFocus
          />
          <button type="submit" className={cx(controls.btn, controls.primary)} disabled={!typedValid}>
            Enter
          </button>
        </form>
      )}
    </div>
  );
}

export function RollPrompt({ state, physical, onDice, onHeroic, rollDigital }: Props) {
  const p = state.pendingRoll;
  const [rolling, setRolling] = useState(false);
  if (!p) return null;
  const member = state.party.find((m) => m.id === p.rollerId);

  if (p.stage === 'heroic' && p.main) {
    const options = heroicOptions(state);
    return (
      <section className={cx(styles.prompt, styles.heroic)} aria-label="Heroic Point" style={{ ['--player' as string]: member?.playerColor ?? 'var(--accent)' }}>
        <div className={styles.text}>
          <strong>
            {p.rollerName.split(' ')[0]} rolled {describeCheck(p.main, p.kind === 'attack' ? 'Defense' : 'DC')}: not enough.
          </strong>
          <span>
            Spend a Heroic Point? ({member?.heroicPoints ?? 0} left)
          </span>
        </div>
        <div className={controls.row}>
          {options.includes('plus5') && (
            <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => onHeroic('plus5')}>
              <Icon name="star" /> Add +5
            </button>
          )}
          {options.includes('reroll') && (
            <button type="button" className={controls.btn} onClick={() => onHeroic('reroll')}>
              <Icon name="refresh" /> Reroll
            </button>
          )}
          <button type="button" className={controls.btn} onClick={() => onHeroic('accept')}>
            Keep the result
          </button>
        </div>
      </section>
    );
  }

  const digital = async () => {
    setRolling(true);
    try {
      onDice(await rollDigital(p.die, p.diceCount));
    } finally {
      setRolling(false);
    }
  };

  return (
    <section className={styles.prompt} aria-label="Roll request" style={{ ['--player' as string]: member?.playerColor ?? 'var(--accent)' }}>
      <div className={styles.text}>
        <strong>{describeRequest(p)}</strong>
        <span>
          {p.stage === 'main' ? p.reason : `Damage to ${p.targetName ?? 'the target'}`}
          {p.notes.length ? ` · ${p.notes.join(' · ')}` : ''}
        </span>
      </div>
      {physical ? (
        <NumberPad key={`${p.id}-${p.stage}-${p.heroicSpent}`} die={p.die} count={p.diceCount} onDone={onDice} />
      ) : (
        <button type="button" className={cx(controls.btn, controls.primary, controls.large)} onClick={() => void digital()} disabled={rolling}>
          <Icon name="dice" size={22} /> {rolling ? 'Rolling…' : `Roll ${p.diceCount > 1 ? `${p.diceCount}d${p.die}` : `d${p.die}`}`}
        </button>
      )}
    </section>
  );
}
