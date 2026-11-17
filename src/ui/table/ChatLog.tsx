import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { handoffStart } from '@/ai/dm/narration';
import { speechUnits } from '@/ai/voice/sentences';
import type { SpeechUnit } from '@/ai/voice/sentences';
import { describeCheck } from '@/engine/rules';
import type { RollReport } from '@/engine/types';
import type { ChatEntry, Session } from '@/game/session';
import type { PlaytestFeedback } from '@/game/playtest';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { TIPS, statTip } from '../glossary';
import { useStoredImage } from '../useStoredImage';
import { ParallaxImage } from '../art/ParallaxImage';
import { Avatar, DmAvatar } from './Avatar';
import styles from './ChatLog.module.css';

interface Props {
  session: Session;
  busy: boolean;
  onRetry(): void;
  /** Sentence currently being read aloud: entry id and character range. */
  speaking?: { entryId: string; start: number; end: number } | null;
  /** People in the game (party, cast, roster): used to tell who says a “quoted” line, as the voice does. */
  names?: string[];
  /** Reads one spoken line again (the speaker button on a quote). Absent: no buttons. */
  onReplay?(entryId: string, unit: SpeechUnit): void;
  /** Playtest reactions per DM message; null hides the feedback buttons. */
  feedback?: Record<string, PlaytestFeedback> | null;
  onFeedback?(entryId: string, rating: PlaytestFeedback['rating'] | null, note?: string): void;
  /** Opens a party member's character card (clicking their avatar beside a message). */
  onOpenCard?(memberId: string): void;
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
  if (report.dice) {
    return (
      <div className={cx(styles.roll, styles.rollFree)} role="status" title={TIPS.plainDice}>
        <Icon name="dice" size={18} className={styles.rollIcon} />
        <div className={styles.rollBody}>
          <span className={styles.rollTitle}>
            <strong>{report.rollerName}</strong> · {report.dice} · {report.reason}
          </span>
          <span className={styles.rollMath}>
            {c.dice.join(' + ')}
            {c.modifier ? ` ${c.modifier > 0 ? '+' : '-'} ${Math.abs(c.modifier)}` : ''} = <strong>{c.total}</strong>
          </span>
        </div>
      </div>
    );
  }
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
          <strong>{report.rollerName}</strong> · <span title={statTip(report.stat)}>{kind}</span>
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

/** The speaker button that reads a quoted line again. */
function ReplayButton({ unit, onReplay, entryId }: { unit: SpeechUnit; entryId: string; onReplay: NonNullable<Props['onReplay']> }) {
  return (
    <button type="button" className={styles.replay} onClick={() => onReplay(entryId, unit)} aria-label={`Hear ${unit.speaker ?? 'this line'} again`} title="Hear this line again">
      <Icon name="volume" size={13} />
    </button>
  );
}

type Range = { start: number; end: number } | null;

/** Does `[start, end)` overlap the line being read aloud? */
const overlaps = (range: Range, start: number, end: number) => !!range && range.start < end && range.end > start;

/**
 * Narration and «Name: line» speech from `text[from, to)`, with replay buttons on every spoken line.
 * `range` is the stretch being read aloud right now: it is highlighted in place, so the layout never changes.
 */
function Region({ text, from, to, units, entryId, onReplay, range }: { text: string; from: number; to: number; units: SpeechUnit[]; entryId: string; onReplay: Props['onReplay']; range: Range }) {
  const out: ReactNode[] = [];
  let para: ReactNode[] = [];
  let pos = from;
  const pushText = (piece: string) => {
    if (piece.trim()) para.push(para.length === 0 ? piece.trimStart() : piece);
  };
  const flushText = (end: number) => {
    if (range && overlaps(range, pos, end)) {
      const a = Math.max(pos, range.start);
      const b = Math.min(end, range.end);
      pushText(text.slice(pos, a));
      para.push(
        <mark key={`m${a}`} className={styles.speaking}>
          {text.slice(a, b)}
        </mark>,
      );
      pushText(text.slice(b, end));
    } else {
      pushText(text.slice(pos, end));
    }
    pos = end;
  };
  const closePara = () => {
    const last = para.length - 1;
    if (last >= 0 && typeof para[last] === 'string') para[last] = (para[last] as string).trimEnd();
    if (para.some((p) => typeof p !== 'string' || p.trim())) {
      out.push(
        <p key={`p${out.length}`} className={styles.narration}>
          {para}
        </p>,
      );
    }
    para = [];
  };
  const lit = (unit: SpeechUnit, content: ReactNode) => (overlaps(range, unit.start, unit.end) ? <mark className={styles.speaking}>{content}</mark> : content);
  for (const unit of units) {
    if (unit.speaker === null || unit.start < from || unit.end > to) continue;
    flushText(unit.start);
    if (text[unit.start] === '«') {
      closePara();
      out.push(
        <blockquote key={`q${unit.start}`} className={styles.speech}>
          <cite>
            {unit.speaker}
            {onReplay && <ReplayButton unit={unit} entryId={entryId} onReplay={onReplay} />}
          </cite>
          <span>{lit(unit, unit.text)}</span>
        </blockquote>,
      );
    } else {
      para.push(
        <span key={`i${unit.start}`} className={styles.quote}>
          {lit(unit, text.slice(unit.start, unit.end))}
          {onReplay && <ReplayButton unit={unit} entryId={entryId} onReplay={onReplay} />}
        </span>,
      );
    }
    pos = unit.end;
  }
  flushText(to);
  closePara();
  return <>{out}</>;
}

function DmText({ entry, speaking, streaming, names, onReplay }: { entry: Extract<ChatEntry, { kind: 'dm' }>; speaking: Props['speaking']; streaming: boolean; names: string[]; onReplay: Props['onReplay'] }) {
  const text = entry.text;
  // The sentence being read aloud is highlighted inside the same formatted layout as the finished message.
  const range = speaking && speaking.entryId === entry.id ? speaking : null;
  const split = streaming ? -1 : handoffStart(text);
  const handoff = split > 0 ? split : text.length;
  const units = speechUnits(text, true, names);
  return (
    <>
      <Region text={text} from={0} to={handoff} units={units} entryId={entry.id} onReplay={onReplay} range={range} />
      {handoff < text.length && (
        <div className={styles.handoff}>
          <hr className={styles.handoffRule} />
          <Region text={text} from={handoff} to={text.length} units={units} entryId={entry.id} onReplay={onReplay} range={range} />
        </div>
      )}
    </>
  );
}

function ImageEntry({ entry }: { entry: Extract<ChatEntry, { kind: 'image' }> }) {
  const url = useStoredImage(entry.imageKey);
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <figure className={styles.image}>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Open image: ${entry.caption}`}>
        <img src={url} alt={entry.caption} />
      </button>
      <figcaption>{entry.caption}</figcaption>
      {open && (
        <Modal title={entry.caption} hideTitle wide onClose={() => setOpen(false)} className={styles.full}>
          <ParallaxImage imageKey={entry.imageKey} url={url} alt={entry.caption} className={styles.fullImage} fit="contain" maxHeight="(100vh - 120px)" />
          <p className={styles.fullCaption}>{entry.caption}</p>
        </Modal>
      )}
    </figure>
  );
}

export function ChatLog({ session, busy, onRetry, speaking, feedback, onFeedback, onReplay, names: knownNames, onOpenCard }: Props) {
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
  const names = knownNames ?? [...session.state.party.map((p) => p.name), ...session.state.roster.map((r) => r.name)];

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
                  <DmText entry={entry} speaking={speaking} streaming={busy && entry === last} names={names} onReplay={onReplay} />
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
                {member && onOpenCard ? (
                  <button type="button" className={styles.avatarButton} onClick={() => onOpenCard(member.id)} aria-label={`${member.name}. Open card`} title={`${member.name}: open card`}>
                    <Avatar name={member.name} archetypeId={member.archetypeId} color={member.playerColor} imageKey={session.images.portraits[member.id]} />
                  </button>
                ) : (
                  <Avatar name={member?.name ?? 'Player'} archetypeId={member?.archetypeId} color={member?.playerColor} imageKey={member ? session.images.portraits[member.id] : null} />
                )}
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
            return <ImageEntry key={entry.id} entry={entry} />;
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
