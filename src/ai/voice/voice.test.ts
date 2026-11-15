import { afterEach, describe, expect, it, vi } from 'vitest';
import { castVoice, genderHint } from './casting';
import type { VoiceInfo } from './casting';
import { FALLBACK_RETRY_MS, Narrator } from './narrator';
import type { NarratorConfig, SpeakingRange } from './narrator';
import { cleanForSpeech, speechUnits } from './sentences';
import { resolveSttProvider } from './stt';
import { OPENAI_VOICES, createElevenLabsTts, createOpenAiTts, getTtsProvider, resolveTtsProvider, setTtsOverride } from './tts';
import type { TtsProvider } from './tts';

afterEach(() => {
  vi.unstubAllGlobals();
  setTtsOverride(null);
});

describe('speechUnits', () => {
  it('splits finished text into sentences with exact source ranges', () => {
    const text = 'The fog closes in. You hear water!  What do you do?';
    const units = speechUnits(text, true);
    expect(units.map((u) => u.text)).toEqual(['The fog closes in.', 'You hear water!', 'What do you do?']);
    for (const u of units) expect(text.slice(u.start, u.end)).toBe(u.text);
    expect(units.every((u) => u.speaker === null)).toBe(true);
  });
  it('holds back the unfinished tail while streaming, and units never change as text grows', () => {
    const full = 'Dusk falls over Brinewick. The bay is leaving. Lyra, what do you do?';
    let previous: string[] = [];
    for (let i = 1; i <= full.length; i++) {
      const now = speechUnits(full.slice(0, i), false).map((u) => u.text);
      expect(now.slice(0, previous.length)).toEqual(previous);
      previous = now;
    }
    expect(previous).toEqual(['Dusk falls over Brinewick.', 'The bay is leaving.']);
    expect(speechUnits('Dusk falls', false)).toEqual([]);
    expect(speechUnits('Dusk falls', true).map((u) => u.text)).toEqual(['Dusk falls']);
    expect(speechUnits('It ends.', false)).toEqual([]);
    expect(speechUnits('It ends. ', false).map((u) => u.text)).toEqual(['It ends.']);
  });
  it('gives NPC speech its own unit and speaker', () => {
    const text = 'The elder turns. «Elder Maren: You came. Thank the tides.» Rain falls.«Pip: This way!»';
    const units = speechUnits(text, true);
    expect(units.map((u) => [u.speaker, u.text])).toEqual([
      [null, 'The elder turns.'],
      ['Elder Maren', 'You came. Thank the tides.'],
      [null, 'Rain falls.'],
      ['Pip', 'This way!'],
    ]);
    expect(text.slice(units[1]!.start, units[1]!.end)).toBe('«Elder Maren: You came. Thank the tides.»');
  });
  it('waits for a speech marker to close while streaming', () => {
    expect(speechUnits('She nods. «Pip: Wait for', false).map((u) => u.text)).toEqual(['She nods.']);
    expect(speechUnits('She nods. «Pip: Wait for', true).map((u) => u.text)).toEqual(['She nods.', 'Pip: Wait for']);
    expect(speechUnits('He mutters «not a name at all» and leaves.', true).map((u) => [u.speaker, u.text])).toEqual([
      [null, 'He mutters'],
      [null, 'not a name at all'],
      [null, 'and leaves.'],
    ]);
  });
  it('does not break on abbreviations, initials, decimals or ellipses', () => {
    expect(speechUnits('Dr. Holt met Mr. J. Varr at 3.5 fathoms. Then... silence.', true).map((u) => u.text)).toEqual(['Dr. Holt met Mr. J. Varr at 3.5 fathoms.', 'Then...', 'silence.']);
    expect(speechUnits('"Run!" she cries. (Too late.) Gone', true).map((u) => u.text)).toEqual(['"Run!"', 'she cries.', '(Too late.)', 'Gone']);
  });
  it('skips units with nothing to say and cleans markdown', () => {
    expect(speechUnits('... \n\n *** ', true)).toEqual([]);
    expect(cleanForSpeech('**Bold** and _soft_\n- a list item\n# Heading «x»')).toBe('Bold and soft a list item Heading x');
  });
});

describe('voice casting', () => {
  const voices: VoiceInfo[] = [
    { id: 'narr', name: 'Narrator', gender: 'male' },
    { id: 'f1', name: 'F1', gender: 'female' },
    { id: 'f2', name: 'F2', gender: 'female' },
    { id: 'm1', name: 'M1', gender: 'male' },
  ];
  it('keeps the narrator voice for narration and when NPC voices are off', () => {
    expect(castVoice(null, voices, 'narr')).toBe('narr');
    expect(castVoice('Pip', voices, 'narr', { npcVoices: false })).toBe('narr');
    expect(castVoice(null, voices, 'missing')).toBe('narr');
    expect(castVoice('Pip', [], 'whatever')).toBe('whatever');
  });
  it('gives each NPC a stable voice that is not the narrator', () => {
    const a = castVoice('Elder Maren', voices, 'narr');
    expect(a).not.toBe('narr');
    expect(castVoice(' elder maren ', voices, 'narr')).toBe(a);
    const assigned = new Set(['Pip', 'Captain Varr', 'Brother Osric', 'Wrecker', 'The Drowned King', 'Tide-Wight'].map((n) => castVoice(n, voices, 'narr')));
    expect(assigned.size).toBeGreaterThan(1);
    expect(assigned.has('narr')).toBe(false);
    expect(castVoice('Pip', [voices[0]!], 'narr')).toBe('narr');
  });
  it('matches gender hints and honours overrides', () => {
    for (const name of ['Elder Maren', 'Isolde', 'Anna', 'Queen Mab']) {
      expect(['f1', 'f2']).toContain(castVoice(name, voices, 'narr', { hints: { [name.toLowerCase()]: 'elderly woman, low and steady' } }));
    }
    expect(castVoice('Osric', voices, 'narr', { hints: { osric: 'old man, soft' } })).toBe('m1');
    expect(castVoice('Osric', voices, 'narr', { overrides: { osric: 'f2' } })).toBe('f2');
    expect(castVoice('Osric', voices, 'narr', { overrides: { osric: 'gone' }, hints: { osric: 'old man' } })).toBe('m1');
    expect([genderHint('young boy, quick'), genderHint('woman, dry and clipped'), genderHint('gravelly')]).toEqual(['male', 'female', '']);
  });
});

describe('provider selection', () => {
  it('auto prefers OpenAI, then ElevenLabs, then the browser', () => {
    expect(resolveTtsProvider('auto', { openai: 'k', elevenlabs: 'e' })).toBe('openai');
    expect(resolveTtsProvider('auto', { openai: '', elevenlabs: 'e' })).toBe('elevenlabs');
    expect(resolveTtsProvider('auto', { openai: '', elevenlabs: '' })).toBe('browser');
    expect(resolveTtsProvider('elevenlabs', { openai: 'k', elevenlabs: '' })).toBe('browser');
    expect(resolveTtsProvider('browser', { openai: 'k', elevenlabs: 'e' })).toBe('browser');
    expect(getTtsProvider({ provider: 'auto', model: '' }, { openai: 'k', elevenlabs: '' }).id).toBe('openai');
    expect(getTtsProvider({ provider: 'elevenlabs', model: '' }, { openai: '', elevenlabs: 'e' }).id).toBe('elevenlabs');
    expect(getTtsProvider({ provider: 'auto', model: '' }, { openai: '', elevenlabs: '' }).id).toBe('browser');
  });
  it('speech input falls back sensibly', () => {
    expect(resolveSttProvider('auto', 'k', true)).toBe('webspeech');
    expect(resolveSttProvider('auto', 'k', false)).toBe('openai');
    expect(resolveSttProvider('auto', '', false)).toBeNull();
    expect(resolveSttProvider('openai', '', true)).toBe('webspeech');
    expect(resolveSttProvider('openai', 'k', true)).toBe('openai');
    expect(resolveSttProvider('webspeech', 'k', false)).toBe('openai');
  });
});

describe('TTS adapters', () => {
  it('OpenAI: requests speech with the model, voice and speed, and lists TTS models', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/models') ? Response.json({ data: [{ id: 'gpt-5' }, { id: 'tts-1' }, { id: 'gpt-4o-mini-tts' }] }) : new Response(new Uint8Array([1, 2, 3])),
    );
    vi.stubGlobal('fetch', fetchFn);
    const tts = createOpenAiTts('sk-o', 'gpt-4o-mini-tts');
    expect(await tts.listModels()).toEqual(['gpt-4o-mini-tts', 'tts-1']);
    expect(await tts.listVoices()).toBe(OPENAI_VOICES);
    const utterance = await tts.prepare('Hello there.', 'onyx', { speed: 1.1 });
    expect(typeof utterance.play).toBe('function');
    const [url, init] = fetchFn.mock.calls[1]! as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(JSON.parse(init.body as string)).toEqual({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: 'Hello there.', response_format: 'mp3', speed: 1.1 });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-o');
  });
  it('ElevenLabs: lists voices with gender labels and requests speech', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/voices')) return Response.json({ voices: [{ voice_id: 'v1', name: 'Rachel', labels: { gender: 'female', age: 'young', accent: 'american' } }] });
      if (u.endsWith('/models')) return Response.json([{ model_id: 'eleven_turbo', can_do_text_to_speech: true }, { model_id: 'sts', can_do_text_to_speech: false }]);
      return new Response(new Uint8Array([1]));
    });
    vi.stubGlobal('fetch', fetchFn);
    const tts = createElevenLabsTts('xi', 'eleven_turbo');
    expect(await tts.listVoices()).toEqual([{ id: 'v1', name: 'Rachel', gender: 'female', description: 'young, american' }]);
    expect(await tts.listModels()).toEqual(['eleven_turbo']);
    await tts.prepare('Hi.', 'v1', { speed: 1 });
    const [url, init] = fetchFn.mock.calls[2]! as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/v1?output_format=mp3_44100_128');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Hi.', model_id: 'eleven_turbo' });
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('xi');
  });
  it('surfaces provider errors', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'bad key' } }, { status: 401 }));
    await expect(createOpenAiTts('x', 'm').prepare('Hi', 'onyx', { speed: 1 })).rejects.toMatchObject({ kind: 'auth' });
  });
});

/** A fake TTS provider whose playback is finished by the test. */
function fakeTts(options: { failPrepare?: boolean } = {}) {
  const log: string[] = [];
  const playing: Array<{ text: string; finish(): void }> = [];
  const provider: TtsProvider = {
    id: 'openai',
    listVoices: async () => [
      { id: 'narr', name: 'N' },
      { id: 'npc', name: 'P' },
    ],
    listModels: async () => [],
    async prepare(text, voice, { signal }) {
      if (options.failPrepare) throw new Error('quota exceeded');
      log.push(`prepare:${voice}:${text}`);
      return {
        play: () =>
          new Promise<void>((resolve) => {
            if (signal?.aborted) return resolve();
            log.push(`play:${text}`);
            const entry = { text, finish: resolve };
            playing.push(entry);
            signal?.addEventListener('abort', () => {
              log.push(`cut:${text}`);
              resolve();
            });
          }),
      };
    },
  };
  return { provider, log, playing };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(times = 6) {
  for (let i = 0; i < times; i++) await tick();
}

function makeNarrator(tts: ReturnType<typeof fakeTts>, config: Partial<NarratorConfig> = {}) {
  const ranges: Array<SpeakingRange | null> = [];
  const ducks: boolean[] = [];
  const errors: string[] = [];
  const full: NarratorConfig = { enabled: true, narratorVoice: 'narr', speed: 1, npcVoices: true, overrides: {}, hints: {}, ...config };
  const narrator = new Narrator({ provider: () => tts.provider, config: () => full, onSpeaking: (r) => ranges.push(r), onError: (m) => errors.push(m), duck: (on) => ducks.push(on) });
  return { narrator, ranges, ducks, errors, config: full };
}

describe('Narrator', () => {
  it('speaks streamed sentences in order, starting before the text is complete', async () => {
    const tts = fakeTts();
    const { narrator, ranges, ducks } = makeNarrator(tts);
    narrator.feed('e1', 'The fog closes in. You hear', false);
    await settle();
    expect(tts.log).toEqual(['prepare:narr:The fog closes in.', 'play:The fog closes in.']);
    expect(ranges).toEqual([{ entryId: 'e1', start: 0, end: 18 }]);
    expect(ducks).toEqual([true]);
    narrator.feed('e1', 'The fog closes in. You hear water. «Pip: Run!»', true);
    await settle();
    // Later sentences are fetched ahead while the first is still playing.
    expect(tts.log).toContain('prepare:narr:You hear water.');
    expect(tts.log).toContain('prepare:npc:Run!');
    expect(tts.log.filter((l) => l.startsWith('play:'))).toHaveLength(1);
    tts.playing[0]!.finish();
    await settle();
    tts.playing[1]!.finish();
    await settle();
    tts.playing[2]!.finish();
    await settle();
    expect(tts.log.filter((l) => l.startsWith('play:'))).toEqual(['play:The fog closes in.', 'play:You hear water.', 'play:Run!']);
    expect(ranges.at(-1)).toBeNull();
    expect(ducks).toEqual([true, false]);
    expect(narrator.speaking).toBe(false);
  });

  it('does not repeat sentences when the same text is fed again', async () => {
    const tts = fakeTts();
    const { narrator } = makeNarrator(tts);
    narrator.feed('e1', 'One. Two. ', false);
    narrator.feed('e1', 'One. Two. ', false);
    narrator.feed('e1', 'One. Two. ', true);
    await settle();
    expect(tts.log.filter((l) => l.startsWith('prepare:'))).toHaveLength(2);
  });

  it('skip moves to the next line; stop silences the rest of the turn', async () => {
    const tts = fakeTts();
    const { narrator } = makeNarrator(tts);
    narrator.feed('e1', 'One. Two. Three. ', false);
    await settle();
    narrator.skip();
    await settle();
    expect(tts.log).toContain('cut:One.');
    expect(tts.log).toContain('play:Two.');
    narrator.stop();
    await settle();
    expect(tts.log).toContain('cut:Two.');
    expect(tts.log).not.toContain('play:Three.');
    narrator.feed('e1', 'One. Two. Three. Four. ', true);
    await settle();
    expect(tts.log.some((l) => l.includes('Four'))).toBe(false);
    narrator.newTurn();
    narrator.feed('e2', 'A new turn. ', true);
    await settle();
    expect(tts.log).toContain('play:A new turn.');
  });

  it('stays quiet when voice is off, without replaying old text when turned on', async () => {
    const tts = fakeTts();
    const { narrator, config } = makeNarrator(tts, { enabled: false });
    narrator.feed('e1', 'Silent sentence. ', false);
    await settle();
    expect(tts.log).toEqual([]);
    config.enabled = true;
    narrator.feed('e1', 'Silent sentence. Spoken sentence. ', true);
    await settle();
    expect(tts.log.filter((l) => l.startsWith('play:'))).toEqual(['play:Spoken sentence.']);
  });

  it('plays a long reply completely and in order', async () => {
    const tts = fakeTts();
    const { narrator } = makeNarrator(tts);
    narrator.feed('e1', 'Alpha one. Beta two. Gamma three. Delta four. Epsilon five. Zeta six. ', true);
    for (let i = 0; i < 6; i++) {
      await settle();
      tts.playing[i]?.finish();
    }
    await settle();
    expect(tts.log.filter((l) => l.startsWith('play:'))).toEqual(['Alpha one.', 'Beta two.', 'Gamma three.', 'Delta four.', 'Epsilon five.', 'Zeta six.'].map((t) => `play:${t}`));
  });

  it('reports a failing voice service once and falls back to the browser voice', async () => {
    const tts = fakeTts({ failPrepare: true });
    const { narrator, errors } = makeNarrator(tts);
    narrator.feed('e1', 'One. Two. ', true);
    await settle(12);
    // jsdom has no speechSynthesis, so the fallback itself fails; the point is the user is told why.
    expect(errors[0]).toMatch(/voice service failed \(quota exceeded\)/);
    expect(errors.filter((e) => e.includes('voice service failed'))).toHaveLength(1);
    expect(narrator.speaking).toBe(false);
    narrator.resetProvider();
  });

  it('goes back to the voice service a minute after it failed', async () => {
    const options = { failPrepare: true };
    const tts = fakeTts(options);
    let clock = 1_000;
    const errors: string[] = [];
    const full: NarratorConfig = { enabled: true, narratorVoice: 'narr', speed: 1, npcVoices: true, overrides: {}, hints: {} };
    const narrator = new Narrator({ provider: () => tts.provider, config: () => full, onSpeaking: () => undefined, onError: (m) => errors.push(m), duck: () => undefined, now: () => clock });
    narrator.feed('e1', 'One. ', true);
    await settle(12);
    expect(errors[0]).toMatch(/try it again in a minute/);
    // The service recovers, but within the minute the browser voice is still used.
    options.failPrepare = false;
    narrator.feed('e2', 'Two. ', true);
    await settle(12);
    expect(tts.log.some((l) => l.startsWith('prepare:'))).toBe(false);
    clock += FALLBACK_RETRY_MS + 1;
    narrator.feed('e3', 'Three. ', true);
    await settle(12);
    expect(tts.log).toContain('prepare:narr:Three.');
    expect(errors.filter((e) => e.includes('voice service failed'))).toHaveLength(1);
    narrator.stop();
  });
});
