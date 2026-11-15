import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicManager, applyVolumes, audioUrl, fetchArrayBuffer, loadCatalog, playSfx, unlockAudioOnGesture } from '@/audio/music';
import { resolveMusic } from '@/audio/tracks';
import type { Catalog, MusicSource } from '@/audio/tracks';
import { useSettings } from '@/app/settingsStore';
import type { Mood } from '@/engine/types';
import { onGameEvent, useGame } from '@/game/store';
import { getUpload, listUploads } from '@/storage/audioUploads';

const manager = new MusicManager();

function sourceKey(s: MusicSource): string {
  return s.kind === 'bundled' ? `bundled:${s.track.id}` : s.kind === 'asset' ? `asset:${s.path}` : `upload:${s.campaignId}:${s.mood}`;
}

/** Keeps the music buses in step with the volume settings and unlocks audio on first use. */
function useAudioPlumbing() {
  const audio = useSettings((s) => s.settings.audio);
  useEffect(() => applyVolumes(audio), [audio]);
  useEffect(() => unlockAudioOnGesture(), []);
}

/** Title music for the menus. */
export function useTitleMusic(): void {
  useAudioPlumbing();
  useEffect(() => {
    let live = true;
    void loadCatalog()
      .then((catalog) => {
        const source = resolveMusic('title', { catalog, genre: '', audioMap: {}, uploads: {}, campaignId: '' });
        if (!live || source?.kind !== 'bundled') return;
        void manager.play(sourceKey(source), () => fetchArrayBuffer(audioUrl(source.track.file)), { gain: source.track.gain, crossfade: 4 });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
}

export interface MusicState {
  mood: Mood;
  /** A mood the players picked by hand, or null to follow the story. */
  override: Mood | null;
  setOverride(mood: Mood | null): void;
  title: string;
}

/** Music and sound effects for the game table: follows the story's mood, crossfading between tracks. */
export function useGameMusic(): MusicState & { onDiceImpact(loudness: number): void } {
  useAudioPlumbing();
  const pack = useGame((s) => s.pack);
  const storyMood = useGame((s) => s.session?.state.musicMood ?? 'exploration');
  const assetUrl = useGame((s) => s.assetUrl);
  const [override, setOverride] = useState<Mood | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [uploads, setUploads] = useState<Partial<Record<Mood, string>>>({});
  const [title, setTitle] = useState('');
  const lastDice = useRef(0);
  const mood = override ?? storyMood;

  useEffect(() => {
    void loadCatalog().then(setCatalog, () => setCatalog(null));
  }, []);
  useEffect(() => {
    if (pack) void listUploads(pack.id).then(setUploads, () => setUploads({}));
  }, [pack]);
  // A new mood from the story releases a manual choice.
  useEffect(() => setOverride(null), [storyMood]);

  useEffect(() => {
    if (!catalog || !pack) return;
    const source = resolveMusic(mood, { catalog, genre: pack.manifest.genre, audioMap: pack.manifest.audio, uploads, campaignId: pack.id });
    if (!source) return;
    setTitle(source.kind === 'bundled' ? source.track.title : source.title);
    const load =
      source.kind === 'bundled'
        ? () => fetchArrayBuffer(audioUrl(source.track.file))
        : source.kind === 'asset'
          ? () => fetchArrayBuffer(assetUrl(source.path) ?? '')
          : async () => {
              const blob = await getUpload(source.campaignId, source.mood);
              if (!blob) throw new Error('upload missing');
              return blob.arrayBuffer();
            };
    const gain = source.kind === 'bundled' ? source.track.gain : source.kind === 'asset' ? source.gain : 1;
    void manager.play(sourceKey(source), load, { gain, crossfade: source.kind === 'bundled' && source.track.source === 'generated' ? 1 : 4 });
  }, [catalog, pack, mood, uploads, assetUrl]);

  useEffect(() => () => manager.stop(1.5), []);

  // Sound effects for rolls and the end of the story.
  useEffect(() => {
    if (!catalog) return;
    return onGameEvent((event) => {
      if (event.type === 'roll_report') {
        const c = event.report.check;
        void playSfx(c.crit ? catalog.sfx.crit : c.success ? catalog.sfx.success : catalog.sfx.fail, 0.7);
      } else if (event.type === 'campaign_ended') {
        void playSfx(event.outcome === 'defeat' ? catalog.sfx.defeat : catalog.sfx.victory, 0.9);
      }
    });
  }, [catalog]);

  const onDiceImpact = useCallback(
    (loudness: number) => {
      const now = performance.now();
      if (!catalog || now - lastDice.current < 45) return;
      lastDice.current = now;
      const file = catalog.sfx.dice[Math.floor(Math.random() * catalog.sfx.dice.length)]!;
      void playSfx(file, 0.25 + loudness * 0.75);
    },
    [catalog],
  );

  return { mood, override, setOverride, title, onDiceImpact };
}
