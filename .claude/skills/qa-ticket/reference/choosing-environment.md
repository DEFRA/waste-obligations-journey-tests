# Choosing LOCAL, dev9 or tst

Start from `pr-status.mjs <KEY>`, the ticket's ACs and the domain rules in `.claude/rules/`. Recommend one environment
with the reason, and let the user decide.

## Environments

This team's services are on **CDP**. The three names pair the Packaging sign-in with a CDP environment (`utils/journey-entry-point.js`):

| Name  | Packaging sign-in | CDP environment |
| ----- | ----------------- | --------------- |
| LOCAL | docker stack      | docker stack    |
| dev9  | dev9              | **dev**         |
| tst   | tst1              | **test**        |

A CDP-only change (API, notifications, the Waste Obligations frontend) is therefore tested on "dev9" when it's on CDP
dev, and on "tst" when it's on CDP test. Check it with `node .claude/skills/cdp-portal/cdp.mjs ticket <KEY>`.

| Env   | Packaging (sign-in, RPD pages)       | CDP (Waste Obligations)                                | Accounts                                      | Clock and data                                                           |
| ----- | ------------------------------------ | ------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------ |
| LOCAL | `https://localhost:7084`             | `https://localhost:8015/manage-recycling-obligations/` | mock B2C: `local:DRP\|CS:AP\|DP\|BU`          | Time shift, flags, seed/snapshot/restore (`mydw-manual-test`)            |
| dev9  | `https://rwd-dev9.azure.defra.cloud` | `waste-obligations.dev.cdp-int.defra.cloud`            | `env:<PREFIX>` from `.env` (ask the user)     | Real clock; shared data                                                  |
| tst   | `https://rwd-tst1.azure.defra.cloud` | `waste-obligations.test.cdp-int.defra.cloud`           | `matrix:<REG>:<DRP\|CS>` (csoc-e2e) or `env:` | Real clock; shared data; `tst1_prn` readable (see `mydw-e2e/prn-db.mjs`) |

## Decision, in order

1. **No PR found, or the ticket isn't a code change** (config, data, spike): ask the user what changed and where it
   is deployed. Don't guess.
2. **A linked PR is still open or draft:**
   - The change exists only on its branch, so test on **LOCAL** with that branch built (check out the PR branch in the
     sibling repo and rebuild that service), or wait for the merge.
   - Say which repo and branch need building. Ask before changing the local stack.
   - Failing checks or no approval are worth telling the user: the change may still move.
3. **The ACs need something only LOCAL can do:** **LOCAL**, even when merged.
   - a different date (December/January window, 1 February, a deadline);
   - a feature flag switched off;
   - data that can't be arranged on a shared environment;
   - a database change beyond reading.
4. **Merged:**

   - **Where it's deployed:** the script prints the first version tag that contains the merge. For CDP services,
     `node .claude/skills/cdp-portal/cdp.mjs ticket <KEY>` compares it with the version deployed to each CDP
     environment: an environment is usable only when every linked PR is `CONTAINS`.

   - **Deployed to tst:** test on **tst**. It's the QA environment, it has the test accounts and their PRN data, and
     it's where sign-off is expected.
   - **Deployed to dev9 only:** test on **dev9**. Tell the user tst still needs a check once it's released.
   - **Not deployed anywhere yet:** LOCAL with `main` built, or wait.

5. **The ticket spans several repos:** use the environment where **every** linked PR is deployed.

## Tell the user before

- Accepting, rejecting or submitting anything on dev9 or tst: it changes shared data. On tst, the `mydw-e2e` reset
  (all of an account's notes back to awaiting) needs explicit approval.
- Changing the LOCAL stack (clock, flags, a rebuilt service): say what will change and restore it afterwards.
