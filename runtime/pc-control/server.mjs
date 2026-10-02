import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync,writeFileSync,mkdirSync,unlinkSync } from 'node:fs';

const root = process.env.KARBS_ROOT || fileURLToPath(new URL('../', import.meta.url));
const data=process.env.COUCOU_DATA_DIR;
if(!data) throw new Error('Karbs data directory is missing.');
const session = `pc-${randomUUID()}`;
const markerDir=`${process.env.COUCOU_DATA_DIR || data}/pc-activity`;
const markerFile=`${markerDir}/${session}.json`;
function markAction(name){
  try{mkdirSync(markerDir,{recursive:true});writeFileSync(markerFile,JSON.stringify({processId:process.pid,provider:process.env.COUCOU_PC_PROVIDER==='gemini'?'gemini':'codex',label:({click:'Clicking',type_text:'Typing',press_keys:'Keyboard',scroll:'Scrolling',focus_window:'Focusing',run_command:'Command',screenshot:'Looking',inspect_window:'Inspecting',open:'Opening'})[name]??'Working',expiresSeconds:135}));}catch{}
}
function clearAction(){try{unlinkSync(markerFile);}catch{}}
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string', maxLength: 1500 };
const integer = { type: 'integer' };
export const toolDefinitions = [
  { name: 'access_status', description: 'Check the actual desktop access mode before a PC task.', inputSchema: schema() },
  { name: 'list_windows', description: 'List open Windows apps and their process IDs.', inputSchema: schema() },
  { name: 'inspect_window', description: 'Inspect accessible buttons and controls. Password values are never read.', inputSchema: schema({ processId: integer }, ['processId']) },
  { name: 'focus_window', description: 'Bring a specific app window to the foreground before interacting. Requires approval.', inputSchema: schema({processId: integer}, ['processId']) },
  { name: 'screenshot', description: 'See the current desktop, scaled to 1600px. Use the returned scale/origin to convert coordinates.', inputSchema: schema() },
  { name: 'open', description: 'Open an existing file, folder, https URL, or app: gemini, vscode, codex, explorer. Requires the user to click Allow in Coucou.', inputSchema: schema({ target: string }, ['target']) },
  { name: 'click', description: 'Move the standard Windows pointer and click a physical screen coordinate. Optional processId focuses the target app first. Supports left, right and middle buttons. Requires approval.', inputSchema: schema({ x: integer, y: integer, double: { type: 'boolean' }, button: {...string,enum:['left','right','middle']}, processId:integer }, ['x','y']) },
  { name: 'type_text', description: 'Type Unicode text into the focused app after approval. Use processId to focus a specific app first. Does not touch the clipboard.', inputSchema: schema({ text: string,processId:integer }, ['text']) },
  { name: 'press_keys', description: 'Press ENTER, TAB, ESC, SPACE, BACKSPACE, DELETE, arrows, HOME, END, or CTRL/ALT/SHIFT combinations such as CTRL+L. Optional processId focuses a target app. Requires approval.', inputSchema: schema({ keys: string,processId:integer }, ['keys']) },
  { name: 'scroll', description: 'Scroll the focused app by signed wheel notches; positive is up, negative is down. Optional processId focuses a target app first. Requires approval.', inputSchema:schema({notches:integer,processId:integer},['notches']) },
  { name: 'invoke', description: 'Activate a named accessible button in a specific process. Requires approval.', inputSchema: schema({ processId: integer, name: string }, ['processId','name']) },
  { name: 'run_command', description: 'Run an exact PowerShell command after the user reviews and approves it. Can manage files and apps. Do not use it to bypass a declined action.', inputSchema: schema({ command: string }, ['command']) },
];
const reads = new Set(['access_status','list_windows','inspect_window','screenshot']);
export function fullAccessEnabled() {
  if (process.env.COUCOU_PC_ACCESS !== 'full') return false;
  try { const settings = JSON.parse(readFileSync(`${process.env.COUCOU_DATA_DIR || data}/config/settings.json`, 'utf8')); return settings.computerControl === true && settings.fullAccess === true; } catch { return false; }
}

export function validate(name, args) {
  const tool = toolDefinitions.find(t => t.name === name);
  if (!tool || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Unknown tool or invalid arguments.');
  for (const key of Object.keys(args)) {
    const field = tool.inputSchema.properties[key];
    if (!field) throw new Error(`Unexpected argument: ${key}`);
    if (field.type === 'integer' ? !Number.isSafeInteger(args[key]) : typeof args[key] !== field.type) throw new Error(`Invalid ${key}`);
    if (field.enum && !field.enum.includes(args[key])) throw new Error(`Invalid ${key}`);
    if (typeof args[key] === 'string' && args[key].length > 1500) throw new Error('Action exceeds the reviewable size limit.');
  }
  for (const key of tool.inputSchema.required) if (!(key in args)) throw new Error(`Missing ${key}`);
  if(name==='scroll' && Math.abs(args.notches)>100) throw new Error('Scroll is limited to 100 notches per action.');
  return args;
}
export const approved = value => value?.hookSpecificOutput?.decision?.behavior === 'allow';

const activeChildren = new Set();
function run(exe, args, input, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd: root, windowsHide: true, env: { ...process.env, TEMP: `${data}/temp`, TMP: `${data}/temp` } });
    activeChildren.add(child);
    child.once('close', () => activeChildren.delete(child));
    let output = ''; let error = ''; let overflow = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Action timed out.')); }, timeout);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 16000000) { overflow = true; child.kill(); } });
    child.stderr.on('data', chunk => { if (error.length < 1500) error += chunk; });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => { clearTimeout(timer); code === 0 && !overflow ? resolve(output) : reject(new Error(overflow ? 'Output too large.' : error.slice(0,1000) || `Action exited ${code}.`)); });
    child.stdin.end(input);
  });
}
async function event(name, tool, args) {
  const labels={list_windows:'Checking open apps',inspect_window:'Inspecting a window',focus_window:'Focusing a window',scroll:'Scrolling',screenshot:'Looking at the screen',open:'Opening',click:'Clicking',type_text:'Typing',press_keys:'Pressing keys',invoke:'Activating a control',run_command:'Running a command'};
  const permission=name==='PermissionRequest';
  const detail=permission?`${tool}: ${JSON.stringify(args)}`:tool==='type_text'?`${args.text?.length??0} characters`:['inspect_window','focus_window'].includes(tool)?`Process ${args.processId}`:tool==='scroll'?`${args.notches} wheel notches`:tool==='click'?`${args.x}, ${args.y}`:tool==='open'?args.target:tool==='press_keys'?args.keys:tool==='invoke'?args.name:tool==='run_command'?args.command:tool==='screenshot'?'Desktop':'Open windows';
  const provider=process.env.COUCOU_PC_PROVIDER==='gemini'?'gemini':'codex';
  return run(process.env.KARBS_HOOK || fileURLToPath(new URL('../../karbs-hook.exe', import.meta.url)), ['--provider',provider,name], JSON.stringify({ session_id: session, client_name: provider==='gemini'?'Coucou Gemini PC control':'Coucou PC control', cwd: 'PC control', hook_event_name: name, tool_name: permission?tool:(labels[tool]??tool), tool_input: { command: detail } }), 115000);
}
export async function closeSession(){clearAction();await event('SessionEnd','PC control',{});}

export async function execute(name, args, dependencies = {}) {
  validate(name, args);
  if (name === 'access_status') return {fullAccess: fullAccessEnabled(), launchAccess: process.env.COUCOU_PC_ACCESS ?? 'missing'};
  const requestApproval = dependencies.requestApproval ?? (async () => {
    const output = await event('PermissionRequest', name, args);
    try { return approved(JSON.parse(output)); } catch { return false; }
  });
  const fullAccess = (dependencies.fullAccessEnabled ?? fullAccessEnabled)();
  if (!reads.has(name) && !fullAccess && !await requestApproval(name, args)) throw new Error('Action was not approved. Nothing was executed.');
  const perform = dependencies.perform ?? (async () => {
    const output = await run('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-STA','-File',`${root}/pc-control/actions.ps1`], JSON.stringify({ action: name, ...args }));
    return JSON.parse(output);
  });
  try {
    if(!dependencies.perform){markAction(name);await event('PreToolUse', name, args);}
    const result = await perform(name, args);
    if (!dependencies.perform) await event('PostToolUse', name, args);
    return result;
  } finally {if(!dependencies.perform)clearAction();}
}

function content(result) {
  if (result.image) {
    const { image, ...metadata } = result;
    return [{ type: 'text', text: JSON.stringify(metadata) }, { type: 'image', data: image, mimeType: 'image/png' }];
  }
  return [{ type: 'text', text: JSON.stringify(result) }];
}
// A desktop has one focused window and cursor. Keep batched desktop calls in
// request order so parallel tool calls cannot type before their preceding click.
let desktopQueue=Promise.resolve();
export function executeQueued(name,args,dependencies={}) {
  const task=desktopQueue.then(()=>execute(name,args,dependencies));
  desktopQueue=task.catch(()=>{});
  return task;
}
async function dispatch(request) {
  switch (request.method) {
    case 'initialize': return { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'coucou-pc', version: '1.0.0' } };
    case 'ping': return {};
    case 'tools/list': return { tools: toolDefinitions.map(tool => ({...tool, description: fullAccessEnabled() ? tool.description.replace(/Requires.*?\./g, '').replace('after approval', 'in full access mode').replace('after the user reviews and approves it', 'in full access mode') : tool.description})) };
    case 'tools/call':
      try { return { content: content(await executeQueued(request.params.name, request.params.arguments ?? {})) }; }
      catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
    default: throw new Error('Unsupported method.');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = createInterface({ input: process.stdin });
  input.on('line', async line => {
    let request;
    try {
      request = JSON.parse(line);
      if (request.id === undefined) return;
      const result = await dispatch(request);
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch (error) {
      if (request?.id !== undefined) process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:error.message}})+'\n');
    }
  });
  input.on('close', () => { for (const child of activeChildren) child.kill(); void closeSession().finally(() => process.exit()); });
}
