import { describe, expect, it } from 'vitest';
import { shortName } from './names';

describe('shortName', () => {
  it('skips titles and honorifics', () => {
    expect(shortName('Sir Rowan Greycrest')).toBe('Rowan');
    expect(shortName('Captain Isolde Varr')).toBe('Isolde');
    expect(shortName('Dr. Ada Reyes')).toBe('Ada');
    expect(shortName('Elder Maren Holt')).toBe('Maren');
    expect(shortName('The Tide-Wight')).toBe('Tide-Wight');
    expect(shortName('Brother Osric')).toBe('Osric');
  });
  it('keeps plain names and names made only of titles', () => {
    expect(shortName('Mags')).toBe('Mags');
    expect(shortName('Lyra Vance')).toBe('Lyra');
    expect(shortName('  Sir  ')).toBe('Sir');
    expect(shortName('The Captain')).toBe('The');
  });
});
