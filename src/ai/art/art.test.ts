import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '@/engine/state';
import type { PartyMember } from '@/engine/types';
import { buildParty } from '@/game/characters';
import { createSession } from '@/game/session';
import type { Session } from '@/game/session';
import { testAnswers, testWorld } from '@/game/testing';
import { resetDbForTests } from '@/storage/db';
import { onMeter } from '../meter';
import type { MeterEvent } from '../meter';
import { ProviderError } from '../providers/types';
import { getCachedImage, hasCachedImage, hashKey, imageKey, putCachedImage } from './cache';
import { ArtDirector } from './director';
import { plaqueLayout } from './plaque';
import { appearanceLock, basePrompt, lookOf, subjectSignature } from './prompts';
import {
  base64ToBlob,
  blobToBase64,
  createCustomImages,
  createGeminiImages,
  createOpenAiImages,
  fillTemplate,
  getImageProvider,
  readPath,
  resolveImageProvider,
  setImageOverride,
} from './providers';
import type { ImageProvider, ImageRequest } from './providers';
import { JobQueue, PRIORITY } from './queue';

const world = testWorld();
const instant = () => Promise.resolve();
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

afterEach(() => {
  vi.unstubAllGlobals();
  setImageOverride(null);
});

describe('JobQueue', () => {
  function deferred() {
    let resolve!: (v: string) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('runs the highest priority first, FIFO within a priority, within the concurrency limit', async () => {
    const order: string[] = [];
    const gates = new Map<string, ReturnType<typeof deferred>>();
    const queue = new JobQueue<string>({ concurrency: 1, sleep: instant });
    const job = (key: string, priority: number) => {
      const gate = deferred();
      gates.set(key, gate);
      return queue.add({ key, priority, run: () => (order.push(key), gate.promise) });
    };
    void job('moment', PRIORITY.moment);
    void job('scene-a', PRIORITY.nextScene);
    void job('portrait', PRIORITY.portrait);
    void job('scene-b', PRIORITY.nextScene);
    expect(order).toEqual(['moment']);
    expect(queue.pending()).toEqual(['portrait', 'scene-a', 'scene-b', 'moment']);
    for (const key of ['moment', 'portrait', 'scene-a', 'scene-b']) {
      gates.get(key)!.resolve(key);
      await flush();
    }
    expect(order).toEqual(['moment', 'portrait', 'scene-a', 'scene-b']);
    expect(queue.state('scene-b')).toBe('done');
    expect(queue.pending()).toEqual([]);
  });

  it('respects concurrency and can change it', async () => {
    const queue = new JobQueue<string>({ concurrency: 2, sleep: instant });
    const gates = [deferred(), deferred(), deferred()];
    gates.forEach((g, i) => void queue.add({ key: `k${i}`, priority: 1, run: () => g.promise }));
    expect(queue.active).toBe(2);
    queue.setConcurrency(3);
    expect(queue.active).toBe(3);
    gates.forEach((g) => g.resolve('x'));
    await flush();
    expect(queue.active).toBe(0);
  });

  it('dedupes by key and raises the priority of a queued job', async () => {
    const queue = new JobQueue<string>({ concurrency: 1, sleep: instant });
    const block = deferred();
    void queue.add({ key: 'busy', priority: 1, run: () => block.promise });
    const run = vi.fn(async () => 'scene');
    const first = queue.add({ key: 'scene', priority: PRIORITY.nextScene, run });
    void queue.add({ key: 'other', priority: PRIORITY.npc, run: async () => 'other' });
    const second = queue.add({ key: 'scene', priority: PRIORITY.currentScene, run });
    expect(second).toBe(first);
    expect(queue.pending()).toEqual(['scene', 'other', 'busy']);
    block.resolve('done');
    expect(await first).toBe('scene');
    expect(run).toHaveBeenCalledTimes(1);
    expect(await queue.add({ key: 'scene', priority: 1, run })).toBe('scene');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries with backoff, gives up after the limit, and does not retry fatal errors', async () => {
    const waits: number[] = [];
    const queue = new JobQueue<string>({
      concurrency: 1,
      retries: 2,
      backoffMs: (n) => 100 * n,
      sleep: async (ms) => void waits.push(ms),
      isFatal: (e) => e instanceof ProviderError && e.kind === 'auth',
    });
    let calls = 0;
    expect(await queue.add({ key: 'flaky', priority: 1, run: async () => (++calls < 3 ? Promise.reject(new Error('503')) : 'ok') })).toBe('ok');
    expect(waits).toEqual([100, 200]);
    await expect(queue.add({ key: 'broken', priority: 1, run: async () => Promise.reject(new Error('always')) })).rejects.toThrow('always');
    expect(queue.state('broken')).toBe('failed');
    let authCalls = 0;
    await expect(queue.add({ key: 'auth', priority: 1, run: async () => (authCalls++, Promise.reject(new ProviderError('auth', 'bad key'))) })).rejects.toThrow('bad key');
    expect(authCalls).toBe(1);
    // A failed key can be tried again later.
    expect(await queue.add({ key: 'broken', priority: 1, run: async () => 'fixed' })).toBe('fixed');
  });

  it('clear cancels everything and notifies listeners', async () => {
    const queue = new JobQueue<string>({ concurrency: 1, sleep: instant });
    const seen = vi.fn();
    queue.subscribe(seen);
    let signal: AbortSignal | undefined;
    const running = queue.add({ key: 'a', priority: 1, run: (s) => ((signal = s), new Promise(() => undefined)) });
    const waiting = queue.add({ key: 'b', priority: 1, run: async () => 'b' });
    queue.clear();
    await expect(running).rejects.toThrow('cancelled');
    await expect(waiting).rejects.toThrow('cancelled');
    expect(signal?.aborted).toBe(true);
    expect(seen).toHaveBeenCalled();
    expect(queue.pending()).toEqual([]);
  });
});

describe('image cache', () => {
  beforeEach(async () => resetDbForTests());
  it('keys are stable and change with any input', () => {
    const base = { prompt: 'a castle', provider: 'openai', model: 'm', size: 'landscape' };
    expect(imageKey(base)).toBe(imageKey({ ...base }));
    expect(imageKey(base)).toMatch(/^img-[0-9a-f]{16}$/);
    const variants = [{ ...base, prompt: 'a castle!' }, { ...base, provider: 'gemini' }, { ...base, model: 'n' }, { ...base, size: 'square' }, { ...base, references: ['x'] }];
    expect(new Set(variants.map(imageKey)).size).toBe(5);
    expect(variants.map(imageKey)).not.toContain(imageKey(base));
    expect(hashKey('')).toHaveLength(16);
  });
  it('stores and reads blobs in IndexedDB', async () => {
    expect(await getCachedImage('img-x')).toBeNull();
    await putCachedImage('img-x', new Blob(['png'], { type: 'image/png' }), { kind: 'scene' });
    expect(await hasCachedImage('img-x')).toBe(true);
    // fake-indexeddb clones Blobs structurally; a real browser returns the Blob itself.
    expect(await getCachedImage('img-x')).not.toBeNull();
  });
});

describe('image providers', () => {
  const png = btoa('PNGDATA');
  it('converts base64 both ways', async () => {
    const blob = base64ToBlob(`data:image/jpeg;base64,${png}`, 'image/jpeg');
    expect(blob.type).toBe('image/jpeg');
    expect(await blobToBase64(blob)).toBe(png);
  });
  it('custom endpoint: fills the template safely and reads the configured path', async () => {
    expect(fillTemplate('{"p": "{{prompt}}", "w": {{width}}, "h": {{height}}}', { prompt: 'say "hi"\nnow', width: 2, height: 3 })).toBe('{"p": "say \\"hi\\"\\nnow", "w": 2, "h": 3}');
    expect(readPath({ data: [{ b64_json: 'x' }] }, 'data.0.b64_json')).toBe('x');
    expect(readPath({ a: 1 }, 'a.b.c')).toBeUndefined();
    const fetchFn = vi.fn(async () => Response.json({ output: { images: [`data:image/webp;base64,${png}`] } }));
    vi.stubGlobal('fetch', fetchFn);
    const provider = createCustomImages({ url: 'https://img.example/gen', authHeader: 'X-Key', authValue: 'secret', bodyTemplate: '{"prompt": "{{prompt}}", "size": "{{width}}x{{height}}"}', responsePath: 'output.images.0' });
    const blob = await provider.generate({ prompt: 'a "quoted" tower', size: 'portrait' });
    expect(blob.type).toBe('image/webp');
    const [url, init] = fetchFn.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://img.example/gen');
    expect(JSON.parse(init.body as string)).toEqual({ prompt: 'a "quoted" tower', size: '1024x1536' });
    expect((init.headers as Record<string, string>)['X-Key']).toBe('secret');
    expect(await provider.listModels()).toEqual([]);
  });
  it('custom endpoint: accepts raw image responses and image URLs, and explains failures', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }));
    const cfg = { url: 'https://img.example', authHeader: '', authValue: '', bodyTemplate: '{"p":"{{prompt}}"}', responsePath: 'url' };
    expect((await createCustomImages(cfg).generate({ prompt: 'x', size: 'square' })).size).toBe(1);
    vi.stubGlobal('fetch', async (u: RequestInfo | URL) => (String(u).endsWith('.png') ? new Response(new Uint8Array([1, 2])) : Response.json({ url: 'https://cdn.example/a.png' })));
    expect((await createCustomImages(cfg).generate({ prompt: 'x', size: 'square' })).size).toBe(2);
    vi.stubGlobal('fetch', async () => Response.json({ other: 1 }));
    await expect(createCustomImages(cfg).generate({ prompt: 'x', size: 'square' })).rejects.toThrow('No image found at "url"');
    await expect(createCustomImages({ ...cfg, url: '' }).generate({ prompt: 'x', size: 'square' })).rejects.toThrow(/endpoint URL/);
    await expect(createCustomImages({ ...cfg, bodyTemplate: '{bad' }).generate({ prompt: 'x', size: 'square' })).rejects.toThrow(/not valid JSON/);
  });
  it('OpenAI: generations without references, edits with them, quality, metering and model listing', async () => {
    const usage = { input_tokens: 60, output_tokens: 1568, input_tokens_details: { text_tokens: 50, image_tokens: 10 } };
    const fetchFn = vi.fn(async (u: RequestInfo | URL) =>
      String(u).endsWith('/models') ? Response.json({ data: [{ id: 'gpt-5' }, { id: 'gpt-image-2' }, { id: 'dall-e-3' }, { id: 'gpt-realtime' }] }) : Response.json({ data: [{ b64_json: png }], usage }),
    );
    vi.stubGlobal('fetch', fetchFn);
    const events: MeterEvent[] = [];
    const off = onMeter((e) => events.push(e));
    const openai = createOpenAiImages('sk', 'gpt-image-2', 'low');
    expect((await openai.listModels()).map((m) => m.id)).toEqual(['gpt-image-2', 'dall-e-3']);
    await openai.generate({ prompt: 'a tower', size: 'landscape', label: 'scene' });
    const [url1, init1] = fetchFn.mock.calls[1]! as unknown as [string, RequestInit];
    expect(url1).toBe('https://api.openai.com/v1/images/generations');
    expect(JSON.parse(init1.body as string)).toEqual({ model: 'gpt-image-2', prompt: 'a tower', size: '1536x1024', n: 1, quality: 'low' });
    expect(events[0]).toEqual({ kind: 'image', provider: 'openai', model: 'gpt-image-2', label: 'scene', detail: '1536x1024 low', imageTokens: { textInput: 50, imageInput: 10, output: 1568 } });
    await openai.generate({ prompt: 'the party', size: 'landscape', references: [new Blob(['a']), new Blob(['b'])] });
    const [url2, init2] = fetchFn.mock.calls[2]! as unknown as [string, RequestInit];
    expect(url2).toBe('https://api.openai.com/v1/images/edits');
    const form = init2.body as FormData;
    expect(form.getAll('image[]')).toHaveLength(2);
    expect(form.get('size')).toBe('1536x1024');
    expect(form.get('quality')).toBe('low');
    // Older models do not take a quality, and a reply without usage is still counted.
    fetchFn.mockImplementation(async () => Response.json({ data: [{ b64_json: png }] }));
    await createOpenAiImages('sk', 'dall-e-3', 'high').generate({ prompt: 'x', size: 'square' });
    expect(JSON.parse(((fetchFn.mock.calls[3] as unknown as [string, RequestInit])[1]).body as string)).not.toHaveProperty('quality');
    expect(events[2]).toMatchObject({ kind: 'image', model: 'dall-e-3', detail: '1024x1024', imageTokens: undefined });
    off();
  });
  it('Gemini: sends references inline and reads the image part', async () => {
    const fetchFn = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: png } }] } }] }));
    vi.stubGlobal('fetch', fetchFn);
    const blob = await createGeminiImages('g', 'gemini-image').generate({ prompt: 'a tower', size: 'portrait', references: [new Blob(['ref'], { type: 'image/jpeg' })] });
    expect(blob.type).toBe('image/png');
    const body = JSON.parse((fetchFn.mock.calls[0]! as unknown as [string, RequestInit])[1].body as string);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('image/jpeg');
    expect(body.contents[0].parts[1]).toEqual({ text: 'a tower' });
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('2:3');
    vi.stubGlobal('fetch', async () => Response.json({ candidates: [{ content: { parts: [{ text: 'no' }] } }] }));
    await expect(createGeminiImages('g', 'm').generate({ prompt: 'x', size: 'square' })).rejects.toThrow(/no image/);
  });
  it('chooses a provider from settings and keys', () => {
    const custom = { url: '', authHeader: '', authValue: '', bodyTemplate: '', responsePath: '' };
    const s = (provider: 'auto' | 'none' | 'openai' | 'gemini' | 'custom', url = '') => ({ provider, model: '', custom: { ...custom, url } });
    expect(resolveImageProvider(s('auto'), { openai: 'o', gemini: 'g' })).toBe('openai');
    expect(resolveImageProvider(s('auto'), { openai: '', gemini: 'g' })).toBe('gemini');
    expect(resolveImageProvider(s('auto'), { openai: '', gemini: '' })).toBeNull();
    expect(resolveImageProvider(s('none'), { openai: 'o', gemini: 'g' })).toBeNull();
    expect(resolveImageProvider(s('gemini'), { openai: 'o', gemini: '' })).toBeNull();
    expect(resolveImageProvider(s('custom', 'https://x'), { openai: '', gemini: '' })).toBe('custom');
    expect(resolveImageProvider(s('custom'), { openai: '', gemini: '' })).toBeNull();
    expect(getImageProvider(s('auto'), { openai: '', gemini: '' })).toBeNull();
    expect(getImageProvider(s('auto'), { openai: 'o', gemini: '' })?.id).toBe('openai');
  });
});

describe('prompts and plaque', () => {
  const session = () => {
    const state = createGame(world.campaign, buildParty(testAnswers(), world.archetypes, world.campaign));
    return createSession({ campaignId: world.pack.id, campaignTitle: 'x', state, dm: { provider: 'mock', model: 'm' }, diceMode: 'digital' });
  };
  it('writes complete prompts with the campaign art style and no lettering', () => {
    const s = session();
    const portrait = basePrompt({ kind: 'portrait', member: s.state.party[1]!, artHint: 'broad stance' }, world.pack);
    expect(portrait).toContain('Brann, a knight');
    expect(portrait).toContain('carrying A notched war-axe');
    expect(portrait).toContain('accompanied by Biscuit, a scruffy terrier');
    expect(portrait).toContain('broad stance');
    expect(portrait).toContain(world.pack.manifest.art_style);
    expect(portrait).toContain('No text, letters');
    const scene = basePrompt({ kind: 'scene', location: world.pack.world.locations[1]! }, world.pack);
    expect(scene).toContain('The Dead Tide Causeway: an ancient pale stone causeway');
    const party = basePrompt({ kind: 'party', members: s.state.party, location: world.pack.world.locations[0]! }, world.pack);
    expect(party).toMatch(/Lyra Vance.*; Brann/);
    expect(basePrompt({ kind: 'npc', entry: world.pack.cast.find((c) => c.role === 'boss')! }, world.pack)).toContain('a menacing antagonist');
    expect(basePrompt({ kind: 'moment', description: 'the vault opens', members: [], locationName: 'the reliquary' }, world.pack)).toContain('the vault opens');
    expect(subjectSignature({ kind: 'scene', location: world.pack.world.locations[1]! }, world.pack)).toContain('the-sunken-crown|');
  });
  it('locks every character’s look into the prompt, word for word, and maps reference images', () => {
    const s = session();
    const [lyra, brann] = s.state.party as [PartyMember, PartyMember];
    const custom: PartyMember = { ...brann, profile: { ...brann.profile, features: 'purple hair, green eyes', strikingFeature: 'clown makeup face', outfit: 'black leather' } };
    expect(lookOf(custom)).toContain('purple hair, green eyes; clown makeup face; wearing black leather');
    const one = appearanceLock({ kind: 'portrait', member: custom, artHint: '' });
    expect(one).toContain('The character must look exactly like this');
    expect(one).toContain('purple hair');
    expect(one).not.toContain('reference image');
    const group = appearanceLock({ kind: 'party', members: [lyra, custom], location: world.pack.world.locations[0]! }, 1);
    expect(group).toContain(`Character 1 (reference image 1): ${lookOf(lyra)}`);
    expect(group).toContain('Character 2: ');
    expect(group).toContain('clown makeup face');
    expect(group).toContain('Match each referenced character');
    // Names stay out of the image prompt; places and NPCs get no lock.
    expect(group).not.toContain(custom.name);
    expect(appearanceLock({ kind: 'scene', location: world.pack.world.locations[1]! })).toBe('');
  });
  it('lays the plaque out inside the image, scaling the name to fit', () => {
    for (const [w, h] of [
      [1024, 1536],
      [512, 768],
    ] as const) {
      for (const name of ['Bo', 'Lyra Vance', 'Captain Isolde Varr of the Kittiwake']) {
        const l = plaqueLayout(w, h, name.length);
        expect(l.x).toBeGreaterThanOrEqual(0);
        expect(l.x + l.width).toBeLessThanOrEqual(w);
        expect(l.y + l.height).toBeLessThan(h);
        expect(l.nameSize).toBeGreaterThan(0);
        expect(l.nameSize).toBeLessThanOrEqual(l.height * 0.42 + 1);
      }
    }
    expect(plaqueLayout(1024, 1536, 34).nameSize).toBeLessThan(plaqueLayout(1024, 1536, 4).nameSize);
  });
});

describe('ArtDirector', () => {
  function setup(options: { fail?: (req: ImageRequest) => Error | null } = {}) {
    const state = createGame(world.campaign, buildParty(testAnswers(), world.archetypes, world.campaign));
    let session: Session = createSession({ campaignId: world.pack.id, campaignTitle: 'x', state, dm: { provider: 'mock', model: 'm' }, diceMode: 'digital' });
    const store = new Map<string, Blob>();
    const requests: ImageRequest[] = [];
    const errors: string[] = [];
    const provider: ImageProvider = {
      id: 'openai',
      listModels: async () => [],
      async generate(req) {
        requests.push(req);
        const failure = options.fail?.(req);
        if (failure) throw failure;
        return new Blob([req.prompt], { type: 'image/png' });
      },
    };
    const director = new ArtDirector({
      provider: { provider, id: 'openai', model: 'img-1' },
      pack: world.pack,
      archetypes: world.archetypes,
      getSession: () => session,
      patch: (change) => {
        session = change(session);
      },
      writePrompt: async (brief) => `polished: ${brief.slice(0, 40)}`,
      cache: { get: async (k) => store.get(k) ?? null, put: async (k, b) => void store.set(k, b) },
      composite: async (_image, name) => new Blob([`card:${name}`]),
      concurrency: 2,
      onError: (m) => errors.push(m),
      sleep: instant,
    });
    return {
      director,
      requests,
      errors,
      store,
      get session() {
        return session;
      },
      set session(s: Session) {
        session = s;
      },
    };
  }

  it('starts with portraits, then the current scene and prefetches, then the party shot', async () => {
    const t = setup();
    t.director.start();
    await flush(30);
    const kinds = t.requests.map((r) => r.size);
    expect(kinds.slice(0, 2)).toEqual(['portrait', 'portrait']);
    const images = t.session.images;
    expect(Object.keys(images.portraits).sort()).toEqual(['pc-brann', 'pc-lyra-vance']);
    expect(Object.keys(images.cards).sort()).toEqual(['pc-brann', 'pc-lyra-vance']);
    expect(await t.store.get(images.cards['pc-brann']!)!.text()).toBe('card:Brann');
    expect(Object.keys(images.scenes).sort()).toEqual(['brinewick', 'causeway']);
    expect(images.party).not.toBeNull();
    expect(images.current).toBe(images.scenes.brinewick);
    const partyRequest = t.requests.find((r) => r.references?.length === 2)!;
    expect(partyRequest.size).toBe('landscape');
    expect(partyRequest.prompt).toMatch(/^polished: /);
    // The helper's rewrite is followed by each character's look, tied to their portrait.
    const [lyra, brann] = t.session.state.party as [PartyMember, PartyMember];
    expect(partyRequest.prompt).toContain(`Character 1 (reference image 1): ${lookOf(lyra)}`);
    expect(partyRequest.prompt).toContain(`Character 2 (reference image 2): ${lookOf(brann)}`);
    expect(t.requests.filter((r) => r.size === 'portrait').every((r) => r.prompt.includes('The character must look exactly like this'))).toBe(true);
    expect(t.requests.find((r) => r.size === 'landscape' && !r.references)?.prompt).not.toContain('must look exactly');
    expect(t.session.chat.at(-1)).toMatchObject({ kind: 'image', caption: 'The party, together at last' });
    expect(images.generated).toBe(t.requests.length);
    expect(t.director.paintingCurrent()).toBe(false);
  });

  it('never pays twice for the same image', async () => {
    const t = setup();
    t.director.start();
    await flush(30);
    const count = t.requests.length;
    const again = setup();
    for (const [k, v] of t.store) again.store.set(k, v);
    again.director.start();
    await flush(30);
    expect(again.requests).toHaveLength(0);
    expect(Object.keys(again.session.images.scenes)).toHaveLength(2);
    expect(count).toBeGreaterThan(0);
  });

  it('shows a cached scene at once on a scene change and paints new ones, prefetching neighbours', async () => {
    const t = setup();
    t.director.start();
    await flush(30);
    const brinewick = t.session.images.scenes.brinewick;
    t.session = { ...t.session, state: { ...t.session.state, locationId: 'causeway' } };
    t.director.handle({ type: 'scene_changed', locationId: 'causeway' });
    await flush(30);
    expect(t.session.images.current).toBe(t.session.images.scenes.causeway);
    expect(t.session.images.scenes).toHaveProperty('drowned-gate');
    t.session = { ...t.session, state: { ...t.session.state, locationId: 'brinewick' } };
    t.director.handle({ type: 'scene_changed', locationId: 'brinewick' });
    expect(t.session.images.current).toBe(brinewick);
    t.director.handle({ type: 'scene_changed', locationId: 'nowhere' });
  });

  it('paints NPCs when they enter, moments on request, and the boss before the final act', async () => {
    const t = setup();
    t.session = { ...t.session, state: { ...t.session.state, roster: [{ ...world.pack.cast[2]!, maxHp: 9, conditions: [], improvised: false, present: true, status: 'active' }] } };
    t.director.handle({ type: 'roster_added', id: 'tide-wight' });
    await flush(20);
    expect(t.session.images.portraits['tide-wight']).toBeDefined();
    expect(t.requests[0]!.size).toBe('square');
    t.director.handle({ type: 'image_request', description: 'the vault door opens', includeParty: false });
    await flush(20);
    expect(t.session.chat.at(-1)).toMatchObject({ kind: 'image', caption: 'the vault door opens' });
    expect(t.session.images.current).toBe((t.session.chat.at(-1) as { imageKey: string }).imageKey);
    expect(t.requests.at(-1)!.prompt).not.toContain('must look exactly');
    // A moment that names a party member shows them, in their own look, even without includeParty.
    t.director.handle({ type: 'image_request', description: 'Brann hauls the chain as the gate groans', includeParty: false });
    await flush(20);
    expect(t.requests.at(-1)!.prompt).toContain(lookOf(t.session.state.party[1]!));
    expect(t.requests.at(-1)!.prompt).not.toContain(lookOf(t.session.state.party[0]!));
    t.director.handle({ type: 'act_advanced', actIndex: 2 });
    await flush(20);
    expect(t.session.images.portraits['drowned-king']).toBeDefined();
    t.director.handle({ type: 'act_advanced', actIndex: 1 });
    t.director.handle({ type: 'turn_started' });
  });

  it('reports a broken image service once and keeps the game going', async () => {
    const t = setup({ fail: () => new ProviderError('auth', 'invalid key') });
    t.director.start();
    await flush(30);
    expect(t.errors).toHaveLength(1);
    expect(t.errors[0]).toMatch(/Pictures are paused: invalid key/);
    expect(t.session.images.portraits).toEqual({});
  });

  it('retries transient failures', async () => {
    let failures = 0;
    const t = setup({ fail: (req) => (req.size === 'portrait' && failures++ < 1 ? new ProviderError('server', 'busy', 503) : null) });
    t.director.start();
    await flush(40);
    expect(Object.keys(t.session.images.portraits)).toHaveLength(2);
    expect(t.errors).toEqual([]);
  });

  it('stops working after dispose', async () => {
    const t = setup();
    t.director.dispose();
    t.director.start();
    t.director.handle({ type: 'scene_changed', locationId: 'causeway' });
    await flush(10);
    expect(t.requests).toEqual([]);
  });
});
