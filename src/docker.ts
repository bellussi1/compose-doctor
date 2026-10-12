import type { Options, Container } from "./types.js";
import { runDocker } from "./process.js";
import { composeArgs } from "./arguments.js";
import {
  parsePs,
  parseInspect,
  mergeContainers,
  serviceName,
} from "./normalize.js";
import { DoctorError } from "./errors.js";
const template =
  '{"id":{{json .Id}},"name":{{json .Name}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"state":{{json .State.Status}},"exitCode":{{json .State.ExitCode}},"restartCount":{{json .RestartCount}},"healthStatus":{{if .State.Health}}{{json .State.Health.Status}}{{else}}""{{end}},"failingStreak":{{if .State.Health}}{{json .State.Health.FailingStreak}}{{else}}0{{end}},"lastExitCode":{{if .State.Health}}{{$last := "null"}}{{range .State.Health.Log}}{{$last = json .ExitCode}}{{end}}{{$last}}{{else}}null{{end}}}';
export async function collect(
  options: Options,
  cwd: string,
): Promise<{ expected: string[]; containers: Container[] }> {
  const base = composeArgs(options);
  const all = (await runDocker([...base, "config", "--services"], cwd))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(serviceName);
  if (!all.length) throw new DoctorError("NO_SERVICES");
  if (options.services.some((name) => !all.includes(name)))
    throw new DoctorError("SERVICE_UNKNOWN");
  const expected = options.services.length
    ? [...new Set(options.services)]
    : [...new Set(all)];
  const ps = parsePs(
    await runDocker(
      [
        ...base,
        "ps",
        "--all",
        "--no-trunc",
        "--format",
        "json",
        "--orphans=false",
        ...expected,
      ],
      cwd,
    ),
  );
  if (ps.some((row) => !expected.includes(row.service)))
    throw new DoctorError("DOCKER_OUTPUT_INVALID");
  const inspect: ReturnType<typeof parseInspect> = [];
  for (let offset = 0; offset < ps.length; offset += 50) {
    inspect.push(
      ...parseInspect(
        await runDocker(
          [
            "inspect",
            "--type",
            "container",
            "--format",
            template,
            ...ps.slice(offset, offset + 50).map((row) => row.id),
          ],
          cwd,
        ),
      ),
    );
  }
  return { expected, containers: mergeContainers(ps, inspect) };
}
