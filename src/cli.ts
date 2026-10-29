#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareSchema,prepareTask,saveTask,start,consentedTask,humanOutput} from './guided.js';
import {connectProject} from './project-connect.js';
import { readTaskFile,validateLocalTask,createSample,diagnostics,recovery } from './local-commands.js';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema,ListToolsRequestSchema,McpError,ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { taskSchema,parseTask } from './schema.js';
import type { ToolConfig } from './file-tools.js';
import { claudeDiagnostics } from './providers/claude.js';
import { BridgeError } from './types.js';
import { redact } from './redact.js';
const help=`Codex Subagent Bridge (cpb)
Usage:
  cpb start --directory NEW_DIRECTORY [--json]
  cpb connect --directory PROJECT [--trust-project] [--json]
  cpb task --directory PROJECT --read FILE --instructions TEXT --output FILE [--json]
  cpb run --task-file FILE --max-spend USD --consent-spend [--review-before-apply] [--json]
  cpb review RUN_ID [--json]
  cpb apply RUN_ID --review-token TOKEN [--json]
  cpb discard RUN_ID [--json]
  cpb sample --directory NEW_DIRECTORY [--model MODEL]
  cpb validate --task-file FILE [--json]
  cpb doctor [--provider openrouter|claude] [--json]
  cpb diagnose [RUN_ID] [--json]
  cpb recovery RUN_ID [--json]
  cpb providers [--json]
  cpb models --provider openrouter [--json]
  cpb auth-status --provider claude [--json]
  cpb delegate --provider PROVIDER --model MODEL --task-file FILE
               [--backend api|sdk|cli] [--json]
  cpb runs [--limit 1..1000] [--before JSON_CURSOR] [--json]
  cpb inspect RUN_ID [--json]
  cpb cancel RUN_ID [--json]
  cpb mcp

Quickstart: start -> validate -> run with explicit spending consent.
connect is optional. For edits, add --review-before-apply to task or run.
Repeat --read or --write for task file access. task creates a zero-budget envelope.
New commands print text; --json gives JSON. Legacy commands keep JSON; --human gives text.
run creates new IDs each time. maxSpendUsd is an application cap, not an invoice guarantee.
Sample data is local. Its maxSpendUsd is 0, so inference is disabled.
CPB_HOME selects private records (default ~/.cpb). diagnose is safe to share.
recovery only inspects files. Exact task instructions remain in private records.
Provider credentials come only from the process environment or official Claude CLI login.
`;
let human=false;
function output(value:unknown) {process.stdout.write(human?humanOutput(redact(value)):JSON.stringify(redact(value),null,2)+'\n');}
function mcpResult(value: object, isError = false) {
  // Preserve text clients while giving native parents direct access to result fields.
  const structuredContent = redact(value) as Record<string, unknown>;
  return { content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], structuredContent, isError };
}
async function mcp() {
  const server=new McpServer({name:'codex-subagent-bridge',version:'1.3.2'});
  server.registerTool('cpb_prepare',{description:'Prepare and validate a zero-budget OpenRouter envelope. Generates IDs and canonical paths. No inference, no files written. Ask user for spending consent before changing maxSpendUsd and calling cpb_delegate.',inputSchema:prepareSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}},async args=>{
    try{return mcpResult(prepareTask(args));}
    catch(e){return mcpResult({error:{code:e instanceof BridgeError?e.code:'PREPARE_FAILED',message:e instanceof BridgeError?e.message:'Check the existing directory and explicit file paths.'}},true);}
  });
  const active=new Set<AbortController>();
  const previousClose=server.server.onclose;
  server.server.onclose=()=>{for(const controller of active)controller.abort();previousClose?.();};
  server.registerTool('cpb_delegate',{description:'Delegate a bounded task to OpenRouter or official Claude. Returns the actual final child result and persisted execution status. File edits require explicit writable paths. Set reviewBeforeApply=true to retain a proposal for the user to review and apply or discard through the CLI.',inputSchema:taskSchema,annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true}},async(args,extra)=>{
    const controller=new AbortController();active.add(controller);
    const abort=()=>controller.abort();extra.signal.addEventListener('abort',abort,{once:true});if(extra.signal.aborted)abort();
    try {const [{delegate},{Store}]=await Promise.all([import('./runner.js'),import('./store.js')]);const run=await delegate(args,new Store(),controller.signal);return mcpResult(run,!['COMPLETED','AWAITING_REVIEW'].includes(run.state));}
    finally{active.delete(controller);extra.signal.removeEventListener('abort',abort);}
  });
  await server.connect(new StdioServerTransport());
}
async function toolServer(file:string) {
  const st=fs.lstatSync(file);if(!st.isFile() || st.isSymbolicLink() || (st.mode&0o077))throw new BridgeError('UNSAFE_CAPABILITY','Capability must be a private regular file');
  const config=JSON.parse(fs.readFileSync(file,'utf8')) as ToolConfig;parseTask(config.task);
  const {FileTools,toolSchemas}=await import('./file-tools.js');
  const tools=new FileTools(config);const server=new Server({name:'cpb-files',version:'1.3.2'},{capabilities:{tools:{}}});
  const timer=setTimeout(()=>process.exit(1),Math.max(1,config.deadline-Date.now()));timer.unref();
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:config.task.allowedOperations.map(name=>({name,description:`Authorized workspace operation: ${name}`,inputSchema:z.toJSONSchema(toolSchemas[name]) as {type:'object'},annotations:{readOnlyHint:name!=='write_file',destructiveHint:name==='write_file',openWorldHint:false}}))}));
  // The broker must see calls before argument validation so denied calls are durable too.
  server.setRequestHandler(CallToolRequestSchema,async request=>{
    const {name,arguments:args}=request.params;
    try{return {content:[{type:'text' as const,text:await tools.execute(name,args??{})}]};}
    catch(e){
      if(!config.task.allowedOperations.includes(name as never))throw new McpError(ErrorCode.InvalidParams,'Unknown or unauthorized tool');
      return {content:[{type:'text' as const,text:JSON.stringify({error:e instanceof BridgeError?e.code:'TOOL_ERROR'})}],isError:true};
    }
  });
  await server.connect(new StdioServerTransport());
}
async function main() {
  const {values,positionals}=parseArgs({allowPositionals:true,options:{help:{type:'boolean',short:'h'},version:{type:'boolean'},json:{type:'boolean'},human:{type:'boolean'},'trust-project':{type:'boolean'},'consent-spend':{type:'boolean'},'review-before-apply':{type:'boolean'},'review-token':{type:'string'},'max-spend':{type:'string'},instructions:{type:'string'},output:{type:'string'},read:{type:'string',multiple:true},write:{type:'string',multiple:true},provider:{type:'string'},backend:{type:'string'},model:{type:'string'},'task-file':{type:'string'},directory:{type:'string'},limit:{type:'string'},before:{type:'string'}}});
  const command=positionals[0];
  human=!values.json&&(!!values.human||['start','connect','task','run','review','apply','discard'].includes(command??''));
  if(values.json&&values.human)throw new BridgeError('OUTPUT_CONFLICT','Choose --json or --human, not both');
  if(values.version){output({version:'1.3.2'});return;}
  if(values.help || !command){process.stdout.write(help);return;}
  if(values['review-before-apply']&&!['task','run'].includes(command))throw new BridgeError('INVALID_OPTION','--review-before-apply is supported only by task and run. For delegate, set reviewBeforeApply in the envelope.');
  if(values['review-token']!==undefined&&command!=='apply')throw new BridgeError('INVALID_OPTION','--review-token is supported only by apply.');
  if(values.provider && !['openrouter','claude'].includes(values.provider))throw new BridgeError('INVALID_PROVIDER','Exactly two providers are supported: openrouter and claude');
  switch(command) {
    case 'start':if(!values.directory)throw new BridgeError('MISSING_ARGUMENT','start requires --directory NEW_DIRECTORY');output(start(values.directory,values.model));break;
    case 'connect':if(!values.directory)throw new BridgeError('MISSING_ARGUMENT','connect requires --directory PROJECT');output(connectProject(values.directory,!!values['trust-project'],fileURLToPath(import.meta.url)));break;
    case 'task':if(!values.directory||!values.instructions||!values.output)throw new BridgeError('MISSING_ARGUMENT','task requires --directory, --instructions and --output; use --read/--write for each file');output(saveTask({directory:values.directory,instructions:values.instructions,readablePaths:values.read??[],writablePaths:values.write??[],...(values.model?{model:values.model}:{}),...(values['review-before-apply']?{reviewBeforeApply:true}:{})},values.output));break;
    case 'run': {
      if(!values['consent-spend']||values['max-spend']===undefined)throw new BridgeError('SPEND_CONSENT_REQUIRED','Run requires --max-spend USD and --consent-spend. Each invocation starts a new paid task.');
      if(!values['task-file'])throw new BridgeError('MISSING_ARGUMENT','run requires --task-file FILE');
      const template=readTaskFile(values['task-file']);
      const task=consentedTask({...template,...(values['review-before-apply']?{reviewBeforeApply:true}:{})},values['max-spend'],!!values['consent-spend']);
      validateLocalTask(task);
      if(human)process.stderr.write(humanOutput({review:task})+'Running one task. No automatic retry.\n');
      const {delegate}=await import('./runner.js');const run=await delegate(task);output(run);if(!['COMPLETED','AWAITING_REVIEW'].includes(run.state))process.exitCode=1;break;
    }
    case 'review':
    case 'apply':
    case 'discard': {
      const id=positionals[1];
      if(!id)throw new BridgeError('MISSING_ID',`${command} requires a run ID`);
      if(command==='apply'&&!values['review-token'])throw new BridgeError('REVIEW_REQUIRED','Run cpb review RUN_ID, inspect every change, then pass its --review-token to cpb apply.');
      const [{Store},review]=await Promise.all([import('./store.js'),import('./review.js')]);
      const store=new Store();
      if(command==='review'){
        const result=review.reviewChanges(store,id);
        // Explicit private review must show the exact proposed bytes, including secret-like source text.
        process.stdout.write(human?humanOutput(result):JSON.stringify(result,null,2)+'\n');
      }else output(command==='apply'?review.applyChanges(store,id,values['review-token']):review.discardChanges(store,id));
      break;
    }
    case 'sample':if(!values.directory)throw new BridgeError('MISSING_ARGUMENT','sample requires --directory NEW_DIRECTORY');output(createSample(values.directory,values.model));break;
    case 'validate': {
      if(!values['task-file'])throw new BridgeError('MISSING_ARGUMENT','validate requires --task-file FILE');
      const task=readTaskFile(values['task-file']);
      output({...validateLocalTask(task),...(human?{review:task}:{})});break;
    }
    case 'diagnose':if(positionals[1]){const {Store}=await import('./store.js');output(diagnostics(new Store(),positionals[1]));}else output(diagnostics(undefined));break;
    case 'recovery':if(!positionals[1])throw new BridgeError('MISSING_ID','recovery requires a run ID');{const {Store}=await import('./store.js');output(recovery(new Store(),positionals[1]));}break;
    case 'mcp':await mcp();break;
    case 'tool-server':if(!positionals[1])throw new BridgeError('MISSING_CAPABILITY','Capability path required');await toolServer(positionals[1]);break;
    case 'providers':output({providers:[{provider:'openrouter',backends:['api'],qualification:'historical-live-v1.2.1',currentSource:'offline-tested'},{provider:'claude',backends:['sdk','cli'],qualification:'experimental-unverified'}]});break;
    case 'models':if(values.provider!=='openrouter')throw new BridgeError('INVALID_PROVIDER','models requires --provider openrouter');{const {models}=await import('./providers/openrouter.js');output({models:await models()});}break;
    case 'doctor': {
      const p=values.provider;
      output({
        node:process.version,platform:process.platform,
        supported:process.platform!=='win32'&&Number(process.versions.node.split('.')[0])>=22,
        qualifiedEnvironment:process.platform==='darwin'&&process.arch==='arm64'&&process.version==='v22.13.1',
        integration:'MCP stdio cpb_delegate',
        ...(p!=='claude'?{openrouter:{
          apiKeyPresent:!!process.env.OPENROUTER_API_KEY,
          status:process.env.OPENROUTER_API_KEY?'UNVERIFIED':'MISSING_CREDENTIALS',
        }}:{}),
        ...(p!=='openrouter'?{claude:await claudeDiagnostics()}:{}),
      });break;
    }
    case 'auth-status':if(values.provider!=='claude')throw new BridgeError('INVALID_PROVIDER','auth-status requires --provider claude');output(await claudeDiagnostics());break;
    case 'delegate': {
      if(!values['task-file'] || !values.provider || !values.model)throw new BridgeError('MISSING_ARGUMENT','delegate requires --provider, --model and --task-file');
      const task=readTaskFile(values['task-file']);
      if(task.provider!==values.provider || task.model!==values.model || (values.backend && task.backend!==values.backend))throw new BridgeError('ENVELOPE_MISMATCH','CLI selectors must match the exact task envelope');
      const {delegate}=await import('./runner.js');const run=await delegate(task);output(run);if(!['COMPLETED','AWAITING_REVIEW'].includes(run.state))process.exitCode=1;break;
    }
    case 'runs': {
      let before:{createdAt:string;id:string}|undefined;
      if(values.before!==undefined){try{before=JSON.parse(values.before);}catch{throw new BridgeError('INVALID_CURSOR','--before requires a JSON object with createdAt and id');}}
      const {Store}=await import('./store.js');output(new Store().list({...(values.limit!==undefined?{limit:Number(values.limit)}:{}),...(values.before!==undefined?{before}:{})}));break;
    }
    case 'inspect':if(!positionals[1])throw new BridgeError('MISSING_ID','Run ID required');{const {Store}=await import('./store.js');output(new Store().get(positionals[1]));}break;
    case 'cancel':if(!positionals[1])throw new BridgeError('MISSING_ID','Run ID required');{const {Store}=await import('./store.js');output(new Store().cancel(positionals[1]));}break;
    default:throw new BridgeError('UNKNOWN_COMMAND','Unknown command; use cpb --help');
  }
}
main().catch(e=>{
  const fileCode=(e as NodeJS.ErrnoException).code;
  const code=e instanceof BridgeError?e.code:fileCode==='EEXIST'?'ALREADY_EXISTS':fileCode==='ENOENT'?'NOT_FOUND':fileCode==='EACCES'?'PERMISSION_DENIED':'CLI_ERROR';
  const message=e instanceof BridgeError?e.message:code==='ALREADY_EXISTS'?'Destination already exists; choose a new directory':code==='NOT_FOUND'?'Requested file or run does not exist':code==='PERMISSION_DENIED'?'Local file permission denied; check ownership and access':'Command failed; check cpb --help and cpb doctor';
  output({error:{code,message}});process.exitCode=1;
});
