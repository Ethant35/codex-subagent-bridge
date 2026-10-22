import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { BridgeError, type Task, type State, type ProviderResult } from './types.js';
import { redact } from './redact.js';
export interface Run { id:string; correlationId:string; state:State; task:Task; instructionHash:string; pid:number; createdAt:string; updatedAt:string; workspace?:string; result?:ProviderResult; error?:{code:string;message:string}; changedPaths?:string[]; }
export function atomicJSON(file:string,value:unknown) {
  const temp = file+'.'+randomUUID()+'.tmp';
  const fd = fs.openSync(temp,'wx',0o600);
  try { fs.writeFileSync(fd,JSON.stringify(redact(value),null,2)+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp,file);
}
export function alive(pid:number):boolean { try { process.kill(pid,0); return true; } catch { return false; } }
export class Store {
  readonly root:string;
  constructor(root=process.env.CPB_HOME || path.join(os.homedir(),'.cpb')) {
    this.root = path.resolve(root); fs.mkdirSync(this.root,{recursive:true,mode:0o700});
    const st=fs.lstatSync(this.root); if(st.isSymbolicLink() || !st.isDirectory() || (st.mode & 0o077)) throw new BridgeError('UNSAFE_STORE','CPB_HOME must be a private directory (mode 0700)');
    fs.mkdirSync(path.join(this.root,'runs'),{recursive:true,mode:0o700});
  }
  dir(id:string) { if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BridgeError('INVALID_ID','Invalid run ID'); return path.join(this.root,'runs',id); }
  create(run:Run) { fs.mkdirSync(this.dir(run.id),{mode:0o700}); this.save(run); }
  save(run:Run) { run.updatedAt = new Date().toISOString(); atomicJSON(path.join(this.dir(run.id),'run.json'),run); }
  get(id:string):Run {
    const r=JSON.parse(fs.readFileSync(path.join(this.dir(id),'run.json'),'utf8')) as Run;
    if (['QUEUED','RUNNING'].includes(r.state) && !alive(r.pid)) {
      r.state='FAILED'; r.error={code:'OWNER_LOST',message:'Execution owner exited without a final result; edits were not confirmed'}; this.save(r);
    }
    return r;
  }
  list():Run[] { return fs.readdirSync(path.join(this.root,'runs')).filter(n=>/^[0-9a-f-]{36}$/.test(n)).flatMap(n=>{try{return [this.get(n)];}catch{return [];}}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); }
  event(id:string,type:string,detail:unknown) { fs.appendFileSync(path.join(this.dir(id),'events.jsonl'),JSON.stringify(redact({at:new Date().toISOString(),type,detail}))+'\n',{mode:0o600}); }
  cancel(id:string) { const r=this.get(id); if (!['QUEUED','RUNNING'].includes(r.state)) return {id,state:r.state,cancelRequested:false}; fs.writeFileSync(path.join(this.dir(id),'cancel'),'cancel\n',{mode:0o600}); return {id,state:r.state,cancelRequested:true}; }
  cancelled(id:string) { return fs.existsSync(path.join(this.dir(id),'cancel')); }
  // SQLite serializes slot claims/recovery across independent CLI and MCP processes.
  acquire(id:string): (()=>void)|undefined {
    const file=path.join(this.root,'scheduler.sqlite');
    const db=new DatabaseSync(file); fs.chmodSync(file,0o600);
    try {
      db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS slots (slot INTEGER PRIMARY KEY, pid INTEGER NOT NULL, id TEXT NOT NULL); BEGIN IMMEDIATE');
      const rows=db.prepare('SELECT slot,pid,id FROM slots').all() as unknown as Array<{slot:number;pid:number;id:string}>;
      for(const row of rows)if(!alive(row.pid))db.prepare('DELETE FROM slots WHERE slot=?').run(row.slot);
      const occupied=db.prepare('SELECT slot FROM slots').all() as unknown as Array<{slot:number}>;
      const slot=[0,1].find(n=>!occupied.some(r=>r.slot===n));
      if(slot===undefined){db.exec('COMMIT');return undefined;}
      db.prepare('INSERT INTO slots VALUES (?,?,?)').run(slot,process.pid,id);db.exec('COMMIT');
      return ()=>{const releaseDB=new DatabaseSync(file);try{releaseDB.exec('PRAGMA busy_timeout=5000');releaseDB.prepare('DELETE FROM slots WHERE id=? AND pid=?').run(id,process.pid);}finally{releaseDB.close();}};
    } finally {db.close();}
  }
}
