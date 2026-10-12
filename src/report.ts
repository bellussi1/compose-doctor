import type {Report,Command} from './types.js';
export function quoteCommand(command:Command,platform:string=process.platform):string{
  const quote=(value:string)=>platform==='win32'?`'${value.replaceAll("'","''")}'`:`'${value.replaceAll("'",`'"'"'`)}'`;
  return [command.executable,...command.args.map(quote)].join(' ');
}
export function formatReport(report:Report,json:boolean):string{
  if(json)return JSON.stringify(report);
  const lines=[report.ready?'Compose environment ready.':'Compose environment not ready.'];
  for(const service of report.services){
    lines.push(`\n${service.ready?'READY':'NOT READY'} ${service.name}`);
    for(const container of service.containers){
      lines.push(`  ${container.name}: ${container.state}, exit=${container.exitCode}, restarts=${container.restartCount}, health=${container.health?.status??'none'}`);
      if(container.health)lines.push(`  health failing streak=${container.health.failingStreak}, last exit=${container.health.lastExitCode??'not available'}`);
      for(const port of container.ports)lines.push(`  port ${port.host}:${port.published} -> ${port.target}/${port.protocol}`);
    }
    for(const finding of report.findings.filter(item=>item.service===service.name)){
      lines.push(`  ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
      for(const command of finding.suggestions)lines.push(`  Suggested (not executed): ${quoteCommand(command)}`);
    }
  }
  return lines.join('\n');
}
export function exitCode(report:Report):0|1{return report.ready?0:1;}
