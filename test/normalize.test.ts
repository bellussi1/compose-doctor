import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePs,parseInspect,mergeContainers} from '../dist/normalize.js';
const ps={ID:'a'.repeat(64),Name:'demo-api-1',Service:'api',State:'running',Health:'healthy',ExitCode:0,Publishers:null,Command:'SECRET_SENTINEL'};
const inspect={id:ps.ID,name:'/demo-api-1',service:'api',state:'running',exitCode:0,restartCount:0,healthStatus:'healthy',failingStreak:0,lastExitCode:0,Env:['SECRET_SENTINEL']};
test('accepts JSON arrays and lines while projecting only selected metadata',()=>{
  for(const text of [JSON.stringify([ps]),JSON.stringify(ps)+'\n']){
    const data=mergeContainers(parsePs(text),parseInspect(JSON.stringify(inspect)));assert.equal(data.length,1);assert.equal(data[0]?.health?.status,'healthy');assert.equal(data[0]?.name,'demo-api-1');assert.deepEqual(data[0]?.ports,[]);assert.ok(!JSON.stringify(data).includes('SECRET_SENTINEL'));
  }
  assert.deepEqual(parsePs(''),[]);
});
test('rejects missing essential fields, malformed output and missing inspected replicas',()=>{
  for(const raw of ['{SECRET_SENTINEL',JSON.stringify([{...ps,ID:'bad'}]),JSON.stringify([{...ps,State:undefined}]),JSON.stringify([{...ps,ExitCode:'0'}]),JSON.stringify([{...ps,Health:'unknown'}]),JSON.stringify([{...ps,Publishers:[{URL:'0.0.0.0',TargetPort:80,PublishedPort:'8080',Protocol:'tcp'}]}])])assert.throws(()=>parsePs(raw));
  for(const raw of [JSON.stringify([{...inspect,restartCount:undefined}]),JSON.stringify([{...inspect,state:'unknown'}])])assert.throws(()=>parseInspect(raw));
  assert.throws(()=>mergeContainers(parsePs(JSON.stringify(ps)),[]),error=>(error as any).code==='CONTAINER_UNAVAILABLE');
});
