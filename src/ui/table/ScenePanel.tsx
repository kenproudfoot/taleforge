import { useState } from 'react';
import { locationName } from '@/engine/state';
import type { EngineCampaign } from '@/engine/types';
import type { CampaignPack } from '@/content/pack';
import type { Session } from '@/game/session';
import { CampaignCover } from '../CampaignCover';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { cx } from '../cx';
import { useStoredImage } from '../useStoredImage';
import styles from './ScenePanel.module.css';

interface Props {
  session: Session;
  pack: CampaignPack;
  campaign: EngineCampaign;
  keyArtUrl: string | null;
  /** True while the Art Director is painting the next scene. */
  painting?: boolean;
}

/** The current location or story moment. Never blank: falls back to the previous image, then key art. */
export function ScenePanel({ session, pack, campaign, keyArtUrl, painting }: Props) {
  const [open, setOpen] = useState(false);
  const url = useStoredImage(session.images.current);
  const name = locationName(session.state, campaign);
  return (
    <section className={styles.scene} aria-label="Current scene">
      <button type="button" className={styles.frame} onClick={() => url && setOpen(true)} aria-label={url ? `Open the picture of ${name} full screen` : name} disabled={!url}>
        {url ? <img key={url} src={url} alt={`Scene: ${name}`} className={styles.image} /> : <CampaignCover title={pack.manifest.title} genre={pack.manifest.genre} theme={pack.manifest.theme} imageUrl={keyArtUrl} className={styles.image} />}
        {painting && <span className={styles.shimmer} aria-hidden="true" />}
        <span className={styles.caption}>
          <span className={styles.place}>{name}</span>
          {painting && <span className={styles.painting}>painting the scene…</span>}
          {url && <Icon name="expand" size={15} />}
        </span>
      </button>
      {open && url && (
        <Modal title={name} hideTitle wide onClose={() => setOpen(false)} className={styles.full}>
          <img src={url} alt={`Scene: ${name}`} className={cx(styles.fullImage)} />
        </Modal>
      )}
    </section>
  );
}
