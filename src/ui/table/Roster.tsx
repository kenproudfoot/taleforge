import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { STATS } from '@/engine/types';
import type { EngineCampaign, PartyMember, RosterEntry } from '@/engine/types';
import type { Session } from '@/game/session';
import { ArchetypeIcon } from '../ArchetypeIcon';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { TIPS, statTip } from '../glossary';
import { useStoredImage } from '../useStoredImage';
import { ParallaxImage } from '../art/ParallaxImage';
import { PLAQUE_TOP } from '@/ai/art/plaque';
import { useVoiceUi } from '../voice/useVoice';
import { Avatar } from './Avatar';
import styles from './Roster.module.css';
import { shortName } from '@/engine/names';

export type Selected = { kind: 'party'; id: string } | { kind: 'npc'; id: string };

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const ROLE_LABEL = { ally: 'Ally', neutral: 'Neutral', enemy: 'Enemy', boss: 'Boss' } as const;

function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  return (
    <span className={styles.hp} role="img" aria-label={`${hp} of ${max} hit points`}>
      <span className={cx(styles.hpFill, pct <= 33 && styles.hpLow, pct > 33 && pct <= 66 && styles.hpMid)} style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Large card art: the portrait when it exists, otherwise a themed emblem card. The name plaque is drawn here, never by the image model. */
function CardFront({ name, subtitle, imageKey, cardKey, archetypeId, color, role, paused }: { name: string; subtitle: string; imageKey?: string | null; cardKey?: string | null; archetypeId?: string; color?: string; role?: RosterEntry['role']; paused?: boolean }) {
  const url = useStoredImage(imageKey);
  const card = useStoredImage(cardKey);
  // The composited card already carries its name plaque, painted in by the app.
  if (card) {
    return (
      <div className={styles.front}>
        {/* 2.5D like the scenes; the painted-on plaque stays still. */}
        <ParallaxImage imageKey={cardKey!} url={card} alt={`${name}, ${subtitle}`} className={styles.art} paused={paused} flatBelow={PLAQUE_TOP} />
      </div>
    );
  }
  return (
    <div className={styles.front}>
      {url ? (
        <ParallaxImage imageKey={imageKey!} url={url} alt={`Portrait of ${name}`} className={styles.art} paused={paused} />
      ) : (
        <div className={styles.emblem} style={{ ['--tint' as string]: color ?? (role === 'enemy' || role === 'boss' ? 'var(--bad)' : 'var(--accent)') }}>
          {archetypeId ? <ArchetypeIcon archetypeId={archetypeId} size={120} color="var(--tint)" /> : <Icon name={role === 'boss' ? 'star' : role === 'enemy' ? 'swords' : role === 'ally' ? 'shield' : 'users'} size={110} style={{ color: 'var(--tint)' }} />}
        </div>
      )}
      <div className={styles.plaque}>
        <strong>{name}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

function PartyBack({ m, campaign, actIndex }: { m: PartyMember; campaign: EngineCampaign; actIndex: number }) {
  const p = m.profile;
  const look = [p.age, p.build, p.features, p.strikingFeature].filter(Boolean).join(', ');
  return (
    <div className={styles.back}>
      <header className={styles.backHead}>
        <strong>{m.name}</strong>
        <span>
          {m.archetypeName} · played by {m.playerName}
          {p.pronouns ? ` · ${p.pronouns}` : ''}
        </span>
      </header>
      <div className={styles.statGrid}>
        {STATS.map((s) => (
          <span key={s} className={cx(styles.statCell, m.proficiencies.includes(s) && styles.statProf)} title={statTip(s, m.proficiencies.includes(s))}>
            <small>{s}</small>
            {signed(m.stats[s])}
          </span>
        ))}
      </div>
      <dl className={styles.facts}>
        <div title={TIPS.hp}>
          <dt>Hit points</dt>
          <dd>
            {m.hp} / {m.maxHp} <HpBar hp={m.hp} max={m.maxHp} />
          </dd>
        </div>
        <div title={TIPS.defense}>
          <dt>Defense</dt>
          <dd>{m.defense}</dd>
        </div>
        <div title={TIPS.attack}>
          <dt>Attack</dt>
          <dd>
            {m.attackStat} {signed(m.stats[m.attackStat] + 2)}, d{m.weaponDie}
            {signed(m.stats[m.attackStat])} damage
          </dd>
        </div>
        <div title={TIPS.heroic}>
          <dt>Heroic Points</dt>
          <dd>{m.heroicPoints}</dd>
        </div>
        {campaign.resources
          .filter((r) => r.scope === 'character')
          .map((r) => (
            <div key={r.id}>
              <dt>{r.name}</dt>
              <dd>
                {m.resources[r.id] ?? r.start} / {r.max}
              </dd>
            </div>
          ))}
      </dl>
      <p className={styles.ability} title={TIPS.signature}>
        <Icon name="star" size={14} /> <strong>{m.signature.name}</strong> ({m.signatureUsedInAct === actIndex ? 'used this act' : 'ready'}): {m.signature.description}
      </p>
      {m.conditions.length > 0 && <p className={styles.line}>Conditions: {m.conditions.join(', ')}</p>}
      <p className={styles.line}>Gear: {m.gear.join(', ')}</p>
      {look && <p className={styles.line}>Appearance: {look}</p>}
      {p.outfit && <p className={styles.line}>Outfit: {p.outfit}</p>}
      {m.companion && (
        <p className={styles.line}>
          Companion: {m.companion.name}
          {m.companion.description ? `, ${m.companion.description}` : ''}
        </p>
      )}
      {(p.trait || p.flaw) && <p className={styles.line}>{[p.trait, p.flaw && `Flaw: ${p.flaw}`].filter(Boolean).join(' · ')}</p>}
      {p.hook && <p className={styles.lore}>{p.hook}</p>}
    </div>
  );
}

function NpcBack({ e }: { e: RosterEntry }) {
  const voice = useVoiceUi();
  return (
    <div className={styles.back}>
      <header className={styles.backHead}>
        <strong>{e.name}</strong>
        <span>
          {ROLE_LABEL[e.role]}
          {e.status !== 'active' ? ` · ${e.status.replace('_', ' ')}` : ''}
        </span>
      </header>
      <dl className={styles.facts}>
        <div title={TIPS.hp}>
          <dt>Hit points</dt>
          <dd>
            {e.hp} / {e.maxHp} <HpBar hp={e.hp} max={e.maxHp} />
          </dd>
        </div>
        <div title={TIPS.defense}>
          <dt>Defense</dt>
          <dd>{e.defense}</dd>
        </div>
      </dl>
      {e.attacks.length > 0 && (
        <p className={styles.line}>
          Attacks: {e.attacks.map((a) => `${a.name} ${signed(a.bonus)} (${a.damage})`).join(', ')}
        </p>
      )}
      {e.abilities.length > 0 && (
        <ul className={styles.abilities}>
          {e.abilities.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {e.conditions.length > 0 && <p className={styles.line}>Conditions: {e.conditions.join(', ')}</p>}
      {e.look && <p className={styles.line}>{e.look}</p>}
      {e.history && <p className={styles.lore}>{e.history}</p>}
      {voice && voice.voices.length > 1 && (
        <label className={styles.voicePick}>
          <span>Voice</span>
          <select value={voice.voiceFor(e.name)} onChange={(event) => voice.setVoice(e.name, event.target.value)}>
            {voice.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.description ? ` (${v.description})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function RosterCard({ session, campaign, selected, onClose }: { session: Session; campaign: EngineCampaign; selected: Selected; onClose(): void }) {
  const [flipped, setFlipped] = useState(false);
  const member = selected.kind === 'party' ? session.state.party.find((p) => p.id === selected.id) : undefined;
  const entry = selected.kind === 'npc' ? session.state.roster.find((r) => r.id === selected.id) : undefined;
  const name = member?.name ?? entry?.name;
  if (!name) return null;
  return (
    <Modal title={name} hideTitle onClose={onClose} className={styles.cardModal}>
      <div className={styles.scene}>
        <div className={cx(styles.card, flipped && styles.flipped)}>
          <div className={styles.face} aria-hidden={flipped}>
            {member ? (
              <CardFront name={member.name} subtitle={member.archetypeName} imageKey={session.images.portraits[member.id]} cardKey={session.images.cards?.[member.id]} archetypeId={member.archetypeId} color={member.playerColor} paused={flipped} />
            ) : (
              <CardFront name={entry!.name} subtitle={ROLE_LABEL[entry!.role]} imageKey={session.images.portraits[entry!.id]} role={entry!.role} paused={flipped} />
            )}
          </div>
          <div className={cx(styles.face, styles.faceBack)} aria-hidden={!flipped}>
            {member ? <PartyBack m={member} campaign={campaign} actIndex={session.state.actIndex} /> : <NpcBack e={entry!} />}
          </div>
        </div>
      </div>
      <div className={styles.cardActions}>
        <button type="button" className={cx(controls.btn, controls.primary)} onClick={() => setFlipped(!flipped)} aria-pressed={flipped}>
          <Icon name="flip" /> {flipped ? 'Portrait' : 'Stats'}
        </button>
      </div>
    </Modal>
  );
}

/** The party and who is in the scene. Clicking someone asks the page to open their card (see RosterCard). */
export function Roster({ session, onOpen }: { session: Session; onOpen(selected: Selected): void }) {
  const setSelected = onOpen;
  const present = session.state.roster.filter((e) => e.present);
  return (
    <section className={styles.roster} aria-label="Who is in the scene">
      <ul className={styles.thumbs}>
        {session.state.party.map((m) => (
          <li key={m.id}>
            <button type="button" className={styles.thumb} onClick={() => setSelected({ kind: 'party', id: m.id })} aria-label={`${m.name}, ${m.archetypeName}. Open card`}>
              <Avatar name={m.name} archetypeId={m.archetypeId} color={m.playerColor} imageKey={session.images.portraits[m.id]} size={56} dimmed={m.status === 'out'} />
              <span className={styles.thumbName}>{shortName(m.name)}</span>
              <HpBar hp={m.hp} max={m.maxHp} />
            </button>
          </li>
        ))}
        <AnimatePresence initial={false}>
          {present.map((e) => (
            <motion.li key={e.id} layout initial={{ opacity: 0, scale: 0.6, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5, y: -8 }} transition={{ duration: 0.3 }}>
              <button type="button" className={styles.thumb} onClick={() => setSelected({ kind: 'npc', id: e.id })}>
                <Avatar name={e.name} role={e.role} imageKey={session.images.portraits[e.id]} size={56} dimmed={e.status !== 'active'} />
                <span className="sr-only">{`${e.name}, ${ROLE_LABEL[e.role]}. Open card`}</span>
                <span className={styles.thumbName} aria-hidden="true">
                  {shortName(e.name)}
                </span>
                <span aria-hidden="true">{e.role === 'enemy' || e.role === 'boss' ? <HpBar hp={e.hp} max={e.maxHp} /> : <span className={styles.roleTag}>{ROLE_LABEL[e.role]}</span>}</span>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

export { HpBar };
