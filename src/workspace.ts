import fs from 'node:fs';
import path from 'node:path';
import { atomicJSON } from './store.js';
import { randomUUID, createHash } from 'node:crypto';
import { BridgeError, type Task } from './types.js';
export const MAX_FILE_BYTES=512_000;
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export function checkedPath(root:string,relative:string,allowMissing=false):string {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(p=>!p || p==='.' || p==='..' || p.startsWith('.git') || p==='.claude' || p==='.codex')) throw new BridgeError('PATH_DENIED','Path is not an authorized relative file');
  let current=root;
  if(fs.realpathSync(root)!==root) throw new BridgeError('PATH_DENIED','Workspace root must be canonical');
  const parts=relative.split('/');
  for(let i=0;i<parts.length;i++) {
    current=path.join(current,parts[i]!);
    try {const st=fs.lstatSync(current);if(st.isSymbolicLink() || (i<parts.length-1 && !st.isDirectory()))throw new BridgeError('PATH_DENIED','Symlinks and non-directory parents are forbidden');}
    catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT' && allowMissing) continue;throw e;}
  }
  return current;
}
function regular(s:fs.Stats) {
  if(!s.isFile()||s.nlink!==1||s.size>MAX_FILE_BYTES)throw new BridgeError('FILE_DENIED','Only bounded regular files with one link are supported');
}
export function readFileSafe(root:string,p:string):Buffer {
  const f=checkedPath(root,p);regular(fs.lstatSync(f));
  const fd=fs.openSync(f,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    regular(fs.fstatSync(fd));const buffer=Buffer.alloc(MAX_FILE_BYTES+1);let length=0;
    while(length<buffer.length){const n=fs.readSync(fd,buffer,length,buffer.length-length,null);if(!n)break;length+=n;}
    if(length>MAX_FILE_BYTES)throw new BridgeError('FILE_DENIED','File grew beyond size limit');
    return buffer.subarray(0,length);
  }finally{fs.closeSync(fd);}
}
export function writeFileSafe(root:string,p:string,data:string|Buffer) {
  if(Buffer.byteLength(data)>MAX_FILE_BYTES)throw new BridgeError('FILE_LIMIT','File exceeds size limit');
  const f=checkedPath(root,p,true);
  try{regular(fs.lstatSync(f));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});
  // Write beside the target, then rename. A failed/short write must never truncate the old file.
  // Node 22 fs flags/rename/fsync: https://nodejs.org/download/release/v22.13.1/docs/api/fs.html
  const temp=path.join(path.dirname(f),'.cpb-'+randomUUID()+'.tmp');let mode=0o600;
  try{mode=fs.lstatSync(f).mode&0o777;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  let fd:number|undefined;
  try {
    fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    fs.writeFileSync(fd,data);fs.fchmodSync(fd,mode);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    checkedPath(root,p,true);fs.renameSync(temp,f);
    const directory=fs.openSync(path.dirname(f),fs.constants.O_RDONLY);try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
    try{fs.unlinkSync(temp);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
}
export class Workspace {
  readonly original = new Map<string,string|null>();
  constructor(readonly task:Task, readonly root:string) {}
  prepare(checkpoint:()=>void=()=>{}) {
    const source=this.task.workspaceRoot;
    if(fs.realpathSync(source)!==source || !fs.statSync(source).isDirectory())throw new BridgeError('INVALID_WORKSPACE','Use a canonical existing workspace directory');
    fs.mkdirSync(this.root,{mode:0o700});
    let bytes=0;
    for(const p of new Set([...this.task.readablePaths,...this.task.writablePaths])) {
      checkpoint();
      let b:Buffer;
      try {b=readFileSafe(source,p);}catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT' && this.task.writablePaths.includes(p)){checkedPath(source,p,true);this.original.set(p,null);continue;}throw e;}
      bytes+=b.length;if(bytes>8_000_000)throw new BridgeError('WORKSPACE_LIMIT','Authorized snapshot exceeds 8 MB');
      this.original.set(p,digest(b));
      if(this.task.writablePaths.includes(p)){
        const originals=path.join(path.dirname(this.root),'originals');fs.mkdirSync(originals,{recursive:true,mode:0o700});writeFileSafe(originals,p,b);
      }
      const target=checkedPath(this.root,p,true);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,b,{mode:0o600});
    }
  }
  publish(checkpoint:()=>void=()=>{}):string[] {
    const changes:Array<{p:string;data:Buffer;target:string}>=[];
    for(const p of this.task.writablePaths) {
      checkpoint();
      const staged=checkedPath(this.root,p,true);if(!fs.existsSync(staged))continue;
      const data=readFileSafe(this.root,p);if(digest(data)===this.original.get(p))continue;
      const target=checkedPath(this.task.workspaceRoot,p,true);
      let now:string|null=null;try{now=digest(readFileSafe(this.task.workspaceRoot,p));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(now!==this.original.get(p))throw new BridgeError('WRITE_CONFLICT','Source changed during task; staged edits retained, no changes published','BLOCKED');
      changes.push({p,data,target});
    }
    const journal={version:1,taskId:this.task.taskId,state:'PREPARED',files:changes.map(c=>({path:c.p,beforeHash:this.original.get(c.p)??null,afterHash:digest(c.data),status:'pending'}))};
    const journalPath=path.join(path.dirname(this.root),'publication.json');
    atomicJSON(journalPath,journal);
    try {
      journal.state='PUBLISHING';atomicJSON(journalPath,journal);
      for(const [index,c] of changes.entries()) {
        checkpoint();writeFileSafe(this.task.workspaceRoot,c.p,c.data);
        journal.files[index]!.status='published';atomicJSON(journalPath,journal);
      }
      checkpoint();journal.state='COMPLETED';atomicJSON(journalPath,journal);
    }catch(e){journal.state='INTERRUPTED';atomicJSON(journalPath,journal);throw e;}
    return changes.map(c=>c.p);
  }
}
