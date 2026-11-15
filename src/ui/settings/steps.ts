import type { ComponentType } from 'react';
import { KeysSection } from './KeysSection';
import { AudioSection } from './AudioSection';
import { ImageSection } from './ImageSection';
import { ModelsSection } from './ModelsSection';
import { SpeechSection, VoiceSection } from './VoiceSection';

export interface SettingsStep {
  id: string;
  title: string;
  Component: ComponentType;
}

/** The sections shown, in order, by both the first-run wizard and the Settings page. */
export const SETTINGS_STEPS: SettingsStep[] = [
  { id: 'keys', title: 'API keys', Component: KeysSection },
  { id: 'models', title: 'Models', Component: ModelsSection },
  { id: 'voice', title: 'Voice', Component: VoiceSection },
  { id: 'speech', title: 'Speech input', Component: SpeechSection },
  { id: 'images', title: 'Pictures', Component: ImageSection },
  { id: 'audio', title: 'Music', Component: AudioSection },
];
