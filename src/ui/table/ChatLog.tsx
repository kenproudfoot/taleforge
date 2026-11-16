import { useEffect, useRef, useState } from 'react';
import { parseNarration } from '@/ai/dm/narration';
import { describeCheck } from '@/engine/rules';
import type { RollReport } from '@/engine/types';
import type { ChatEntry, Session } from '@/game/session';
import type { PlaytestFeedback } from '@/game/playtest';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { useStoredImage } from '../useStoredImage';
import { Avatar, DmAvatar } from './Avatar';
import styles from './ChatLog.module.css';

interface Props {
  session: Session;
  busy: boolean;
  onRetry(): void;
  /** Sentence currently being read aloud: entry id and character range. */
  speaking?: { entryId: string; start: number; end: number } | null;
  onOpenImage?(imageKey: string): void;
  /** Playtest reactions per DM message; null hides the feedback buttons. */
  feedback?: Record<string, PlaytestFeedback> | null;
  onFeedback?(entryId: string, rating: PlaytestFeedback['rating'] | null, note?: string): void;
}

/** Thumbs up/down (and an optional note) on a DM message, for the playtest log. */
function FeedbackBar({ entryId, value, onFeedback }: { entryId: string; value: PlaytestFeedback | undefined; onFeedback: NonNullable<Props['onFeedback']> }) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState(value?.note ?? '');
  return (
    <div className={styles.feedback}>
      <button
        type="button"
        className={cx(styles.feedbackBtn, value?.rating === 'up' && styles.feedbackOn)}
        aria-pressed={value?.rating === 'up'}
        aria-label="Good reply"
        title="Good reply (playtest)"
        onClick={() => {
          setNoting(false);
          onFeedback(entryId, value?.rating === 'up' ? null : 'up');
        }}
      >
        <Icon name="thumbUp" size={14} />
      </button>
      <button
        type="button"
        className={cx(styles.feedbackBtn, value?.rating === 'down' && styles.feedbackOn)}
        aria-pressed={value?.rating === 'down'}
        aria-label="Problem with this reply"
        title="Problem with this reply (playtest)"
        onClick={() => {
          if (value?.rating === 'down') {
            setNoting(false);
            onFeedback(entryId, null);
          } else {
            onFeedback(entryId, 'down', note);
            setNoting(true);
          }
        }}
      >
        <Icon name="thumbDown" size={14} />
      </button>
      {noting ? (
        <form
          className={styles.feedbackForm}
          onSubmit={(e) => {
            e.preventDefault();
            onFeedback(entryId, 'down', note);
            setNoting(false);
          }}
        >
          <input className={cx(controls.input, styles.feedbackInput)} aria-label="What went wrong? (optional)" placeholder="What went wrong? (optional)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <button type="submit" className={cx(controls.btn, controls.small)}>
            Save note
          </button>
        </form>
      ) : (
        value?.rating === 'down' && value.note && <span className={styles.feedbackNote}>{value.note}</span>
      )}
    </div>
  );
}

function outcome(report: RollReport): { label: string; tone: 'good' | 'bad' | 'crit' } {
  const c = report.check;
  if (c.crit) return { label: 'Critical success', tone: 'crit' };
  if (c.complication) return { label: 'Failure, with a complication', tone: 'bad' };
  return c.success ? { label: 'Success', tone: 'good' } : { label: 'Failure', tone: 'bad' };
}

export function RollCard({ report, free }: { report: RollReport; free?: boolean }) {
  const c = report.check;
  if (free) {
    return (
      <div className={cx(styles.roll, styles.rollFree)} role="status">
        <Icon name="dice" size={18} className={styles.rollIcon} />
        <div className={styles.rollBody}>
          <span className={styles.rollTitle}>
            <strong>{report.rollerName}</strong> · {report.reason}
          </span>
          <span className={styles.rollMath}>
            {c.dice.join(' + ')}
            {c.modifier ? ` ${c.modifier > 0 ? '+' : '-'} ${Math.abs(c.modifier)}` : ''} = <strong>{c.total}</strong>
          </span>
        </div>
      </div>
    );
  }
  const o = outcome(report);
  const kind = report.kind === 'attack' ? `${report.stat} attack` : `${report.stat} ${report.kind}`;
  return (
    <div className={cx(styles.roll, styles[`roll_${o.tone}`])} role="status">
      <Icon name="dice" size={18} className={styles.rollIcon} />
      <div className={styles.rollBody}>
        <span className={styles.rollTitle}>
          <strong>{report.rollerName}</strong> · {kind}
          {report.targetName ? ` on ${report.targetName}` : ''} · {report.reason}
        </span>
        <span className={styles.rollMath}>
          {c.dice.length > 1 && <span className={styles.rollDice}>rolled {c.dice.join(' and ')} · </span>}
          {describeCheck(c, report.kind === 'attack' ? 'Defense' : 'DC')}
        </span>
        {report.damage && (
          <span className={styles.rollMath}>
            Damage: <strong>{report.damage.total}</strong>
            {report.damage.crit ? ' (critical)' : ''}
          </span>
        )}
        {report.notes.length > 0 && <span className={styles.rollNotes}>{report.notes.join(' · ')}</span>}
      </div>
      <span className={styles.rollOutcome}>
        <Icon name={o.tone === 'bad' ? 'x' : o.tone === 'crit' ? 'star' : 'check'} size={15} /> {o.label}
      </span>
    </div>
  );
}

function DmText({ entry, speaking }: { entry: Extract<ChatEntry, { kind: 'dm' }>; speaking: Props['speaking'] }) {
  const range = speaking && speaking.entryId === entry.id ? speaking : null;
  if (range) {
    // While a sentence is being read aloud, show the raw text with that sentence highlighted.
    return (
      <p className={styles.narration}>
        {entry.text.slice(0, range.start)}
        <mark className={styles.speaking}>{entry.text.slice(range.start, range.end)}</mark>
        {entry.text.slice(range.end)}
      </p>
    );
  }
  return (
    <>
      {parseNarration(entry.text).map((segment, i) =>
        segment.type === 'speech' ? (
          <blockquote key={i} className={styles.speech}>
            <cite>{segment.speaker}</cite>
            <span>{segment.text}</span>
          </blockquote>
        ) : (
          <p key={i} className={styles.narration}>
            {segment.text}
          </p>
        ),
      )}
    </>
  );
}

function ImageEntry({ entry, onOpen }: { entry: Extract<ChatEntry, { kind: 'image' }>; onOpen?: (key: string) => void }) {
  const url = useStoredImage(entry.imageKey);
  if (!url) return null;
  return (
    <figure className={styles.image}>
      <button type="button" onClick={() => onOpen?.(entry.imageKey)} aria-label={`Open image: ${entry.caption}`}>
        <img src={url} alt={entry.caption} />
      </button>
      <figcaption>{entry.caption}</figcaption>
    </figure>
  );
}

export function ChatLog({ session, busy, onRetry, speaking, onOpenImage, feedback, onFeedback }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = session.chat.at(-1);
  const lastSize = last?.kind === 'dm' ? last.text.length : 0;

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [session.chat.length, lastSize, busy]);

  // Keep the newest line in view when the log itself is resized (the roll prompt opening, a window resize).
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const waiting = busy && !session.state.pendingRoll && last?.kind !== 'dm';

  return (
    <div
      ref={scroller}
      className={styles.log}
      role="log"
      aria-label="Game chat"
      aria-live="polite"
      data-busy={busy ? 'true' : 'false'}
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {session.chat.map((entry) => {
        switch (entry.kind) {
          case 'dm':
            return (
              <div key={entry.id} className={cx(styles.row, styles.dmRow)}>
                <DmAvatar />
                <div className={cx(styles.bubble, styles.dm)}>
                  <DmText entry={entry} speaking={speaking} />
                  {feedback && onFeedback && !(busy && entry === last) && <FeedbackBar entryId={entry.id} value={feedback[entry.id]} onFeedback={onFeedback} />}
                </div>
              </div>
            );
          case 'player': {
            const member = session.state.party.find((p) => p.id === entry.characterId);
            return (
              <div key={entry.id} className={cx(styles.row, styles.playerRow)} style={{ ['--player' as string]: member?.playerColor ?? 'var(--accent)' }}>
                <div className={cx(styles.bubble, styles.player)}>
                  <span className={styles.who}>
                    {member?.name ?? 'Player'}
                    {member ? <small> · {member.playerName}</small> : null}
                  </span>
                  <p>{entry.text}</p>
                </div>
                <Avatar name={member?.name ?? 'Player'} archetypeId={member?.archetypeId} color={member?.playerColor} imageKey={member ? session.images.portraits[member.id] : null} />
              </div>
            );
          }
          case 'chip':
            return (
              <div key={entry.id} className={styles.chipRow}>
                <span className={cx(controls.chip, entry.tone === 'good' && controls.chipGood, entry.tone === 'bad' && controls.chipBad, entry.tone === 'info' && styles.chipInfo)}>{entry.text}</span>
              </div>
            );
          case 'roll':
            return (
              <div key={entry.id} className={styles.chipRow}>
                <RollCard report={entry.report} free={entry.free} />
              </div>
            );
          case 'image':
            return <ImageEntry key={entry.id} entry={entry} onOpen={onOpenImage} />;
          case 'error':
            return (
              <div key={entry.id} className={styles.error} role="alert">
                <Icon name="alert" />
                <span>{entry.text}</span>
                {entry === last && (
                  <button type="button" className={cx(controls.btn, controls.small)} onClick={onRetry} disabled={busy}>
                    <Icon name="refresh" size={14} /> Try again
                  </button>
                )}
              </div>
            );
        }
      })}
      {waiting && (
        <div className={cx(styles.row, styles.dmRow)}>
          <DmAvatar />
          <div className={cx(styles.bubble, styles.dm, styles.thinking)} aria-label="The Dungeon Master is thinking">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
  );
}
