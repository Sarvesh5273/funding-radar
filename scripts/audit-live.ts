import { readFile, writeFile } from 'node:fs/promises';
import { TinyFishClient, type TinyFetchPage } from '../src/server/tinyfish.js';
import { candidateFromRow, verifyRound, extractDates } from '../src/server/verification.js';
import { dateWindow } from '../src/server/spec.js';

const datasets=JSON.parse(await readFile('data/private/demo-datasets.json','utf8'));
const client=new TinyFishClient();
const records=await Promise.all(datasets.map(async (entry:any)=>({entry,rows:(await client.getRows(entry.dataset.id)).rows})));
const urls=[...new Set(records.flatMap(({rows}:any)=>rows.map(candidateFromRow).map((c:any)=>c.sourceUrl).filter(Boolean)))] as string[];
let pages:TinyFetchPage[]=[];
try { pages=JSON.parse(await readFile('data/private/source-audit.json','utf8')).pages||[]; } catch {}
const known=new Set(pages.map(p=>p.url));
const missing=process.env.RADAR_AUDIT_LOCAL==='true'?[]:urls.filter(url=>!known.has(url));
for(let i=0;i<missing.length;i+=20) {
  const groups=[missing.slice(i,i+10),missing.slice(i+10,i+20)].filter(group=>group.length);
  const fetched=await Promise.allSettled(groups.map(group=>client.fetchPages(group,'Audit the original funding event and named participants; preserve exact source text for local validation.')));
  for(const response of fetched)if(response.status==='fulfilled')pages.push(...response.value.results);
  await writeFile('data/private/source-audit.json',JSON.stringify({asOf:new Date().toISOString(),pages},null,2));
  console.log(JSON.stringify({read:pages.length,total:urls.length}));
}
const summaries=records.map(({entry,rows}:any)=>({
  example:entry.example,datasetId:entry.dataset.id,
  rows:rows.map((row:any)=>{
    const c=candidateFromRow(row),page=pages.find(p=>p.url===c.sourceUrl||p.final_url===c.sourceUrl);
    const window=dateWindow(new Date(entry.asOf),entry.input.lookbackMonths);
    let proof=page?verifyRound(c,page,window):null;
    let verifiedDate=c.roundDate;
    if(page&&!proof?.accepted)for(const date of [...new Set([page.published_date?.slice(0,10),...extractDates((page.text||'').slice(0,2500))].filter((date):date is string=>!!date))]) {
      const trial=verifyRound({...c,roundDate:date},page,window);
      if(trial.accepted){proof=trial;verifiedDate=date;break;}
    }
    return {candidate:c,verifiedDate,published:page?.published_date,title:page?.title,textLength:page?.text?.length||0,proof};
  }),
}));
await writeFile('data/private/source-audit-summary.json',JSON.stringify(summaries,null,2));
for(const summary of summaries)console.log(JSON.stringify({example:summary.example,accepted:summary.rows.filter((row:any)=>row.proof?.accepted).length,total:summary.rows.length,acceptedNames:summary.rows.filter((row:any)=>row.proof?.accepted).map((row:any)=>({name:row.candidate.name,date:row.verifiedDate,investors:row.proof.investors.map((i:any)=>i.name)})),rejected:summary.rows.filter((row:any)=>!row.proof?.accepted).map((row:any)=>({name:row.candidate.name,date:row.candidate.roundDate,published:row.published,reason:row.proof?.reason||'Fetch failed',url:row.candidate.sourceUrl}))}));
