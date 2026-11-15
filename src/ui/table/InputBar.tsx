import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DIE_SIZES } from '@/engine/dice';
import type { Session } from '@/game/session';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import styles from './InputBar.module.css';
import { shortName } from '@/engine/names';

interface Props {
  session: Session;
  speaker: string | null;
  busy: boolean;
  onSpeaker(id: string): void;
  onSend(text: string): void;
  onFreeRoll(notation: string): void;
  /** Text dictated by the microphone, appended to the box. */
  dictated?: { id: number; text: string } | null;
  /** Extra controls (the microphone button). */
  children?: ReactNode;
}

export function InputBar({ session, speaker, busy, onSpeaker, onSend, onFreeRoll, dictated, children }: Props) {
  const [text, setText] = useState('');
  const [diceOpen, setDiceOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const ended = session.state.ended !== null;
  const waitingForRoll = session.state.pendingRoll !== null;
  const canSend = !busy && !ended && text.trim().length > 0;

  useEffect(() => {
    if (dictated?.text) setText((t) => (t.trim() ? `${t.trimEnd()} ${dictated.text}` : dictated.text));
  }, [dictated]);

  const send = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
    box.current?.focus();
  };

  const active = session.state.party.find((p) => p.id === speaker);

  return (
    <div className={styles.bar}>
      <div className={styles.speakers} role="radiogroup" aria-label="Speaking as">
        <span className={styles.speakLabel}>Speaking as</span>
        {session.state.party.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={speaker === m.id}
            className={cx(styles.speaker, speaker === m.id && styles.speakerOn)}
            style={{ ['--player' as string]: m.playerColor }}
            onClick={() => onSpeaker(m.id)}
          >
            <span className={styles.dot} />
            {shortName(m.name)}
            {m.status !== 'ok' && <small>({m.status})</small>}
          </button>
        ))}
      </div>
      <div className={styles.inputRow}>
        <div className={styles.diceWrap}>
          <button type="button" className={cx(controls.btn, controls.icon)} aria-label="Roll dice" aria-expanded={diceOpen} onClick={() => setDiceOpen(!diceOpen)} disabled={ended}>
            <Icon name="dice" size={20} />
          </button>
          {diceOpen && (
            <div className={styles.dicePop} role="menu" aria-label="Free roll">
              {DIE_SIZES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="menuitem"
                  className={cx(controls.btn, controls.small)}
                  onClick={() => {
                    onFreeRoll(`1d${d}`);
                    setDiceOpen(false);
                  }}
                >
                  d{d}
                </button>
              ))}
            </div>
          )}
        </div>
        {children}
        <textarea
          ref={box}
          className={cx(controls.textarea, styles.text)}
          rows={1}
          value={text}
          disabled={ended}
          placeholder={ended ? 'The adventure is over.' : waitingForRoll ? 'Waiting for the dice…' : active ? `What does ${shortName(active.name)} do?` : 'Type your action…'}
          aria-label="Your action"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className={cx(controls.btn, controls.primary)} onClick={send} disabled={!canSend}>
          <Icon name="send" /> Send
        </button>
      </div>
    </div>
  );
}
