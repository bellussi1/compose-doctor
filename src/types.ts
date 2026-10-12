export type Options = {
  files: string[];
  projectName?: string;
  services: string[];
  json: boolean;
};
export type Port = {
  host: string;
  published: number;
  target: number;
  protocol: string;
};
export type Container = {
  id: string;
  name: string;
  service: string;
  state: string;
  exitCode: number;
  restartCount: number;
  health?: { status: string; failingStreak: number; lastExitCode?: number };
  ports: Port[];
};
export type Command = { executable: "docker"; args: string[] };
export type Finding = {
  service: string;
  containerId?: string;
  code: string;
  severity: "error" | "warning";
  message: string;
  suggestions: Command[];
};
export type ServiceReport = {
  name: string;
  containers: Container[];
  ready: boolean;
};
export type Report = {
  ready: boolean;
  services: ServiceReport[];
  findings: Finding[];
};
