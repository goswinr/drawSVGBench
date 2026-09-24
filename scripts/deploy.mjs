// Publishes dist/ to the gh-pages branch of this repo's origin, replacing
// whatever is there. Run through `npm run deploy`, which builds first.
// The build happens locally because it may use the Fable.Ripple fork in
// ./Fable.Ripple, which a CI checkout would not have.

import { execSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const git = (args, cwd = root) => execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

if (!existsSync(resolve(dist, 'index.html'))) throw new Error('dist/index.html is missing; run `npm run build` first');

const origin = git('remote get-url origin');
const source = git('rev-parse --short HEAD') + (git('status --porcelain') ? '+dirty' : '');

// Pages would otherwise run the files through Jekyll.
writeFileSync(resolve(dist, '.nojekyll'), '');

rmSync(resolve(dist, '.git'), { recursive: true, force: true });
git('init -q -b gh-pages', dist);
git('add -A', dist);
git(`commit -q -m "Deploy ${source}"`, dist);
git(`push -f -q ${origin} gh-pages`, dist);
rmSync(resolve(dist, '.git'), { recursive: true, force: true });

console.log(`Pushed dist/ (from ${source}) to ${origin} gh-pages`);
