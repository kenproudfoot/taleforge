import { computePacing } from '@/engine/pacing';
import { goalProgress, milestoneBoostAvailable } from '@/engine/state';
import type { EngineCampaign } from '@/engine/types';
import type { Session } from '@/game/session';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { TIPS } from '../glossary';
import { HpBar } from './Roster';
import styles from './StatePanel.module.css';
import { shortName } from '@/engine/names';

const PACING = {
  ahead: { label: 'Ahead of schedule', tone: 'good' },
  on_track: { label: 'On track', tone: 'good' },
  running_long: { label: 'Running long', tone: 'warn' },
  wrap_up: { label: 'Time to wrap up', tone: 'warn' },
} as const;

export function StatePanel({ session, campaign, onBoost }: { session: Session; campaign: EngineCampaign; onBoost(): void }) {
  const state = session.state;
  const holderName = (id: string) => {
    const member = state.party.find((p) => p.id === id);
    return member ? shortName(member.name) : 'party';
  };
  const progress = Math.round(goalProgress(state, campaign) * 100);
  const pacing = PACING[computePacing(state, campaign).status];
  const won = state.encounters.filter((e) => e.outcome === 'won').length;
  const lost = state.encounters.filter((e) => e.outcome === 'lost').length;
  const avoided = state.encounters.filter((e) => e.outcome === 'avoided').length;
  const boost = state.party.some((p) => milestoneBoostAvailable(state, campaign, p.id));
  return (
    <section className={styles.panel} aria-label="Game state">
      <div className={styles.block}>
        <h3 className={styles.heading}>Goal</h3>
        <p className={styles.goal}>{campaign.goal.text}</p>
        <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Goal progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.metaRow}>
          <span>{progress}% complete</span>
          <span className={cx(controls.chip, pacing.tone === 'good' ? controls.chipGood : controls.chipWarn)}>
            <Icon name="clock" size={12} /> {pacing.label}
          </span>
        </div>
      </div>

      <div className={styles.block}>
        <h3 className={styles.heading}>Acts</h3>
        <ol className={styles.acts}>
          {campaign.acts.map((act, i) => {
            const done = act.beats.filter((b) => state.beatsCompleted.includes(b)).length;
            return (
              <li key={act.id} className={cx(styles.act, i === state.actIndex && styles.actNow, i < state.actIndex && styles.actDone)} aria-current={i === state.actIndex ? 'step' : undefined}>
                <span className={styles.actNum}>{i < state.actIndex ? <Icon name="check" size={12} /> : i + 1}</span>
                <span className={styles.actTitle}>{act.title}</span>
                <span className={styles.beats} role="img" aria-label={`${done} of ${act.beats.length} beats`}>
                  {act.beats.map((b) => (
                    <i key={b} className={state.beatsCompleted.includes(b) ? styles.beatDone : undefined} />
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
        <p className={styles.small}>
          Encounters: {won} won · {lost} lost{avoided ? ` · ${avoided} avoided` : ''}
        </p>
      </div>

      <div className={styles.block}>
        <h3 className={styles.heading}>Party</h3>
        {boost && (
          <button type="button" className={cx(controls.btn, controls.primary, controls.small)} onClick={onBoost}>
            <Icon name="sparkle" size={14} /> Milestone boost available
          </button>
        )}
        <ul className={styles.party}>
          {state.party.map((m) => (
            <li key={m.id} style={{ ['--player' as string]: m.playerColor }}>
              <span className={styles.memberName}>
                <i className={styles.dot} />
                {m.name}
              </span>
              <span className={styles.memberHp} title={TIPS.hp}>
                <HpBar hp={m.hp} max={m.maxHp} /> {m.hp}/{m.maxHp}
              </span>
              <span className={styles.tags}>
                {m.status !== 'ok' && <span className={cx(controls.chip, controls.chipBad)}>{m.status}</span>}
                {m.conditions
                  .filter((c) => c !== 'Downed')
                  .map((c) => (
                    <span key={c} className={controls.chip}>
                      {c}
                    </span>
                  ))}
                <span className={controls.chip} title={TIPS.heroic}>
                  <Icon name="star" size={11} /> {m.heroicPoints}
                </span>
                {campaign.resources
                  .filter((r) => r.scope === 'character')
                  .map((r) => (
                    <span key={r.id} className={controls.chip}>
                      {r.name} {m.resources[r.id] ?? r.start}/{r.max}
                    </span>
                  ))}
              </span>
            </li>
          ))}
        </ul>
        {campaign.resources
          .filter((r) => r.scope === 'party')
          .map((r) => {
            const value = state.partyResources[r.id] ?? r.start;
            return (
              <div key={r.id} className={styles.resource} title={r.description}>
                <span>{r.name}</span>
                <span className={styles.pips} role="img" aria-label={`${r.name}: ${value} of ${r.max}`}>
                  {Array.from({ length: r.max }, (_, i) => (
                    <i key={i} className={i < value ? styles.pipOn : undefined} />
                  ))}
                </span>
              </div>
            );
          })}
      </div>

      {(state.clues.length > 0 || state.items.length > 0) && (
        <div className={styles.block}>
          <h3 className={styles.heading}>Clues and items</h3>
          <ul className={styles.list}>
            {state.clues.map((c) => (
              <li key={c.id}>
                <Icon name="eye" size={13} /> {c.text}
              </li>
            ))}
            {state.items.map((item, i) => (
              <li key={`${item.name}-${i}`} title={item.description}>
                <Icon name="key" size={13} /> {item.name}
                <small> ({item.holder === 'party' ? 'party' : holderName(item.holder)})</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
