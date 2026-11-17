import { mkdir,readFile,writeFile,rename,readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ResearchRun } from '../shared/types.js';
export interface StoredRun extends ResearchRun { checkpoint?: { agents:Record<string,string>; sourcePages?:Record<string,unknown>; pendingStart?:{operation:'TinySet'|'Agent';key?:string}; ambiguity?:{operation:string;agentKey?:string;message:string} }; }
export class RunStore {
  readonly directory=path.resolve(process.env.RADAR_DATA_DIR||'data/private');
  readonly runs=new Map<string,StoredRun>();
  private queues=new Map<string,Promise<void>>();
  async init(){
    await mkdir(path.join(this.directory,'runs'),{recursive:true});
    for(const dir of [path.join(this.directory,'runs'),path.resolve('data/public-runs')]){
      for(const file of await readdir(dir).catch(()=>[])){
        if(!file.endsWith('.json'))continue;
        try{const r=JSON.parse(await readFile(path.join(dir,file),'utf8')) as StoredRun;if(r.id&&r.input&&r.status){if(dir.endsWith('public-runs')){r.demo=true;if(this.runs.has(r.id))continue;}this.runs.set(r.id,r);}}catch{}
      }
    }
  }
  async save(run:StoredRun){
    this.runs.set(run.id,run);
    const json=JSON.stringify(run,null,2);
    const current=(this.queues.get(run.id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const file=path.join(this.directory,'runs',`${run.id}.json`),tmp=`${file}.tmp`;
      await writeFile(tmp,json);await rename(tmp,file);
    });
    this.queues.set(run.id,current);await current;
  }
  public(run:StoredRun):ResearchRun{const {checkpoint,...safe}=run;return safe;}
  get(id:string){return this.runs.get(id);}
  list(){return [...this.runs.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).map(r=>this.public(r));}
}
