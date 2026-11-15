import type { ImageTokens, MeterEvent } from './meter';
import type { TextProviderId, Usage } from './providers/types';

/*
 * List prices used for the on-screen cost estimates, in USD. They are estimates: the provider's bill is
 * the truth, and prices change. Sources, checked 2026-11-15:
 *   Anthropic  https://platform.claude.com/docs/en/about-claude/pricing
 *   OpenAI     https://developers.openai.com/api/docs/pricing and the image generation guide
 * Unknown models show their token, character or picture counts without a cost; Settings → Costs can set
 * a price for pictures and voices the table does not know (a local service, ElevenLabs credits …).
 */

export interface Price {
  inputPerM: number;
  outputPerM: number;
  /** Cache hits per million tokens. Defaults to a tenth of input when unknown. */
  cacheReadPerM?: number;
  /** 5-minute cache writes per million tokens. Defaults to 1.25x input when unknown. */
  cacheWritePerM?: number;
}

const p = (inputPerM: number, outputPerM: number, cacheReadPerM: number, cacheWritePerM: number): Price => ({ inputPerM, outputPerM, cacheReadPerM, cacheWritePerM });

/** Matched by model-id prefix; the longest matching prefix wins. */
const TEXT_PRICES: Array<[TextProviderId, string, Price]> = [
  ['anthropic', 'claude-fable-5-2', p(8, 40, 0.2, 10)],
  ['anthropic', 'claude-fable-5-1', p(10, 50, 0.25, 12.5)],
  ['anthropic', 'claude-fable-5', p(10, 50, 1, 12.5)],
  ['anthropic', 'claude-opus-5-5', p(4, 20, 0.2, 5)],
  ['anthropic', 'claude-opus-5', p(5, 25, 0.5, 6.25)],
  ['anthropic', 'claude-opus-4', p(5, 25, 0.5, 6.25)],
  ['anthropic', 'claude-sonnet-5-5', p(2, 10, 0.1, 2.5)],
  ['anthropic', 'claude-sonnet-5', p(2, 10, 0.2, 2.5)],
  ['anthropic', 'claude-sonnet-4', p(3, 15, 0.3, 3.75)],
  // Haiku 5.5's price for prompts up to 100k tokens; TaleForge prompts stay well under that.
  ['anthropic', 'claude-haiku-5-5', p(0.1, 0.5, 0.01, 0.125)],
  ['anthropic', 'claude-haiku-4-5', p(1, 5, 0.1, 1.25)],
  // OpenAI caches automatically with no write surcharge.
  ['openai', 'gpt-6-astra', p(10, 50, 1, 10)],
  ['openai', 'gpt-6.1-sol', p(2, 10, 0.1, 2)],
  ['openai', 'gpt-6.1-terra', p(1, 5, 0.05, 1)],
  ['openai', 'gpt-6-sol', p(2, 10, 0.2, 2)],
  ['openai', 'gpt-6-luna', p(0.1, 0.5, 0.01, 0.1)],
  ['openai', 'gpt-5.6-sol', p(4, 20, 0.4, 4)],
  ['openai', 'gpt-5.6-terra', p(2, 12, 0.2, 2)],
  ['openai', 'gpt-5.6-luna', p(0.2, 1.2, 0.02, 0.2)],
];

export function priceFor(provider: TextProviderId, model: string): Price | undefined {
  return TEXT_PRICES.filter(([pr, prefix]) => pr === provider && model.startsWith(prefix)).sort((a, b) => b[1].length - a[1].length)[0]?.[2];
}

/** Estimated cost in USD of a text request. */
export function estimateCost(usage: Usage, price: Price | undefined): number | null {
  if (!price) return null;
  const cacheRead = price.cacheReadPerM ?? price.inputPerM * 0.1;
  const cacheWrite = price.cacheWritePerM ?? price.inputPerM * 1.25;
  return (usage.inputTokens * price.inputPerM + usage.cacheReadTokens * cacheRead + usage.cacheWriteTokens * cacheWrite + usage.outputTokens * price.outputPerM) / 1_000_000;
}

interface ImagePrice {
  textInputPerM: number;
  imageInputPerM: number;
  outputPerM: number;
}

/** OpenAI GPT Image token prices, by model-id prefix. */
const OPENAI_IMAGE_PRICES: Array<[string, ImagePrice]> = [
  ['gpt-image-2', { textInputPerM: 5, imageInputPerM: 8, outputPerM: 30 }],
  ['gpt-image-1.5', { textInputPerM: 5, imageInputPerM: 8, outputPerM: 32 }],
  ['gpt-image-1-mini', { textInputPerM: 2, imageInputPerM: 2.5, outputPerM: 8 }],
  ['chatgpt-image-latest', { textInputPerM: 5, imageInputPerM: 8, outputPerM: 32 }],
];

export function imagePriceFor(model: string): ImagePrice | undefined {
  return OPENAI_IMAGE_PRICES.filter(([prefix]) => model.startsWith(prefix)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
}

export function imageTokenCost(tokens: ImageTokens, price: ImagePrice): number {
  return (tokens.textInput * price.textInputPerM + tokens.imageInput * price.imageInputPerM + tokens.output * price.outputPerM) / 1_000_000;
}

/** USD per million characters sent to a voice. */
const VOICE_PRICES: Array<[string, string, number]> = [
  ['openai', 'tts-1-hd', 30],
  ['openai', 'tts-1', 15],
  // Billed per token ($0.60/M text in, $12/M audio out). OpenAI's guide puts it near $0.015 a minute;
  // at about 14 spoken characters a second that is roughly $18 per million characters.
  ['openai', 'gpt-4o-mini-tts', 18],
  ['browser', '', 0],
];

export function voicePricePerMillionChars(provider: string, model: string): number | undefined {
  return VOICE_PRICES.filter(([pr, prefix]) => pr === provider && model.startsWith(prefix)).sort((a, b) => b[1].length - a[1].length)[0]?.[2];
}

/** USD per minute of audio transcribed. */
const LISTEN_PRICES: Array<[string, number]> = [
  ['gpt-4o-mini-transcribe', 0.003],
  ['gpt-4o-transcribe', 0.006],
  ['gpt-transcribe', 0.0045],
  ['whisper', 0.006],
];

export function listenPricePerMinute(provider: string, model: string): number | undefined {
  if (provider === 'webspeech') return 0;
  return LISTEN_PRICES.filter(([prefix]) => model.startsWith(prefix)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
}

/** User-set prices for services the built-in table does not know. Null keeps the built-in estimate. */
export interface PriceOverrides {
  picture: number | null;
  voicePerMillionChars: number | null;
}

export const NO_OVERRIDES: PriceOverrides = { picture: null, voicePerMillionChars: null };

/** Estimated USD for one metered call, or null when no price is known. */
export function costOf(event: MeterEvent, overrides: PriceOverrides = NO_OVERRIDES): number | null {
  switch (event.kind) {
    case 'dm':
    case 'helper': {
      if (!event.usage) return null;
      return estimateCost(event.usage, priceFor(event.provider as TextProviderId, event.model));
    }
    case 'image': {
      if (overrides.picture !== null) return overrides.picture;
      if (event.provider === 'openai' && event.imageTokens) {
        const price = imagePriceFor(event.model);
        return price ? imageTokenCost(event.imageTokens, price) : null;
      }
      return null;
    }
    case 'voice': {
      const perM = overrides.voicePerMillionChars ?? voicePricePerMillionChars(event.provider, event.model);
      return perM === undefined || event.chars === undefined ? null : (event.chars * perM) / 1_000_000;
    }
    case 'listen': {
      const perMin = listenPricePerMinute(event.provider, event.model);
      return perMin === undefined || event.seconds === undefined ? null : (event.seconds / 60) * perMin;
    }
  }
}

export function formatCost(usd: number | null): string {
  if (usd === null) return '';
  if (usd === 0) return '$0';
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

/** Finer-grained cost for per-request tables: shows tenths of a cent. */
export function formatSmallCost(usd: number | null): string {
  if (usd === null) return '—';
  if (usd === 0) return '$0';
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(usd < 0.1 ? 3 : 2)}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
