#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { DoctorError } from "./errors.js";
import type { Options } from "./types.js";
import { collect } from "./docker.js";
import { diagnose } from "./diagnose.js";
import { formatReport, exitCode } from "./report.js";
const args = process.argv.slice(2);
const json = args.includes("--json");
const help = `compose-doctor check [options]
--file <path>          Compose file; repeat for overlays
--project-name <name>  Existing Compose project
--service <name>       Active service to diagnose; repeat to select several
--json                Machine-readable report
--help                Show help without Docker
--version             Show version without Docker
Read-only. Uses the current Docker context, which can be remote.`;
function parse(): Options {
  const options: Options = { files: [], services: [], json: false };
  const seen = new Set<string>();
  if (args[0] !== "check") throw new DoctorError("ARGS_INVALID");
  for (let i = 1; i < args.length; i++) {
    const flag = args[i]!;
    if (
      !["--file", "--project-name", "--service", "--json"].includes(flag) ||
      (seen.has(flag) && !["--file", "--service"].includes(flag))
    )
      throw new DoctorError("ARGS_INVALID");
    seen.add(flag);
    if (flag === "--json") {
      options.json = true;
      continue;
    }
    const value = args[++i];
    if (!value || value.startsWith("--") || /[\x00-\x1f\x7f]/.test(value))
      throw new DoctorError("ARGS_INVALID");
    if (flag === "--file") options.files.push(value);
    if (flag === "--project-name") {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(value))
        throw new DoctorError("ARGS_INVALID");
      options.projectName = value;
    }
    if (flag === "--service") {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value))
        throw new DoctorError("ARGS_INVALID");
      options.services.push(value);
    }
  }
  options.services = [...new Set(options.services)];
  return options;
}
try {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "--version"))
    console.log(
      args[0] === "--help"
        ? help
        : JSON.parse(
            await readFile(new URL("../package.json", import.meta.url), "utf8"),
          ).version,
    );
  else {
    const options = parse();
    const data = await collect(options, process.cwd());
    const report = diagnose(data.expected, data.containers, options);
    console.log(formatReport(report, options.json));
    process.exitCode = exitCode(report);
  }
} catch (error) {
  const code = error instanceof DoctorError ? error.code : "INTERNAL_ERROR";
  if (json) console.log(JSON.stringify({ error: { code, message: code } }));
  else console.error(`Compose Doctor error: ${code}. Use --help for usage.`);
  process.exitCode = 2;
}
