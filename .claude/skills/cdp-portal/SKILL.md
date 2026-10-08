---
name: cdp-portal
description: Read-only CDP Portal and CDP API Hub lookups - which version of each service is deployed in dev, test, perf-test and prod (and when, by whom), whether a ticket's merged PRs are in the build an environment runs (deployed version >= the PR's first release tag), the build-under-test line for evidence, a team's services and test suites, the journey-test suite's recent runs and results, and a service's API operations from its published OpenAPI spec. Use when the user asks what's deployed or running where, which version is on test, whether a fix or PR has reached an environment, before testing on CDP, or what endpoints an API has.
user-invocable: true
allowed-tools: Bash, Read
argument-hint: versions [svc,…] [--env e] | ticket <KEY> [--env e] | build <svc> --env e | deployed <svc> <ver> | team | suite-runs | api <svc>
---

# CDP Portal

The one place the skills in this repo read CDP Portal (`https://portal.cdp-int.defra.cloud`) and the CDP API Hub
(`https://cdp-api-hub.<env>.cdp-int.defra.cloud`). Other skills call the script; they never copy it.

- **No credentials:** the pages it reads are visible without signing in, from the Defra network or VPN. Exit 2 means
  the host can't be reached: ask the user to connect to the VPN.
- **Read-only:** GET requests only. It never deploys, runs a suite or changes anything.
- **Parsed pages:** the Portal has no public JSON API, so the script parses its HTML. If a page changes shape, a
  command fails with "could not parse" rather than guessing. Fix the parser; don't fall back to reading by eye
  without saying so.

```
node .claude/skills/cdp-portal/cdp.mjs <command> … [--json]
```

| Command                                               | What it answers                                                                                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `versions [svc,…] [--env <env>]`                      | Version per service per environment. Default services: the Waste Obligations services plus `epr-frontend`, `epr-backend`, `epr-re-ex-admin-frontend`. With `--env`: status, deploy time and who deployed |
| `ticket <KEY> [--env <env>] [--prs <pr-status.json>]` | For each **linked** PR of the ticket: its first release tag, the version deployed per environment, and `CONTAINS` / `MISSING` / `not deployed`. Then a verdict per environment                           |
| `build <svc> --env <env>`                             | The build-under-test line and its source, for `run.build()` in `evidence-report`                                                                                                                         |
| `deployed <svc> <version>`                            | Whether each environment runs that version or later                                                                                                                                                      |
| `team [teamId]`                                       | A team's services and test suites (default `epr-meet-obligations`)                                                                                                                                       |
| `suite-runs [suite] [--env <env>] [--limit N]`        | Recent runs of a test suite (default `waste-obligations-journey-tests`): version, env, profile, passed/failed, who ran it. `--json` adds the OpenSearch logs link                                        |
| `api <svc> [--env <env>] [--grep <text>]`             | Operations from the service's OpenAPI spec on the API Hub (default env `test`), and the Redoc link                                                                                                       |

Environments are `dev`, `test`, `perf-test`, `ext-test` and `prod`. In this repo "dev9" pairs with CDP **dev** and
"tst" with CDP **test** (`.claude/skills/qa-ticket/reference/choosing-environment.md`).

## The build must contain the ticket's change

Before testing a ticket on CDP, run:

```
node .claude/skills/cdp-portal/cdp.mjs ticket <KEY> --env <dev|test>
```

- **CONTAINS for every linked PR:** the deployed version is each PR's first release tag or later, so the change is
  in the build. Record the build with `cdp.mjs build <svc> --env <env>`, then test.
- **MISSING, not deployed, or not merged:** stop. Tell the user which PR and service is missing and where it is
  deployed. Deploying is the user's decision.
- **No release tag yet:** the PR merged but no tag contains it yet (or it's older than the last 30 tags). Say so and
  ask the user to check the release in CDP Portal.
- **Not a CDP service:** a PR in a repo that isn't on CDP (the Azure Packaging repos). Its release is checked the
  Azure way, outside this skill.
- **Mentions:** PRs that only mention the key aren't counted. If the user says a mention is part of the ticket, check
  it with `deployed <svc> <firstTag>`.

## Rules

- **Facts only:** report versions, times and results as the Portal shows them, with the date read. Don't infer a
  deployment from a merge.
- **Results need the report:** `suite-runs` gives passed or failed per run. The HTML report needs a Portal sign-in, so
  ask the user for failure details.
