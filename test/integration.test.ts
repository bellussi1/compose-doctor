import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const enabled = process.env.COMPOSE_DOCTOR_INTEGRATION === "1";
test(
  "real Compose unhealthy→ready demo and profile filtering",
  { skip: !enabled, timeout: 180000 },
  async () => {
    const project = `doctor-demo-${process.pid}-${Date.now()}`;
    const cwd = resolve(".");
    const file = resolve("examples/compose.yaml");
    const overlay = resolve("examples/compose.fixed.yaml");
    const cli = resolve("dist/cli.js");
    const docker = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
      spawnSync("docker", args, {
        cwd,
        env,
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 4194304,
      });
    const base = ["compose", "--file", file, "--project-name", project];
    const endpoint = docker([
      "context",
      "inspect",
      "--format",
      "{{.Endpoints.docker.Host}}",
    ]);
    assert.equal(endpoint.status, 0);
    assert.match(
      endpoint.stdout,
      /^(unix|npipe):\/\//,
      "Integration only creates resources on a local socket context.",
    );
    const check = (fixed = false) =>
      spawnSync(
        process.execPath,
        [
          cli,
          "check",
          "--file",
          file,
          ...(fixed ? ["--file", overlay] : []),
          "--project-name",
          project,
          "--json",
        ],
        { cwd, encoding: "utf8", timeout: 30000 },
      );
    try {
      const services = docker([...base, "config", "--services"], {
        ...process.env,
        COMPOSE_PROFILES: "",
      });
      assert.equal(services.status, 0, services.stderr);
      assert.ok(!services.stdout.includes("debug"));
      const all = docker([...base, "config", "--services"], {
        ...process.env,
        COMPOSE_PROFILES: "debug",
      });
      assert.equal(all.status, 0);
      assert.ok(all.stdout.includes("debug"));
      const up = docker([
        ...base,
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "30",
      ]);
      assert.ok(up.status === 0 || up.status === 1, up.stderr);
      let unhealthy = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = check();
        if (
          result.status === 1 &&
          JSON.parse(result.stdout).findings.some(
            (item: any) => item.code === "UNHEALTHY",
          )
        ) {
          unhealthy = true;
          break;
        }
        if (result.status === 2) assert.fail(result.stdout);
        await delay(1000);
      }
      assert.equal(unhealthy, true);
      const fix = docker([
        "compose",
        "--file",
        file,
        "--file",
        overlay,
        "--project-name",
        project,
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "30",
      ]);
      assert.equal(fix.status, 0, fix.stderr);
      const ready = check(true);
      assert.equal(ready.status, 0, ready.stdout + ready.stderr);
      assert.equal(JSON.parse(ready.stdout).ready, true);
    } finally {
      const cleanup = docker([
        ...base,
        "down",
        "--volumes",
        "--remove-orphans",
      ]);
      assert.equal(cleanup.status, 0, cleanup.stderr);
    }
  },
);
