import express from 'express';
import { z } from 'zod';
import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { DEMO_STARTUPS, STAGES } from '../shared/types.js';
import { RunStore } from './store.js';
import { ResearchEngine, exportCsv } from './pipeline.js';
import { warmEmbeddings } from './similarity.js';
import { WEIGHTS } from './ranking.js';

// The key is server-only. Local .env is optional and excluded from the repository.
try {
  const env=await readFile('.env','utf8');
  for(const line of env.split(/\r?\n/)){
    const match=line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(!match||process.env[match[1]])continue;
    process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
} catch {}
const store=new RunStore();await store.init();
const engine=new ResearchEngine(store);
for(const run of store.runs.values()){
  if(['complete','partial','failed'].includes(run.status))continue;
  run.status='failed';run.error='The server restarted. Resume this research to check its original remote jobs; saved dataset and Agent handles are preserved.';
  run.progress={...run.progress,phase:'failed',message:run.error};await store.save(run);
}
const app=express();
app.disable('x-powered-by');app.use(express.json({limit:'16kb'}));
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Cache-Control','no-store');next();});
const token=process.env.RADAR_ACCESS_TOKEN||'';
const production=process.env.NODE_ENV==='production'||process.argv.includes('--production');
const allowLive=process.env.RADAR_ALLOW_LIVE!=='false'&&!!process.env.TINYFISH_API_KEY&&(!production||!!token);
const safeCompare=(a:string,b:string)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);};
const auth:express.RequestHandler=(req,res,next)=>{
  if(production&&!token){res.status(503).json({error:'Private research access requires RADAR_ACCESS_TOKEN on a public deployment. Saved public demos remain readable.'});return;}
  if(token&&!safeCompare((req.headers.authorization||'').replace(/^Bearer\s+/i,''),token)){res.status(401).json({error:'Enter the demo access token to run or view private research.'});return;}
  next();
};
const sameOrigin:express.RequestHandler=(req,res,next)=>{
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host){res.status(403).json({error:'Cross-origin research requests are refused.'});return;}}catch{res.status(403).json({error:'Invalid request origin.'});return;}}
  next();
};
const schema=z.object({
  description:z.string().trim().min(12,'Describe the actual product and customer in at least 12 characters.').max(600),
  stage:z.enum(STAGES),country:z.string().trim().min(2).max(80),
  targetChequeUsd:z.number().finite().positive().max(1e9).nullable().optional().default(null),
  lookbackMonths:z.union([z.literal(12),z.literal(18)]).default(18),
  maxCompanies:z.number().int().min(10).max(50).default(24)
}).strict();
const newRuns:number[]=[];
app.get('/api/health',(_req,res)=>res.json({status:'ok',configured:!!process.env.TINYFISH_API_KEY,version:'1.0.0'}));
app.get('/api/config',(_req,res)=>res.json({configured:!!process.env.TINYFISH_API_KEY,allowLive,requiresAuth:!!token,embeddings:process.env.RADAR_EMBEDDINGS!=='false',examples:DEMO_STARTUPS,rankingWeights:WEIGHTS}));
app.get('/api/demos',(_req,res)=>res.json({runs:store.list().filter(r=>r.demo)}));
app.get('/api/runs',auth,(_req,res)=>res.json({runs:store.list()}));
app.post('/api/runs',sameOrigin,auth,async(req,res)=>{
  if(!allowLive){res.status(503).json({error:production&&!token?'New live research requires server RADAR_ACCESS_TOKEN on a public deployment. Saved real demos remain readable.':'Live research is disabled. Set a personal TINYFISH_API_KEY on the server.'});return;}
  if(!req.is('application/json')){res.status(415).json({error:'Send application/json.'});return;}
  const parsed=schema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});return;}
  if(engine.active.size>=Number(process.env.RADAR_MAX_ACTIVE_RUNS||3)){res.status(429).json({error:'Three research jobs are already active. Wait for one to finish before starting another.'});return;}
  const since=Date.now()-60*60*1000;while(newRuns.length&&newRuns[0]<since)newRuns.shift();
  if(newRuns.length>=8){res.status(429).json({error:'Live research is limited to 8 new jobs per hour to bound paid API usage.'});return;}
  newRuns.push(Date.now());const run=await engine.create(parsed.data);engine.start(run);res.status(202).json(store.public(run));
});
app.get('/api/runs/:id',async(req,res,next)=>{
  const run=store.get(String(req.params.id));if(!run){res.status(404).json({error:'Research run not found.'});return;}
  if(!run.demo)return auth(req,res,()=>res.json(store.public(run)));
  res.json(store.public(run));
});
app.post('/api/runs/:id/resume',sameOrigin,auth,async(req,res)=>{
  const run=store.get(String(req.params.id));if(!run){res.status(404).json({error:'Research run not found.'});return;}
  if(!allowLive){res.status(503).json({error:'Live research is disabled.'});return;}
  if(run.checkpoint?.ambiguity){res.status(409).json({error:run.checkpoint.ambiguity.message});return;}
  if(engine.active.has(run.id)){res.status(202).json(store.public(run));return;}
  if(run.status==='complete'){res.status(409).json({error:'This research is already complete. Use its result or start a fresh run.'});return;}
  if(engine.active.size>=Number(process.env.RADAR_MAX_ACTIVE_RUNS||3)){res.status(429).json({error:'Wait for an active research job to finish.'});return;}
  run.error=null;engine.start(run);res.status(202).json(store.public(run));
});
app.post('/api/runs/:id/refresh',sameOrigin,auth,async(req,res)=>{
  const run=store.get(String(req.params.id));if(!run?.result){res.status(404).json({error:'A completed funding result is required before refreshing investor facts.'});return;}
  if(!allowLive){res.status(503).json({error:'Live research is disabled.'});return;}
  if(engine.active.has(run.id)){res.status(202).json(store.public(run));return;}
  if(run.checkpoint?.ambiguity){res.status(409).json({error:run.checkpoint.ambiguity.message});return;}
  if(engine.active.size>=3){res.status(429).json({error:'Wait for an active research job to finish.'});return;}
  engine.refresh(run);res.status(202).json(store.public(run));
});
app.get('/api/runs/:id/export',(req,res)=>{
  const run=store.get(String(req.params.id));if(!run?.result){res.status(404).json({error:'This research has no exportable result yet.'});return;}
  const send=()=>{
    if(req.query.format==='csv'){res.setHeader('Content-Disposition',`attachment; filename="funding-radar-${run.id}.csv"`);res.type('text/csv').send(exportCsv(run.result!));}
    else{res.setHeader('Content-Disposition',`attachment; filename="funding-radar-${run.id}.json"`);res.json(run.result);}
  };
  if(!run.demo)return auth(req,res,send);send();
});
app.get('/api/openapi.json',async(_req,res)=>res.json(JSON.parse(await readFile('docs/openapi.json','utf8'))));
app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found.'}));
if(!production){const {createServer:createViteServer}=await import('vite');const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
else{
  app.use(express.static(path.resolve('dist/client'),{index:false}));
  app.get('/{*splat}',(_req,res)=>res.sendFile(path.resolve('dist/client/index.html')));
}
app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  res.status(error?.status||500).json({error:error?.type==='entity.parse.failed'?'Malformed JSON request.':'Request failed. Check the server log.'});
});
const port=Number(process.env.PORT||3000);const host=process.env.HOST||(production?'0.0.0.0':'127.0.0.1');
const server=app.listen(port,host,()=>{const address=server.address();const listeningPort=address&&typeof address==='object'?address.port:port;console.log(`Funding Radar listening at http://${host}:${listeningPort}; live research ${allowLive?'enabled':'disabled'}.`);});
void warmEmbeddings().catch(()=>console.warn('Sentence model unavailable; runs will explicitly use lexical similarity.'));
// One-time import of the three real TinySet jobs already created for this build.
if(process.env.RADAR_LOAD_PENDING_DEMOS==='true'){
  try{
    const imports=JSON.parse(await readFile('data/private/demo-datasets.json','utf8'));
    const ids:Record<string,string>={};
    for(const item of imports){
      const existing=[...store.runs.values()].find(r=>r.datasetId===item.dataset.id);
      const run=existing||await engine.create(item.input,{datasetId:item.dataset.id,asOf:item.asOf,demo:true});
      ids[item.example]=run.id;
      if(process.env.RADAR_REFRESH_DEMOS==='true'&&run.result)engine.refresh(run);
      else if(run.status!=='complete')engine.start(run);
    }
    await writeFile('data/private/demo-run-ids.json',JSON.stringify(ids,null,2));
  }catch(error){console.error('Demo import failed:',error instanceof Error?error.message:'unknown');}
}
