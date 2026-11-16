import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { estimateCost, formatCost, formatTokens, priceFor } from '@/ai/pricing';
import { PlaytestSurvey } from './PlaytestSurvey';
import { UsagePanel } from './UsagePanel';
import { useSettings } from '@/app/settingsStore';
import { useDiceTray } from '@/dice/DiceTray';
import { milestoneBoostAvailable } from '@/engine/state';
import { STATS } from '@/engine/types';
import type { SpeechUnit } from '@/ai/voice/sentences';
import { recapFileName } from '@/game/recap';
import { formatClock, usesPhysicalDice } from '@/game/session';
import type { DiceMode } from '@/game/session';
import { playtestFileId } from '@/game/playtest';
import { playtestLogFor, useGame } from '@/game/store';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { statTip } from '../glossary';
import { ModelPicker } from '../settings/ModelsSection';
import { downloadText } from '../download';
import { themeStyle } from '../theme';
import { ChatLog } from './ChatLog';
import styles from './GameTablePage.module.css';
import { InputBar } from './InputBar';
import { RollPrompt } from './RollPrompt';
import { Roster } from './Roster';
import { ScenePanel } from './ScenePanel';
import { StatePanel } from './StatePanel';

type SideTab = 'roster' | 'scene' | 'state';

export interface TableSlots {
  /** Extra top-bar controls (music, voice). */
  topBar?: ReactNode;
  /** Extra input-bar controls (microphone). */
  input?: ReactNode;
  /** Overlays such as the dice tray. */
  overlay?: ReactNode;
  /** Called for each dice impact during a throw, with a 0..1 loudness (for sound). */
  onDiceImpact?: (loudness: number) => void;
  speaking?: { entryId: string; start: number; end: number } | null;
  /** Reads one spoken line of a DM message again. */
  onReplay?(entryId: string, unit: SpeechUnit): void;
  /** People in the game, for telling who says a “quoted” line. */
  names?: string[];
  dictated?: { id: number; text: string } | null;
  painting?: boolean;
}

const OUTCOME_TITLE = { victory: 'Victory', bittersweet: 'A bittersweet ending', defeat: 'Defeat' } as const;

export function GameTablePage({ slots = {} }: { slots?: TableSlots }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const settingsLoaded = useSettings((s) => s.loaded);
  const loadSettings = useSettings((s) => s.load);
  const game = useGame();
  const { session, pack, campaign } = game;
  const [tab, setTab] = useState<SideTab>('scene');
  const [modelOpen, setModelOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const playtesting = useSettings((s) => s.settings.playtest.enabled);
  const [boostOpen, setBoostOpen] = useState(false);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'writing' | 'done'>('idle');
  const tray = useDiceTray(slots.onDiceImpact);

  useEffect(() => {
    if (!settingsLoaded) void loadSettings();
  }, [settingsLoaded, loadSettings]);

  useEffect(() => {
    if (settingsLoaded && sessionId && useGame.getState().session?.id !== sessionId) void useGame.getState().open(sessionId);
  }, [settingsLoaded, sessionId]);

  // Play clock: counts real time at the table while the game is open and not paused.
  useEffect(() => {
    const timer = setInterval(() => useGame.getState().tick(1000), 1000);
    return () => clearInterval(timer);
  }, []);

  const saveAndQuit = useCallback(async () => {
    useGame.getState().setPaused(true);
    setSaving('writing');
    await useGame.getState().writeRecap().catch(() => undefined);
    setSaving('done');
  }, []);

  const leave = useCallback(async () => {
    await useGame.getState().save();
    useGame.getState().close();
    navigate('/');
  }, [navigate]);

  if (game.loadError) {
    return (
      <div className={styles.message}>
        <p role="alert">{game.loadError}</p>
        <Link to="/" className={controls.btn}>
          <Icon name="home" /> Home
        </Link>
      </div>
    );
  }
  if (!session || !pack || !campaign || session.id !== sessionId) return <div className={styles.message}>Setting the table…</div>;

  const state = session.state;
  const act = campaign.acts[state.actIndex];
  const price = priceFor(session.dm.provider, session.dm.model);
  const tokens = session.usage.dm.inputTokens + session.usage.dm.outputTokens + session.usage.dm.cacheReadTokens + session.usage.dm.cacheWriteTokens;
  const cost = session.costUsd > 0 ? session.costUsd : (estimateCost(session.usage.dm, price) ?? null);
  const pending = state.pendingRoll;
  const keyArtUrl = pack.manifest.key_art ? game.assetUrl(pack.manifest.key_art) : null;
  const overTime = state.elapsedMs > campaign.targetMinutes * 60_000;
  const boostMembers = state.party.filter((p) => milestoneBoostAvailable(state, campaign, p.id));

  return (
    <div className={styles.table} style={themeStyle(pack.manifest.theme)} data-bubble={pack.manifest.theme.bubble}>
      <header className={styles.top}>
        <button type="button" className={styles.home} onClick={() => void leave()} aria-label="Save and return home">
          <img src={`${import.meta.env.BASE_URL}icons/taleforge.svg`} alt="" width={28} height={28} />
        </button>
        <div className={styles.titles}>
          <h1 className={styles.title}>{pack.manifest.title}</h1>
          <span className={styles.act}>
            Act {state.actIndex + 1}
            {act ? `: ${act.title}` : ''}
          </span>
        </div>
        <span className={cx(styles.clock, overTime && styles.clockOver)} title="Time played / target length">
          <Icon name="clock" size={15} /> <span aria-label="Time played">{formatClock(state.elapsedMs)}</span> / {campaign.targetMinutes}:00
        </span>
        <div className={styles.tools}>
          {slots.topBar}
          <button type="button" className={cx(controls.btn, controls.small)} onClick={() => setModelOpen(true)} title="Change the Dungeon Master model">
            <Icon name="sparkle" size={14} /> <span className={styles.modelName}>{session.dm.model}</span> <Icon name="chevronDown" size={13} />
          </button>
          <label className={styles.diceMode}>
            <span className="sr-only">Dice mode</span>
            <Icon name="dice" size={15} />
            <select className={styles.miniSelect} value={session.diceMode} onChange={(e) => game.setDiceMode(e.target.value as DiceMode)}>
              <option value="digital">Digital dice</option>
              <option value="physical">Physical dice</option>
              <option value="per_player">Per player</option>
            </select>
          </label>
          <button type="button" className={cx(styles.meter, styles.meterButton)} onClick={() => setUsageOpen(true)} title="Usage and estimated costs for this game">
            {formatTokens(tokens)} tokens{cost !== null ? ` · ${formatCost(cost)}` : ''}
            {session.images.generated ? ` · ${session.images.generated} pictures` : ''}
          </button>
          <button type="button" className={cx(controls.btn, controls.small)} onClick={() => game.setPaused(true)}>
            <Icon name="pause" size={14} /> Pause
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <main className={styles.chat}>
          <ChatLog session={session} busy={game.busy} onRetry={() => void game.retry()} speaking={slots.speaking} onReplay={slots.onReplay} names={slots.names} feedback={playtesting ? session.playtest.feedback : null} onFeedback={game.setFeedback} />
          {!game.busy && !state.ended && session.history.length === 0 && session.summary.trim() !== '' && (
            <div className={styles.resume}>
              <span>This game was restored from a recap. The Dungeon Master will remind everyone where things stand.</span>
              <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => void game.resume()}>
                <Icon name="play" /> Continue the story
              </button>
            </div>
          )}
          <RollPrompt
            state={state}
            physical={pending ? usesPhysicalDice(session, pending.rollerId) : false}
            onDice={game.submitDice}
            onHeroic={game.chooseHeroic}
            rollDigital={tray.roller}
          />
          <InputBar session={session} speaker={game.speaker} busy={game.busy} onSpeaker={game.setSpeaker} onSend={(text) => void game.send(text)} onFreeRoll={(notation) => {
              const sides = Number(/d(\d+)/.exec(notation)?.[1]);
              // Digital players throw free rolls in the tray too; physical players get an instant result.
              if (sides && game.speaker && !usesPhysicalDice(session, game.speaker)) void tray.roller(sides, 1).then((values) => game.freeRoll(notation, undefined, values));
              else game.freeRoll(notation);
            }} dictated={slots.dictated}>
            {slots.input}
          </InputBar>
        </main>

        <aside className={styles.side} aria-label="Scene and game state">
          <div className={styles.sideTabs} role="tablist" aria-label="Panels">
            {(['roster', 'scene', 'state'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={cx(styles.sideTab, tab === t && styles.sideTabOn)} onClick={() => setTab(t)}>
                {t === 'roster' ? 'Roster' : t === 'scene' ? 'Scene' : 'State'}
              </button>
            ))}
          </div>
          <div className={cx(styles.sidePanel, tab === 'roster' && styles.sidePanelOn)}>
            <Roster session={session} campaign={campaign} />
          </div>
          <div className={cx(styles.sidePanel, tab === 'scene' && styles.sidePanelOn)}>
            <ScenePanel session={session} pack={pack} campaign={campaign} keyArtUrl={keyArtUrl} painting={slots.painting} />
          </div>
          <div className={cx(styles.sidePanel, tab === 'state' && styles.sidePanelOn)}>
            <StatePanel session={session} campaign={campaign} onBoost={() => setBoostOpen(true)} />
          </div>
        </aside>
      </div>

      {slots.overlay}
      {tray.overlay}

      {modelOpen && (
        <Modal title="Dungeon Master model" onClose={() => setModelOpen(false)}>
          <p className={controls.hint}>The change applies from the next turn. The story so far carries over, even to a different provider.</p>
          <ModelPicker idPrefix="table-dm" provider={session.dm.provider} model={session.dm.model} onProvider={(p) => game.setDmModel(p, '')} onModel={(m) => game.setDmModel(session.dm.provider, m)} suggest={/sonnet|gpt-5(?!.*(nano|mini))|pro/} />
          <div className={controls.row}>
            <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => setModelOpen(false)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {saving !== 'idle' && (
        <Modal title={saving === 'writing' ? 'Saving your game' : 'Game saved'} onClose={saving === 'done' ? () => setSaving('idle') : undefined}>
          {saving === 'writing' ? (
            <p role="status">Writing the recap of your story so far…</p>
          ) : (
            <>
              <p>
                Your game is saved in this browser. The recap is a single file that can bring this exact game back on any computer: on the home page, choose <strong>Load a recap file</strong>.
              </p>
              <div className={controls.row}>
                <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => session.recap && downloadText(recapFileName(session), session.recap, 'text/markdown')} disabled={!session.recap}>
                  <Icon name="download" /> Download recap.md
                </button>
                <button type="button" className={controls.btn} onClick={() => void leave()}>
                  <Icon name="home" /> Home
                </button>
                <button
                  type="button"
                  className={controls.btn}
                  onClick={() => {
                    setSaving('idle');
                    game.setPaused(false);
                  }}
                >
                  <Icon name="play" /> Keep playing
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {game.paused && saving === 'idle' && (
        <Modal title="Game paused" onClose={() => game.setPaused(false)}>
          <p>The clock is stopped. Your game is saved automatically after every turn.</p>
          <div className={controls.row}>
            <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => game.setPaused(false)}>
              <Icon name="play" /> Resume
            </button>
            <button type="button" className={controls.btn} onClick={() => void saveAndQuit()}>
              <Icon name="save" /> Save and quit
            </button>
            <button type="button" className={controls.btn} onClick={() => setUsageOpen(true)}>
              <Icon name="sparkle" /> Usage and costs
            </button>
            {playtesting && (
              <button type="button" className={controls.btn} onClick={() => setSurveyOpen(true)}>
                <Icon name="file" /> Playtest notes
              </button>
            )}
            <Link to="/settings" className={controls.btn} onClick={() => void game.save()}>
              <Icon name="settings" /> Settings
            </Link>
          </div>
        </Modal>
      )}

      {surveyOpen && (
        <PlaytestSurvey
          initial={session.playtest.survey}
          onSave={game.setSurvey}
          onClose={() => setSurveyOpen(false)}
          onDownload={() => {
            const log = playtestLogFor(session);
            downloadText(`taleforge-playtest_${playtestFileId(log)}.json`, JSON.stringify(log, null, 2), 'application/json');
          }}
        />
      )}
      {usageOpen && <UsagePanel session={session} targetMinutes={campaign.targetMinutes} onClose={() => setUsageOpen(false)} />}

      {boostOpen && boostMembers.length > 0 && (
        <Modal title="Milestone boost" onClose={() => setBoostOpen(false)}>
          <p>The party has come a long way. Each character gains +1 to one stat.</p>
          {boostMembers.map((m) => (
            <fieldset key={m.id} className={styles.boost}>
              <legend>{m.name}</legend>
              <div className={styles.boostStats}>
                {STATS.map((s) => (
                  <button key={s} type="button" className={controls.btn} onClick={() => game.boost(m.id, s)} aria-label={`${m.name}: +1 ${s}`} title={statTip(s)}>
                    {s} {m.stats[s] >= 0 ? '+' : ''}
                    {m.stats[s]} → {m.stats[s] + 1 >= 0 ? '+' : ''}
                    {Math.min(4, m.stats[s] + 1)}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </Modal>
      )}

      {state.ended && !game.busy && !summaryDismissed && (
        <Modal title={OUTCOME_TITLE[state.ended.outcome]} onClose={() => setSummaryDismissed(true)}>
          <p className={styles.endCampaign}>{pack.manifest.title}</p>
          {state.ended.ending && pack.endings[state.ended.ending] && <p className={styles.endText}>{pack.endings[state.ended.ending]!.replace(/\s*Outcome:.*$/s, '')}</p>}
          <dl className={styles.endStats}>
            <div>
              <dt>Time played</dt>
              <dd>{formatClock(state.elapsedMs)}</dd>
            </div>
            <div>
              <dt>Encounters won</dt>
              <dd>
                {state.encounters.filter((e) => e.outcome === 'won').length} of {state.encounters.length}
              </dd>
            </div>
            <div>
              <dt>Clues found</dt>
              <dd>{state.clues.length}</dd>
            </div>
            <div>
              <dt>Party</dt>
              <dd>{state.party.map((p) => p.name).join(', ')}</dd>
            </div>
          </dl>
          {playtesting && (
            <p className={controls.hint}>
              Playtesting: tell us how it went.{' '}
              <button type="button" className={cx(controls.btn, controls.small)} onClick={() => setSurveyOpen(true)}>
                <Icon name="file" size={14} /> Playtest notes
              </button>
            </p>
          )}
          <div className={controls.row}>
            <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => void leave()}>
              <Icon name="home" /> Home
            </button>
            <button type="button" className={controls.btn} disabled={!session.recap} onClick={() => session.recap && downloadText(recapFileName(session), session.recap, 'text/markdown')}>
              <Icon name="download" /> {session.recap ? 'Download recap' : 'Writing recap…'}
            </button>
            <button type="button" className={controls.btn} onClick={() => setSummaryDismissed(true)}>
              Read the story again
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
