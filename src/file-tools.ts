import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { readFileSafe, writeFileSafe, MAX_FILE_BYTES } from './workspace.js';
import { BridgeError, type Task } from './types.js';
import { redact } from './redact.js';
export interface ToolConfig { task:Task; workspace:string; eventPath:string; deadline:number; }
export const toolSchemas = {
  read_file: z.object({path:z.string()}).strict(),
  write_file: z.object({path:z.string(),content:z.string().max(MAX_FILE_BYTES)}).strict(),
  list_files: z.object({}).strict()
};
export class FileTools {
  constructor(readonly config:ToolConfig) {}
  assertHealthy() {
    const dir=path.dirname(this.config.eventPath),file=path.join(dir,'tool-ledger.sqlite');
    if(fs.existsSync(path.join(dir,'tool-failure')))throw new BridgeError('TOOL_FAILED','A tool operation failed');
    if(!fs.existsSync(file))return;
    const db=new DatabaseSync(file,{readOnly:true});
    try{const row=db.prepare('SELECT failed,owner FROM ledger WHERE id=1').get() as {failed:number;owner:number|null}|undefined;
      if(!row||row.failed||row.owner!==null)throw new BridgeError('TOOL_FAILED','Tool ledger contains failed or unfinished work');
    }finally{db.close();}
  }
  event(type:string,detail:unknown) {
    const fd=fs.openSync(this.config.eventPath,'a',0o600);
    try{fs.writeSync(fd,JSON.stringify(redact({at:new Date().toISOString(),type,detail}))+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
  async execute(name:string,args:unknown):Promise<string> {
    const {task,workspace}=this.config,dir=path.dirname(this.config.eventPath),token=randomUUID();
    const db=new DatabaseSync(path.join(dir,'tool-ledger.sqlite'));let step=0,owned=false;
    db.exec('PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, steps INTEGER NOT NULL, failed INTEGER NOT NULL, owner INTEGER, token TEXT); INSERT OR IGNORE INTO ledger VALUES (1,0,0,NULL,NULL)');
    fs.chmodSync(path.join(dir,'tool-ledger.sqlite'),0o600);
    try {
      // Commit each reservation before its side effect. A dead owner makes this task fail closed.
      for(;;){
        db.exec('BEGIN IMMEDIATE');
        const row=db.prepare('SELECT * FROM ledger WHERE id=1').get() as {steps:number;failed:number;owner:number|null;token:string|null};
        if(row.owner!==null){
          let alive=true;try{process.kill(row.owner,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
          if(alive){db.exec('COMMIT');if(Date.now()>=this.config.deadline)throw new BridgeError('TIMEOUT','Tool deadline exceeded','TIMED_OUT');await new Promise(r=>setTimeout(r,20));continue;}
          db.exec('UPDATE ledger SET failed=1,owner=NULL,token=NULL WHERE id=1');row.failed=1;
        }
        step=row.steps+1;db.prepare('UPDATE ledger SET steps=?,owner=?,token=? WHERE id=1').run(step,process.pid,token);db.exec('COMMIT');owned=true;
        if(row.failed||fs.existsSync(path.join(dir,'tool-failure')))throw new BridgeError('TASK_FAILED','A previous tool operation failed');
        break;
      }
      if(Date.now()>=this.config.deadline)throw new BridgeError('TIMEOUT','Tool deadline exceeded','TIMED_OUT');
      if(fs.existsSync(path.join(path.dirname(this.config.eventPath),'cancel')))throw new BridgeError('CANCELLED','Cancellation requested','CANCELLED');
      if(step>task.maxToolSteps)throw new BridgeError('TOOL_LIMIT','Maximum tool steps reached');
      if(!task.allowedOperations.includes(name as never) || !(name in toolSchemas))throw new BridgeError('OPERATION_DENIED','Operation is not authorized');
      const a=toolSchemas[name as keyof typeof toolSchemas].parse(args) as {path?:string;content?:string};
      let result:string;
      if(name==='list_files')result=JSON.stringify(task.readablePaths);
      else {
        const p=a.path!;
        if(!(name==='read_file'?task.readablePaths:task.writablePaths).includes(p))throw new BridgeError('PATH_DENIED','File is outside the explicit path allowlist');
        if(name==='read_file') result=readFileSafe(workspace,p).toString('utf8');
        else {
          if(Buffer.byteLength(a.content!)>MAX_FILE_BYTES)throw new BridgeError('FILE_LIMIT','File exceeds size limit');
          writeFileSafe(workspace,p,a.content!);result=JSON.stringify({written:p,bytes:Buffer.byteLength(a.content!)});
        }
      }
      this.event('tool_allowed',{name,path:a.path ?? null,step}); return result;
    } catch(e) {
      if(db.isTransaction)db.exec('ROLLBACK');
      db.exec('UPDATE ledger SET failed=1 WHERE id=1');
      const code=e instanceof BridgeError?e.code:'TOOL_ERROR';this.event('tool_denied',{name,code,step});
      // A permanent failure marker prevents a later plausible model answer from hiding a tool failure.
      fs.writeFileSync(path.join(path.dirname(this.config.eventPath),'tool-failure'),code,{mode:0o600});
      throw new BridgeError(code,'Tool operation failed or was denied',e instanceof BridgeError?e.state:'FAILED');
    } finally {
      if(owned)db.prepare('UPDATE ledger SET owner=NULL,token=NULL WHERE id=1 AND token=?').run(token);
      db.close();
    }
  }
}
