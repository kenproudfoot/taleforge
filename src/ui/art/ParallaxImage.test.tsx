import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDepthForTests, setDepthOverride } from '@/ai/art/depth';
import { useSettings } from '@/app/settingsStore';
import { defaultSettings } from '@/storage/settings';
import { ParallaxImage } from './ParallaxImage';

const setParallax = (on: boolean) => {
  const settings = defaultSettings();
  settings.image.parallax = on;
  useSettings.setState({ settings });
};

describe('ParallaxImage', () => {
  beforeEach(() => resetDepthForTests());

  it('is a plain picture when 3D pictures are off', () => {
    setParallax(false);
    render(<ParallaxImage imageKey="img-x" url="blob:x" alt="Scene: Harbour" />);
    const img = screen.getByRole('img', { name: 'Scene: Harbour' });
    expect(img.tagName).toBe('IMG');
    expect(img.className).not.toMatch(/drift/);
  });

  it('falls back to a slow drift when depth is unavailable', async () => {
    setParallax(true);
    setDepthOverride(async () => {
      throw new Error('offline');
    });
    render(<ParallaxImage imageKey="img-y" url="blob:y" alt="Scene: Harbour" />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Scene: Harbour' }).className).toMatch(/drift/));
    expect(screen.getByRole('img', { name: 'Scene: Harbour' }).tagName).toBe('IMG');
  });
});
