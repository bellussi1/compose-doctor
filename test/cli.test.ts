import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fakeDocker, ps, inspected, runCli } from "./helpers.ts";
const cli = resolve("dist/cli.js");
test("CLI validates flags, exposes help and returns JSON for invalid arguments", () => {
  assert.match(runCli(cli, ["--help"], process.cwd()).stdout, /--service/);
  assert.match(runCli(cli, ["--version"], process.cwd()).stdout, /0\.1\.0/);
  for (const args of [
    [],
    ["oops"],
    ["check", "--unknown"],
    ["check", "--file"],
    ["check", "--json", "--json"],
    ["check", "--project-name", "a", "--project-name", "b"],
    ["check", "--service", "bad;name"],
  ]) {
    const result = runCli(
      cli,
      [...args, ...(args.includes("--json") ? [] : ["--json"])],
      process.cwd(),
    );
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).error.code, "ARGS_INVALID");
  }
});
test("CLI emits exit0/1/2 without leaking raw Docker output or executing suggestions", async () => {
  const fake = await fakeDocker();
  try {
    await fake.set({
      ps: JSON.stringify(ps),
      inspect: JSON.stringify(inspected),
    });
    const healthy = runCli(cli, ["check", "--json"], fake.dir, fake.env);
    assert.equal(healthy.status, 0);
    assert.equal(JSON.parse(healthy.stdout).ready, true);
    await fake.set({
      ps: JSON.stringify(ps),
      inspect: JSON.stringify({ ...inspected, healthStatus: "unhealthy" }),
    });
    const bad = runCli(cli, ["check", "--json"], fake.dir, fake.env);
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).ready, false);
    const text = runCli(cli, ["check"], fake.dir, fake.env);
    assert.match(text.stdout, /UNHEALTHY/);
    for (const input of [
      { mode: "error" },
      { ps: "SECRET_SENTINEL malformed" },
    ]) {
      await fake.set(input);
      const result = runCli(cli, ["check", "--json"], fake.dir, fake.env);
      assert.equal(result.status, 2);
      assert.ok(JSON.parse(result.stdout).error);
      assert.ok(!(result.stdout + result.stderr).includes("SECRET_SENTINEL"));
    }
    assert.ok(
      (await fake.calls()).every(
        (args) =>
          args.includes("config") ||
          args.includes("ps") ||
          args[0] === "inspect",
      ),
    );
  } finally {
    await fake.close();
  }
});
