import { readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ContactRoute, ResearchRun, Evidence } from '../src/shared/types.js';
import type { TinyFetchPage } from '../src/server/tinyfish.js';
import { brandedInvestorUrl, makeEvidence } from '../src/server/enrichment.js';
import { exactQuote, shortExcerpt, normalizedIdentity } from '../src/server/verification.js';

const audit=JSON.parse(await readFile('data/private/founder-intake-audit.json','utf8')) as {observedAt:string;pages:TinyFetchPage[];facts:Array<{investor:string;type:ContactRoute['type'];url:string;label:string;detail:string;verificationLevel:'destination';quote:string;sourceUrl:string}>};
const eventId=randomUUID();
for(const file of await readdir('data/public-runs')) {
  if(!file.endsWith('.json'))continue;
  const run=JSON.parse(await readFile(`data/public-runs/${file}`,'utf8')) as ResearchRun;
  if(!run.result||run.status!=='complete')continue;
  let changed=false;
  for(const fact of audit.facts) {
    const investor=run.result.investors.find(i=>normalizedIdentity(i.name)===normalizedIdentity(fact.investor));if(!investor)continue;
    const referral=audit.pages.find(p=>(p.final_url||p.url)===fact.sourceUrl);
    const destination=audit.pages.find(p=>(p.final_url||p.url)===fact.url);
    if(!referral?.text||!destination?.text||!brandedInvestorUrl(fact.sourceUrl,fact.investor))throw new Error('A verified official referral and readable destination are required.');
    if(fact.sourceUrl!==fact.url&&!referral.links?.includes(fact.url))throw new Error('The official investor page does not link this intake.');
    const ids:string[]=[];
    const add=(page:TinyFetchPage,quote:string)=>{const checked=exactQuote(page,quote);if(!checked)throw new Error(`Intake excerpt does not match ${page.url}`);const e=makeEvidence(page,'contact',checked);e.retrievedAt=audit.observedAt;run.result!.evidence.push(e);ids.push(e.id);};
    if(fact.sourceUrl!==fact.url)add(referral,'Submit your pitch deck');
    add(destination,fact.quote);
    investor.contacts=[{type:fact.type,url:fact.url,label:fact.label,detail:fact.detail,verificationLevel:'destination',verified:true,evidenceIds:ids},...investor.contacts.filter(c=>c.type==='warm-intro')];
    if(fact.investor==='EIT Urban Mobility')investor.caveats.push('This programme co-invests and requires a secured lead investor, an MVP/prototype and urban-mobility relevance. Full call registration and the current cutoff must be checked before applying.');
    if(fact.investor==='Investible')investor.caveats.push('The official funding invitation and destination are verified; anonymous application fields are not verified.');
    changed=true;
  }
  if(!changed)continue;
  const groups=new Map<string,Evidence[]>();for(const e of run.result.evidence){const group=groups.get(e.url)||[];group.push(e);groups.set(e.url,group);}for(const group of groups.values())for(const e of group)e.excerpt=shortExcerpt(e.excerpt,Math.max(1,Math.floor(25/group.length)));
  run.usage.push({id:eventId,endpoint:'Fetch',operation:'manual-founder-intake-audit',startedAt:audit.observedAt,finishedAt:audit.observedAt,status:'success',units:audit.pages.length,detail:'Imported a shared actual TinyFish Fetch audit of five official/referral pages. Published invitation and destination are verified; no interactive application or submission is claimed.'});
  run.result.usage=run.usage;run.updatedAt=new Date().toISOString();await writeFile(`data/public-runs/${file}`,JSON.stringify(run,null,2));
  const privateFile=`data/private/runs/${file}`;const privateRun=JSON.parse(await readFile(privateFile,'utf8'));privateRun.result=run.result;privateRun.usage=run.usage;privateRun.updatedAt=run.updatedAt;privateRun.checkpoint??={agents:{}};privateRun.checkpoint.sourcePages??={};for(const p of audit.pages)privateRun.checkpoint.sourcePages[p.final_url||p.url]=p;await writeFile(privateFile,JSON.stringify(privateRun,null,2));
  console.log(JSON.stringify({run:run.id,updatedIntakes:audit.facts.filter(f=>run.result!.investors.some(i=>i.name===f.investor)).map(f=>f.investor)}));
}
