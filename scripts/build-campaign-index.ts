// Generates public/content/campaigns/index.json: the list of bundled campaigns shown in the picker.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { summarizePack } from '../src/content/summary';
import { CAMPAIGNS_ROOT, listCampaignFolders, readPackFolder } from './lib/packs';

mkdirSync(CAMPAIGNS_ROOT, { recursive: true });
const campaigns = [];
for (const name of listCampaignFolders()) {
  const { pack } = readPackFolder(join(CAMPAIGNS_ROOT, name), name);
  if (!pack) {
    console.error(`skipping ${name}: it has validation errors (run npm run validate:campaigns)`);
    process.exitCode = 1;
    continue;
  }
  campaigns.push(summarizePack(pack));
}
// Bonus campaigns come after the core ones.
campaigns.sort((a, b) => Number(a.bonus) - Number(b.bonus));
writeFileSync(join(CAMPAIGNS_ROOT, 'index.json'), JSON.stringify({ campaigns }, null, 2) + '\n');
console.log(`campaign index: ${campaigns.length} campaign(s)`);
