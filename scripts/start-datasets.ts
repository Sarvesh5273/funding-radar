import { mkdir, writeFile } from 'node:fs/promises';
import { DEMO_STARTUPS } from '../src/shared/types.js';
import { fundingSpec } from '../src/server/spec.js';
const key = process.env.TINYFISH_API_KEY;
if (!key) throw new Error('TINYFISH_API_KEY required');
await mkdir('data/private', { recursive: true });
const started = [];
for (const input of DEMO_STARTUPS) {
  const asOf = new Date();
  const spec = fundingSpec(input, asOf);
  const res = await fetch('https://agent.tinyfish.ai/v1/datasets', { method: 'POST', headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ spec, target_rows: input.maxCompanies }), signal: AbortSignal.timeout(90000) });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify({ status:res.status, error:body.error }));
  started.push({ example: input.id, input, asOf:asOf.toISOString(), dataset:body });
  await writeFile('data/private/demo-datasets.json', JSON.stringify(started, null, 2));
  console.log(JSON.stringify({ example:input.id, datasetId:body.id, runId:body.run?.id, status:body.status }));
}
