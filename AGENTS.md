# Working on Waste Obligations journey tests

## Purpose and related repositories

These Playwright journeys protect both service pull requests and the deployed
journey across Azure and CDP. Every change must consider both execution modes.

The shared runner is consumed by the CI pipelines of:

- [DEFRA/waste-obligations](https://github.com/DEFRA/waste-obligations): the CDP backend API.
- [DEFRA/waste-obligations-frontend](https://github.com/DEFRA/waste-obligations-frontend): the CDP browser application.
- [DEFRA/packaging-waste-proxy](https://github.com/DEFRA/packaging-waste-proxy): the application reverse proxy.

The Azure part of the browser journey belongs to
[DEFRA/epr-packaging-frontend](https://github.com/DEFRA/epr-packaging-frontend).
It includes account home and the multi-year “Choose a year” screen.

Read [README.md](README.md) for setup and operational details. Confirm behavior
against the action, Compose files and code when documentation differs from the
implementation; do not copy outdated assumptions into new changes.

## Two execution modes

### Service PR builds: CDP-only Docker environment

[run-journey-tests/action.yml](run-journey-tests/action.yml) is the shared
composite action. [.github/workflows/journey-tests.yml](.github/workflows/journey-tests.yml)
also exposes a reusable workflow and this repository's journey checks.

The goal is a small local Docker environment containing the CDP services and
their dependencies, so a service PR can exercise the CDP portion of each journey
before merging. Do not add the Azure application estate or depend on a full
`epr-local-environment` profile to make these checks run.

- The action uses [ci/compose.yml](ci/compose.yml), merging service-owned
  `compose/journey-tests.compose.yml` fragments from the backend and frontend.
- Azure backend dependencies are represented by WireMock contracts and scenario
  data. Browser authentication still uses Azure AD B2C and requires test-account
  credentials; “CDP-only” does not mean authentication is mocked or offline.
- For each service, an explicit revision wins; otherwise the action builds a
  matching branch when available, or uses the published image with `main` setup
  assets. Keep runtime and setup contracts compatible.
- `journey-tests-ref` selects the test checkout. The backend, frontend and proxy
  callers check out the matching journey branch (or main when absent), then
  invoke its local composite action. Verify both action and test revisions
  when coordinating changes across repositories.
- The default browser project is `chrome-android`; the action runs E2E,
  accessibility and security as separate profiles.

### After deployment: full journey from CDP

When a service change is merged, the changing service is automatically deployed
to CDP dev and the journey suite is then run automatically in dev to detect
regressions. The test runner executes inside CDP, but the browser journey can
start in the Azure Packaging application and continue into CDP services.

This mode includes the Azure account home and year-selection steps when their
feature flags are enabled. Use the configured deployed services and credentials;
do not assume the Docker stack's stubs, flags or data exist in dev.

[entrypoint.sh](entrypoint.sh) controls container execution and report publishing.
Preserve test failure exit codes. Network access to Azure can depend on CDP
egress allowlists; local checks against Azure require the Azure VPN.
A network failure before login is not evidence of a journey assertion failure.

The Azure VPN does **not** make the private CDP backend directly accessible from
a developer machine. Local deployed runs must use the API gateway variant:
`WASTE_OBLIGATIONS_API_BASE_URL=https://waste-obligations.api.dev.cdp-int.defra.cloud`.
Set `WASTE_OBLIGATIONS_API_TOKEN_URL`, `WASTE_OBLIGATIONS_API_CLIENT_ID` and
`WASTE_OBLIGATIONS_API_CLIENT_SECRET` in the local `.env` to enable bearer
authentication for every backend helper, including admin cleanup. All three
are required when any is set. With none set, Basic auth remains the default.
The gateway must expose the admin cleanup route as well as the read/write
routes; OAuth credentials alone do not guarantee a complete local deployed run.
The CI action clears all three OAuth settings to keep local Basic auth isolated
from developer gateway configuration. A local Squid proxy does not provide
private backend access.

## Entry points, proxy routing and omitted steps

- `JOURNEY_ENTRY_POINT=packaging` is the default. It starts at `/report-data`
  and exercises the Azure navigation before reaching the CDP application.
- The PR action sets `ENVIRONMENT=local`,
  `JOURNEY_ENTRY_POINT=waste-obligations` and
  `EPR_BASE_URL=https://localhost:8015/manage-recycling-obligations/`.
- All application browser requests in the Docker journey must go through the
  TLS ingress and the `packaging-waste-proxy` Docker service. Do not navigate
  directly to the frontend container or expose a frontend port to bypass the
  proxy. Keep the `/manage-recycling-obligations/` prefix on subsequent links.
- Authentication redirects to B2C and service-to-service/backend setup calls
  have separate destinations. The application reverse proxy is distinct from
  the CDP outbound proxy and the security profile's ZAP proxy.
- Use [utils/journey-entry-point.js](utils/journey-entry-point.js) for route
  construction. A leading slash passed to `new URL` or Playwright navigation
  discards a base URL's pathname; preserve the proxy prefix explicitly and pass
  the requested year through to the CDP route.
- Do not skip a whole scenario merely because its Azure entry point is absent
  in CI. Omit only the Azure-specific steps, enter the equivalent CDP page, and
  execute the remaining assertions. Mark omitted steps in the report and print
  an explicit `SKIPPED STEPS` message with the reason.
- Observe the runner flags for the target environment. Skip the whole scenario,
  with a recorded reason, when a required flag is explicitly false. Omit only
  steps the environment is not configured to show, such as Azure year selection
  when `FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS` is false. A missing page or tile
  when the flag is enabled is a failure, not a skip.
- The certificate-for-year and PRNs-list scenarios use this combined approach.
  Each scenario enters its own CDP destination directly in CI. Certificate-for-year
  resets the org's declarations for that year, submits a new certificate, then
  views it. There is no snapshot restore. PRNs must not navigate through or
  assert a certificate. In Packaging mode, configure
  `WASTE_OBLIGATIONS_FRONTEND_BASE_URL` with the public CDP frontend/proxy URL
  and routing prefix for the PRNs, cookie banner and GA destinations. Packaging
  follows `FEATURE_SHOW_PRNS_ON_CDP` for the Azure-to-CDP PRNs link; when that
  flag is false the scenario opens the CDP PRNs URL directly. Do not claim to
  test Azure year selection in direct-entry mode. Cookie banner and GA tests
  always hit the CDP frontend, including in Packaging/Portal runs.
- Keep helpers focused on one action or assertion. Compose login, year selection,
  destination navigation and assertions explicitly in each scenario. Reporting
  helpers must not decide which steps to omit or navigate on a test's behalf.
- Whole-scenario skips are made visible by
  [utils/skipped-tests-reporter.js](utils/skipped-tests-reporter.js), including
  GitHub warning annotations. A passing run with skipped scenarios does not
  establish coverage for those scenarios.

## Feature flags, credentials and data

Feature configuration is part of making a journey executable. Identify which
service owns each flag and where it must be configured:

| Example flag                          | Owner                      | Configuration to consider                                                                                                                                                                                                                      |
| ------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FEATURE_SHOW_PRNS`                   | Waste Obligations frontend | Enabled in CI Compose and on the CI runner. Portal runner config in `cdp-app-config` records the expected value per env. Explicit `false` skips PRNs; otherwise a missing PRNs page fails.                                                     |
| `FEATURE_MANAGE_OBLIGATIONS`          | Waste Obligations frontend | Recorded on the Portal runner to match frontend config. Does not skip CSOC or certificate journeys.                                                                                                                                            |
| `FEATURE_CSOC_ENABLED`                | Azure Packaging frontend   | Maps to `FeatureManagement__CsocEnabled`. Portal runner config records the expected value. Explicit `false` skips CSOC and certificate journeys; otherwise a missing card or about page fails.                                                 |
| `FEATURE_SHOW_MULTI_YEAR_OBLIGATIONS` | Azure Packaging frontend   | Maps to `FeatureManagement__ShowMultiYearObligations`. Chooses the Azure year-selection path vs the single-year obligations link. A missing tile for the configured path fails.                                                                |
| `FEATURE_SHOW_PRNS_ON_CDP`            | Azure Packaging frontend   | Maps to `FeatureManagement__ShowPrnsOnCdp`. Connects Azure obligations to the CDP PRNs list. Explicit `false` omits that Azure link and opens CDP PRNs directly; otherwise a Packaging-only PRNs href fails.                                   |
| `FEATURE_ANALYTICS`                   | Waste Obligations frontend | True when `GOOGLE_TAG_MANAGER_KEY` or `GOOGLE_ANALYTICS_MEASUREMENT_ID` is set on the frontend. Enabled in CI Compose, the CI runner, and Dev/Test Portal config. Explicit `false` skips cookie/GA journeys; otherwise a missing banner fails. |

A test-runner environment variable does not automatically configure a target
service. Check the service's actual configuration names and behavior. Document
required deployment/configuration changes and coordinate them explicitly; do
not change a shared environment's flags just to make a test pass.

- DP browser login uses `EPR_USER_EMAIL` / `EPR_USER_PASSWORD`; CSO browser login
  uses `EPR_CSO_USER_EMAIL` / `EPR_CSO_USER_PASSWORD`.
- `JOURNEY_USER` / `JOURNEY_PASSWORD` and `WASTE_OBLIGATION_USERNAME` /
  `WASTE_OBLIGATION_PASSWORD` are backend credentials, not browser login accounts.
- Keep secrets out of source control, documentation and diagnostic output.
  Test traces and reports can contain credential-fill values; handle them
  accordingly.
- The journey repository owns scenario data and shared orchestration. Services
  own their infrastructure initialisation and API contract setup. Reuse their
  Compose fragments rather than copying service setup logic here.
- The CI PRNs scenario uses a populated PRN response generated by
  [the backend-owned WireMock initialiser](https://github.com/DEFRA/waste-obligations/blob/main/compose/journey-tests/generate-wiremock-mappings.mjs). Local runs require a visible row matching backend values (number, material,
  issuer and tonnage). Deployed runs report rendered PRN numbers, materials and
  tonnages diagnostically, warning if unavailable; they do not require seeded
  PRNs. Page loading remains mandatory. Do not log names or free-text notes.
  No acceptance or rejection is performed.
- CSOC declarations are not restored from a snapshot. `resetOrgDeclarations`
  deletes the organisation's declarations for a year through the admin DELETE
  API. Specs that need a submitted certificate recreate it through the UI after
  that reset.

## Coordinating application and journey changes

1. For every application behavior change, assess the shared journey coverage.
   Add or amend scenarios and assertions alongside the application change when
   user-visible behavior, API contracts, authentication, routing or error paths
   change. Record why no journey update is needed when existing coverage suffices.
2. When coordinating changes, create and push the **exact same branch name**
   in `waste-obligations-journey-tests` and every affected application repository
   (`waste-obligations`, `waste-obligations-frontend`, `packaging-waste-proxy`).
   For example, use `MO-123-description` in each changed repository. A local-only
   branch is not visible to CI; do not create empty companion branches where
   no changes are needed.
3. Push companion changes before the validation run. Service PR workflows select
   the matching journey branch, falling back to `main` when absent, and pin the
   calling service to its PR head SHA. For other services, explicit revisions
   take precedence over matching branches; absent both, the action uses published
   images and `main` setup assets where applicable. Check the resolved revisions
   in the run logs: a green fallback run does not validate unpublished changes.
4. A push to a companion repository does not automatically rerun an existing
   service PR check. After all companion changes are pushed, rerun the affected
   service journey jobs (or trigger new runs). Recheck the resolved revisions
   after further companion changes and before merging.
5. Update scenario data and service-owned dependency contracts together with
   assertions. For environment variables and feature flags, follow the
   environment-change checklist below: check CI injection, runner settings and
   deployed service configuration separately. Exercise the applicable Docker
   profiles and the full deployed journey when its environment is available;
   do not skip whole scenarios to conceal missing coverage or configuration.
6. Link companion PRs in each PR description. Record the tested service/test
   revisions, execution mode, results and required configuration changes.
   Describe merge and deployment dependencies explicitly. Keep intermediate
   states compatible, or agree a coordinated rollout before merging; do not
   assume repositories deploy atomically.
7. Matching branches coordinate **PR checks only**. Deployed CDP runs use a
   published journey-test image, not the matching source branch. Before relying
   on post-deployment regression coverage, verify the required journey changes
   are merged, their image is published and the deployed run selects that image.
   Coordinate application deployment, journey-image availability and required
   CDP/Azure configuration; confirm the resulting dev run and its image version.

## Reviewing environment-variable changes

For every added, renamed, removed or changed environment variable, feature flag,
default, credential, endpoint or dependency in a participating service:

1. Identify its owner and whether it affects the Docker PR stack, deployed
   Azure/CDP journey, runner, or several of these.
2. Check `ci/compose.yml`, `run-journey-tests/action.yml`, the caller workflows
   and service-owned `compose/journey-tests.compose.yml` fragments. Update where
   the target process receives the value, including required action inputs and
   secret injection. Update `.env.example` for runner/local settings. For Portal
   runner flags such as `FEATURE_SHOW_PRNS`, `FEATURE_CSOC_ENABLED` and
   `FEATURE_ANALYTICS`, also keep
   `cdp-app-config` `services/waste-obligations-journey-tests` env files aligned
   with the frontend and Azure Packaging contracts.
3. Check WireMock contracts, Floci initialisers and
   `ci/seed-waste-organisations.mjs` for changed dependencies or scenario data.
   Keep dependency contracts with the consuming service.
4. Identify any corresponding deployed CDP or Azure flag/secret change and its
   owner. Do not assume local Docker settings propagate to deployed services.
5. Coordinate matching branches or explicit service revisions, and record which
   were tested. Waste Organisations currently uses a published image; its
   same-named branch is not selected by the action. Use an explicit
   `WASTE_ORGANISATIONS_IMAGE` for an alternative image. For a locally built,
   unpublished image, also start Compose with `--pull never`: this service's
   Compose definition otherwise always attempts a registry pull.
6. Run affected profiles in the applicable modes. State in the change description
   which journey setup was amended, or why no update is needed, and record any
   unavailable environment. Do not skip scenarios to hide configuration gaps.

Keep these checks aligned with the participating repositories' `AGENTS.md`
files. [Waste Organisations](https://github.com/DEFRA/waste-organisations) supplies
the organisation API and fixtures; Azure Packaging owns year selection, while
the backend, frontend and proxy consume the shared PR action.

## Changing and validating journeys

1. Identify the assertions that apply in both modes and the steps that require
   Azure. Keep the shared CDP assertions active in the pipeline.
2. Check proxy paths, year propagation, credentials, scenario data, target-service
   feature flags and compatibility with each consuming repository's action.
3. Review profile selection in [playwright.config.js](playwright.config.js).
   E2E-only scenarios must not accidentally run in accessibility or security.
   Keep authentication setup outside the ZAP proxy; do not introduce fresh B2C
   logins into the proxied security phase.
4. Run `npm run format:check`, `npm run lint`, `npm run test:unit` and relevant journey checks.
   For routing/CI changes, exercise the affected scenarios through the Docker
   proxy. For full-journey changes, validate the deployed path when the required
   environment and flags are available. `--list` confirms selection, not execution.
5. Report which mode and scenarios were actually tested, omitted steps, failures
   and any environment blockers. Do not present local Docker success as proof
   that the full Azure/CDP journey passes.
6. Clean up temporary stacks created for validation without disturbing existing
   user environments. Keep README and these instructions aligned with changes
   to the execution contract.

## Repeating a full deployed run

The following steps describe a runner inside CDP. Local runs against the same
deployed services require the Azure VPN and API gateway OAuth settings above;
the private backend hostname cannot be used locally.

1. Connect to the Azure VPN for local Azure access and any accompanying browser
   diagnostics. Confirm CDP Portal access and sign in with permission to run this
   test suite. VPN access alone is insufficient for direct CDP backend calls.
2. Identify the exact journey-test revision to validate and its published image
   version. The [publish workflow](.github/workflows/publish.yml) builds the test
   image after a push to `main`. Uncommitted local changes are not present in an
   existing Portal image. If the desired revision has not been published, report
   that prerequisite rather than silently testing an older image or pushing/
   merging code without the user's instruction.
3. Open the [journey suite in CDP Portal](https://portal.cdp-int.defra.cloud/test-suites/waste-obligations-journey-tests).
   Run the chosen image against **dev**, one profile at a time: `e2e`,
   `accessibility`, then `security`. Keep all configured browser projects; do not
   apply the PR action's single-project restriction. The accessibility profile
   has its own smaller project matrix in `playwright.config.js`.
4. Confirm the runner resolves `ENVIRONMENT=dev` and
   `JOURNEY_ENTRY_POINT=packaging`, with the Azure dev entry point
   `https://rwd-dev9.azure.defra.cloud`. An `EPR_BASE_URL` override must agree with
   that target. Do not carry local URLs, local API overrides or Docker backend
   credentials into the deployed run. Use the configured CDP secrets and egress
   settings; do not print secret values.
5. Check that the target services have the feature flags needed by the journeys.
   If the Azure year-selection flag is off, record that configuration mismatch;
   do not turn the affected scenario into a pass by omitting its deployed steps.
6. Use `entrypoint.sh` for security runs so authentication occurs before ZAP is
   enabled. Leave `ZAP_ACTIVE` unset or `0` for passive scanning unless active
   scanning has been separately authorised. Running `PROFILE=security npm test`
   alone does not start ZAP. The entrypoint also gates Medium-or-higher findings.
7. Wait for each profile to finish and inspect its report and logs. Record the
   suite image version, target environment, profile, run/report URL, pass/fail/
   skip counts and distinct failure causes. A completed Portal task is not by
   itself evidence that its tests passed. Continue the remaining profiles after
   an assertion failure when the environment is still usable.

For local Docker/PR validation, use the shared action and CDP-only stack described
above instead. Do not substitute that result for the full deployed journey.
If preparing a local runner image for diagnostics, exclude `.env`, credentials,
auth storage state and old reports from its build context, disable S3 publishing
with `PUBLISH_TEST_RESULTS=0`, retain logs/reports in a dedicated directory, and
remove temporary containers and credential files afterwards. Local proxy setup
does not overcome the private-backend restriction.

## Git and GitHub

- Use plain descriptive commit messages by default, without Conventional Commit
  prefixes such as `feat:`, `fix:` or `test:`.
- For GitHub operations, use elevated shell execution first so host keychain
  credentials are available. Run elevated `gh auth status` before declaring
  authentication unavailable; prefer `gh` to browser automation for GitHub work.
- Request only scoped elevation for the required GitHub command, such as
  `gh auth status`, `gh pr` or `git push`; do not request broad shell access.
