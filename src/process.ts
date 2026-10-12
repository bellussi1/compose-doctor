import { spawn } from "node:child_process";
import { DoctorError } from "./errors.js";
export async function runDocker(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let size = 0;
    let finished = false;
    let failure: DoctorError | undefined;
    let terminationTimer: NodeJS.Timeout | undefined;
    const chunks: Buffer[] = [];
    const fail = (code: string) => {
      if (finished) return;
      finished = true;
      failure = new DoctorError(code);
      clearTimeout(timer);
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      terminationTimer = setTimeout(() => {
        child.unref();
        reject(failure);
      }, 1000);
    };
    const timer = setTimeout(() => fail("DOCKER_TIMEOUT"), 10000);
    const count = (chunk: Buffer, stdout: boolean) => {
      size += chunk.length;
      if (size > 4194304) {
        fail("DOCKER_OUTPUT_LIMIT");
        return;
      }
      if (stdout) chunks.push(chunk);
    };
    child.stdout.on("data", (chunk) => count(chunk, true));
    child.stderr.on("data", (chunk) => count(chunk, false));
    child.on("error", (error) =>
      fail(
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "DOCKER_NOT_FOUND"
          : "DOCKER_QUERY_FAILED",
      ),
    );
    child.on("close", (code) => {
      clearTimeout(terminationTimer);
      if (failure) {
        reject(failure);
        return;
      }
      finished = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new DoctorError("DOCKER_QUERY_FAILED"));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}
