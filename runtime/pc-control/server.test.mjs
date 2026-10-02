import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, executeQueued, approved, validate } from './server.mjs';
test('declined, missing or malformed approval cannot execute an action', async () => {
  for (const decision of [false, undefined, null]) {
    let executed = false;
    await assert.rejects(execute('run_command',{command:'anything'},{requestApproval:async()=>decision,perform:async()=>{executed=true;}}),/not approved/);
    assert.equal(executed,false);
  }
  for(const value of [{},{hookSpecificOutput:{decision:{behavior:'deny'}}}]) assert.equal(approved(value),false);
});
test('approved action keeps exact text and executes once', async () => {
  const command = 'Write-Output "a `$b & c"'; let count=0;
  await execute('run_command',{command},{requestApproval:async()=>true,perform:async(name,args)=>{count++;assert.equal(args.command,command);return {ok:true};}});
  assert.equal(count,1);
});
test('unknown tools, unknown fields and oversized actions are refused', () => {
  assert.throws(()=>validate('unknown',{}));
  assert.throws(()=>validate('click',{x:1,y:2,command:'other'}));
  assert.throws(()=>validate('click',{x:'1',y:2}));
  assert.throws(()=>validate('type_text',{text:'x'.repeat(1501)}));
  assert.throws(()=>validate('click',{x:1,y:2,button:'invalid'}));
  assert.throws(()=>validate('scroll',{notches:101}));
});
test('read-only window inspection does not ask for an action approval', async () => {
  const result=await execute('list_windows',{}, {requestApproval:async()=>{throw new Error('unexpected');},perform:async()=>({windows:[]})});
  assert.deepEqual(result,{windows:[]});
});
test('full access runs the exact action without a permission request', async () => {
  let count = 0;
  await execute('run_command', {command:'Write-Output COUCOU_FULL_OK'}, {fullAccessEnabled:()=>true, requestApproval:async()=>{throw new Error('must not prompt');}, perform:async(name,args)=>{count++;assert.equal(args.command,'Write-Output COUCOU_FULL_OK');}});
  assert.equal(count,1);
});
test('turning full access off restores review before the next action', async () => {
  let full = true, count = 0;
  const deps={fullAccessEnabled:()=>full,requestApproval:async()=>false,perform:async()=>{count++;}};
  await execute('press_keys',{keys:'ENTER'},deps);
  full=false;
  await assert.rejects(execute('press_keys',{keys:'ENTER'},deps),/not approved/);
  assert.equal(count,1);
});
test('batched desktop calls finish in order and a failure does not block later calls', async () => {
  const events=[];
  const deps={fullAccessEnabled:()=>true,perform:async(name)=>{
    events.push(`start:${name}`);
    await new Promise(resolve=>setTimeout(resolve,5));
    events.push(`end:${name}`);
    if(name==='click') throw new Error('test failure');
  }};
  const results=await Promise.allSettled([executeQueued('click',{x:1,y:1},deps),executeQueued('type_text',{text:'test'},deps)]);
  assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');
  assert.deepEqual(events,['start:click','end:click','start:type_text','end:type_text']);
});
