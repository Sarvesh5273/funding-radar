import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('compiled production server keeps private results locked without a token and returns JSON API 404s', {timeout:20000}, async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'funding-radar-release-'));
  const privateDir=path.join(directory,'private');
  const publicDir=path.join(directory,'data','public-runs');
  const marker='private-release-fixture-not-public';
  const fixture={id:'11111111-1111-4111-8111-111111111111',input:{description:marker,stage:'seed',country:'Germany',targetChequeUsd:null,lookbackMonths:18,maxCompanies:10},status:'complete',startedAt:'2026-11-17T00:00:00Z',updatedAt:'2026-11-17T00:00:00Z',progress:{phase:'complete',current:0,total:0,message:'Test fixture'},datasetId:null,usage:[],result:{privateMarker:marker},error:null,demo:false};
  await mkdir(path.join(privateDir,'runs'),{recursive:true});await mkdir(publicDir,{recursive:true});
  await writeFile(path.join(privateDir,'runs',`${fixture.id}.json`),JSON.stringify(fixture));
  await writeFile(path.join(publicDir,'22222222-2222-4222-8222-222222222222.json'),JSON.stringify({...fixture,id:'22222222-2222-4222-8222-222222222222',input:{...fixture.input,description:'Public release fixture'},result:null,demo:true}));
  const entry=fileURLToPath(new URL('../dist/server/index.js',import.meta.url));
  const child=spawn(process.execPath,[entry,'--production'],{cwd:directory,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'0',RADAR_DATA_DIR:privateDir,RADAR_ACCESS_TOKEN:'',RADAR_ALLOW_LIVE:'false',RADAR_EMBEDDINGS:'false',RADAR_LOAD_PENDING_DEMOS:'false',RADAR_REFRESH_DEMOS:'false',TINYFISH_API_KEY:'release-test-unused-key'},stdio:['ignore','pipe','pipe']});
  let output='';child.stderr.on('data',data=>{output+=String(data);});
  try{
    const base=await new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Production startup did not finish: ${output}`)),10000);
      const done=(error?:Error)=>{clearTimeout(timer);if(error)reject(error);};
      child.on('error',error=>done(error));child.on('exit',code=>done(new Error(`Production server exited ${code}: ${output}`)));
      child.stdout.on('data',data=>{output+=String(data);const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match){clearTimeout(timer);resolve(match[0]);}});
    });
    const config=await (await fetch(`${base}/api/config`)).json();assert.equal(config.allowLive,false);
    for(const route of ['/api/runs',`/api/runs/${fixture.id}`,`/api/runs/${fixture.id}/export?format=json`]){
      const response=await fetch(base+route);assert.equal(response.status,503,route);assert.ok(!(await response.text()).includes(marker),route);
    }
    const demos=await (await fetch(`${base}/api/demos`)).json();assert.equal(demos.runs.length,1);assert.equal(demos.runs[0].demo,true);
    const missing=await fetch(`${base}/api/does-not-exist`);assert.equal(missing.status,404);assert.match(missing.headers.get('content-type')||'',/application\/json/);assert.equal((await missing.json()).error,'API endpoint not found.');
  }finally{
    if(child.exitCode===null&&child.signalCode===null){
      await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
    }
    await rm(directory,{recursive:true,force:true});
  }
});
