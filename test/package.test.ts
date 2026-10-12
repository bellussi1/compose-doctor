import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fakeDocker, ps, inspected } from "./helpers.ts";
test("installed package includes runtime only and bin preserves exit and JSON contracts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doctor-package-"));
  const fake = await fakeDocker();
  const npm = (args: string[], cwd: string) => {
    const result = spawnSync(
      process.execPath,
      [process.env.npm_execpath!, ...args],
      { cwd, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    const packed = JSON.parse(
      npm(["pack", "--json", "--pack-destination", dir], resolve(".")),
    )[0];
    assert.ok(packed.files.some((file: any) => file.path === "dist/cli.js"));
    assert.ok(
      !packed.files.some(
        (file: any) =>
          /^(src|test|examples)\//.test(file.path) ||
          file.path.includes(".env"),
      ),
    );
    await writeFile(join(dir, "package.json"), "{}");
    npm(
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        join(dir, packed.filename),
      ],
      dir,
    );
    const bin = join(
      dir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "compose-doctor.cmd" : "compose-doctor",
    );
    const run = (args: string[]) =>
      process.platform === "win32"
        ? spawnSync(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `""${bin}" ${args.join(" ")}"`],
            {
              cwd: fake.dir,
              env: fake.env,
              encoding: "utf8",
              windowsVerbatimArguments: true,
            },
          )
        : spawnSync(bin, args, {
            cwd: fake.dir,
            env: fake.env,
            encoding: "utf8",
          });
    assert.equal(run(["--help"]).status, 0);
    await fake.set({
      ps: JSON.stringify(ps),
      inspect: JSON.stringify(inspected),
    });
    const ready = run(["check", "--json"]);
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(JSON.parse(ready.stdout).ready, true);
    await fake.set({});
    const missing = run(["check", "--json"]);
    assert.equal(missing.status, 1);
    assert.equal(JSON.parse(missing.stdout).ready, false);
    const invalid = run(["bad", "--json"]);
    assert.equal(invalid.status, 2);
    assert.equal(JSON.parse(invalid.stdout).error.code, "ARGS_INVALID");
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});
