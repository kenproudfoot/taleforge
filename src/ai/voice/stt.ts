import { meter } from '../meter';
import { providerFetch } from '../providers/http';

export type SttProviderId = 'webspeech' | 'openai';

export interface Listening {
  /** Stops listening and resolves with the transcript (possibly empty). */
  stop(): Promise<string>;
  /** Abandons the recording. */
  cancel(): void;
}

export interface SttProvider {
  id: SttProviderId;
  /** Starts listening. `onInterim` receives the transcript so far, when the provider supports it. */
  start(onInterim?: (text: string) => void): Promise<Listening>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognitionCtor(): (new () => RecognitionLike) | undefined {
  const g = globalThis as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
}

export function webSpeechAvailable(): boolean {
  return recognitionCtor() !== undefined;
}

/** The browser's own speech recognition (Chrome, Edge, Safari). Free, with live interim text. */
export function createWebSpeechStt(): SttProvider {
  return {
    id: 'webspeech',
    start(onInterim) {
      const Ctor = recognitionCtor();
      if (!Ctor) return Promise.reject(new Error('This browser has no built-in speech recognition.'));
      const recognition = new Ctor();
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      let text = '';
      let ended = false;
      let failure: string | null = null;
      let finish: ((value: string) => void) | null = null;
      recognition.onresult = (event) => {
        text = Array.from(event.results)
          .map((r) => r[0]?.transcript ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        onInterim?.(text);
      };
      recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') failure = event.error;
      };
      recognition.onend = () => {
        ended = true;
        finish?.(text);
      };
      recognition.start();
      return Promise.resolve({
        stop: () =>
          new Promise<string>((resolve, reject) => {
            const done = (value: string) => (failure === 'not-allowed' ? reject(new Error('Microphone access was blocked. Allow it in the browser address bar.')) : resolve(value));
            if (ended) return done(text);
            finish = done;
            recognition.stop();
            // Some browsers never fire onend after stop(): do not hang.
            setTimeout(() => done(text), 2500);
          }),
        cancel: () => recognition.abort(),
      });
    },
  };
}

/** Records the microphone and sends the clip to OpenAI for transcription. Works in every browser. */
export function createOpenAiStt(apiKey: string, model: string): SttProvider {
  return {
    id: 'openai',
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot record audio.');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error('Microphone access was blocked. Allow it in the browser address bar.');
      }
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.start();
      const startedAt = Date.now();
      const release = () => stream.getTracks().forEach((t) => t.stop());
      return {
        stop: () =>
          new Promise<string>((resolve, reject) => {
            recorder.onstop = () => {
              release();
              const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
              if (blob.size < 1200) return resolve('');
              const form = new FormData();
              form.append('file', blob, `speech.${(recorder.mimeType || 'audio/webm').includes('mp4') ? 'mp4' : 'webm'}`);
              form.append('model', model);
              meter({ kind: 'listen', provider: 'openai', model, seconds: (Date.now() - startedAt) / 1000 });
              providerFetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form })
                .then((res) => res.json() as Promise<{ text?: string }>)
                .then((data) => resolve((data.text ?? '').trim()), reject);
            };
            recorder.stop();
          }),
        cancel: () => {
          recorder.onstop = release;
          if (recorder.state !== 'inactive') recorder.stop();
          else release();
        },
      };
    },
  };
}

export const DEFAULT_STT_MODEL = 'gpt-4o-mini-transcribe';

/** Which provider "auto" means: the browser's recognition when it exists, otherwise OpenAI if a key is set. */
export function resolveSttProvider(setting: 'auto' | SttProviderId, openaiKey: string, webSpeech = webSpeechAvailable()): SttProviderId | null {
  if (setting === 'webspeech') return webSpeech ? 'webspeech' : openaiKey ? 'openai' : null;
  if (setting === 'openai') return openaiKey ? 'openai' : webSpeech ? 'webspeech' : null;
  return webSpeech ? 'webspeech' : openaiKey ? 'openai' : null;
}

export function getSttProvider(setting: { provider: 'auto' | SttProviderId; model: string }, openaiKey: string): SttProvider | null {
  const id = resolveSttProvider(setting.provider, openaiKey);
  if (id === 'webspeech') return createWebSpeechStt();
  if (id === 'openai') return createOpenAiStt(openaiKey, setting.model || DEFAULT_STT_MODEL);
  return null;
}

/** Transcription-capable OpenAI models, from the live model list. */
export async function listSttModels(openaiKey: string): Promise<string[]> {
  const res = await providerFetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${openaiKey}` } });
  const data = (await res.json()) as { data: Array<{ id: string }> };
  return data.data.map((m) => m.id).filter((id) => /transcribe|whisper/i.test(id)).sort();
}
