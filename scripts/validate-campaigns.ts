// npm run validate:campaigns — replaced with the real validator in the content-system phase.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'public/content/campaigns');
const count = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).length : 0;
console.log(`validate:campaigns: ${count} campaign folder(s) found`);
