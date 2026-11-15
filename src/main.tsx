import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/spectral/400.css';
import '@fontsource/spectral/400-italic.css';
import '@fontsource/spectral/600.css';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/limelight/400.css';
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import './ui/tokens.css';
import { App } from './app/App';

// Test and demo hook: answer all model requests from a script instead of a real provider.
try {
  const script = localStorage.getItem('taleforge:e2e');
  if (script) {
    const { installE2eProvider } = await import('./ai/e2e');
    installE2eProvider(JSON.parse(script) as Parameters<typeof installE2eProvider>[0]);
  }
} catch {
  // ignore a malformed script
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
