import { useState } from 'react';
import { useSettings } from '@/app/settingsStore';
import { useGame } from '@/game/store';
import { useArtDirector } from '../art/useArtDirector';
import { MusicControl } from '../audio/MusicControl';
import { useGameMusic } from '../audio/useMusic';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { MicButton } from '../voice/MicButton';
import { VoiceContext, useMic, useNarration } from '../voice/useVoice';
import voiceStyles from '../voice/voice.module.css';
import { GameTablePage } from './GameTablePage';

/** The game table with its live services attached: narration, microphone, and (later) art and music. */
export function PlayPage() {
  const narration = useNarration();
  const art = useArtDirector();
  const music = useGameMusic();
  const [dictated, setDictated] = useState<{ id: number; text: string } | null>(null);
  const mic = useMic({
    onBargeIn: narration.stop,
    onText: (text) => {
      if (useSettings.getState().settings.speech.autoSend && !useGame.getState().busy) void useGame.getState().send(text);
      else setDictated((d) => ({ id: (d?.id ?? 0) + 1, text }));
    },
  });

  return (
    <VoiceContext.Provider value={narration.ui}>
      <GameTablePage
        slots={{
          speaking: narration.speaking,
          onReplay: narration.replay,
          names: narration.names,
          painting: art.painting,
          onDiceImpact: music.onDiceImpact,
          dictated,
          input: <MicButton mic={mic} />,
          topBar: (
            <>
              <MusicControl music={music} />
              {narration.speaking && (
                <button type="button" className={cx(controls.btn, controls.small)} onClick={narration.skip} title="Skip the line being read">
                  <Icon name="skip" size={14} /> Skip
                </button>
              )}
              <button
                type="button"
                className={cx(controls.btn, controls.small, narration.enabled && voiceStyles.voiceOn)}
                onClick={narration.toggle}
                aria-pressed={narration.enabled}
                title={narration.enabled ? 'The Dungeon Master reads aloud. Click to mute the voice.' : 'Turn on the Dungeon Master voice'}
              >
                <Icon name={narration.enabled ? 'volume' : 'mute'} size={14} /> Voice
              </button>
            </>
          ),
          overlay: (
            <>
              {(narration.error ?? art.error) && (
                <div className={voiceStyles.note} role="status">
                  <Icon name="alert" />
                  <span>{narration.error ?? art.error}</span>
                  <button type="button" className={cx(controls.btn, controls.small)} onClick={narration.error ? narration.dismissError : art.dismiss}>
                    Dismiss
                  </button>
                </div>
              )}
            </>
          ),
        }}
      />
    </VoiceContext.Provider>
  );
}
