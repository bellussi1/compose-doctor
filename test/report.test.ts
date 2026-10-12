import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteCommand,formatReport,exitCode} from '../dist/report.js';
test('command suggestions quote literal arguments for PowerShell and POSIX',()=>{
  const command={executable:'docker' as const,args:['compose','--file',"a'b $x ` ; space.yaml"]};
  assert.equal(quoteCommand(command,'win32'),"docker 'compose' '--file' 'a''b $x ` ; space.yaml'");
  assert.equal(quoteCommand(command,'linux'),"docker 'compose' '--file' 'a'\"'\"'b $x ` ; space.yaml'");
});
test('JSON and text reports preserve readiness and metadata',()=>{
  const report={ready:false,services:[{name:'api',containers:[],ready:false}],findings:[{service:'api',code:'MISSING',severity:'error' as const,message:'No container.',suggestions:[]}]};
  assert.equal(JSON.parse(formatReport(report,true)).ready,false);assert.match(formatReport(report,false),/MISSING/);assert.equal(exitCode(report),1);assert.equal(exitCode({...report,ready:true}),0);
});
