# Compose Doctor

[![CI](https://github.com/bellussi1/compose-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/bellussi1/compose-doctor/actions/workflows/ci.yml)

Find which services in your Docker Compose environment are not ready, with explanations and diagnostic commands you can choose to run.

A read-only Node.js/TypeScript CLI. It queries Compose service names, container status, healthcheck metadata, historical restarts and published ports. It never starts, stops, restarts or modifies containers.

## Install

Requires Node.js 24+, Docker CLI and Compose v2 or later. Docker must already be available. This package is not published on npm yet.

```sh
git clone https://github.com/bellussi1/compose-doctor.git
cd compose-doctor
npm ci
npm test
npm pack
npm install --global ./compose-doctor-0.1.0.tgz
```

Run in a Compose project:

```sh
compose-doctor check
compose-doctor check --json
compose-doctor check --file compose.yaml --file compose.dev.yaml --project-name my-app --service api
```

`--file` and `--service` can repeat. `--project-name` selects an existing project. Without file options, Compose performs its normal file discovery. `--help` and `--version` work without Docker.

## What the report means

| Finding                  | Meaning                                                                          | Exit impact |
| ------------------------ | -------------------------------------------------------------------------------- | ----------- |
| `MISSING`                | An active service has no container.                                              | 1           |
| `NOT_RUNNING`            | Created, exited, paused, removing or dead container.                             | 1           |
| `RESTARTING`             | Container is currently restarting.                                               | 1           |
| `UNHEALTHY`              | Docker healthcheck is failing.                                                   | 1           |
| `HEALTH_STARTING`        | Healthcheck has not reached readiness.                                           | 1           |
| `RUNNING_NO_HEALTHCHECK` | Container runs; application readiness is unknown.                                | warning     |
| `RESTARTS_OBSERVED`      | Historical restarts, not proof of an active restart loop.                        | warning     |
| `WILDCARD_BIND`          | Published port binds to all host interfaces. Reachability depends on networking. | warning     |

A healthy running container is ready. Every replica is checked; one unhealthy replica makes its service not ready. One-shot jobs exited with code 0 are still reported as not running; the tool cannot infer their intended lifecycle.

Exit **0** means no blocking findings; **1** means missing/not-ready services; **2** means arguments, unavailable Docker/Compose, invalid output or an incomplete query. A project with no active services returns `NO_SERVICES`; `--service` must name an active service. Running without a healthcheck can exit 0 and is always called out as an informational warning.

JSON contains `{ready,services,findings}` with stable finding codes, severity, selected metadata and structured suggested commands `{executable,args}`. Errors use `{error:{code,message}}` with static codes. Suggested commands are never executed. Text output quotes arguments for PowerShell on Windows and POSIX shells elsewhere.

## Privacy and limits

- Does not print environment values, interpolated configuration, commands, raw Docker errors, container logs or healthcheck output. Health reports include status, failing streak and last exit code only.
- Service/container names, file arguments, published ports and selected status metadata are visible. Keep secrets out of those identifiers.
- Uses your **current Docker context**, which can point to a remote daemon. It never changes contexts or claims the daemon is local.
- Active profiles are resolved by Compose. Set `COMPOSE_PROFILES` as you do for your project; selecting a service does not implicitly enable its inactive profile.
- Only published host ports are reported. Exposed image ports without host bindings are not treated as published ports.
- Each query has a 10s timeout and a 4 MiB combined stdout/stderr limit. Failed/partial queries return exit 2 rather than hiding missing containers.
- A snapshot can change after the check. It is not monitoring, a dependency graph validator, a root-cause guarantee or a test that the application serves requests.

## Real demo: unhealthy → ready

The example has PostgreSQL and a small HTTP API. The API starts after the database healthcheck passes; its own health route does not query the database. The initial API healthcheck targets a nonexistent route. An overlay corrects it.

**These demo commands create and remove their own containers and named volume. The diagnostic CLI remains read-only.** Run the demo on a local Docker context, using a unique project name.

```sh
docker compose -f examples/compose.yaml -p doctor-demo up -d
compose-doctor check --file examples/compose.yaml --project-name doctor-demo
# Exit 1: API healthcheck fails after its initial starting period.
docker compose -f examples/compose.yaml -f examples/compose.fixed.yaml -p doctor-demo up -d --wait
compose-doctor check --file examples/compose.yaml --file examples/compose.fixed.yaml --project-name doctor-demo --json
# Exit 0: API and database healthy.
docker compose -f examples/compose.yaml -p doctor-demo down --volumes
```

The demo publishes an ephemeral API port on 127.0.0.1. PostgreSQL credentials are dummy local-only values. The optional debug profile is inactive by default.

## Development and verification

```sh
npm ci
npm test
npm run test:integration
npm audit
npm pack --dry-run
```

Default tests use a controlled fake Docker executable and real CLI subprocesses; integration is skipped in that suite. The explicit integration command requires a local Unix/npipe Docker context and creates a uniquely named disposable project, cleaning it up in `finally`. CI tests unit/CLI/package on Windows/Linux and the real demo on Linux. npm publication is separate.

See [architecture](https://github.com/bellussi1/compose-doctor/blob/main/docs/architecture.md), [contributing](https://github.com/bellussi1/compose-doctor/blob/main/CONTRIBUTING.md) and [changelog](https://github.com/bellussi1/compose-doctor/blob/main/CHANGELOG.md).

MIT © Enzo Bellussi.
