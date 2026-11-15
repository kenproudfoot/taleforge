import { formatCost, formatSmallCost, formatTokens } from '@/ai/pricing';
import type { MeterKind } from '@/ai/meter';
import type { Session } from '@/game/session';
import { formatClock } from '@/game/session';
import { KIND_LABELS, ledgerToCsv, PROJECTION_MIN_MS, summarizeUsage } from '@/game/usage';
import type { KindTotals } from '@/game/usage';
import controls from '../controls.module.css';
import { downloadText } from '../download';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import styles from './UsagePanel.module.css';

const KIND_ORDER: MeterKind[] = ['dm', 'helper', 'image', 'voice', 'listen'];

function amount(kind: MeterKind, t: KindTotals): string {
  if (kind === 'voice') return `${t.chars.toLocaleString()} characters`;
  if (kind === 'listen') return `${(t.seconds / 60).toFixed(1)} min of speech`;
  const tokens = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens + t.outputTokens;
  if (kind === 'image') return tokens ? `${formatTokens(tokens)} tokens` : '';
  return `${formatTokens(tokens)} tokens`;
}

function calls(kind: MeterKind, n: number): string {
  if (kind === 'image') return `${n} ${n === 1 ? 'picture' : 'pictures'}`;
  if (kind === 'voice') return `${n} ${n === 1 ? 'clip' : 'clips'}`;
  if (kind === 'listen') return `${n} ${n === 1 ? 'recording' : 'recordings'}`;
  return `${n} ${n === 1 ? 'request' : 'requests'}`;
}

/** The usage and cost breakdown for one game: what was called, how much, and what it is likely to cost. */
export function UsagePanel({ session, targetMinutes, onClose }: { session: Session; targetMinutes: number; onClose(): void }) {
  const summary = summarizeUsage(session.ledger, session.state.elapsedMs, targetMinutes);
  const recentTurns = summary.dmTurns.slice(-12).reverse();
  const pictures = session.ledger.filter((e) => e.kind === 'image');
  const exportCsv = () => downloadText(`taleforge-usage-${session.campaignId}-${new Date(session.createdAt).toISOString().slice(0, 10)}.csv`, ledgerToCsv(session.ledger), 'text/csv');
  const legacy = session.ledger.length === 0 && session.costUsd > 0;

  return (
    <Modal title="Usage and costs" onClose={onClose} wide>
      <div className={styles.panel}>
        <div className={styles.headline}>
          <div>
            <span className={styles.big}>{formatCost(summary.totalUsd) || '$0'}</span>
            <span className={styles.caption}>estimated so far · {formatClock(session.state.elapsedMs)} played</span>
          </div>
          <div>
            <span className={styles.big}>{summary.projectedUsd !== null ? formatCost(summary.projectedUsd) : '—'}</span>
            <span className={styles.caption}>
              {summary.projectedUsd !== null ? `on pace for a ${targetMinutes}-minute game` : `projection after ${PROJECTION_MIN_MS / 60_000} minutes of play`}
            </span>
          </div>
          <div>
            <span className={styles.big}>{summary.perTurnUsd !== null ? formatSmallCost(summary.perTurnUsd) : '—'}</span>
            <span className={styles.caption}>per turn (DM and helper)</span>
          </div>
          <div>
            <span className={styles.big}>{summary.cacheHitRate !== null ? `${Math.round(summary.cacheHitRate * 100)}%` : '—'}</span>
            <span className={styles.caption}>DM input read from cache</span>
          </div>
        </div>
        {legacy && <p className={styles.note}>This game was started before detailed tracking: only the DM total is known ({formatCost(session.costUsd)}).</p>}

        <div className={styles.details}>
        <table className={styles.table}>
          <caption className="sr-only">Usage by service</caption>
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Calls</th>
              <th scope="col">Amount</th>
              <th scope="col" className={styles.num}>
                Est. cost
              </th>
            </tr>
          </thead>
          <tbody>
            {KIND_ORDER.map((kind) => {
              const t = summary.byKind[kind];
              return (
                <tr key={kind}>
                  <th scope="row">{KIND_LABELS[kind]}</th>
                  <td>{t.calls ? calls(kind, t.calls) : '—'}</td>
                  <td>{t.calls ? amount(kind, t) : ''}</td>
                  <td className={styles.num}>
                    {t.calls ? formatSmallCost(t.costUsd) : '—'}
                    {t.unpriced ? <span className={styles.unpriced}> + {t.unpriced} unpriced</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {recentTurns.length > 0 && (
          <details className={styles.details} open>
            <summary>Dungeon Master tokens per turn {summary.dmTurns.length > recentTurns.length ? `(last ${recentTurns.length})` : ''}</summary>
            <table className={styles.table}>
              <caption className="sr-only">Dungeon Master tokens per turn</caption>
              <thead>
                <tr>
                  <th scope="col">Turn</th>
                  <th scope="col" className={styles.num}>Requests</th>
                  <th scope="col" className={styles.num}>Input</th>
                  <th scope="col" className={styles.num}>Cache write</th>
                  <th scope="col" className={styles.num}>Cache read</th>
                  <th scope="col" className={styles.num}>Output</th>
                  <th scope="col" className={styles.num}>Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {recentTurns.map((r) => (
                  <tr key={r.turn}>
                    <th scope="row">{r.turn}</th>
                    <td className={styles.num}>{r.calls}</td>
                    <td className={styles.num}>{formatTokens(r.inputTokens)}</td>
                    <td className={styles.num}>{formatTokens(r.cacheWriteTokens)}</td>
                    <td className={styles.num}>{formatTokens(r.cacheReadTokens)}</td>
                    <td className={styles.num}>{formatTokens(r.outputTokens)}</td>
                    <td className={styles.num}>{formatSmallCost(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {pictures.length > 0 && (
          <details className={styles.details}>
            <summary>Pictures painted ({pictures.length})</summary>
            <table className={styles.table}>
              <caption className="sr-only">Pictures painted</caption>
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Model</th>
                  <th scope="col">Size</th>
                  <th scope="col" className={styles.num}>Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {pictures.map((e, i) => (
                  <tr key={i}>
                    <th scope="row">{e.label ?? 'picture'}</th>
                    <td>{e.model}</td>
                    <td>{e.detail ?? ''}</td>
                    <td className={styles.num}>{formatSmallCost(e.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        <p className={styles.note}>
          Estimates from each provider&rsquo;s list prices (checked November 2026). Your provider&rsquo;s bill is the real figure. Pictures already painted
          come from this browser&rsquo;s cache for free, so replaying a campaign costs less. Unpriced items are counted but not costed: set a price under
          Settings → Costs.
        </p>
        <div className={styles.actions}>
          <button type="button" className={controls.btn} onClick={exportCsv} disabled={session.ledger.length === 0}>
            <Icon name="download" size={15} /> Download usage log (CSV)
          </button>
        </div>
      </div>
    </Modal>
  );
}
