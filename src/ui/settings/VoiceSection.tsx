import { useEffect, useRef, useState } from 'react';
import { describeProviderError } from '@/ai/providers';
import type { VoiceInfo } from '@/ai/voice/casting';
import { listSttModels, resolveSttProvider, webSpeechAvailable } from '@/ai/voice/stt';
import { DEFAULT_TTS_MODEL, getTtsProvider, resolveTtsProvider } from '@/ai/voice/tts';
import { useSettings } from '@/app/settingsStore';
import { resumeAudio } from '@/audio/bus';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import styles from './settings.module.css';

const PROVIDER_NAMES = { openai: 'OpenAI', elevenlabs: 'ElevenLabs', browser: 'this browser' } as const;
const PREVIEW_LINE = 'The torches gutter as you step inside. Somewhere below, a door grinds open. What do you do?';

export function VoiceSection() {
  const voice = useSettings((s) => s.settings.voice);
  const keys = useSettings((s) => s.settings.keys);
  const update = useSettings((s) => s.update);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const stopPreview = useRef<AbortController | null>(null);
  const active = resolveTtsProvider(voice.provider, keys);

  useEffect(() => {
    let live = true;
    setNote(null);
    const provider = getTtsProvider(voice, keys);
    provider
      .listVoices()
      .then((list) => {
        if (!live) return;
        setVoices(list);
        // Pick a sensible narrator when none is chosen or the old choice belongs to another provider.
        if (list.length && !list.some((v) => v.id === voice.narratorVoice)) void update((d) => void (d.voice.narratorVoice = list[0]!.id));
      })
      .catch((e: unknown) => live && (setVoices([]), setNote(describeProviderError(e, PROVIDER_NAMES[active]))));
    provider
      .listModels()
      .then((list) => live && setModels(list))
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
  }, [active, voice.model, keys.openai, keys.elevenlabs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopPreview.current?.abort(), []);

  const preview = async () => {
    stopPreview.current?.abort();
    const abort = new AbortController();
    stopPreview.current = abort;
    setPreviewing(true);
    setNote(null);
    try {
      await resumeAudio();
      const utterance = await getTtsProvider(voice, keys).prepare(PREVIEW_LINE, voice.narratorVoice, { speed: voice.speed, signal: abort.signal });
      await utterance.play();
    } catch (e) {
      if (!abort.signal.aborted) setNote(describeProviderError(e, PROVIDER_NAMES[active]));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="voice-heading">
      <h2 id="voice-heading">Narrator voice</h2>
      <p className={styles.sectionLede}>The Dungeon Master reads every line aloud. Characters in the story get voices of their own.</p>
      <label className={styles.check}>
        <input type="checkbox" checked={voice.enabled} onChange={(e) => void update((d) => void (d.voice.enabled = e.target.checked))} />
        <span>Read the story aloud</span>
      </label>
      <div className={styles.pickerRow}>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="voice-provider">
            Voice service
          </label>
          <select id="voice-provider" className={controls.select} value={voice.provider} onChange={(e) => void update((d) => void ((d.voice.provider = e.target.value as typeof d.voice.provider), (d.voice.model = ''), (d.voice.narratorVoice = '')))}>
            <option value="auto">Automatic (best available)</option>
            <option value="openai">OpenAI{keys.openai ? '' : ' (no key)'}</option>
            <option value="elevenlabs">ElevenLabs{keys.elevenlabs ? '' : ' (no key)'}</option>
            <option value="browser">Browser voice (free)</option>
          </select>
          <span className={controls.hint}>
            Now using {PROVIDER_NAMES[active]}.{active === 'browser' && voice.provider !== 'browser' ? ' Add an OpenAI or ElevenLabs key for natural voices.' : ''}
          </span>
        </div>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="voice-narrator">
            Narrator
          </label>
          <div className={styles.keyInputRow}>
            <select id="voice-narrator" className={controls.select} value={voice.narratorVoice} onChange={(e) => void update((d) => void (d.voice.narratorVoice = e.target.value))} style={{ flex: 1, minWidth: 160 }}>
              {voices.length === 0 && <option value={voice.narratorVoice}>{voice.narratorVoice || 'Default voice'}</option>}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.description ? ` (${v.description})` : ''}
                </option>
              ))}
            </select>
            {previewing ? (
              <button type="button" className={controls.btn} onClick={() => stopPreview.current?.abort()}>
                <Icon name="stop" /> Stop
              </button>
            ) : (
              <button type="button" className={controls.btn} onClick={() => void preview()}>
                <Icon name="play" /> Preview
              </button>
            )}
          </div>
        </div>
      </div>
      <div className={styles.pickerRow}>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="voice-speed">
            Speed: {voice.speed.toFixed(2)}x
          </label>
          <div className={styles.slider}>
            <input id="voice-speed" type="range" min={0.7} max={1.4} step={0.05} value={voice.speed} onChange={(e) => void update((d) => void (d.voice.speed = Number(e.target.value)))} />
          </div>
        </div>
        {active !== 'browser' && (
          <div className={controls.field}>
            <label className={controls.label} htmlFor="voice-model">
              Voice model
            </label>
            {models.length > 0 ? (
              <select id="voice-model" className={controls.select} value={voice.model || DEFAULT_TTS_MODEL[active]} onChange={(e) => void update((d) => void (d.voice.model = e.target.value))}>
                {!models.includes(voice.model || DEFAULT_TTS_MODEL[active]) && <option value={voice.model}>{voice.model || 'Provider default'}</option>}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input id="voice-model" className={controls.input} value={voice.model} placeholder={DEFAULT_TTS_MODEL[active] || 'Provider default'} onChange={(e) => void update((d) => void (d.voice.model = e.target.value.trim()))} />
            )}
          </div>
        )}
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={voice.npcVoices} onChange={(e) => void update((d) => void (d.voice.npcVoices = e.target.checked))} />
        <span>Give story characters their own voices (change any of them from their roster card)</span>
      </label>
      {note && (
        <p role="alert" className={styles.bad}>
          {note}
        </p>
      )}
    </section>
  );
}

export function SpeechSection() {
  const speech = useSettings((s) => s.settings.speech);
  const openaiKey = useSettings((s) => s.settings.keys.openai);
  const update = useSettings((s) => s.update);
  const [models, setModels] = useState<string[]>([]);
  const active = resolveSttProvider(speech.provider, openaiKey);

  useEffect(() => {
    let live = true;
    if (!openaiKey) {
      setModels([]);
      return;
    }
    listSttModels(openaiKey)
      .then((list) => live && setModels(list))
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
  }, [openaiKey]);

  return (
    <section className={styles.section} aria-labelledby="speech-heading">
      <h2 id="speech-heading">Speaking to the Dungeon Master</h2>
      <p className={styles.sectionLede}>Answer by voice or keyboard. Starting to talk interrupts the Dungeon Master, just like at a real table.</p>
      <div className={styles.pickerRow}>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="speech-provider">
            Speech recognition
          </label>
          <select id="speech-provider" className={controls.select} value={speech.provider} onChange={(e) => void update((d) => void (d.speech.provider = e.target.value as typeof d.speech.provider))}>
            <option value="auto">Automatic</option>
            <option value="webspeech">Browser (free; Chrome, Edge, Safari){webSpeechAvailable() ? '' : ': not available here'}</option>
            <option value="openai">OpenAI transcription (every browser){openaiKey ? '' : ': no key'}</option>
          </select>
          <span className={controls.hint}>
            {active === 'webspeech' && 'Now using the browser. Your browser will ask for microphone permission the first time.'}
            {active === 'openai' && 'Now using OpenAI transcription.'}
            {active === null && 'Not available: use Chrome, Edge or Safari, or add an OpenAI key. You can always type instead.'}
          </span>
        </div>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="speech-mode">
            Microphone button
          </label>
          <select id="speech-mode" className={controls.select} value={speech.mode} onChange={(e) => void update((d) => void (d.speech.mode = e.target.value as typeof d.speech.mode))}>
            <option value="push">Push to talk: hold the button or the Space bar</option>
            <option value="toggle">Toggle: click to start, click to finish</option>
          </select>
        </div>
      </div>
      {active === 'openai' && models.length > 0 && (
        <div className={controls.field}>
          <label className={controls.label} htmlFor="speech-model">
            Transcription model
          </label>
          <select id="speech-model" className={controls.select} value={speech.model} onChange={(e) => void update((d) => void (d.speech.model = e.target.value))}>
            <option value="">Default</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className={styles.check}>
        <input type="checkbox" checked={speech.autoSend} onChange={(e) => void update((d) => void (d.speech.autoSend = e.target.checked))} />
        <span>Send what I say straight away (otherwise it lands in the text box for a quick edit)</span>
      </label>
    </section>
  );
}
