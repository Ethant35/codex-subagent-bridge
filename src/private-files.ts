import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {BridgeError} from './types.js';
import {redact} from './redact.js';

const PRIVATE_MODE_MASK=0o077;

/** Store-safe atomic JSON writes shared with the workspace journal without loading SQLite. */
export function atomicJSON(file:string,value:unknown):void {
  const directory=path.dirname(file);
  assertPrivateDirectory(directory);
  assertRegularDestination(file);
  const temp=`${file}.${randomUUID()}.tmp`;
  let fd:number|undefined,renamed=false;
  try {
    fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
    fs.writeFileSync(fd,`${JSON.stringify(redact(value),null,2)}\n`);
    fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(temp,file);renamed=true;syncDirectory(directory);
  } catch(error) {
    throw asStoreIOError(error,'Could not safely write a local run record.');
  } finally {
    if(fd!==undefined){try{fs.closeSync(fd);}catch{/* preserve the original write error */}}
    if(!renamed){try{fs.unlinkSync(temp);}catch{/* preserve the primary failure; a private temporary file may remain */}}
  }
}

/** Read a bounded private regular file without following links or blocking on FIFOs. */
export function readPrivateFile(file:string,maxBytes:number):string {
  let fd:number|undefined;
  try {
    if(fs.constants.O_NOFOLLOW===undefined){
      const stat=fs.lstatSync(file);
      if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&PRIVATE_MODE_MASK)!==0)throw new BridgeError('UNSAFE_STORE','A local run record is unsafe or exceeds the supported size.');
    }
    fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|(fs.constants.O_NOFOLLOW??0));
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||(stat.mode&PRIVATE_MODE_MASK)!==0||stat.size>maxBytes)throw new BridgeError('UNSAFE_STORE','A local run record is unsafe or exceeds the supported size.');
    const chunks:Buffer[]=[];let total=0;
    const chunk=Buffer.alloc(Math.min(64*1024,maxBytes+1));
    while(true){
      const count=fs.readSync(fd,chunk,0,Math.min(chunk.length,maxBytes+1-total),null);
      if(count===0)break;
      total+=count;
      if(total>maxBytes)throw new BridgeError('UNSAFE_STORE','A local run record is unsafe or exceeds the supported size.');
      chunks.push(Buffer.from(chunk.subarray(0,count)));
    }
    return Buffer.concat(chunks,total).toString('utf8');
  } catch(error) {
    if(error instanceof BridgeError)throw error;
    if((error as NodeJS.ErrnoException).code==='ELOOP')throw new BridgeError('UNSAFE_STORE','A local run record cannot be a symbolic link.');
    throw error;
  } finally {if(fd!==undefined)fs.closeSync(fd);}
}

function assertPrivateDirectory(directory:string):void {
  let stat:fs.Stats;
  try{stat=fs.lstatSync(directory);}catch(error){throw asStoreIOError(error,'Could not access the local run store.');}
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new BridgeError('UNSAFE_STORE','The local run store contains an unsafe directory path.');
  if((stat.mode&PRIVATE_MODE_MASK)!==0)throw new BridgeError('UNSAFE_STORE','The local run store directory must not grant group or other users access.');
}
function assertRegularDestination(file:string):void {
  try{const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&PRIVATE_MODE_MASK)!==0)throw new BridgeError('UNSAFE_STORE','The run record path must be a private regular file.');}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;if(error instanceof BridgeError)throw error;throw asStoreIOError(error,'Could not inspect the run record path.');}
}
function syncDirectory(directory:string):void {
  let fd:number|undefined;
  try{fd=fs.openSync(directory,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY??0));fs.fsyncSync(fd);}
  catch(error){const code=(error as NodeJS.ErrnoException).code;if(!['EINVAL','ENOTSUP','EOPNOTSUPP','EISDIR','EBADF'].includes(code??''))throw error;}
  finally{if(fd!==undefined)fs.closeSync(fd);}
}
function asStoreIOError(error:unknown,message:string):BridgeError {
  if(error instanceof BridgeError)return error;
  if((error as NodeJS.ErrnoException|undefined)?.code==='ELOOP')return new BridgeError('UNSAFE_STORE','A local run-state path cannot be a symbolic link.');
  return new BridgeError('STORE_IO',message);
}
