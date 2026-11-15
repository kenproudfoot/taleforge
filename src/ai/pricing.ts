import type { TextProviderId, Usage } from './providers/types';

export interface Price {
  inputPerM: number;
  outputPerM: number;
}

/**
 * Published list prices in USD per million tokens, matched by model-id prefix (longest prefix wins).
 * Used only for the on-screen cost estimate; providers that publish prices in their model list
 * (OpenRouter) override this table. Unknown models show token counts without a cost.
 */
const PRICES: Array<[TextProviderId, string, Price]> = [
  ['anthropic', 'claude-fable-5-2', { inputPerM: 8, outputPerM: 40 }],
  ['anthropic', 'claude-fable-5', { inputPerM: 10, outputPerM: 50 }],
  ['anthropic', 'claude-opus-5-5', { inputPerM: 4, outputPerM: 20 }],
  ['anthropic', 'claude-opus-5', { inputPerM: 5, outputPerM: 25 }],
  ['anthropic', 'claude-opus-4', { inputPerM: 5, outputPerM: 25 }],
  ['anthropic', 'claude-sonnet-5', { inputPerM: 2, outputPerM: 10 }],
  ['anthropic', 'claude-sonnet-4', { inputPerM: 3, outputPerM: 15 }],
  ['anthropic', 'claude-haiku-5-5', { inputPerM: 0.1, outputPerM: 0.5 }],
  ['anthropic', 'claude-haiku-4-5', { inputPerM: 1, outputPerM: 5 }],
];

export function priceFor(provider: TextProviderId, model: string): Price | undefined {
  return PRICES.filter(([p, prefix]) => p === provider && model.startsWith(prefix)).sort((a, b) => b[1].length - a[1].length)[0]?.[2];
}

/** Estimated cost in USD. Cache reads are billed at about a tenth of input, cache writes at 1.25x. */
export function estimateCost(usage: Usage, price: Price | undefined): number | null {
  if (!price) return null;
  const input = usage.inputTokens + usage.cacheReadTokens * 0.1 + usage.cacheWriteTokens * 1.25;
  return (input * price.inputPerM + usage.outputTokens * price.outputPerM) / 1_000_000;
}

export function formatCost(usd: number | null): string {
  if (usd === null) return '';
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
