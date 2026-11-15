import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@/app/settingsStore';
import type { CoreContent } from '@/content/core';
import { listCampaigns, loadCampaign, loadCore } from '@/content/library';
import type { LibraryEntry, LoadedCampaign } from '@/content/library';
import { skinArchetypes, toEngineCampaign } from '@/content/pack';
import { createGame } from '@/engine/state';
import { STATS } from '@/engine/types';
import { buildParty, emptyAnswers, missingAnswers } from '@/game/characters';
import type { CharacterAnswers } from '@/game/characters';
import { createSession } from '@/game/session';
import type { DiceMode } from '@/game/session';
import { useGame } from '@/game/store';
import { ArchetypeIcon } from '../ArchetypeIcon';
import { CampaignCover } from '../CampaignCover';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { themeStyle } from '../theme';
import { CharacterForm } from './CharacterForm';
import styles from './newgame.module.css';

type Step = 'campaign' | 'table' | 'characters' | 'review';

const DICE_MODES: Array<{ id: DiceMode; label: string; text: string }> = [
  { id: 'digital', label: 'Digital dice', text: 'Throw 3D dice on screen.' },
  { id: 'physical', label: 'Physical dice', text: 'Roll real dice and type the result.' },
  { id: 'per_player', label: 'Per player', text: 'Each player chooses.' },
];

export function NewGamePage() {
  const navigate = useNavigate();
  const settings = useSettings((s) => s.settings);
  const [step, setStep] = useState<Step>('campaign');
  const [campaigns, setCampaigns] = useState<LibraryEntry[] | null>(null);
  const [loaded, setLoaded] = useState<LoadedCampaign | null>(null);
  const [core, setCore] = useState<CoreContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState(1);
  const [diceMode, setDiceMode] = useState<DiceMode>(settings.dice.mode);
  const [playerDice, setPlayerDice] = useState<Array<'digital' | 'physical'>>(['digital', 'digital', 'digital', 'digital']);
  const [answers, setAnswers] = useState<CharacterAnswers[]>([emptyAnswers(0)]);
  const [current, setCurrent] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    listCampaigns()
      .then(setCampaigns)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const pack = loaded?.pack ?? null;
  const archetypes = useMemo(() => (pack && core ? skinArchetypes(core.archetypes, pack) : []), [pack, core]);

  const choose = async (id: string) => {
    setError(null);
    try {
      const [campaign, coreContent] = await Promise.all([loadCampaign(id), loadCore()]);
      setLoaded(campaign);
      setCore(coreContent);
      setPlayers((n) => Math.min(Math.max(n, campaign.pack.players.min), campaign.pack.players.max));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setCount = (n: number) => {
    setPlayers(n);
    setAnswers((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? emptyAnswers(i)));
    setCurrent((c) => Math.min(c, n - 1));
  };

  const missing = answers.map(missingAnswers);
  const allReady = missing.every((m) => m.length === 0);

  const begin = async () => {
    if (!loaded || !core || !pack) return;
    setStarting(true);
    setError(null);
    try {
      const campaign = toEngineCampaign(pack);
      const party = buildParty(answers, archetypes, campaign);
      const dice: Record<string, 'digital' | 'physical'> = {};
      // Companions share their player's dice choice.
      let player = -1;
      for (const member of party) {
        if (!member.isCompanion) player += 1;
        dice[member.id] = playerDice[player] ?? 'digital';
      }
      const session = createSession({
        campaignId: pack.id,
        campaignTitle: pack.manifest.title,
        state: createGame(campaign, party),
        dm: { provider: settings.dm.provider, model: settings.dm.model },
        diceMode,
        playerDice: dice,
      });
      void useGame.getState().begin(session, loaded, core);
      navigate(`/play/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  const theme = pack ? themeStyle(pack.manifest.theme) : undefined;

  return (
    <div className={styles.page} style={theme}>
      <header className={styles.head}>
        <p className={controls.eyebrow}>New game</p>
        <h1>
          {step === 'campaign' && 'Choose a campaign'}
          {step === 'table' && 'Set the table'}
          {step === 'characters' && 'Create your characters'}
          {step === 'review' && 'Review the party'}
        </h1>
      </header>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {step === 'campaign' && (
        <>
          <div className={styles.campaigns}>
            {campaigns?.map((c) => (
              <button key={`${c.source}:${c.id}`} type="button" className={cx(styles.campaign, pack?.id === c.id && styles.campaignOn)} style={themeStyle(c.theme)} aria-pressed={pack?.id === c.id} onClick={() => void choose(c.id)}>
                <CampaignCover title={c.title} genre={c.genre} theme={c.theme} imageUrl={c.keyArtUrl} />
                <span className={styles.campaignBody}>
                  <span className={styles.campaignMeta}>
                    <span className={controls.chip}>{c.genre.replace(/-/g, ' ')}</span>
                    <span className={controls.chip}>
                      <Icon name="clock" size={13} /> {c.targetMinutes} min
                    </span>
                    <span className={controls.chip}>
                      <Icon name="users" size={13} /> {c.players}
                    </span>
                  </span>
                  <span className={styles.campaignTitle}>{c.title}</span>
                  <span className={styles.campaignTagline}>{c.tagline}</span>
                </span>
              </button>
            ))}
          </div>
          {pack && (
            <section className={styles.panel} aria-label="About this campaign">
              <h2>{pack.manifest.title}</h2>
              <p className={styles.lede}>{pack.overview.split(/\n\s*\n/)[0]}</p>
            </section>
          )}
          <div className={styles.nav}>
            <button type="button" className={controls.btn} onClick={() => navigate('/')}>
              <Icon name="chevronLeft" /> Home
            </button>
            <button type="button" className={cx(controls.btn, controls.primary)} disabled={!pack} onClick={() => setStep('table')}>
              Next <Icon name="chevronRight" />
            </button>
          </div>
        </>
      )}

      {step === 'table' && pack && (
        <>
          <section className={styles.panel}>
            <div className={styles.row}>
              <fieldset className={styles.q}>
                <legend className={controls.label}>How many players?</legend>
                <div className={styles.options}>
                  {[1, 2, 3, 4]
                    .filter((n) => n >= pack.players.min && n <= pack.players.max)
                    .map((n) => (
                      <button key={n} type="button" className={cx(styles.option, players === n && styles.optionOn)} aria-pressed={players === n} onClick={() => setCount(n)}>
                        <strong>{n}</strong>
                      </button>
                    ))}
                </div>
                <span className={controls.hint}>Everyone shares this computer. A companion can add an extra character later.</span>
              </fieldset>
              <fieldset className={styles.q}>
                <legend className={controls.label}>Dice</legend>
                <div className={styles.options}>
                  {DICE_MODES.map((m) => (
                    <button key={m.id} type="button" className={cx(styles.option, diceMode === m.id && styles.optionOn)} aria-pressed={diceMode === m.id} onClick={() => setDiceMode(m.id)}>
                      <strong>{m.label}</strong>
                      <small>{m.text}</small>
                    </button>
                  ))}
                </div>
                <span className={controls.hint}>You can change this at any time during the game.</span>
              </fieldset>
            </div>
          </section>
          <div className={styles.nav}>
            <button type="button" className={controls.btn} onClick={() => setStep('campaign')}>
              <Icon name="chevronLeft" /> Back
            </button>
            <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => setStep('characters')}>
              Next <Icon name="chevronRight" />
            </button>
          </div>
        </>
      )}

      {step === 'characters' && pack && core && (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Players">
            {answers.map((a, i) => (
              <button key={i} type="button" role="tab" aria-selected={current === i} className={cx(styles.tab, current === i && styles.tabOn)} onClick={() => setCurrent(i)}>
                <span className={styles.tabDot} style={{ background: a.playerColor }} />
                {a.name || a.playerName || `Player ${i + 1}`}
                {missing[i]!.length === 0 && <Icon name="check" size={14} label="ready" />}
              </button>
            ))}
          </div>
          <section className={styles.panel} role="tabpanel" aria-label={`Player ${current + 1}`}>
            <CharacterForm
              key={current}
              index={current}
              answers={answers[current]!}
              onChange={(next) => setAnswers((prev) => prev.map((a, i) => (i === current ? next : a)))}
              questions={core.questions}
              archetypes={archetypes}
              pack={pack}
              diceChoice={
                diceMode === 'per_player'
                  ? { value: playerDice[current]!, onChange: (v) => setPlayerDice((prev) => prev.map((d, i) => (i === current ? v : d))) }
                  : undefined
              }
            />
          </section>
          <div className={styles.nav}>
            <button type="button" className={controls.btn} onClick={() => (current > 0 ? setCurrent(current - 1) : setStep('table'))}>
              <Icon name="chevronLeft" /> Back
            </button>
            <span className={styles.missing} aria-live="polite">
              {missing[current]!.length > 0 ? `Still needed: ${missing[current]!.join(', ')}` : ''}
            </span>
            {current < answers.length - 1 ? (
              <button type="button" className={cx(controls.btn, controls.primary)} disabled={missing[current]!.length > 0} onClick={() => setCurrent(current + 1)}>
                Confirm and next player <Icon name="chevronRight" />
              </button>
            ) : (
              <button type="button" className={cx(controls.btn, controls.primary)} disabled={!allReady} onClick={() => setStep('review')}>
                Confirm and review party <Icon name="chevronRight" />
              </button>
            )}
          </div>
        </>
      )}

      {step === 'review' && pack && (
        <>
          <section className={styles.panel}>
            <h2>{pack.manifest.title}</h2>
            <p className={styles.lede}>{pack.manifest.goal.text}</p>
            <div className={styles.review}>
              {answers.map((a, i) => {
                const arch = archetypes.find((x) => x.id === a.archetype);
                return (
                  <article key={i} className={styles.reviewCard} style={{ ['--player' as string]: a.playerColor }}>
                    <span className={styles.reviewName}>
                      <ArchetypeIcon archetypeId={a.archetype} size={26} color={a.playerColor} />
                      {a.name}
                    </span>
                    <span className={styles.reviewMeta}>
                      {arch?.name} · played by {a.playerName}
                    </span>
                    {arch && <span className={styles.reviewStats}>{STATS.map((s) => `${s} ${arch.stats[s] + (a.bump === s ? 1 : 0) >= 0 ? '+' : ''}${arch.stats[s] + (a.bump === s ? 1 : 0)}`).join('  ')}</span>}
                    {a.companion?.name && (
                      <span className={styles.reviewMeta}>
                        With {a.companion.name}
                        {a.companion.fullMember ? ' (full party member)' : ''}
                      </span>
                    )}
                    {a.hook && <span className={styles.reviewMeta}>{a.hook}</span>}
                  </article>
                );
              })}
            </div>
            <p className={controls.hint}>
              Dungeon Master: {settings.dm.model} · Dice: {DICE_MODES.find((m) => m.id === diceMode)!.label}
            </p>
          </section>
          <div className={styles.nav}>
            <button type="button" className={controls.btn} onClick={() => setStep('characters')}>
              <Icon name="chevronLeft" /> Back
            </button>
            <button type="button" className={cx(controls.btn, controls.primary, controls.large)} disabled={starting} onClick={() => void begin()}>
              <Icon name="play" /> Begin the adventure
            </button>
          </div>
        </>
      )}
    </div>
  );
}
