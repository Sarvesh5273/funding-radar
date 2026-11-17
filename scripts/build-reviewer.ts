import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import type { ResearchRun } from '../src/shared/types.js';
import { DEMO_STARTUPS } from '../src/shared/types.js';

const source = path.resolve('data/public-runs');
const runs: ResearchRun[] = [];
for (const file of await readdir(source)) {
  if (file.endsWith('.json')) runs.push(JSON.parse(await readFile(path.join(source, file), 'utf8')));
}
const examples = DEMO_STARTUPS.map(example => {
  const run = runs.filter(item => item.input.description === example.description).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!run || run.status !== 'complete' || !run.result?.coverage.meetsMinimum || run.result.companies.length < 10) throw new Error(`A complete verified live snapshot is required for ${example.title}.`);
  if ('checkpoint' in run) throw new Error('Private checkpoint data cannot be published in the reviewer build.');
  return run;
});
process.env.VITE_RADAR_REPLAY = 'true';
await build({ build: { outDir: 'dist/reviewer' }, base: process.env.RADAR_REVIEWER_BASE || './' });
const destination = path.resolve('dist/reviewer/replay');
await mkdir(destination, { recursive: true });
for (const run of examples) {
  await writeFile(path.join(destination, `${run.id}.json`), JSON.stringify(run));
  await writeFile(path.join(destination, `${run.id}.csv`), await readFile(path.join(source, `${run.id}.csv`)));
}
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), repositoryUrl: process.env.RADAR_REPOSITORY_URL || undefined, runIds: examples.map(run => run.id) }));
await writeFile(path.resolve('dist/reviewer/.nojekyll'), '');
try {
  await writeFile(path.resolve('dist/reviewer/demo.mp4'), await readFile('artifacts/funding-radar-demo.mp4'));
} catch(error) {
  if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
}
console.log(`Reviewer build: ${examples.length} genuine dated research examples; live research disabled.`);
