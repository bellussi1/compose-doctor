import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose } from "../dist/diagnose.js";
const options = {
  files: ["file with space.yaml"],
  projectName: "demo",
  services: [],
  json: true,
};
const base = {
  id: "a".repeat(64),
  name: "demo-api-1",
  service: "api",
  state: "running",
  exitCode: 0,
  restartCount: 0,
  ports: [],
  health: { status: "healthy", failingStreak: 0 },
};
test("classifies readiness without confusing warnings with failure", () => {
  for (const [state, health, code, ready] of [
    ["running", "healthy", undefined, true],
    ["running", "", "RUNNING_NO_HEALTHCHECK", true],
    ["running", "starting", "HEALTH_STARTING", false],
    ["running", "unhealthy", "UNHEALTHY", false],
    ...["exited", "created", "dead", "paused", "removing"].map((state) => [
      state,
      "",
      "NOT_RUNNING",
      false,
    ]),
    ["restarting", "", "RESTARTING", false],
  ] as const) {
    const container = {
      ...base,
      state,
      health: health ? { status: health, failingStreak: 0 } : undefined,
    };
    const report = diagnose(["api"], [container], options);
    assert.equal(report.ready, ready);
    if (code) assert.ok(report.findings.some((f) => f.code === code));
    else assert.equal(report.findings.length, 0);
  }
  const missing = diagnose(["api"], [], options);
  assert.equal(missing.ready, false);
  assert.equal(missing.findings[0]?.code, "MISSING");
});
test("mixed replicas fail, historical restarts and wildcard ports stay informational", () => {
  const warning = diagnose(
    ["api"],
    [
      {
        ...base,
        restartCount: 2,
        ports: [
          { host: "0.0.0.0", published: 8080, target: 80, protocol: "tcp" },
          { host: "::", published: 8081, target: 80, protocol: "tcp" },
        ],
      },
    ],
    options,
  );
  assert.equal(warning.ready, true);
  assert.ok(warning.findings.some((f) => f.code === "RESTARTS_OBSERVED"));
  assert.ok(warning.findings.some((f) => f.code === "WILDCARD_BIND"));
  const mixed = diagnose(
    ["api"],
    [
      base,
      { ...base, id: "b".repeat(64), name: "demo-api-2", state: "exited" },
    ],
    options,
  );
  assert.equal(mixed.ready, false);
  assert.equal(mixed.services[0]?.containers.length, 2);
  assert.equal(warning.findings[0]?.suggestions[0]?.executable, "docker");
  assert.deepEqual(warning.findings[0]?.suggestions[0]?.args, [
    "compose",
    "--file",
    "file with space.yaml",
    "--project-name",
    "demo",
    "logs",
    "--tail",
    "50",
    "api",
  ]);
});
