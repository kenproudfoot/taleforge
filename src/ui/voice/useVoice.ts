import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { castVoice } from '@/ai/voice/casting';
import type { VoiceInfo } from '@/ai/voice/casting';
import { Narrator } from '@/ai/voice/narrator';
import type { SpeakingRange } from '@/ai/voice/narrator';
import { getSttProvider } from '@/ai/voice/stt';
import type { Listening } from '@/ai/voice/stt';
import { getTtsProvider } from '@/ai/voice/tts';
import { useSettings } from '@/app/settingsStore';
import { resumeAudio } from '@/audio/bus';
import { onGameEvent, useGame } from '@/game/store';

export interface VoiceUi {
  voices: VoiceInfo[];
  /** The voice an NPC currently speaks with. */
  voiceFor(name: string): string;
  setVoice(name: string, voiceId: string): void;
}

export const VoiceContext = createContext<VoiceUi | null>(null);
export const useVoiceUi = () => useContext(VoiceContext);

/** Runs the narrator for the open game: speaks DM text as it streams and reports the sentence being read. */
export function useNarration() {
  const [speaking, setSpeaking] = useState<SpeakingRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const voice = useSettings((s) => s.settings.voice);
  const keys = useSettings((s) => s.settings.keys);
  const update = useSettings((s) => s.update);
  const narrator = useRef<Narrator | null>(null);

  const hints = useCallback(() => {
    const { pack, session } = useGame.getState();
    const out: Record<string, string> = {};
    for (const c of pack?.cast ?? []) if (c.voice) out[c.name.toLowerCase()] = c.voice;
    const state = session?.state;
    const names = [...(state?.party ?? []).map((p) => p.name), ...(pack?.cast ?? []).map((c) => c.name), ...(state?.roster ?? []).map((r) => r.name)];
    return { hints: out, overrides: session?.voiceCast ?? {}, names: [...new Set(names.filter(Boolean))] };
  }, []);

  if (!narrator.current) {
    narrator.current = new Narrator({
      provider: () => {
        const s = useSettings.getState().settings;
        return getTtsProvider(s.voice, s.keys);
      },
      config: () => {
        const v = useSettings.getState().settings.voice;
        return { enabled: v.enabled, narratorVoice: v.narratorVoice, speed: v.speed, npcVoices: v.npcVoices, ...hints() };
      },
      onSpeaking: setSpeaking,
      onError: setError,
    });
  }

  // A changed provider, model or key means a fresh start for the voice service.
  useEffect(() => {
    narrator.current?.resetProvider();
    let live = true;
    getTtsProvider(voice, keys)
      .listVoices()
      .then((list) => live && setVoices(list))
      .catch(() => live && setVoices([]));
    return () => {
      live = false;
    };
  }, [voice.provider, voice.model, keys.openai, keys.elevenlabs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const off = onGameEvent((event) => {
      if (event.type === 'turn_started') narrator.current?.newTurn();
      else if (event.type === 'dm_text') narrator.current?.feed(event.entryId, event.text, event.done);
    });
    return () => {
      off();
      narrator.current?.stop();
    };
  }, []);

  const toggle = useCallback(() => {
    void resumeAudio();
    const next = !useSettings.getState().settings.voice.enabled;
    if (!next) narrator.current?.stop();
    setError(null);
    void update((d) => void (d.voice.enabled = next));
  }, [update]);

  const ui = useMemo<VoiceUi>(
    () => ({
      voices,
      voiceFor: (name) => castVoice(name, voices, voice.narratorVoice, { npcVoices: voice.npcVoices, ...hints() }),
      setVoice: (name, voiceId) => {
        useGame.getState().patch((s) => ({ ...s, voiceCast: { ...s.voiceCast, [name.toLowerCase()]: voiceId } }));
        void useGame.getState().save();
      },
    }),
    [voices, voice.narratorVoice, voice.npcVoices, hints],
  );

  return {
    enabled: voice.enabled,
    speaking,
    error,
    ui,
    toggle,
    skip: useCallback(() => narrator.current?.skip(), []),
    /** Barge-in: silence the DM now. */
    stop: useCallback(() => narrator.current?.stop(), []),
    dismissError: useCallback(() => setError(null), []),
  };
}

export type MicState = 'idle' | 'listening' | 'working';

/**
 * Microphone input. Push-to-talk (hold the button or the Space bar) or toggle mode, per settings.
 * Starting to talk interrupts the Dungeon Master.
 */
export function useMic(options: { onBargeIn(): void; onText(text: string, final: boolean): void }) {
  const speech = useSettings((s) => s.settings.speech);
  const openaiKey = useSettings((s) => s.settings.keys.openai);
  const [state, setState] = useState<MicState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listening = useRef<Listening | null>(null);
  const starting = useRef(false);
  const wantStop = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const available = getSttProvider(speech, openaiKey) !== null;

  const stop = useCallback(async () => {
    if (starting.current) {
      wantStop.current = true;
      return;
    }
    const active = listening.current;
    if (!active) return;
    listening.current = null;
    setState('working');
    try {
      const text = await active.stop();
      if (text) optionsRef.current.onText(text, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInterim('');
      setState('idle');
    }
  }, []);

  const start = useCallback(async () => {
    if (listening.current || starting.current) return;
    const provider = getSttProvider(useSettings.getState().settings.speech, useSettings.getState().settings.keys.openai);
    if (!provider) {
      setError('Speech input needs Chrome, Edge or Safari, or an OpenAI key.');
      return;
    }
    setError(null);
    starting.current = true;
    wantStop.current = false;
    optionsRef.current.onBargeIn();
    void resumeAudio();
    try {
      listening.current = await provider.start(setInterim);
      setState('listening');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      starting.current = false;
    }
    if (wantStop.current) void stop();
  }, [stop]);

  // Hold Space to talk, unless the cursor is in a text field or a dialog is open.
  useEffect(() => {
    if (speech.mode !== 'push') return;
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || !!document.querySelector('dialog[open], [aria-modal="true"]'));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !typing(e.target)) {
        e.preventDefault();
        void start();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (listening.current || starting.current)) {
        e.preventDefault();
        void stop();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [speech.mode, start, stop]);

  useEffect(() => () => listening.current?.cancel(), []);

  return { state, interim, error, available, mode: speech.mode, start, stop, toggle: () => (listening.current ? stop() : start()) };
}
