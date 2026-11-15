import type { CampaignPack } from '@/content/pack';
import type { Archetype } from '@/engine/types';
import { newId } from '@/game/session';
import type { Session } from '@/game/session';
import type { GameEvent } from '@/game/store';
import { ProviderError } from '../providers/types';
import { imageKey } from './cache';
import { basePrompt, subjectSignature } from './prompts';
import type { ArtSubject } from './prompts';
import type { ImageProvider, ImageSize } from './providers';
import { JobQueue, PRIORITY } from './queue';

export interface DirectorDeps {
  provider: { provider: ImageProvider; id: string; model: string };
  pack: CampaignPack;
  archetypes: Archetype[];
  getSession(): Session | null;
  patch(change: (s: Session) => Session): void;
  /** Rewrites a brief into a polished prompt (the helper model). May throw: the brief is used instead. */
  writePrompt(brief: string): Promise<string>;
  cache: {
    get(key: string): Promise<Blob | null>;
    put(key: string, blob: Blob, meta: Record<string, string>): Promise<void>;
  };
  /** Draws the name plaque onto a portrait. Returns null when it cannot. */
  composite(image: Blob, name: string, subtitle: string): Promise<Blob | null>;
  concurrency: number;
  onError?(message: string): void;
  /** Injected in tests to make retries instant. */
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
}

const SCENE_PREFETCH = 2;

/**
 * The Art Director: decides what to paint and when, and feeds finished images into the session.
 * Portraits come first (queued the moment the game starts), then the current scene, the party shot,
 * likely next scenes, NPC portraits and finally story moments. Nothing here ever blocks the game.
 */
export class ArtDirector {
  readonly queue: JobQueue<string>;
  private reported = false;
  private disposed = false;

  constructor(private deps: DirectorDeps) {
    this.queue = new JobQueue<string>({
      concurrency: deps.concurrency,
      retries: 2,
      sleep: deps.sleep,
      isFatal: (e) => e instanceof ProviderError && (e.kind === 'auth' || e.kind === 'bad_request' || e.kind === 'aborted'),
    });
  }

  private session(): Session | null {
    return this.disposed ? null : this.deps.getSession();
  }

  private patchImages(change: (images: Session['images']) => Session['images']): void {
    if (!this.disposed) this.deps.patch((s) => ({ ...s, images: change(s.images) }));
  }

  /** Paints a subject (or returns the cached image) and resolves with its cache key. */
  private paint(subject: ArtSubject, size: ImageSize, priority: number, references: string[] = []): Promise<string> {
    const { provider, id, model } = this.deps.provider;
    const key = imageKey({ prompt: subjectSignature(subject, this.deps.pack), provider: id, model, size, references });
    return this.queue.add({
      key,
      priority,
      run: async (signal) => {
        if (await this.deps.cache.get(key)) return key;
        const brief = basePrompt(subject, this.deps.pack);
        const prompt = await this.deps.writePrompt(brief).catch(() => brief);
        const refs = (await Promise.all(references.map((k) => this.deps.cache.get(k)))).filter((b): b is Blob => b !== null);
        const blob = await provider.generate({ prompt: prompt || brief, size, references: refs.length ? refs : undefined, signal });
        await this.deps.cache.put(key, blob, { kind: subject.kind, prompt: prompt || brief, provider: id, model, size });
        this.patchImages((images) => ({ ...images, generated: images.generated + 1 }));
        return key;
      },
    });
  }

  private report(error: unknown): void {
    if (this.reported || this.disposed) return;
    if (error instanceof Error && error.message === 'cancelled') return;
    this.reported = true;
    this.deps.onError?.(`Pictures are paused: ${error instanceof Error ? error.message : String(error)}. The game carries on without them; check the image settings.`);
  }

  private location(id: string | null) {
    if (!id) return null;
    const known = this.deps.pack.world.locations.find((l) => l.id === id);
    if (known) return known;
    const improvised = this.session()?.state.improvisedLocations.find((l) => l.id === id);
    return improvised ? { id: improvised.id, name: improvised.name, imagePrompt: improvised.description, description: improvised.description, connects: [] as string[] } : null;
  }

  /** Called once the game is open: queues everything that should exist from the start. */
  start(): void {
    const session = this.session();
    if (!session) return;
    for (const member of session.state.party) this.portrait(member.id);
    for (const entry of session.state.roster.filter((e) => e.present)) this.npc(entry.id);
    this.scene(session.state.locationId, true);
  }

  private portrait(memberId: string): void {
    const session = this.session();
    const member = session?.state.party.find((p) => p.id === memberId);
    if (!session || !member) return;
    if (session.images.portraits[memberId]) {
      this.maybePartyShot();
      return;
    }
    const artHint = this.deps.archetypes.find((a) => a.id === member.archetypeId)?.artHint ?? '';
    this.paint({ kind: 'portrait', member, artHint }, 'portrait', PRIORITY.portrait)
      .then(async (key) => {
        this.patchImages((images) => ({ ...images, portraits: { ...images.portraits, [memberId]: key } }));
        const raw = await this.deps.cache.get(key);
        const card = raw ? await this.deps.composite(raw, member.name, member.archetypeName).catch(() => null) : null;
        if (card) {
          await this.deps.cache.put(`${key}-card`, card, { kind: 'card', name: member.name });
          this.patchImages((images) => ({ ...images, cards: { ...images.cards, [memberId]: `${key}-card` } }));
        }
        this.maybePartyShot();
      })
      .catch((e: unknown) => this.report(e));
  }

  /** Once every party member has a portrait, paint them together in the opening location. */
  private maybePartyShot(): void {
    const session = this.session();
    if (!session || session.images.party) return;
    const portraits = session.state.party.map((p) => session.images.portraits[p.id]);
    if (portraits.some((k) => !k)) return;
    const opening = this.location(this.deps.pack.manifest.opening_location ?? this.deps.pack.world.locations[0]?.id ?? null);
    if (!opening) return;
    this.paint({ kind: 'party', members: session.state.party, location: opening }, 'landscape', PRIORITY.party, portraits as string[])
      .then((key) => {
        if (this.session()?.images.party) return;
        this.patchImages((images) => ({ ...images, party: key, current: images.current ?? key }));
        this.deps.patch((s) => ({ ...s, chat: [...s.chat, { id: newId('image'), kind: 'image', imageKey: key, caption: 'The party, together at last' }] }));
      })
      .catch((e: unknown) => this.report(e));
  }

  private npc(entryId: string): void {
    const session = this.session();
    const entry = session?.state.roster.find((e) => e.id === entryId);
    if (!session || !entry || session.images.portraits[entryId]) return;
    this.paint({ kind: 'npc', entry }, 'square', PRIORITY.npc)
      .then((key) => this.patchImages((images) => ({ ...images, portraits: { ...images.portraits, [entryId]: key } })))
      .catch((e: unknown) => this.report(e));
  }

  /** Paints a location. The current one is shown when ready; neighbours are prefetched quietly. */
  private scene(locationId: string | null, current: boolean): void {
    const session = this.session();
    const location = this.location(locationId);
    if (!session || !location) return;
    const existing = session.images.scenes[location.id];
    if (existing) {
      if (current) this.patchImages((images) => ({ ...images, current: existing }));
    } else {
      this.paint({ kind: 'scene', location }, 'landscape', current ? PRIORITY.currentScene : PRIORITY.nextScene)
        .then((key) => {
          this.patchImages((images) => ({
            ...images,
            scenes: { ...images.scenes, [location.id]: key },
            current: this.session()?.state.locationId === location.id ? key : images.current,
          }));
        })
        .catch((e: unknown) => this.report(e));
    }
    if (current) {
      for (const next of location.connects.filter((id) => !session.images.scenes[id]).slice(0, SCENE_PREFETCH)) this.scene(next, false);
    }
  }

  private moment(description: string, includeParty: boolean): void {
    const session = this.session();
    if (!session) return;
    const members = includeParty ? session.state.party.filter((p) => p.status !== 'out') : [];
    const refs = members.map((m) => session.images.portraits[m.id]).filter((k): k is string => !!k);
    const location = this.location(session.state.locationId);
    this.paint({ kind: 'moment', description, members, locationName: location?.name ?? 'the scene' }, 'landscape', PRIORITY.moment, refs)
      .then((key) => {
        this.patchImages((images) => ({ ...images, current: key }));
        this.deps.patch((s) => ({ ...s, chat: [...s.chat, { id: newId('image'), kind: 'image', imageKey: key, caption: description }] }));
      })
      .catch((e: unknown) => this.report(e));
  }

  handle(event: GameEvent): void {
    if (this.disposed) return;
    switch (event.type) {
      case 'scene_changed':
        this.scene(event.locationId, true);
        break;
      case 'roster_added':
        this.npc(event.id);
        break;
      case 'image_request':
        this.moment(event.description, event.includeParty);
        break;
      case 'act_advanced': {
        // Get the climax ready: paint the boss before the party meets them.
        const finalAct = event.actIndex >= this.deps.pack.manifest.acts.length - 1;
        if (finalAct) for (const boss of this.deps.pack.cast.filter((c) => c.role === 'boss')) this.paintCast(boss.id);
        break;
      }
    }
  }

  /** Prefetches a cast portrait before the character appears; it is attached when they enter. */
  private paintCast(castId: string): void {
    const entry = this.deps.pack.cast.find((c) => c.id === castId);
    if (!entry || this.session()?.images.portraits[castId]) return;
    this.paint({ kind: 'npc', entry }, 'square', PRIORITY.npc)
      .then((key) => this.patchImages((images) => ({ ...images, portraits: { ...images.portraits, [castId]: key } })))
      .catch((e: unknown) => this.report(e));
  }

  /** True while the picture for the current location is still being painted. */
  paintingCurrent(): boolean {
    const session = this.session();
    if (!session?.state.locationId) return false;
    return !session.images.scenes[session.state.locationId] && this.queue.pending().length > 0 && this.queue.active > 0;
  }

  dispose(): void {
    this.disposed = true;
    this.queue.clear();
  }
}
