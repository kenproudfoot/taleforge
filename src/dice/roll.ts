import { createCryptoRng } from '@/engine/rng';

export type DiceRoller = (die: number, count: number) => Promise<number[]>;

const rng = createCryptoRng();

/** Rolls with the cryptographic RNG and no animation. Used when the 3D tray is unavailable. */
export const quickRoll: DiceRoller = async (die, count) => Array.from({ length: count }, () => rng.int(die));
