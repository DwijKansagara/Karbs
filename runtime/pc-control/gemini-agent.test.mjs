import test from 'node:test';
import assert from 'node:assert/strict';
import {runGemini} from './gemini-agent.mjs';
const input={key:'FAKE_TEST_KEY',model:'gemini-3.8-flash',messages:[{role:'user',parts:[{text:'test'}]}],system:'test',fullAccess:true};
test('Gemini executes calls, preserves signatures and returns screenshots and history',async()=>{
  let count=0;const requests=[],executed=[];
  const model={role:'model',parts:[{thoughtSignature:'signature-123',functionCall:{name:'screenshot',id:'call-1',args:{}}},{functionCall:{name:'type_text',id:'call-2',args:{text:'test',processId:42}}}]};
  const result=await runGemini(input,{request:async body=>{requests.push(structuredClone(body));return {candidates:[{content:count++===0?model:{role:'model',parts:[{text:'DONE'}]}}]};},execute:async(name,args)=>{executed.push([name,args]);return name==='screenshot'?{image:'AAAA',scale:0.5}:{typedCharacters:4};}});
  assert.equal(result.text,'DONE');assert.equal(executed.length,2);
  assert.deepEqual(requests[1].contents[1],model);
  assert.equal(requests[1].contents[2].parts[0].functionResponse.id,'call-1');
  assert.equal(requests[1].contents[3].parts[1].inlineData.data,'AAAA');
  assert.equal(result.messages.at(-1).parts[0].text,'DONE');
});
test('Gemini tool errors reach the model and unknown tools are not evaluated as commands',async()=>{
  let count=0;const requests=[];
  await runGemini(input,{request:async body=>{requests.push(structuredClone(body));return {candidates:[{content:{role:'model',parts:count++===0?[{functionCall:{name:'not_a_tool',args:{}}}]:[{text:'Failed'}]}}]};},execute:async()=>{throw new Error('Unknown tool');}});
  assert.equal(requests[1].contents[2].parts[0].functionResponse.response.error,'Unknown tool');
});
test('web search returns source metadata without consuming an extra model request',async()=>{
  let count=0;const requests=[];
  await runGemini(input,{request:async body=>{requests.push(structuredClone(body));return {candidates:[{content:{role:'model',parts:count++===0?[{functionCall:{name:'search_web',args:{query:'Windows cleanup'}}}]:[{text:'Done'}]}}]};},search:async()=>({sources:[{uri:'https://microsoft.com',title:'Microsoft'}]})});
  assert.equal(requests.length,2);
  assert.equal(requests[1].contents[2].parts[0].functionResponse.response.sources[0].uri,'https://microsoft.com');
});
