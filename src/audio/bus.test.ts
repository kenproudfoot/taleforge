import { describe, expect, it } from 'vitest';
import { DUCKED_LEVEL, duckLevel, setDucked, setHushed } from './bus';

describe('music ducking', () => {
  it('silences the music under a preview, lowers it under a voice, and restores it when both end', () => {
    expect(duckLevel()).toBe(1);
    setDucked(true);
    expect(duckLevel()).toBe(DUCKED_LEVEL);
    setHushed(true);
    expect(duckLevel()).toBe(0);
    setDucked(false);
    expect(duckLevel()).toBe(0);
    setHushed(false);
    expect(duckLevel()).toBe(1);
    setHushed(false);
    expect(duckLevel()).toBe(1);
  });
});
