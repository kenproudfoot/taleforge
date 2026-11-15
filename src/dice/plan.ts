import type { Rng } from '@/engine/rng';
import type { DieType } from './geometry';

export interface PlannedDie {
  /** The physical die to draw. */
  type: DieType;
  /** The value its top face must show (a d10 shows 0-9; tens dice show 0-9 as 00-90). */
  face: number;
  style: 'normal' | 'tens';
}

export interface RollPlan {
  dice: PlannedDie[];
  /** The result of each requested die, in order: this is what the game uses. */
  values: number[];
}

/**
 * Decides the result of a digital roll with the fair RNG, then says which dice to animate and what each
 * must show. A d100 is drawn as two ten-sided dice (tens and ones; 00 + 0 reads as 100).
 */
export function planRoll(die: number, count: number, rng: Rng): RollPlan {
  const values = Array.from({ length: count }, () => rng.int(die));
  const dice: PlannedDie[] = [];
  for (const value of values) {
    if (die === 100) {
      dice.push({ type: 10, face: Math.floor((value % 100) / 10), style: 'tens' }, { type: 10, face: value % 10, style: 'normal' });
    } else if (die === 10) {
      dice.push({ type: 10, face: value % 10, style: 'normal' });
    } else {
      dice.push({ type: die as DieType, face: value, style: 'normal' });
    }
  }
  return { dice, values };
}

/** Text drawn on a face. Sixes and nines get a dot so they cannot be confused. */
export function faceText(die: PlannedDie, label: number): string {
  if (die.style === 'tens') return label === 0 ? '00' : String(label * 10);
  const text = String(label);
  return (die.type > 6 || die.type === 10) && (label === 6 || label === 9) ? `${text}.` : text;
}
