import { writeFile,mkdir } from 'node:fs/promises';
import { DEMO_STARTUPS } from '../src/shared/types.js';
const base=process.env.RADAR_URL||'http://127.0.0.1:3000';
const headers={'Content-Type':'application/json',...(process.env.RADAR_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.RADAR_ACCESS_TOKEN}`}:{})};
await mkdir('artifacts',{recursive:true});
for(const input of DEMO_STARTUPS){
  const {id,title,subtitle,...startup}=input;
  const res=await fetch(`${base}/api/runs`,{method:'POST',headers,body:JSON.stringify(startup)});
  if(!res.ok)throw new Error(await res.text());
  let run=await res.json();console.log(`${id}: run ${run.id}`);
  while(!['complete','partial','failed'].includes(run.status)){
    await new Promise(r=>setTimeout(r,15000));const state=await fetch(`${base}/api/runs/${run.id}`,{headers});run=await state.json();console.log(`${id}: ${run.progress?.message}`);
  }
  await writeFile(`artifacts/${id}.json`,JSON.stringify(run,null,2));
  if(run.status!=='complete')throw new Error(`${id} failed the acceptance gate: ${run.error||run.result?.warnings?.join('; ')}`);
  const csv=await fetch(`${base}/api/runs/${run.id}/export?format=csv`,{headers});await writeFile(`artifacts/${id}.csv`,await csv.text());
}
