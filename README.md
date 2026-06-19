# waste-obligations-journey-tests

End-to-end Playwright tests for the EPR waste obligations CSOC submission journey, packaged for the DEFRA CDP Portal.

- [Local development](#local-development)
  - [Requirements](#requirements)
  - [Setup](#setup)
  - [Running locally](#running-locally)
  - [Profiles](#profiles)
  - [Debugging locally](#debugging-locally)
  - [Running locally in Docker](#running-locally-in-docker)
- [Production (CDP Portal)](#production-cdp-portal)
- [Running on GitHub](#running-on-github)
- [Reporting](#reporting)
- [Licence](#licence)

## Local development

### Requirements

Node.js `>= 22.13.1` (matching `.nvmrc`). Use [nvm](https://github.com/creationix/nvm) to pick up the pinned version:

```bash
nvm use
```

Docker is required for the containerised flows (`docker:test:local`, building the CDP image).

### Setup

Install dependencies and download the Chromium binary used by Playwright:

```bash
npm install
npm run install:browsers
```

Copy the example env file and fill in test credentials:

```bash
cp .env.example .env
# edit .env to set EPR_USER_EMAIL, EPR_USER_PASSWORD, and optionally EPR_BASE_URL
```

The local config (`playwright.local.config.js`) reads `EPR_BASE_URL` and defaults to `https://localhost:7084` when not set.

### Running locally

Headed (recommended for development):

```bash
npm run test:local
```

Headless against the local config:

```bash
npx playwright test --config=playwright.local.config.js
```

Open the most recent Allure report after a run:

```bash
npm run report
```

### Profiles

The suite runs one profile at a time, selected by the `PROFILE` env var. The CDP Portal injects this from the **Profile** field on the test-suite run page; locally you set it yourself.

| `PROFILE`       | Specs run                       |
| --------------- | ------------------------------- |
| `e2e` (default) | `tests/csoc-submission.spec.js` |
| `accessibility` | `tests/accessibility.spec.js`   |
| `security`      | `tests/security.spec.js`        |

Unset → `e2e` (so `npm test` and `npm run test:local` keep working as before). Any other value throws at config load and names the valid options.

Convenience scripts:

```bash
npm run test:e2e                 # PROFILE=e2e (headless, CDP config)
npm run test:accessibility       # PROFILE=accessibility (headless, CDP config)
npm run test:security            # PROFILE=security (headless, CDP config)
npm run test:local:e2e           # PROFILE=e2e (headed, local config)
npm run test:local:accessibility # PROFILE=accessibility (headed, local config)
npm run test:local:security      # PROFILE=security (headed, local config)
```

#### Security profile (OWASP ZAP)

`PROFILE=security` walks the same CSOC journey as the other profiles but through an OWASP ZAP daemon that runs **inside the test container** — no extra services to spin up. `entrypoint.sh` starts ZAP, points Playwright at it via `HTTP_PROXY`, and after the journey writes an HTML report to `./security-report/index.html`.

Findings are **report-only**: ZAP alerts never fail the suite, only the journey itself does.

| Env var      | Effect                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `ZAP_ACTIVE` | Set to `1` to run a ZAP active scan against in-scope URLs after the journey. Default = passive (baseline) scan only. |

Run an active scan locally:

```bash
ZAP_ACTIVE=1 PROFILE=security npm run docker:test:local
```

Active scans send attack payloads at the target environment — only enable against shared envs (`tst1`/`dev9`) after the security team has signed off.

**Local outside Docker:** `npm run test:local:security` does NOT start ZAP — it just runs the security spec as a plain headed Playwright run (useful for iterating on the journey itself). Use `npm run docker:test:local` whenever you need real ZAP coverage; the entrypoint inside the container does the orchestration.

### Debugging locally

Step through tests in the Playwright Inspector:

```bash
npm run test:debug
```

Or use the interactive UI mode:

```bash
npm run test:ui
```

### Running locally in Docker

Build the container and run the suite end-to-end (skipping the S3 publish step):

```bash
npm run docker:test:local
```

Allure results and report are volume-mounted into `./allure-results` and `./allure-report` so you can browse them after the run.

## Production (CDP Portal)

Tests run from the CDP Portal under **Test Suites**. Each push to `main` builds a new Docker image via `.github/workflows/publish.yml`. The portal pulls the latest image when you trigger a run.

The container's flow (`entrypoint.sh`):

1. Logs the portal-injected `RUN_ID` and resolved `PROFILE` (defaults to `e2e`) so the run is traceable in the container logs.
2. If `PROFILE=security`, starts OWASP ZAP as a local daemon and exports `HTTP_PROXY` so Playwright routes browser traffic through it.
3. Runs `npm test` (Playwright headless against the configured `baseURL`, with `testIgnore` driven by `PROFILE`).
4. If `PROFILE=security`, optionally runs a ZAP active scan (when `ZAP_ACTIVE=1`), then fetches the HTML report to `./security-report/index.html` and shuts ZAP down.
5. Publishes the run's primary report (see [Reporting](#reporting) for the per-profile mapping): Allure for `e2e`/`security`, or the WCAG HTML for `accessibility`. `bin/publish-tests.sh` also uploads `security-report/index.html` (when present) and `test-results/`.
6. Exits with Playwright's exit code so the portal shows pass/fail correctly. ZAP findings are report-only and do not affect the exit code.

`baseURL` is built from the portal-injected `ENVIRONMENT` variable in `playwright.config.js`:

```js
const baseURL = `https://waste-obligations-journey-tests.${process.env.ENVIRONMENT}.cdp-int.defra.cloud`
```

> **Important:** the host segment is currently `waste-obligations-journey-tests` (the test-suite repo name). Swap this for the deployed frontend service name when the EPR app is in CDP.

Outbound HTTP from the container goes through the CDP proxy at `localhost:3128`. Any target host outside CDP-internal must be on your test suite's outbound allowlist; otherwise Chromium fails with `ERR_TUNNEL_CONNECTION_FAILED`.

## Running on GitHub

`compose.yml` is a single test-runner service built from this repo's `Dockerfile`. Playwright runs the browser inside the runner itself — no separate Selenium service required.

For PR-triggered runs from another service repo, see `run-journey-tests/action.yml` and the example workflow in `.github/workflows/journey-tests.yml`.

## Reporting

The published report depends on which profile ran. The Portal's "report" link always points at `$RESULTS_OUTPUT_S3_PATH/index.html`; what lives there changes:

| `PROFILE`       | Primary report at S3 root            | Additional uploads                                          |
| --------------- | ------------------------------------ | ----------------------------------------------------------- |
| `e2e` (default) | Allure (`allure-report/index.html`)  | `test-results/` (Playwright traces/screenshots)             |
| `accessibility` | WCAG findings (`reports/index.html`) | `test-results/`                                             |
| `security`      | Allure (`allure-report/index.html`)  | `security-report/index.html` (ZAP HTML) and `test-results/` |

For `e2e` and `security`, `npm run report:publish` runs `allure generate` then `bin/publish-tests.sh`. For `accessibility`, `entrypoint.sh` skips the Allure generate step entirely — `tests/accessibility-checking.js` writes the WCAG report to `./reports/` during the test's `afterAll`, and `bin/publish-tests.sh` uploads that directory instead.

The CDP Portal expects the published directory to contain an `index.html` at the root — Allure's `allure generate` and the accessibility checker's `generateAccessibilityReportIndex` both produce one.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government licence v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
