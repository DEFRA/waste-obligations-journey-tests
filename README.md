# waste-obligations-journey-tests

End-to-end Playwright tests for the EPR waste obligations CSOC submission journey, packaged for the DEFRA CDP Portal.

- [Local development](#local-development)
  - [Requirements](#requirements)
  - [Setup](#setup)
  - [Running locally](#running-locally)
  - [Profiles](#profiles)
  - [Accounts](#accounts)
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

The local config (`playwright.local.config.js`) reads `EPR_BASE_URL`; without it, Packaging defaults to `https://localhost:7084` and the direct Waste Obligations entry point to `https://localhost:8010`.

### Entry point

`JOURNEY_ENTRY_POINT` controls which application receives the first browser request:

| Value                 | Start route                                                                                                                  | Intended use                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `packaging` (default) | Packaging `/report-data`, then the Manage recycling obligations link                                                         | Local journeys through epr-local-environment     |
| `waste-obligations`   | DP: `/compliance/producer/{organisationId}/certificate?year={year}`; CSO: `/compliance/cso/{schemeId}/statement?year={year}` | CI against a deployed Waste Obligations frontend |

`EPR_BASE_URL` overrides the frontend URL for either entry point. `WASTE_OBLIGATIONS_API_BASE_URL` similarly overrides the lifecycle API URL; use it when the frontend and API are deployed to different hosts. Local scripts now set `ENVIRONMENT=local` automatically.

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

| `PROFILE`       | Specs run                                                               |
| --------------- | ----------------------------------------------------------------------- |
| `e2e` (default) | `tests/csoc-submission-dp.spec.js`, `tests/csoc-submission-cso.spec.js` |
| `accessibility` | `tests/accessibility.spec.js`                                           |
| `security`      | `tests/security.spec.js`                                                |

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

### Accounts

The suite covers two accounts in parallel — both run on every `npm run test:*` invocation, no env flag needed.

| Spec                                | Account                          | Login env vars                                | Backend org / submitter env vars                                                               | Storage state               |
| ----------------------------------- | -------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| `tests/csoc-submission-dp.spec.js`  | DP (direct producer)             | `EPR_USER_EMAIL`, `EPR_USER_PASSWORD`         | `WASTE_OBLIGATION_ORG_ID`, `WASTE_OBLIGATION_SUBMITTER_ID`, `WASTE_OBLIGATION_SUBMITTER_EMAIL` | `playwright/.auth/dp.json`  |
| `tests/csoc-submission-cso.spec.js` | CSO (compliance scheme operator) | `EPR_CSO_USER_EMAIL`, `EPR_CSO_USER_PASSWORD` | `WASTE_OBLIGATION_CSO_ORG_ID`                                                                  | `playwright/.auth/cso.json` |

Both `*.setup.js` files run unconditionally, producing `dp.json` and `cso.json`. Each spec pins its own `storageState` via `test.use({ storageState })` and threads the account string (`'dp'` or `'cso'`) into the API helpers so backend ops target the right org and submitter. The submission page object auto-detects the CSO variant from the rendered DOM (presence of a "Compliance scheme" summary row and a "Regulation 43" radio fieldset).

Shared backend admin credentials (`WASTE_OBLIGATION_USERNAME` / `WASTE_OBLIGATION_PASSWORD` / `JOURNEY_USER` / `JOURNEY_PASSWORD`) are tenant-agnostic and used for both accounts.

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
5. Publishes the run via `bin/publish-tests.sh` (see [Reporting](#reporting)): Allure goes to the S3 root for every profile (the Portal report link opens it directly), and accessibility/security profiles also upload their findings to `accessibility-report/` or `security-report/`. `test-results/` (Playwright traces/screenshots) uploads alongside in every case.
6. Exits with Playwright's exit code so the portal shows pass/fail correctly. ZAP findings are report-only and do not affect the exit code.

`baseURL` is resolved from `ENVIRONMENT` and `JOURNEY_ENTRY_POINT`, unless `EPR_BASE_URL` is supplied explicitly. The CDP Portal can continue to use the Packaging entry point, or set `JOURNEY_ENTRY_POINT=waste-obligations` when it needs to begin at the direct frontend route.

Outbound HTTP from the container goes through the CDP proxy at `localhost:3128`. Any target host outside CDP-internal must be on your test suite's outbound allowlist; otherwise Chromium fails with `ERR_TUNNEL_CONNECTION_FAILED`.

## Running on GitHub

The repository workflow runs the `e2e`, `accessibility` and `security` profiles with the Playwright `chrome-android` project. It starts a dedicated Docker Compose stack from [ci/compose.yml](ci/compose.yml), accessed locally at `https://localhost:8010` and `http://localhost:8007`. It does not start, check out or depend on an `epr-local-environment` profile. The security profile runs its passive ZAP scan in a short-lived container on the runner host network, explicitly including loopback browser traffic so it can inspect the same local stack as the browser.

The stack contains only the journey's runtime dependencies:

- published `waste-obligations`, `waste-obligations-frontend` and `waste-organisations` images;
- MongoDB, Redis, Floci and an Nginx TLS proxy;
- WireMock in place of the Azure-hosted Backend Account API; and
- journey-owned organisation scenario data, seeded through the Waste Organisations API.

The runner always checks out `waste-obligations` and `waste-obligations-frontend`: at a supplied SHA, or at `main` when a SHA is omitted. With a SHA it builds the existing service Dockerfile locally; when both SHAs are supplied, those image builds run concurrently on the same runner. Without a SHA, Docker Compose pulls the service's normal `latest` image from the registry. The checkout always supplies that service's CI setup assets. The workflow is available through **Run workflow** and as a reusable workflow. The [Waste Obligations](https://github.com/DEFRA/waste-obligations#journey-tests) and [Waste Obligations frontend](https://github.com/DEFRA/waste-obligations-frontend#journey-tests) pull-request workflows use the composite runner directly. It requires the two B2C login accounts, `WASTE_OBLIGATIONS_FRONTEND_B2C_CLIENT_SECRET`, and `GOVUK_NOTIFY_API_KEY` as GitHub secrets. The journey's organisation and submitter identifiers are non-secret scenario data defined in the workflow.

#### GitHub Actions secrets

Configure these repository secrets for manual runs. A repository calling the reusable workflow must provide the same names, either explicitly or through `secrets: inherit`.

The composite action used by service pull requests executes in the calling repository, so secrets configured here are not automatically available to it. Configure the same names in both service repositories, or preferably as organisation-level Actions secrets restricted to this repository and the two service repositories. The service-repository READMEs link here as the canonical contract; do not duplicate the values in source control.

| Secret                                         | Purpose                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `EPR_USER_EMAIL`                               | Direct producer journey-account email address.                                                    |
| `EPR_USER_PASSWORD`                            | Direct producer journey-account password.                                                         |
| `EPR_CSO_USER_EMAIL`                           | Compliance-scheme journey-account email address.                                                  |
| `EPR_CSO_USER_PASSWORD`                        | Compliance-scheme journey-account password.                                                       |
| `WASTE_OBLIGATIONS_FRONTEND_B2C_CLIENT_SECRET` | Azure AD B2C application client secret used by the frontend.                                      |
| `GOVUK_NOTIFY_API_KEY`                         | Format-valid dummy GOV.UK Notify key injected into the WireMock-backed Waste Obligations service. |

The caller's journey job also needs `contents: read` and `id-token: write`. Docker login derives the CDP role name from the caller repository, so the roles `github-waste-obligations-build-role` and `github-waste-obligations-frontend-build-role` must be available to their respective workflows. These role permissions are not GitHub secrets.

#### Calling from service pull requests

The service pull-request jobs are independent of their repositories' normal validation jobs. They look for a branch with the same name in this repository and pass it as `journey-tests-ref`; if it does not exist, they use `main`. They then pass their own PR head SHA as the relevant service input. This lets a coordinated change exercise altered journey tests without publishing a test image. Pull requests from forks are excluded because GitHub does not make repository secrets available to them.

The action is deliberately pinned to `run-journey-tests@main`, as GitHub Actions does not support a dynamic `uses:` ref. `journey-tests-ref` checks out the selected test branch and uses its journeys and CI-stack assets.

### Service-owned CI setup

The journey-test repository owns the shared topology and test scenario; it does not copy a service's setup logic. Waste Obligations owns [its Compose fragment](../waste-obligations/compose/journey-tests.compose.yml), which runs its existing `compose/init-floci.sh` to create and verify the analytics SNS topic, SQS queue, queue policy and subscription before the API starts. It also provides the Account `organisation-with-persons` and GOV.UK Notify mappings it consumes. The frontend owns [its Compose fragment](../waste-obligations-frontend/compose/journey-tests.compose.yml), which provides Account token, user-organisation and compliance-scheme mappings. Those mappings mirror the relevant epr-local-environment account seed: POP QUEST LTD, Organisation Name, and Compliance Scheme Name.

Every source-owned fragment extends the shared target service with a one-shot dependency. For example, a fragment that contributes WireMock mappings adds its generator as a `wiremock.depends_on` entry; a fragment that contributes Floci resources adds its initialiser to the consuming service's `depends_on`. A later service can use the same convention for additional Floci or WireMock setup without changing `ci/compose.yml`; the runner only needs to check out and merge that service's fragment when it is added to the stack.

No test-support images are built or published. The no-SHA route deliberately uses setup assets from `main` with the service's published `latest` image; those assets must remain compatible. Supplying a SHA makes the runtime image and setup assets come from the same source revision.

```yaml
jobs:
  waste-obligations-e2e:
    uses: DEFRA/waste-obligations-journey-tests/.github/workflows/journey-tests.yml@main
    with:
      waste-obligations-frontend: ${{ github.sha }}
      # Pass this when the calling repository is waste-obligations itself.
      # waste-obligations: ${{ github.sha }}
    secrets: inherit
```

`run-journey-tests/action.yml` provides the same runner as a composite action when a caller needs to place it among other workflow steps. Omitting both SHA inputs exercises the latest registry images; supplying one or both exercises those source revisions in the local stack.

## Reporting

The CDP Portal's report viewer only renders the `index.html` at the run's S3 root, so Allure always lives there — that's what the Portal "report" link opens for every profile. Profile-specific reports sit at predictable sub-paths and are reachable from the Portal's "report folder contents" listing (or by knowing the URL).

| `PROFILE`       | `$RESULTS_OUTPUT_S3_PATH/` root | Additional sub-paths                                                  |
| --------------- | ------------------------------- | --------------------------------------------------------------------- |
| `e2e` (default) | Allure                          | `test-results/` (Playwright traces, screenshots, videos)              |
| `accessibility` | Allure                          | `accessibility-report/index.html` (WCAG findings) and `test-results/` |
| `security`      | Allure                          | `security-report/index.html` (ZAP HTML) and `test-results/`           |

Sources:

- **Allure** — `allure-results/` (written by `allure-playwright` during the run) → `allure-report/` (via `npm run report`, allure-commandline).
- **WCAG findings** — `tests/accessibility-checking.js` writes `./reports/` during the accessibility spec's `afterAll`.
- **ZAP HTML** — `entrypoint.sh:stop_zap` pulls `/OTHER/core/other/htmlreport/` from the ZAP API at end of run.

If the `security` ZAP report is missing (a `REPORT_MISSING` marker is left when the fetch fails), `bin/publish-tests.sh` logs a warning and skips the S3 upload — Allure is still published so the run's pass/fail story is intact.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government licence v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
