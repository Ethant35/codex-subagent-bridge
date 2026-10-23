import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parse} from 'smol-toml';
import {BridgeError} from './types.js';

const BEGIN='# >>> codex-subagent-bridge managed MCP server >>>';
const END='# <<< codex-subagent-bridge managed MCP server <<<';
const MAX_CONFIG=1024*1024;

function fail(code:string,message:string):never { throw new BridgeError(code,message); }
function statDirectory(directory:string):fs.Stats {
  const st=fs.lstatSync(directory);
  if(st.isSymbolicLink()||!st.isDirectory())fail('UNSAFE_CONFIG',`Refusing unsafe directory: ${directory}`);
  return st;
}
function tomlString(value:string):string { return JSON.stringify(value); }
function shellQuote(value:string):string { return `'${value.replaceAll("'", "'\\''")}'`; }
function managedBlock(cliPath:string):string {
  return `${BEGIN}\n[mcp_servers.cpb]\ncommand = ${tomlString(process.execPath)}\nargs = [${tomlString(cliPath)}, "mcp"]\nenv_vars = ["OPENROUTER_API_KEY"]\ntool_timeout_sec = 180\n${END}`;
}
function parseConfig(text:string):Record<string,unknown> {
  try{return parse(text) as Record<string,unknown>;}catch{fail('INVALID_CONFIG','Project .codex/config.toml is invalid TOML. Fix the existing file before connecting cpb; no changes were made.');}
}
function hasCpbServer(parsed:Record<string,unknown>):boolean {
  const servers=parsed.mcp_servers;
  return !!servers&&typeof servers==='object'&&Object.hasOwn(servers,'cpb');
}
function cleanupTemp(temp:string,originalError:unknown):void {
  try{fs.unlinkSync(temp);}catch(cleanupError){
    if((cleanupError as NodeJS.ErrnoException).code==='ENOENT')return;
    const error=new BridgeError('CONFIG_CLEANUP',`Could not remove temporary config ${temp}; inspect and remove it after resolving the original write error.`);
    (error as Error&{cause?:unknown}).cause={originalError,cleanupError};throw error;
  }
}

export type ProjectConnectResult={configPath:string;applied:boolean;alreadyConfigured:boolean;config:string;next:string};

/** Preview by default. Writing is limited to a trusted project's .codex/config.toml. */
export function connectProject(directory:string,trustProject:boolean,cliPath:string):ProjectConnectResult {
  if(!directory)fail('INVALID_DIRECTORY','Project directory is required.');
  const supplied=path.resolve(directory);
  statDirectory(supplied);
  const project=fs.realpathSync(supplied);
  const protectedRoots=[os.homedir(),process.env.CODEX_HOME].filter((v):v is string=>!!v).map(v=>{try{return fs.realpathSync(v);}catch{return path.resolve(v);}});
  if(protectedRoots.includes(project))fail('UNSAFE_CONFIG','Refusing to write Codex user configuration. Choose a project directory; ~/.codex/config.toml is never modified.');
  if(!path.isAbsolute(cliPath))fail('UNSAFE_CONFIG','Installed cpb CLI path must be absolute. Reinstall the package and retry.');
  const installedCli=fs.realpathSync(cliPath),cliStat=fs.lstatSync(installedCli);
  if(cliStat.isSymbolicLink()||!cliStat.isFile())fail('UNSAFE_CONFIG','Installed cpb CLI must be a regular file. Reinstall the package and retry.');

  const codexDir=path.join(project,'.codex'),configPath=path.join(codexDir,'config.toml');
  if(process.env.CODEX_HOME&&path.resolve(process.env.CODEX_HOME,'config.toml')===configPath)fail('UNSAFE_CONFIG','This project config is the active CODEX_HOME user configuration. Choose a separate project directory.');
  let codexExists=false;
  try{statDirectory(codexDir);codexExists=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  let original='';let existing=false;
  try {
    const st=fs.lstatSync(configPath);
    if(st.isSymbolicLink()||!st.isFile())fail('UNSAFE_CONFIG','Refusing unsafe .codex/config.toml; it must be a regular file.');
    if(st.size>MAX_CONFIG)fail('UNSAFE_CONFIG','Project Codex config is larger than 1 MiB; refusing to modify it.');
    original=fs.readFileSync(configPath,'utf8');existing=true;
  } catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}

  const block=managedBlock(installedCli);
  const parsed=existing?parseConfig(original):{};
  if(existing&&hasCpbServer(parsed)){
    const expected=parseConfig(block);
    const actualServers=parsed.mcp_servers as Record<string,unknown>;
    const expectedServers=expected.mcp_servers as Record<string,unknown>;
    const beginCount=original.split(BEGIN).length-1,endCount=original.split(END).length-1;
    const start=original.indexOf(BEGIN),end=original.indexOf(END,start);
    if(beginCount!==1||endCount!==1||end<0||original.slice(start,end+END.length)!==block||!isDeepStrictEqual(actualServers.cpb,expectedServers.cpb))
      fail('CONFIG_CONFLICT','An existing mcp_servers.cpb definition is not cpb managed configuration. Review .codex/config.toml and remove or correct it manually.');
    return {configPath,applied:false,alreadyConfigured:true,config:block,next:`The project MCP server is already configured. Open ${shellQuote(project)} in Codex and approve its project trust prompt if shown.`};
  }
  if(existing&&(original.includes(BEGIN)||original.includes(END)))
    fail('CONFIG_CONFLICT','An incomplete or duplicated cpb managed marker exists. Review .codex/config.toml and repair it manually.');

  const nextConfig=existing?`${original}${original.length&&!original.endsWith('\n')?'\n':''}${original.trim()? '\n':''}${block}\n`:`${block}\n`;
  let newParsed:Record<string,unknown>;
  try{newParsed=parse(nextConfig) as Record<string,unknown>;}catch{fail('CONFIG_CONFLICT','This valid config cannot accept an appended [mcp_servers.cpb] section, often because mcp_servers is an inline table. Convert it to TOML sections, then retry. No changes were made.');}
  if(!hasCpbServer(newParsed))fail('CONFIG_CONFLICT','Could not add the cpb MCP section to this config. Convert conflicting mcp_servers inline tables to TOML sections and retry.');
  const next=`Review the preview, then apply it with: cpb connect --directory ${shellQuote(project)} --trust-project. Codex still asks separately before trusting project configuration.`;
  if(!trustProject)return {configPath,applied:false,alreadyConfigured:false,config:block,next};

  if(!codexExists){fs.mkdirSync(codexDir,{mode:0o700});statDirectory(codexDir);}
  if(existing){
    const backup=`${configPath}.cpb-backup-${Date.now()}-${randomUUID()}`;
    let backupFd:number|undefined;
    try{backupFd=fs.openSync(backup,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW??0),0o600);fs.writeFileSync(backupFd,original);fs.fsyncSync(backupFd);}
    catch(e){if(backupFd!==undefined)fs.closeSync(backupFd);throw e;}
    if(backupFd!==undefined)fs.closeSync(backupFd);
  }
  const temp=path.join(codexDir,`.config.toml.cpb-${randomUUID()}.tmp`);
  const fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW??0),existing?(fs.statSync(configPath).mode&0o777):0o600);
  try{fs.writeFileSync(fd,nextConfig);fs.fsyncSync(fd);}
  catch(e){try{fs.closeSync(fd);}catch(closeError){cleanupTemp(temp,{originalError:e,closeError});throw closeError;}cleanupTemp(temp,e);throw e;}
  fs.closeSync(fd);
  try{fs.renameSync(temp,configPath);const dirfd=fs.openSync(codexDir,fs.constants.O_RDONLY);try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}}
  catch(e){cleanupTemp(temp,e);throw e;}
  return {configPath,applied:true,alreadyConfigured:false,config:block,next:`Project MCP configuration was added. Open ${shellQuote(project)} in Codex and approve its project trust prompt separately.`};
}
