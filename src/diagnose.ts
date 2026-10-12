import type {Container,Options,Report,Finding} from './types.js';
import {composeArgs} from './arguments.js';
const messages:Record<string,string>={MISSING:'No container exists for this active service.',NOT_RUNNING:'Container is not running. Check its exit code and logs.',RESTARTING:'Container is currently restarting.',UNHEALTHY:'Healthcheck is failing.',HEALTH_STARTING:'Healthcheck has not reached a ready state.',RUNNING_NO_HEALTHCHECK:'Running without a healthcheck; application readiness is unknown.',RESTARTS_OBSERVED:'Historical restarts observed; this does not establish an active restart loop.',WILDCARD_BIND:'A published port is bound to all host interfaces; external reachability depends on host networking.'};
export function diagnose(expected:string[],containers:Container[],options:Options):Report{
  const findings:Finding[]=[];
  const services=[...expected].sort().map(name=>{
    const members=containers.filter(item=>item.service===name).sort((a,b)=>a.name.localeCompare(b.name));let ready=true;
    const add=(code:string,severity:Finding['severity'],container?:Container)=>{findings.push({service:name,...(container?{containerId:container.id}:{}),code,severity,message:messages[code]!,suggestions:[{executable:'docker',args:[...composeArgs(options),'logs','--tail','50',name]}]});if(severity==='error'||code==='HEALTH_STARTING')ready=false;};
    if(!members.length)add('MISSING','error');
    for(const member of members){
      if(member.state==='restarting')add('RESTARTING','error',member);
      else if(member.state!=='running')add('NOT_RUNNING','error',member);
      else if(member.health?.status==='unhealthy')add('UNHEALTHY','error',member);
      else if(member.health?.status==='starting')add('HEALTH_STARTING','warning',member);
      else if(!member.health)add('RUNNING_NO_HEALTHCHECK','warning',member);
      if(member.restartCount>0)add('RESTARTS_OBSERVED','warning',member);
      if(member.ports.some(port=>port.host==='0.0.0.0'||port.host==='::'))add('WILDCARD_BIND','warning',member);
    }
    return {name,containers:members,ready};
  });
  return {ready:services.every(service=>service.ready),services,findings};
}
