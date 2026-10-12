import { test } from "node:test";
import assert from "node:assert/strict";
import { collect } from "../dist/docker.js";
import { runDocker } from "../dist/process.js";
import { fakeDocker, ps, inspected } from "./helpers.ts";
const options = {
  files: ["file with $ and ; space.yaml"],
  projectName: "demo",
  services: [],
  json: true,
};
async function withFake(
  action: (fake: Awaited<ReturnType<typeof fakeDocker>>) => Promise<void>,
) {
  const fake = await fakeDocker();
  const before = {
    PATH: process.env.PATH,
    NODE_OPTIONS: process.env.NODE_OPTIONS,
  };
  Object.assign(process.env, {
    PATH: fake.env.PATH,
    NODE_OPTIONS: fake.env.NODE_OPTIONS,
  });
  try {
    await action(fake);
  } finally {
    for (const [key, value] of Object.entries(before))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await fake.close();
  }
}
test("adapter preserves argv and executes only config ps and projected inspect", async () =>
  withFake(async (fake) => {
    await fake.set({
      ps: JSON.stringify(ps),
      inspect: JSON.stringify(inspected),
    });
    const data = await collect(options, fake.dir);
    assert.deepEqual(data.expected, ["api"]);
    assert.equal(data.containers.length, 1);
    const calls = await fake.calls();
    assert.deepEqual(calls[0], [
      "compose",
      "--file",
      "file with $ and ; space.yaml",
      "--project-name",
      "demo",
      "config",
      "--services",
    ]);
    assert.deepEqual(calls[1], [
      "compose",
      "--file",
      "file with $ and ; space.yaml",
      "--project-name",
      "demo",
      "ps",
      "--all",
      "--no-trunc",
      "--format",
      "json",
      "--orphans=false",
      "api",
    ]);
    assert.equal(calls[2][0], "inspect");
    assert.ok(calls[2].includes(ps.ID));
    assert.ok(!calls[2].join(" ").includes(".Config.Env"));
    assert.ok(!calls[2].join(" ").includes(".Output"));
  }));
test("missing replicas and invalid selections fail explicitly; empty ps is legitimate", async () =>
  withFake(async (fake) => {
    await fake.set({ ps: JSON.stringify(ps), inspect: "[]" });
    await assert.rejects(
      collect(options, fake.dir),
      (error) => (error as any).code === "CONTAINER_UNAVAILABLE",
    );
    await fake.set({ services: "" });
    await assert.rejects(
      collect(options, fake.dir),
      (error) => (error as any).code === "NO_SERVICES",
    );
    await fake.set({});
    assert.deepEqual((await collect(options, fake.dir)).containers, []);
    await assert.rejects(
      collect({ ...options, services: ["unknown"] }, fake.dir),
      (error) => (error as any).code === "SERVICE_UNKNOWN",
    );
  }));
test("subprocess failures never disclose stderr and enforce output and time budgets", async () =>
  withFake(async (fake) => {
    for (const [mode, code] of [
      ["error", "DOCKER_QUERY_FAILED"],
      ["overflow", "DOCKER_OUTPUT_LIMIT"],
      ["timeout", "DOCKER_TIMEOUT"],
    ]) {
      await fake.set({ mode });
      const start = Date.now();
      await assert.rejects(
        runDocker(["compose", "config", "--services"], fake.dir),
        (error) => {
          assert.equal((error as any).code, code);
          assert.ok(!String(error).includes("SECRET_SENTINEL"));
          return true;
        },
      );
      if (mode === "timeout") {
        assert.ok(Date.now() - start >= 9500);
        assert.ok(Date.now() - start < 12000);
      }
    }
  }));
