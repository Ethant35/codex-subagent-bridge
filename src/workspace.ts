import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
export function readFileSafe(root:string,p:string):Buffer {
  const f=checkedPath(root,p);const fd=fs.openSync(f,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>MAX_FILE_BYTES)throw new BridgeError('FILE_DENIED','Only bounded regular files with one link are supported');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
export class Workspace {
  readonly original = new Map<string,string|null>();
  constructor(readonly task:Task, readonly root:string) {}
  prepare() {
    const source=this.task.workspaceRoot;
    if(fs.realpathSync(source)!==source || !fs.statSync(source).isDirectory())throw new BridgeError('INVALID_WORKSPACE','Use a canonical existing workspace directory');
    fs.mkdirSync(this.root,{mode:0o700});
    let bytes=0;
    for(const p of new Set([...this.task.readablePaths,...this.task.writablePaths])) {
      let b:Buffer;
      try {b=readFileSafe(source,p);}catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT' && this.task.writablePaths.includes(p)){checkedPath(source,p,true);this.original.set(p,null);continue;}throw e;}
      bytes+=b.length;if(bytes>8_000_000)throw new BridgeError('WORKSPACE_LIMIT','Authorized snapshot exceeds 8 MB');
      this.original.set(p,digest(b)); const target=checkedPath(this.root,p,true);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,b,{mode:0o600});
    }
  }
  publish():string[] {
    const changes:Array<{p:string;data:Buffer;target:string}>=[];
    for(const p of this.task.writablePaths) {
      const staged=checkedPath(this.root,p,true);if(!fs.existsSync(staged))continue;
      const data=readFileSafe(this.root,p);if(digest(data)===this.original.get(p))continue;
      const target=checkedPath(this.task.workspaceRoot,p,true);
      let now:string|null=null;try{now=digest(readFileSafe(this.task.workspaceRoot,p));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(now!==this.original.get(p))throw new BridgeError('WRITE_CONFLICT','Source changed during task; staged edits retained, no changes published','BLOCKED');
      changes.push({p,data,target});
    }
    // Validate the entire change set before any write. Local concurrent attackers are outside this boundary.
    for(const c of changes) {
      checkedPath(this.task.workspaceRoot,c.p,true);fs.mkdirSync(path.dirname(c.target),{recursive:true,mode:0o700});
      const fd=fs.openSync(c.target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);
      try{fs.writeFileSync(fd,c.data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    }
    return changes.map(c=>c.p);
  }
}
