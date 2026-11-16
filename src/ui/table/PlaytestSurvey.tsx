import { useState } from 'react';
import type { PlaytestSurvey as Survey } from '@/game/playtest';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import styles from './PlaytestSurvey.module.css';

const PACING: Survey['pacing'][] = ['too slow', 'just right', 'too fast'];

/** Three quick questions for the playtest log. Can be filled in (and changed) any time during a game. */
export function PlaytestSurvey({
  initial,
  onSave,
  onClose,
  onDownload,
}: {
  initial: Survey | null;
  onSave(survey: Omit<Survey, 'at'>): void;
  onClose(): void;
  /** Saves this game's playtest log as a file (the hosted site cannot write it to disk itself). */
  onDownload?(): void;
}) {
  const [fun, setFun] = useState(initial?.fun ?? 0);
  const [pacing, setPacing] = useState<Survey['pacing'] | null>(initial?.pacing ?? null);
  const [confusing, setConfusing] = useState(initial?.confusing ?? '');
  const [other, setOther] = useState(initial?.other ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <Modal title="Playtest notes" onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ fun, pacing: pacing ?? 'just right', confusing: confusing.trim(), other: other.trim() });
          setSaved(true);
        }}
      >
        <p className={controls.hint}>Your answers are saved with this game&apos;s playtest log, on this device only, to help improve TaleForge.</p>
        <fieldset className={styles.group}>
          <legend className={controls.label}>How much fun was it?</legend>
          <div className={styles.scale}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={cx(styles.pick, fun === n && styles.pickOn)}>
                <input type="radio" name="fun" className="sr-only" checked={fun === n} onChange={() => setFun(n)} />
                {n}
                <span className="sr-only">{n === 1 ? ' (not fun)' : n === 5 ? ' (great fun)' : ''}</span>
              </label>
            ))}
          </div>
          <span className={controls.hint}>1 = not fun, 5 = great fun</span>
        </fieldset>
        <fieldset className={styles.group}>
          <legend className={controls.label}>The pace was…</legend>
          <div className={styles.scale}>
            {PACING.map((p) => (
              <label key={p} className={cx(styles.pick, pacing === p && styles.pickOn)}>
                <input type="radio" name="pacing" className="sr-only" checked={pacing === p} onChange={() => setPacing(p)} />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="survey-confusing">
            Anything confusing, broken or annoying?
          </label>
          <textarea id="survey-confusing" className={cx(controls.input, styles.text)} value={confusing} onChange={(e) => setConfusing(e.target.value)} rows={3} />
        </div>
        <div className={controls.field}>
          <label className={controls.label} htmlFor="survey-other">
            Anything else? (best moments, ideas)
          </label>
          <textarea id="survey-other" className={cx(controls.input, styles.text)} value={other} onChange={(e) => setOther(e.target.value)} rows={3} />
        </div>
        <div className={controls.row}>
          <button type="submit" className={cx(controls.btn, controls.primary)} disabled={fun === 0}>
            Save notes
          </button>
          {onDownload && (
            <button type="button" className={controls.btn} onClick={onDownload}>
              <Icon name="download" /> Download playtest log
            </button>
          )}
          {saved && <span role="status">Saved. Thank you!</span>}
        </div>
      </form>
    </Modal>
  );
}
