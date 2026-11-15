// Generates public/content/campaigns/index.json from the bundled campaign folders.
// Fleshed out in the content-system phase; safe to run when no campaigns exist yet.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'public/content/campaigns');
mkdirSync(root, { recursive: true });
const ids = readdirSync(root)
  .filter((name) => statSync(join(root, name)).isDirectory() && existsSync(join(root, name, 'campaign.md')))
  .sort();
writeFileSync(join(root, 'index.json'), JSON.stringify({ campaigns: ids.map((id) => ({ id })) }, null, 2) + '\n');
console.log(`campaign index: ${ids.length} campaign(s)`);
