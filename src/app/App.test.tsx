import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './App';

describe('app shell', () => {
  it('renders the brand and the home hero', () => {
    render(
      <MemoryRouter>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'TaleForge home' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The tale begins');
  });
});
