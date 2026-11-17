import { writeFile } from 'node:fs/promises';
import { TinyFishClient } from '../src/server/tinyfish.js';
import { basicProfile } from '../src/server/enrichment.js';
import type { Evidence } from '../src/shared/types.js';

const names=process.argv.slice(2);
if(!names.length)names.push('Khosla Ventures','Y Combinator','Bonfire Ventures','645 Ventures');
const reports:any[]=[];
const client=new TinyFishClient();
for(let i=0;i<names.length;i+=2) {
  const results=await Promise.all(names.slice(i,i+2).map(async name=>{
    const evidence:Evidence[]=[];
    const result=await basicProfile(client,name,evidence);
    return {name,...result,evidence};
  }));
  reports.push(...results);
  await writeFile('data/private/profile-audit.json',JSON.stringify({observedAt:new Date().toISOString(),reports},null,2));
  for(const result of results)console.log(JSON.stringify({name:result.name,website:result.profile.website,pages:result.pages.map(page=>page.final_url),cheque:result.profile.cheque,stages:result.profile.stages,geographies:result.profile.geographies,contacts:result.profile.contacts,caveats:result.profile.caveats}));
}
