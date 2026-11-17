import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CampaignCover, motifFor } from './CampaignCover';

const theme = { accent: '#e0533f', background: '#0a0f13', display_font: 'Spectral' as const, bubble: 'smoke' as const };

describe('CampaignCover', () => {
  it('shows the key art without a sash for a normal campaign', () => {
    render(<CampaignCover title="Ashes" genre="noir-mystery" theme={theme} imageUrl="/art.jpg" />);
    expect(screen.getByAltText('Key art for Ashes')).toBeInTheDocument();
    expect(screen.queryByText('Bonus')).toBeNull();
  });

  it('wears a Bonus sash on a bonus campaign, over key art or the drawn cover', () => {
    const { rerender } = render(<CampaignCover title="The Light" genre="supernatural-horror" theme={theme} imageUrl="/art.jpg" bonus />);
    expect(screen.getByText('Bonus')).toBeInTheDocument();
    expect(screen.getByAltText('Key art for The Light')).toBeInTheDocument();
    rerender(<CampaignCover title="The Light" genre="supernatural-horror" theme={theme} bonus />);
    expect(screen.getByText('Bonus')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Illustrated cover for The Light' })).toBeInTheDocument();
  });

  it('picks a motif from the genre', () => {
    expect(motifFor('noir-mystery')).toBe('noir');
    expect(motifFor('supernatural-horror')).toBe('generic');
  });
});
