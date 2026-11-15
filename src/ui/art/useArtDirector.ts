import { useEffect, useState } from 'react';
import { getCachedImage, putCachedImage } from '@/ai/art/cache';
import { ArtDirector } from '@/ai/art/director';
import { compositePlaque } from '@/ai/art/plaque';
import { PROMPT_WRITER_SYSTEM } from '@/ai/art/prompts';
import { DEFAULT_IMAGE_MODEL, getImageProvider, resolveImageProvider } from '@/ai/art/providers';
import { askHelper } from '@/ai/helper';
import { useSettings } from '@/app/settingsStore';
import { skinArchetypes } from '@/content/pack';
import { onGameEvent, useGame } from '@/game/store';

/** Runs the Art Director for the open game. Returns whether the current scene is being painted. */
export function useArtDirector(): { painting: boolean; error: string | null; dismiss(): void } {
  const sessionId = useGame((s) => s.session?.id ?? null);
  const image = useSettings((s) => s.settings.image);
  const keys = useSettings((s) => s.settings.keys);
  const [painting, setPainting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { pack, core } = useGame.getState();
    if (!sessionId || !pack || !core) return;
    const provider = getImageProvider(image, keys);
    const id = resolveImageProvider(image, keys) ?? 'custom';
    if (!provider) return;
    const theme = pack.manifest.theme;
    const director = new ArtDirector({
      provider: { provider, id, model: image.model || DEFAULT_IMAGE_MODEL[id] || id },
      pack,
      archetypes: skinArchetypes(core.archetypes, pack),
      getSession: () => {
        const s = useGame.getState().session;
        return s?.id === sessionId ? s : null;
      },
      patch: (change) => useGame.getState().patch(change),
      writePrompt: (brief) => askHelper({ system: PROMPT_WRITER_SYSTEM, user: brief, maxTokens: 400, label: 'picture prompt' }),
      cache: { get: getCachedImage, put: putCachedImage },
      composite: (blob, name, subtitle) => compositePlaque(blob, name, subtitle, { accent: theme.accent, background: theme.background, font: `"${theme.display_font}", Georgia, serif` }),
      concurrency: image.concurrency,
      onError: setError,
    });
    const update = () => setPainting(director.paintingCurrent());
    const offQueue = director.queue.subscribe(() => {
      update();
      void useGame.getState().save();
    });
    const offGame = onGameEvent((event) => director.handle(event));
    director.start();
    update();
    return () => {
      offQueue();
      offGame();
      director.dispose();
      setPainting(false);
    };
    // Restart the director when the game, the provider or its key changes.
  }, [sessionId, image.provider, image.model, image.quality, image.concurrency, image.custom.url, keys.openai, keys.gemini]); // eslint-disable-line react-hooks/exhaustive-deps

  return { painting, error, dismiss: () => setError(null) };
}
