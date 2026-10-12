import type { Options } from "./types.js";
export function composeArgs(options: Options): string[] {
  return [
    "compose",
    ...options.files.flatMap((file) => ["--file", file]),
    ...(options.projectName ? ["--project-name", options.projectName] : []),
  ];
}
