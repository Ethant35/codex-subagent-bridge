#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { taskSchema,parseTask } from './schema.js';
import { delegate } from './runner.js';
import { Store } from './store.js';
import { FileTools,toolSchemas,type ToolConfig } from './file-tools.js';
import { models } from './providers/openrouter.js';
import { claudeDiagnostics } from './providers/claude.js';
import { BridgeError } from './types.js';
import { redact } from './redact.js';
const help=`Codex Subagent Bridge (cpb)
Usage:
  cpb doctor [--provider openrouter|claude] [--json]
  cpb providers [--json]
  cpb models --provider openrouter [--json]
  cpb auth-status --provider claude [--json]
  cpb delegate --provider PROVIDER [--backend api|sdk|cli] --model MODEL --task-file FILE [--json]
  cpb runs [--json]
  cpb inspect RUN_ID [--json]
  cpb cancel RUN_ID [--json]
  cpb mcp

Task files use the version 1 envelope in examples/task.json. CPB_HOME selects a private metadata directory.
Provider credentials come only from the process environment or official Claude CLI login.
`;
function output(value:unknown) {process.stdout.write(JSON.stringify(redact(value),null,2)+'\n');}
async function mcp() {
  const server=new McpServer({name:'codex-subagent-bridge',version:'0.1.0'});
  const active=new Set<AbortController>();
  const previousClose=server.server.onclose;
  server.server.onclose=()=>{for(const controller of active)controller.abort();previousClose?.();};
  server.registerTool('cpb_delegate',{description:'Delegate a bounded task to OpenRouter or official Claude. Returns the actual final child result and persisted execution status. File edits require explicit writable paths.',inputSchema:taskSchema,annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true}},async(args,extra)=>{
    const controller=new AbortController();active.add(controller);
    const abort=()=>controller.abort();extra.signal.addEventListener('abort',abort,{once:true});if(extra.signal.aborted)abort();
    try {const run=await delegate(args,new Store(),controller.signal);return {content:[{type:'text' as const,text:JSON.stringify(redact(run))}],isError:run.state!=='COMPLETED'};}
    finally{active.delete(controller);extra.signal.removeEventListener('abort',abort);}
  });
  await server.connect(new StdioServerTransport());
}
async function toolServer(file:string) {
  const st=fs.lstatSync(file);if(!st.isFile() || st.isSymbolicLink() || (st.mode&0o077))throw new BridgeError('UNSAFE_CAPABILITY','Capability must be a private regular file');
  const config=JSON.parse(fs.readFileSync(file,'utf8')) as ToolConfig;parseTask(config.task);
  const tools=new FileTools(config);const server=new McpServer({name:'cpb-files',version:'0.1.0'});
  const timer=setTimeout(()=>process.exit(1),Math.max(1,config.deadline-Date.now()));timer.unref();
  for(const name of config.task.allowedOperations) {
    server.registerTool(name,{description:`Authorized workspace operation: ${name}`,inputSchema:toolSchemas[name],annotations:{readOnlyHint:name!=='write_file',destructiveHint:name==='write_file',openWorldHint:false}},async(args: unknown)=>{
      try{return {content:[{type:'text' as const,text:await tools.execute(name,args)}]};}
      catch(e){return {content:[{type:'text' as const,text:JSON.stringify({error:e instanceof BridgeError?e.code:'TOOL_ERROR'})}],isError:true};}
    });
  }
  await server.connect(new StdioServerTransport());
}
async function main() {
  const {values,positionals}=parseArgs({allowPositionals:true,options:{help:{type:'boolean',short:'h'},version:{type:'boolean'},json:{type:'boolean'},provider:{type:'string'},backend:{type:'string'},model:{type:'string'},'task-file':{type:'string'}}});
  const command=positionals[0];
  if(values.version){output({version:'0.1.0'});return;}
  if(values.help || !command){process.stdout.write(help);return;}
  if(values.provider && !['openrouter','claude'].includes(values.provider))throw new BridgeError('INVALID_PROVIDER','Exactly two providers are supported: openrouter and claude');
  switch(command) {
    case 'mcp':await mcp();break;
    case 'tool-server':if(!positionals[1])throw new BridgeError('MISSING_CAPABILITY','Capability path required');await toolServer(positionals[1]);break;
    case 'providers':output({providers:[{provider:'openrouter',backends:['api']},{provider:'claude',backends:['sdk','cli']}]});break;
    case 'models':if(values.provider!=='openrouter')throw new BridgeError('INVALID_PROVIDER','models requires --provider openrouter');output({models:await models()});break;
    case 'doctor': {
      const p=values.provider;output({node:process.version,platform:process.platform,supported:process.platform!=='win32'&&Number(process.versions.node.split('.')[0])>=22,integration:'MCP stdio cpb_delegate',...(p!=='claude'?{openrouter:{apiKeyPresent:!!process.env.OPENROUTER_API_KEY,status:process.env.OPENROUTER_API_KEY?'UNVERIFIED':'MISSING_CREDENTIALS'}}:{}),...(p!=='openrouter'?{claude:await claudeDiagnostics()}:{})});break;
    }
    case 'auth-status':if(values.provider!=='claude')throw new BridgeError('INVALID_PROVIDER','auth-status requires --provider claude');output(await claudeDiagnostics());break;
    case 'delegate': {
      if(!values['task-file'] || !values.provider || !values.model)throw new BridgeError('MISSING_ARGUMENT','delegate requires --provider, --model and --task-file');
      const file=path.resolve(values['task-file']);if(fs.statSync(file).size>200_000)throw new BridgeError('TASK_LIMIT','Task file exceeds 200 KB');
      let value:unknown;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new BridgeError('INVALID_TASK','Task file must contain valid JSON');}
      const task=parseTask(value);
      if(task.provider!==values.provider || task.model!==values.model || (values.backend && task.backend!==values.backend))throw new BridgeError('ENVELOPE_MISMATCH','CLI selectors must match the exact task envelope');
      const run=await delegate(task);output(run);if(run.state!=='COMPLETED')process.exitCode=1;break;
    }
    case 'runs':output(new Store().list());break;
    case 'inspect':if(!positionals[1])throw new BridgeError('MISSING_ID','Run ID required');output(new Store().get(positionals[1]));break;
    case 'cancel':if(!positionals[1])throw new BridgeError('MISSING_ID','Run ID required');output(new Store().cancel(positionals[1]));break;
    default:throw new BridgeError('UNKNOWN_COMMAND','Unknown command; use cpb --help');
  }
}
main().catch(e=>{output({error:{code:e instanceof BridgeError?e.code:'CLI_ERROR',message:e instanceof BridgeError?e.message:'Command failed; check arguments, file permissions, and cpb doctor'}});process.exitCode=1;});
