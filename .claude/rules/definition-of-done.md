# Definition of Done (what QA sign-off has to show)

Source: **Definition of Done (CDP) - WIP**, Confluence page `6612943097`, v1 of 2 Oct 2026. Read the live page with `confluence-read` when the wording matters; this is a distilled copy.

"Done" means deployed to production. Items marked ‡ apply where relevant; items marked † can be ruled out of scope.

- **Acceptance:**
  - every AC is met;
  - a demo in a deployed environment to the PO, BA or QA ‡;
  - acceptance from the PO or a stakeholder.
- **Testing:**
  - unit tests passing in CI ‡;
  - integration, functional or acceptance tests show the ACs are met, with **evidence collated and attached to
    Jira** ‡;
  - the relevant browsers ‡;
  - accessibility †;
  - security testing where relevant †;
  - database query performance attached to Jira, when relevant;
  - migrations reviewed and run in the target environment ‡;
  - no severe or critical defects open;
  - ZAP and Sonar scans in the pipeline.
- **Code and deployment:**
  - reviewed and approved by another engineer;
  - merged to `main` and tagged;
  - **deployed to the agreed environment (e.g. TST or PRE1) and the deployment verified**;
  - test data and configuration in place ‡;
  - a content or design check ‡;
  - a rollback approach defined and verified.
- **Database changes (stored procedures, data pipelines):** the release notes state "no changes", or the changes
  state their impact and show a performance test scaled to production.
- **Documentation:**
  - API docs and specs ‡;
  - the database schema docs;
  - the runbook;
  - the impact on dependencies;
  - regression test updates †;
  - support and operations readiness (monitoring, logging) †.
- **Security Impact Check:** confirm NO to every item, otherwise include evidence of a Security Team review in the
  test exit report:

  - authentication;
  - authorisation / access control;
  - new public API endpoints;
  - encryption, secrets or keys;
  - sensitive data (validation, forwarding, storing, logging);
  - new outbound integrations (APIs, database instances, blob storage, topics or queues).

  Static analysis: no critical or high SAST or
  dependency findings.

For QA, this means the evidence goes on the Jira ticket, the build under test is verified on the environment, and a
ticket that trips the Security Impact Check needs the Security Team review referenced in its test exit evidence.
