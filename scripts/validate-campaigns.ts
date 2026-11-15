// npm run validate:campaigns [-- <folder> ...]
// Validates the core content files and every campaign pack (or just the folders given).
// Exits with code 1 if any errors are found.
import { basename, join, resolve } from 'node:path';
import { formatIssue, hasErrors } from '../src/content/issues';
import type { Issue } from '../src/content/issues';
import { CAMPAIGNS_ROOT, listCampaignFolders, readCore, readPackFolder } from './lib/packs';

const args = process.argv.slice(2);
let errorCount = 0;
let warningCount = 0;

function report(label: string, issues: Issue[]): void {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  errorCount += errors;
  warningCount += warnings;
  const status = errors ? 'FAIL' : warnings ? 'ok (with warnings)' : 'ok';
  console.log(`${errors ? '✖' : '✔'} ${label}: ${status}`);
  for (const issue of issues) console.log(`  ${formatIssue(issue).replace(/\n/g, '\n  ')}`);
}

if (args.length === 0) report('core', readCore().issues);

const targets = args.length
  ? args.map((a) => ({ dir: resolve(a), name: basename(resolve(a)) }))
  : listCampaignFolders().map((name) => ({ dir: join(CAMPAIGNS_ROOT, name), name }));

for (const t of targets) {
  const { issues } = readPackFolder(t.dir, t.name);
  report(`campaign ${t.name}`, issues);
}

console.log(`\n${targets.length} campaign(s) checked: ${errorCount} error(s), ${warningCount} warning(s).`);
if (errorCount > 0 || (args.length === 0 && hasErrors(readCore().issues))) process.exit(1);
