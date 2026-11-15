import type { Usage } from './providers/types';

/** What a paid (or free) service call was for. */
export type MeterKind = 'dm' | 'helper' | 'image' | 'voice' | 'listen';

/** Token counts an image model reports (OpenAI bills text input, image input and image output separately). */
export interface ImageTokens {
  textInput: number;
  imageInput: number;
  output: number;
}

/**
 * One measured service call, as reported by the code that made it. Only the quantities the provider
 * really reported (or that the app knows exactly, such as characters sent) go here; prices are applied
 * later by `costOf` in `pricing.ts`.
 */
export interface MeterEvent {
  kind: MeterKind;
  provider: string;
  model: string;
  /** Text tokens (DM, helper, Gemini images). */
  usage?: Usage;
  /** OpenAI image tokens. */
  imageTokens?: ImageTokens;
  /** Image size and quality, e.g. "1024x1536 medium". */
  detail?: string;
  /** Characters sent to a voice service. */
  chars?: number;
  /** Seconds of audio sent for transcription. */
  seconds?: number;
  /** Short description, e.g. "portrait", "scene", "recap". */
  label?: string;
}

/** A metered call recorded against a game session, with its estimated cost at the time. */
export interface LedgerEntry extends MeterEvent {
  at: number;
  /** The engine turn it belonged to. */
  turn: number;
  /** Estimated USD, or null when the price is unknown. */
  costUsd: number | null;
}

type Listener = (event: MeterEvent) => void;
const listeners = new Set<Listener>();

/** Subscribes to every metered call. Returns an unsubscribe function. */
export function onMeter(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reports a service call. Listener errors never break the caller. */
export function meter(event: MeterEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // accounting must never break a game
    }
  }
}
