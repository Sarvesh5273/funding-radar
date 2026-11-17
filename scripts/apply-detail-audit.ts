import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ResearchRun, Evidence } from '../src/shared/types.js';
import { emptyProfile, extractCheque, extractStages, makeEvidence } from '../src/server/enrichment.js';
import { exactQuote, normalizedIdentity, shortExcerpt } from '../src/server/verification.js';
import { rankInvestors, type InvestorProfile } from '../src/server/ranking.js';
import type { TinyFetchPage } from '../src/server/tinyfish.js';

// Build-time source audit, separate from the generic live engine. Every new
// prospect must already have a proved recent edge in the genuine TinySet run.
const id='730e8414-6b9e-4ff6-b4d2-b8ec851dadcc';
const file=`data/public-runs/${id}.json`;
const run=JSON.parse(await readFile(file,'utf8')) as ResearchRun;
if(!run.result||run.status!=='complete')throw new Error('A verified live result is required.');
const audit=JSON.parse(await readFile('data/private/india-detail-audit.json','utf8')) as {startedAt:string;observedAt:string;results:TinyFetchPage[]};
const result=run.result;
// Reapplying a parser correction reuses the same source audit, without
// recording another web request or retaining superseded unreferenced facts.
const auditUrls=new Set(audit.results.map(p=>p.final_url||p.url));
const referenced=new Set(result.investors.flatMap(i=>[...i.cheque.evidenceIds,...i.stages.evidenceIds,...i.geographies.evidenceIds,...i.contacts.flatMap(c=>c.evidenceIds),...i.leadPartners.map(p=>p.evidenceId)]));
result.evidence=result.evidence.filter(e=>!auditUrls.has(e.url)||referenced.has(e.id));
const source=(path:string)=>{const page=audit.results.find(p=>(p.final_url||p.url)===path);if(!page?.text)throw new Error(`Missing primary page ${path}`);return page;};
const proof=(page:TinyFetchPage,kind:Evidence['kind'],quote:string)=>{
  const checked=exactQuote(page,quote);if(!checked)throw new Error('Audit quote does not match its independently fetched source.');
  const evidence=makeEvidence(page,kind,checked);evidence.retrievedAt=audit.observedAt;result.evidence.push(evidence);return evidence.id;
};
const profiles=new Map<string,InvestorProfile>(result.investors.map(i=>[normalizedIdentity(i.name),{name:i.name,website:i.website,cheque:i.cheque,stages:i.stages.basis==='observed'?{value:null,evidenceIds:[]}:i.stages,geographies:i.geographies,contacts:i.contacts,caveats:i.caveats}]));
for(const name of ['Endiya Partners','Elevation Capital'])if(!result.companies.some(c=>c.investors.some(i=>normalizedIdentity(i.investorName)===normalizedIdentity(name))))throw new Error(`${name} has no proved recent comparable investment.`);
const endiya=emptyProfile('Endiya Partners');endiya.website='https://www.endiya.com';
const home=source('https://www.endiya.com/');
const stageQuote='We primarily invest in seed & pre-series A rounds, with some room for flexibility on both ends.';
endiya.stages={value:extractStages(stageQuote,'Endiya Partners')?.values||null,evidenceIds:[proof(home,'mandate',stageQuote)]};
const referral='The best way to approach us is through quality referrals';
endiya.contacts=[{type:'warm-intro',label:'Investor-published portfolio referral route',url:home.final_url||home.url,detail:'Endiya explicitly prefers quality referrals from portfolio companies and other entrepreneurs. OpenCFO is a proven recent backing; ask its founders whether they can introduce you. Availability of an introduction is unconfirmed.',verified:true,evidenceIds:[proof(home,'contact',referral)]}];
profiles.set(normalizedIdentity(endiya.name),endiya);
const elevation=emptyProfile('Elevation Capital');elevation.website='https://www.elevationcapital.com';
const strategy=source('https://www.elevationcapital.com/fintech-and-financial-services');
const rangeQuote='Investment range $500k to $35M';const parsed=extractCheque(rangeQuote);
if(!parsed)throw new Error('The published investment range could not be parsed.');
const {quote,...range}=parsed;
elevation.cheque={value:{...range,label:`${range.label} · published range across stages`},evidenceIds:[proof(strategy,'mandate',rangeQuote)]};
const stages='We invest in Seed · Series A · Growth';
elevation.stages={value:extractStages(stages,'Elevation Capital')?.values||null,evidenceIds:[proof(strategy,'mandate',stages)]};
elevation.caveats.push('The published investment range spans Seed, Series A and Growth; it is not an average or guaranteed initial Seed cheque. Currency is not explicitly identified on the source page.');
const pitch=source('https://www.elevationcapital.com/pitch');
elevation.contacts=[{type:'open-intake',label:'Official founder pitch intake',url:pitch.final_url||pitch.url,detail:'The official intake invites a pitch deck, short summary, video or product screens. The published destination was read; interactive application fields were not inspected.',verified:true,verificationLevel:'destination',evidenceIds:[proof(pitch,'contact','We promise to read through everything you send us.')]}];
profiles.set(normalizedIdentity(elevation.name),elevation);
result.investors=rankInvestors(run.input,result.companies,profiles,result.asOf).filter(i=>profiles.has(normalizedIdentity(i.name))&&i.eligibility!=='ineligible').slice(0,12).map((i,index)=>({...i,rank:index+1}));
const finalReferences=new Set(result.investors.flatMap(i=>[...i.cheque.evidenceIds,...i.stages.evidenceIds,...i.geographies.evidenceIds,...i.contacts.flatMap(c=>c.evidenceIds),...i.leadPartners.map(p=>p.evidenceId)]));
result.evidence=result.evidence.filter(e=>!auditUrls.has(e.url)||finalReferences.has(e.id));
const groups=new Map<string,Evidence[]>();for(const e of result.evidence){const group=groups.get(e.url)||[];group.push(e);groups.set(e.url,group);}for(const group of groups.values())for(const e of group)e.excerpt=shortExcerpt(e.excerpt,Math.max(1,Math.floor(25/group.length)));
if(!run.usage.some(e=>e.operation==='manual-investor-detail-audit'&&e.startedAt===audit.startedAt))run.usage.push({id:randomUUID(),endpoint:'Fetch',operation:'manual-investor-detail-audit',startedAt:audit.startedAt,finishedAt:audit.observedAt,status:'success',units:3,detail:'Three actual TinyFish Fetch pages supplied current Endiya/Elevation stage and founder-route evidence; their recent investments already passed the TinySet proof gate.'});
result.usage=run.usage;run.updatedAt=new Date().toISOString();
await writeFile(file,JSON.stringify(run,null,2));
const privateFile=`data/private/runs/${id}.json`;const privateRun=JSON.parse(await readFile(privateFile,'utf8'));privateRun.result=result;privateRun.usage=run.usage;privateRun.updatedAt=run.updatedAt;privateRun.checkpoint??={agents:{}};privateRun.checkpoint.sourcePages??={};for(const page of audit.results)privateRun.checkpoint.sourcePages[page.final_url||page.url]=page;await writeFile(privateFile,JSON.stringify(privateRun,null,2));
console.log(JSON.stringify({run:id,top:result.investors.slice(0,4).map(i=>({name:i.name,eligibility:i.eligibility,contacts:i.contacts.map(c=>c.label)}))}));
