import type { ComponentType } from 'react';
import { KeysSection } from './KeysSection';
import { ModelsSection } from './ModelsSection';

export interface SettingsStep {
  id: string;
  title: string;
  Component: ComponentType;
}

/** The sections shown, in order, by both the first-run wizard and the Settings page. */
export const SETTINGS_STEPS: SettingsStep[] = [
  { id: 'keys', title: 'API keys', Component: KeysSection },
  { id: 'models', title: 'Models', Component: ModelsSection },
];
