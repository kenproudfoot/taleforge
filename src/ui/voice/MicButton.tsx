import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import styles from './voice.module.css';
import type { useMic } from './useVoice';

/** Hold to talk (or click to toggle, per settings). */
export function MicButton({ mic }: { mic: ReturnType<typeof useMic> }) {
  const listening = mic.state === 'listening';
  const push = mic.mode === 'push';
  const label = !mic.available ? 'Speech input is not available in this browser' : listening ? 'Listening. Release to finish' : push ? 'Hold to talk' : 'Start talking';
  return (
    <div className={styles.micWrap}>
      <button
        type="button"
        className={cx(controls.btn, controls.icon, styles.mic, listening && styles.micOn)}
        aria-label={label}
        title={push ? 'Hold to talk (or hold Space)' : 'Click to talk, click again to finish'}
        aria-pressed={listening}
        disabled={!mic.available || mic.state === 'working'}
        {...(push
          ? {
              onPointerDown: (e: React.PointerEvent) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                void mic.start();
              },
              onPointerUp: () => void mic.stop(),
              onPointerCancel: () => void mic.stop(),
              onKeyDown: (e: React.KeyboardEvent) => {
                if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
                  e.preventDefault();
                  void mic.start();
                }
              },
              onKeyUp: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') void mic.stop();
              },
            }
          : { onClick: () => void mic.toggle() })}
      >
        <Icon name={mic.state === 'working' ? 'refresh' : 'mic'} size={20} />
      </button>
      {(listening || mic.error) && (
        <div className={cx(styles.micPop, mic.error && styles.micError)} role="status">
          {mic.error ?? (mic.interim || 'Listening…')}
        </div>
      )}
    </div>
  );
}
