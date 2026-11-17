import { useEffect, useState } from 'react';
import { locationName } from '@/engine/state';
import type { EngineCampaign } from '@/engine/types';
import type { CampaignPack } from '@/content/pack';
import { sceneGallery } from '@/game/session';
import type { Session } from '@/game/session';
import { CampaignCover } from '../CampaignCover';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { cx } from '../cx';
import { useStoredImage } from '../useStoredImage';
import { ParallaxImage } from '../art/ParallaxImage';
import { requestTiltPermission } from '../art/parallax';
import styles from './ScenePanel.module.css';

interface Props {
  session: Session;
  pack: CampaignPack;
  campaign: EngineCampaign;
  keyArtUrl: string | null;
  /** True while the Art Director is painting the next scene. */
  painting?: boolean;
}

/** The name of a place by id (a campaign location or one the DM improvised). */
function placeName(id: string | null, session: Session, campaign: EngineCampaign): string {
  if (!id) return locationName(session.state, campaign);
  return campaign.locations.find((l) => l.id === id)?.name ?? session.state.improvisedLocations.find((l) => l.id === id)?.name ?? id;
}

/**
 * The current location or story moment. Never blank: falls back to the previous image, then key art.
 * Small arrows page back through every picture shown this game; the next turn returns to the current one.
 */
export function ScenePanel({ session, pack, campaign, keyArtUrl, painting }: Props) {
  const [open, setOpen] = useState(false);
  const gallery = sceneGallery(session);
  const [pick, setPick] = useState<string | null>(null);
  // Back to the current picture whenever the story moves on (a new picture or a new message).
  const current = session.images.current;
  const turns = session.chat.length;
  useEffect(() => setPick(null), [current, turns]);
  const nowIndex = gallery.findIndex((g) => g.key === session.images.current);
  const picked = pick ? gallery.findIndex((g) => g.key === pick) : -1;
  const index = picked >= 0 ? picked : nowIndex;
  const shown = gallery[index];
  const key = shown?.key ?? session.images.current;
  const url = useStoredImage(key);
  const earlier = picked >= 0 && picked !== nowIndex;
  const name = earlier && shown ? placeName(shown.at, session, campaign) : locationName(session.state, campaign);
  const go = (to: number) => {
    const target = gallery[to];
    if (target) setPick(target.key === session.images.current ? null : target.key);
  };
  return (
    <section className={styles.scene} aria-label="Current scene">
      <div className={styles.frameWrap}>
        <button
          type="button"
          className={styles.frame}
          onClick={() => {
            if (!url) return;
            // Tapping the picture is also the moment iOS lets a page read the tilt sensors.
            void requestTiltPermission();
            setOpen(true);
          }}
          aria-label={url ? `Open the picture of ${name} full screen` : name}
          disabled={!url}
          title={shown?.caption}
        >
          {url && key ? <ParallaxImage key={url} imageKey={key} url={url} alt={`Scene: ${name}`} className={styles.image} paused={open} /> : <CampaignCover title={pack.manifest.title} genre={pack.manifest.genre} theme={pack.manifest.theme} imageUrl={keyArtUrl} className={styles.image} />}
          {painting && <span className={styles.shimmer} aria-hidden="true" />}
          <span className={styles.caption}>
            <span className={styles.place}>{name}</span>
            {painting && <span className={styles.painting}>painting the scene…</span>}
            {url && <Icon name="expand" size={15} />}
          </span>
        </button>
        {gallery.length > 1 && index >= 0 && (
          <>
            <button type="button" className={cx(styles.arrow, styles.arrowLeft)} onClick={() => go(index - 1)} disabled={index <= 0} aria-label="Previous picture" title="Previous picture">
              <Icon name="chevronLeft" size={16} />
            </button>
            <button type="button" className={cx(styles.arrow, styles.arrowRight)} onClick={() => go(index + 1)} disabled={index >= gallery.length - 1} aria-label="Next picture" title="Next picture">
              <Icon name="chevronRight" size={16} />
            </button>
            <span className={cx(styles.counter, earlier && styles.counterEarlier)} aria-live="polite">
              {earlier ? (
                <button type="button" onClick={() => setPick(null)} title="Back to the current picture" aria-label={`Picture ${index + 1} of ${gallery.length}. Back to the current picture`}>
                  {index + 1} / {gallery.length} · now
                </button>
              ) : (
                `${index + 1} / ${gallery.length}`
              )}
            </span>
          </>
        )}
      </div>
      {open && url && key && (
        <Modal title={name} hideTitle wide onClose={() => setOpen(false)} className={styles.full}>
          <ParallaxImage imageKey={key} url={url} alt={`Scene: ${name}`} className={cx(styles.fullImage)} fit="contain" maxHeight="(100vh - 80px)" />
        </Modal>
      )}
    </section>
  );
}
