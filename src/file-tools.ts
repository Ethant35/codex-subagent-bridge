import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { checkedPath, readFileSafe, MAX_FILE_BYTES } from './workspace.js';
import { BridgeError, type Task } from './types.js';
import { redact } from './redact.js';
export interface ToolConfig { task:Task; workspace:string; eventPath:string; deadline:number; }
export const toolSchemas = {
  read_file: z.object({path:z.string()}).strict(),
  write_file: z.object({path:z.string(),content:z.string().max(MAX_FILE_BYTES)}).strict(),
  list_files: z.object({}).strict()
};
export class FileTools {
  private steps=0;
  constructor(readonly config:ToolConfig) {
    if(fs.existsSync(config.eventPath))for(const line of fs.readFileSync(config.eventPath,'utf8').split('\n')){try{const e=JSON.parse(line);if(['tool_allowed','tool_denied'].includes(e.type))this.steps=Math.max(this.steps,e.detail.step || 0);}catch{}}
  }
  event(type:string,detail:unknown) {fs.appendFileSync(this.config.eventPath,JSON.stringify(redact({at:new Date().toISOString(),type,detail}))+'\n',{mode:0o600});}
  async execute(name:string,args:unknown):Promise<string> {
    const {task,workspace}=this.config;
    try {
      if(Date.now()>=this.config.deadline)throw new BridgeError('TIMEOUT','Tool deadline exceeded','TIMED_OUT');
      if(fs.existsSync(path.join(path.dirname(this.config.eventPath),'cancel')))throw new BridgeError('CANCELLED','Cancellation requested','CANCELLED');
      if(++this.steps>task.maxToolSteps)throw new BridgeError('TOOL_LIMIT','Maximum tool steps reached');
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
          const f=checkedPath(workspace,p,true);fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});
          const fd=fs.openSync(f,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);
          try{fs.writeFileSync(fd,a.content!);}finally{fs.closeSync(fd);}result=JSON.stringify({written:p,bytes:Buffer.byteLength(a.content!)});
        }
      }
      this.event('tool_allowed',{name,path:a.path ?? null,step:this.steps}); return result;
    } catch(e) {
      const code=e instanceof BridgeError?e.code:'TOOL_ERROR';this.event('tool_denied',{name,code,step:this.steps});
      // A permanent failure marker prevents a later plausible model answer from hiding a tool failure.
      fs.writeFileSync(path.join(path.dirname(this.config.eventPath),'tool-failure'),code,{mode:0o600});
      throw new BridgeError(code,'Tool operation failed or was denied');
    }
  }
}
