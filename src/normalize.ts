import type {Container,Port} from './types.js';
import {DoctorError} from './errors.js';
export type PsContainer=Omit<Container,'restartCount'|'health'>;
export type InspectContainer=Omit<Container,'ports'>;
const states=['created','running','paused','restarting','removing','exited','dead'];
const healthStates=['','healthy','unhealthy','starting'];
const fail=()=>new DoctorError('DOCKER_OUTPUT_INVALID');
export function safeText(value:unknown):string{if(typeof value!=='string'||!value.length||/[\x00-\x1f\x7f]/.test(value))throw fail();return value;}
export function serviceName(value:unknown):string{const name=safeText(value);if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name))throw fail();return name;}
function object(value:unknown):Record<string,unknown>{if(value===null||typeof value!=='object'||Array.isArray(value))throw fail();return value as Record<string,unknown>;}
function number(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw fail();return value;}
function id(value:unknown):string{const text=safeText(value);if(!/^[a-f0-9]{12,64}$/.test(text))throw fail();return text;}
function state(value:unknown):string{const text=safeText(value);if(!states.includes(text))throw fail();return text;}
function rows(text:string):Record<string,unknown>[] {
  try{if(!text.trim())return [];const parsed:unknown=text.trim().startsWith('[')?JSON.parse(text):text.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));if(!Array.isArray(parsed))throw fail();return parsed.map(object);}catch{throw fail();}
}
function ports(value:unknown):Port[]{
  if(value===null)return [];if(!Array.isArray(value))throw fail();
  return value.map(raw=>{const port=object(raw);const protocol=safeText(port.Protocol);if(!['tcp','udp','sctp'].includes(protocol))throw fail();return {host:safeText(port.URL),published:number(port.PublishedPort,1,65535),target:number(port.TargetPort,1,65535),protocol};});
}
export function parsePs(text:string):PsContainer[]{return rows(text).map(row=>{
  if(typeof row.Health!=='string'||!healthStates.includes(row.Health))throw fail();
  return {id:id(row.ID),name:safeText(row.Name),service:serviceName(row.Service),state:state(row.State),exitCode:number(row.ExitCode,-1,255),ports:ports(row.Publishers)};
});}
export function parseInspect(text:string):InspectContainer[]{return rows(text).map(row=>{
  if(typeof row.healthStatus!=='string'||!healthStates.includes(row.healthStatus))throw fail();
  return {id:id(row.id),name:safeText(row.name).replace(/^\//,''),service:serviceName(row.service),state:state(row.state),exitCode:number(row.exitCode,-1,255),restartCount:number(row.restartCount),...(row.healthStatus?{health:{status:row.healthStatus,failingStreak:number(row.failingStreak),...(row.lastExitCode!==null&&row.lastExitCode!==undefined?{lastExitCode:number(row.lastExitCode,-1,255)}:{})}}:{})};
});}
export function mergeContainers(ps:PsContainer[],inspect:InspectContainer[]):Container[]{
  if(new Set(ps.map(row=>row.id)).size!==ps.length||new Set(inspect.map(row=>row.id)).size!==inspect.length)throw fail();
  return ps.map(row=>{const detail=inspect.find(item=>item.id===row.id);if(!detail)throw new DoctorError('CONTAINER_UNAVAILABLE');if(detail.service!==row.service)throw fail();return {...detail,ports:row.ports};});
}
