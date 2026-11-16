// npm run playtest:report [-- <file.json …>] [--out report.md]
//
// Summarizes the playtest logs in playtests/ (written by the game while you play) into one Markdown report:
// per game, how long the table waited, what failed, which tool calls the engine rejected, actions that
// probably should have been rolled, voice and picture problems, and every 👎 with its context and note.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzePlaytest, SLOW_TURN_MS } from '../src/game/playtest';
import type { PlaytestLog } from '../src/game/playtest';
import { playtestDir } from './lib/playtestServer';

const { values, positionals } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true });
const dir = playtestDir();
const files = positionals.length ? positionals : existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : [];
if (files.length === 0) {
  console.log(`No playtest logs yet (looked in ${dir}). Play a game with Settings → Playtesting turned on.`);
  process.exit(0);
}

const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const quote = (text: string, max = 400) => `> ${(text.length > max ? `${text.slice(0, max)}…` : text).replace(/\n+/g, ' ')}`;
const out: string[] = ['# TaleForge playtest report', ''];

const logs = files
  .map((f) => JSON.parse(readFileSync(f, 'utf8')) as PlaytestLog)
  .filter((l) => l.format === 'taleforge-playtest')
  .sort((a, b) => a.startedAt - b.startedAt);

for (const log of logs) {
  const f = analyzePlaytest(log);
  out.push(`## ${log.campaignTitle}: ${new Date(log.startedAt).toLocaleString()}`, '');
  out.push(
    `- **Party:** ${log.party.map((p) => `${p.name} (${p.player})`).join(', ')}`,
    `- **Played:** ${Math.round(log.elapsedMs / 60_000)} min, ${f.turns} turns${log.ended ? `, ended: ${log.ended}` : ', not finished'}`,
    `- **Setup:** DM ${log.setup.dm} · helper ${log.setup.helper} · voice ${log.setup.voice} · speech ${log.setup.speech} · pictures ${log.setup.pictures}`,
    `- **Waiting for the DM:** ${f.wait ? `median ${s(f.wait.median)}, 90% under ${s(f.wait.p90)}, longest ${s(f.wait.max)}` : 'no completed turns'}${f.firstWords ? ` · first words after ${s(f.firstWords.median)} (median)` : ''}`,
    `- **Rolls per turn:** ${f.rollsPerTurn.toFixed(2)} · scene changes: ${f.sceneChanges}`,
    `- **Pictures:** ${f.pictures.painted} painted${f.pictures.medianMs !== null ? ` (median ${s(f.pictures.medianMs)})` : ''}, ${f.pictures.failed} failed`,
    `- **Feedback:** ${f.liked} 👍, ${f.disliked.length} 👎`,
    '',
  );
  if (log.survey) {
    out.push('### Notes from the table', '', `- Fun: ${log.survey.fun}/5 · pace: ${log.survey.pacing}`);
    if (log.survey.confusing) out.push(`- Confusing, broken or annoying: ${log.survey.confusing}`);
    if (log.survey.other) out.push(`- Anything else: ${log.survey.other}`);
    out.push('');
  }
  if (f.disliked.length) {
    out.push('### Replies marked 👎', '');
    for (const d of f.disliked) out.push(`- **Note:** ${d.note || '(none)'}`, `  - Player: ${d.player || '(opening)'}`, `  - DM: ${quote(d.dm).slice(2)}`);
    out.push('');
  }
  const problems: string[] = [
    ...f.failedTurns.map((t) => `Turn ${t.turn} failed (${t.input}): ${t.error}`),
    ...f.rejectedTools.map((t) => `Turn ${t.turn}: engine rejected ${t.tool}: ${t.error}`),
    ...f.possibleSkippedRolls.map((t) => `Turn ${t.turn}: no roll for "${t.input}"`),
    ...f.slowTurns.map((t) => `Turn ${t.turn}: slow (${s(t.waitMs)}, over ${s(SLOW_TURN_MS)}) for "${t.input}"`),
    ...[...new Set(f.voiceIssues)].map((m) => `Voice: ${m}`),
    ...[...new Set(f.pictures.errors)].map((m) => `Pictures: ${m}`),
  ];
  out.push('### Problems found', '', ...(problems.length ? problems.map((p) => `- ${p}`) : ['- none']), '');
}

const report = out.join('\n');
if (values.out) {
  writeFileSync(values.out, report);
  console.log(`Wrote ${values.out} (${logs.length} game${logs.length === 1 ? '' : 's'}).`);
} else console.log(report);
