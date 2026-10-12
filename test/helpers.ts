import {mkdtemp,writeFile,copyFile,chmod,rm,readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export async function fakeDocker(){
  const dir=await mkdtemp(join(tmpdir(),'doctor-'));const log=join(dir,'argv.jsonl');const state=join(dir,'state.json');const script=join(dir,'fake.cjs');
  await writeFile(state,'{}');
  const code=`const fs=require('node:fs');const state=JSON.parse(fs.readFileSync(${JSON.stringify(state)},'utf8'));const args=process.argv.slice(process.platform==='win32'?1:2);if(process.platform==='win32')args[0]=require('node:path').basename(args[0]);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');
if(state.mode==='timeout'){setTimeout(()=>{},20000);}
else if(state.mode==='overflow'){process.stdout.write('S'.repeat(4194305));}
else if(state.mode==='error'){process.stderr.write('SECRET_SENTINEL');process.exit(1);}
else if(args.includes('config')){console.log(state.services??'api');process.exit(0);}
else if(args.includes('ps')){console.log(state.ps??'');process.exit(0);}
else if(args.includes('inspect')){console.log(state.inspect??'');process.exit(0);}
else {process.stderr.write('unexpected command');process.exit(1);}`;
  const env={...process.env,PATH:dir+ (process.platform==='win32'?';':':')+process.env.PATH};
  if(process.platform==='win32'){
    await copyFile(process.execPath,join(dir,'docker.exe'));await writeFile(script,code);await writeFile(join(dir,'compose'),'setInterval(()=>{},20000)');env.NODE_OPTIONS=`--require="${script.replaceAll('\\','/')}"`;
  }else{await writeFile(join(dir,'docker'),'#!/usr/bin/env node\n'+code);await chmod(join(dir,'docker'),0o755);env.NODE_OPTIONS='';}
  return {dir,env,log,async set(value:unknown){await writeFile(state,JSON.stringify(value));},async calls(){try{return (await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}},async close(){await rm(dir,{recursive:true,force:true});}};
}
export const ps={ID:'a'.repeat(64),Name:'demo-api-1',Service:'api',State:'running',Health:'healthy',ExitCode:0,Publishers:null};
export const inspected={id:ps.ID,name:'/demo-api-1',service:'api',state:'running',exitCode:0,restartCount:0,healthStatus:'healthy',failingStreak:0,lastExitCode:0};
export function runCli(cli:string,args:string[],cwd:string,env:NodeJS.ProcessEnv=process.env){
  if(process.platform!=='win32'||!env.NODE_OPTIONS)return spawnSync(process.execPath,[cli,...args],{cwd,env,encoding:'utf8'});
  const bootstrap=`process.env.NODE_OPTIONS=${JSON.stringify(env.NODE_OPTIONS)};process.argv=[process.execPath,${JSON.stringify(cli)},...${JSON.stringify(args)}];await import(${JSON.stringify(pathToFileURL(cli).href)});`;
  return spawnSync(process.execPath,['--input-type=module','-e',bootstrap],{cwd,env:{...env,NODE_OPTIONS:''},encoding:'utf8'});
}
