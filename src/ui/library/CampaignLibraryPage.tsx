import { useCallback, useEffect, useRef, useState } from 'react';
import { checkRawPack, readFiles, readZip } from '@/content/importer';
import type { RawPack } from '@/content/importer';
import type { Issue } from '@/content/issues';
import { deleteImportedCampaign, fetchBundledTrackIds, listCampaigns, loadCampaign, saveImportedCampaign } from '@/content/library';
import type { LibraryEntry } from '@/content/library';
import type { CampaignPack } from '@/content/pack';
import { CampaignCover } from '../CampaignCover';
import { Icon } from '../Icon';
import controls from '../controls.module.css';
import { cx } from '../cx';
import { filesFromDrop, filesFromInput } from '../dropFiles';
import type { PathFile } from '../dropFiles';
import { themeStyle } from '../theme';
import styles from './CampaignLibraryPage.module.css';

const AUTHORING_GUIDE = 'https://github.com/kenproudfoot/taleforge/blob/main/docs/CAMPAIGN_AUTHORING.md';

type ImportState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'done'; title: string; issues: Issue[] }
  | { status: 'failed'; message: string; issues: Issue[] };

export function CampaignLibraryPage() {
  const [campaigns, setCampaigns] = useState<LibraryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCampaigns(await listCampaigns());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importRaw = useCallback(
    async (read: () => Promise<RawPack>) => {
      setImportState({ status: 'working' });
      try {
        const raw = await read();
        if (!raw.files['campaign.md']) {
          setImportState({
            status: 'failed',
            message: 'No campaign.md was found. Choose a campaign folder or a .zip that contains the five campaign files.',
            issues: [],
          });
          return;
        }
        const tracks = await fetchBundledTrackIds();
        const check = checkRawPack(raw, tracks);
        if (!check.pack) {
          setImportState({ status: 'failed', message: 'This campaign has problems that need fixing before it can be imported.', issues: check.issues });
          return;
        }
        await saveImportedCampaign(raw, tracks);
        setImportState({ status: 'done', title: check.pack.manifest.title, issues: check.issues });
        await refresh();
      } catch (e) {
        setImportState({ status: 'failed', message: e instanceof Error ? e.message : String(e), issues: [] });
      }
    },
    [refresh],
  );

  const importFiles = useCallback(
    (files: PathFile[]) => {
      const zip = files.length === 1 && /\.zip$/i.test(files[0]!.path) ? files[0]!.file : null;
      return importRaw(() => (zip ? readZip(zip) : readFiles(files)));
    },
    [importRaw],
  );

  const remove = async (entry: LibraryEntry) => {
    await deleteImportedCampaign(entry.id);
    if (openId === entry.id) setOpenId(null);
    await refresh();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={controls.eyebrow}>Campaign library</p>
        <h1>Choose your adventure, or bring your own</h1>
        <p className={styles.lede}>
          A campaign is a folder of five plain-text files. Write one by hand or with Claude using the{' '}
          <a href={AUTHORING_GUIDE} target="_blank" rel="noreferrer">
            campaign authoring guide
          </a>
          , then drop it here.
        </p>
      </header>

      <section
        className={cx(styles.drop, dragging && styles.dropActive)}
        aria-label="Import a campaign"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void filesFromDrop(e.dataTransfer).then(importFiles);
        }}
      >
        <Icon name="upload" size={26} className={styles.dropIcon} />
        <div className={styles.dropText}>
          <strong>Import a campaign</strong>
          <span>Drag a campaign folder or .zip here, or choose one.</span>
        </div>
        <div className={controls.row}>
          <button type="button" className={controls.btn} onClick={() => zipInput.current?.click()}>
            <Icon name="file" /> Choose .zip
          </button>
          <button type="button" className={controls.btn} onClick={() => folderInput.current?.click()}>
            <Icon name="folder" /> Choose folder
          </button>
        </div>
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          aria-label="Campaign zip file"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFiles([{ path: file.name, file }]);
            e.target.value = '';
          }}
        />
        <input
          ref={(el) => {
            folderInput.current = el;
            el?.setAttribute('webkitdirectory', '');
          }}
          type="file"
          multiple
          className="sr-only"
          aria-label="Campaign folder"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files?.length) void importFiles(filesFromInput(e.target.files));
            e.target.value = '';
          }}
        />
      </section>

      <div aria-live="polite">
        {importState.status === 'working' && <p className={styles.status}>Reading and checking the campaign…</p>}
        {importState.status === 'done' && (
          <div className={cx(styles.result, styles.resultOk)}>
            <p>
              <Icon name="check" /> <strong>{importState.title}</strong> was imported and is ready to play.
            </p>
            <IssueList issues={importState.issues} />
          </div>
        )}
        {importState.status === 'failed' && (
          <div className={cx(styles.result, styles.resultBad)} role="alert">
            <p>
              <Icon name="alert" /> {importState.message}
            </p>
            <IssueList issues={importState.issues} />
          </div>
        )}
      </div>

      {loadError && (
        <p className={cx(styles.result, styles.resultBad)} role="alert">
          {loadError}
        </p>
      )}

      <section aria-label="Campaigns" className={styles.grid}>
        {campaigns?.map((c) => (
          <article key={`${c.source}:${c.id}`} className={styles.card} style={themeStyle(c.theme)}>
            <CampaignCover title={c.title} genre={c.genre} theme={c.theme} imageUrl={c.keyArtUrl} />
            <div className={styles.cardBody}>
              <div className={styles.cardMeta}>
                <span className={controls.chip}>{c.genre.replace(/-/g, ' ')}</span>
                <span className={controls.chip}>
                  <Icon name="clock" size={13} /> {c.targetMinutes} min
                </span>
                <span className={controls.chip}>
                  <Icon name="users" size={13} /> {c.players}
                </span>
                <span className={controls.chip}>{c.contentRating}</span>
                {c.source === 'imported' && <span className={cx(controls.chip, controls.chipGood)}>Imported</span>}
              </div>
              <h2 className={styles.cardTitle}>{c.title}</h2>
              <p className={styles.tagline}>{c.tagline}</p>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={cx(controls.btn, controls.small)}
                  aria-expanded={openId === c.id}
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                >
                  <Icon name="book" size={15} /> {openId === c.id ? 'Hide details' : 'Details'}
                </button>
                {c.source === 'imported' && (
                  <button type="button" className={cx(controls.btn, controls.small, controls.danger)} onClick={() => void remove(c)}>
                    <Icon name="trash" size={15} /> Remove
                  </button>
                )}
              </div>
              {openId === c.id && <CampaignDetails id={c.id} />}
            </div>
          </article>
        ))}
        {campaigns?.length === 0 && <p className={styles.status}>No campaigns yet. Import one to begin.</p>}
      </section>
    </div>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className={styles.issues}>
      {issues.map((issue, i) => (
        <li key={i} className={issue.severity === 'error' ? styles.issueError : styles.issueWarning}>
          <span className={styles.issueWhere}>
            {issue.severity === 'error' ? 'Error' : 'Warning'} · {issue.file}
            {issue.line ? `:${issue.line}` : ''}
            {issue.field ? ` · ${issue.field}` : ''}
          </span>
          <span>{issue.message}</span>
          {issue.fix && <span className={styles.issueFix}>Fix: {issue.fix}</span>}
        </li>
      ))}
    </ul>
  );
}

function CampaignDetails({ id }: { id: string }) {
  const [pack, setPack] = useState<CampaignPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadCampaign(id)
      .then((c) => live && setPack(c.pack))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [id]);
  if (error) return <p className={styles.detailError}>{error}</p>;
  if (!pack) return <p className={styles.status}>Loading…</p>;
  const m = pack.manifest;
  return (
    <div className={styles.details}>
      <p className={styles.era}>{m.era}</p>
      <p>{pack.overview.split(/\n\s*\n/)[0]}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Goal</dt>
          <dd>{m.goal.text}</dd>
        </div>
        <div>
          <dt>Acts</dt>
          <dd>{m.acts.map((a) => `${a.title} (${a.minutes} min)`).join(' · ')}</dd>
        </div>
        <div>
          <dt>Roles</dt>
          <dd>
            {Object.values(pack.rules.archetype_skins)
              .map((s) => s?.name)
              .filter(Boolean)
              .join(', ') || 'Standard archetypes'}
          </dd>
        </div>
        <div>
          <dt>World</dt>
          <dd>
            {pack.world.locations.length} locations · {pack.cast.length} characters · {m.endings.length} endings
          </dd>
        </div>
        {pack.rules.resources.length > 0 && (
          <div>
            <dt>Special rules</dt>
            <dd>{pack.rules.extra_rules.map((r) => r.name).join(', ')}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
