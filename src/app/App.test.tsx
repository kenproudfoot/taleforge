import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/storage/db';
import { loadSettings } from '@/storage/settings';
import { AppRoutes } from './App';
import { resetSettingsStore } from './settingsStore';

beforeEach(async () => {
  await resetDbForTests();
  resetSettingsStore();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('app shell', () => {
  it('renders the brand, the home hero and the first-run notice', async () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'TaleForge home' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('The tale begins');
    expect(screen.getByRole('link', { name: /Start setup/ })).toHaveAttribute('href', '/setup');
  });
});

describe('setup wizard', () => {
  it('walks through keys and models and marks setup complete', async () => {
    const user = userEvent.setup();
    renderAt('/setup');
    await user.click(await screen.findByRole('button', { name: /Get started/ }));
    const next = screen.getByRole('button', { name: /Next/ });
    expect(next).toBeDisabled();
    await user.type(screen.getByLabelText('Anthropic API key'), 'sk-ant-test');
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByRole('heading', { name: 'Models' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('heading', { name: 'Narrator voice' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('heading', { name: 'Speaking to the Dungeon Master' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('heading', { name: 'Pictures' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText(/claude-sonnet-5-5 · Anthropic/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Finish setup/ }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('The tale begins');
    expect(screen.queryByRole('link', { name: /Start setup/ })).not.toBeInTheDocument();
    const stored = await loadSettings();
    expect(stored.settings).toMatchObject({ setupComplete: true, keys: { anthropic: 'sk-ant-test' } });
  });
});
