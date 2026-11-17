import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResearchRun } from '../src/shared/types.js';
import { rankInvestors, type InvestorProfile } from '../src/server/ranking.js';
import { normalizedIdentity } from '../src/server/verification.js';
import { exportCsv } from '../src/server/pipeline.js';

// Reapply deterministic code corrections to already researched snapshots. No web requests.
for(const file of await readdir('data/public-runs')) {
  if(!file.endsWith('.json'))continue;
  const run=JSON.parse(await readFile(path.join('data/public-runs',file),'utf8')) as ResearchRun;
  if(run.status!=='complete'||!run.result)continue;
  for(const company of run.result.companies)for(const backing of company.investors)if(backing.leadScope==='round'&&backing.leadPartner&&backing.partnerEvidenceId)backing.isLead=true;
  const generatedCaveat=/^(?:Your country is not confirmed|Stage fit is unconfirmed|Published stages \(|Published geographic mandate \(|Known ineligible for this input|The published cheque range is retained|Typical cheque size not disclosed)/;
  const profiles=new Map<string,InvestorProfile>(run.result.investors.map(investor=>[normalizedIdentity(investor.name),{name:investor.name,website:investor.website,cheque:investor.cheque,stages:investor.stages.basis==='observed'?{value:null,evidenceIds:[]}:investor.stages,geographies:investor.geographies,contacts:investor.contacts,caveats:investor.caveats.filter(caveat=>!generatedCaveat.test(caveat))}]));
  run.result.investors=rankInvestors(run.input,run.result.companies,profiles,run.result.asOf).filter(investor=>profiles.has(normalizedIdentity(investor.name))&&investor.eligibility!=='ineligible').map((investor,index)=>({...investor,rank:index+1}));
  run.result.rankingMethod.version='evidence-fit-v2';
  run.result.rankingMethod.description='Investors with evidence supporting the requested stage and country rank before candidates whose eligibility needs confirmation. Within each group, the weighted fit score determines order. Unknown fields earn zero; exclusive ineligibility excludes an investor. Scores describe fit, not funding probability.';
  run.updatedAt=new Date().toISOString();
  await writeFile(path.join('data/public-runs',file),JSON.stringify(run,null,2));
  await writeFile(path.join('data/public-runs',file.replace(/\.json$/,'.csv')),exportCsv(run.result));
  const privatePath=path.resolve(process.env.RADAR_DATA_DIR||'data/private','runs',file);
  try { const privateRun=JSON.parse(await readFile(privatePath,'utf8'));privateRun.result=run.result;privateRun.updatedAt=run.updatedAt;await writeFile(privatePath,JSON.stringify(privateRun,null,2)); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
  console.log(JSON.stringify({run:run.id,companies:run.result.companies.length,top:run.result.investors.slice(0,3).map(i=>({name:i.name,eligibility:i.eligibility}))}));
}
