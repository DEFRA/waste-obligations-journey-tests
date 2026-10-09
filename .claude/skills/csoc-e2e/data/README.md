# tst accounts for csoc-e2e (and mydw-e2e, qa-ticket)

The CSoC matrix runs one producer account per regulator × org type: 4 regulators (EA, NRW, SEPA, NIEA) × 2 org types
(DRP, CS) = 8 accounts on tst. Their sign-in details and org ids are **not in the repo**: this repo is public. Each
user keeps their own copy in `accounts.json` here, which git ignores.

## Set it up before running the skill

1. Copy the template:

   ```
   cp .claude/skills/csoc-e2e/data/accounts.example.json .claude/skills/csoc-e2e/data/accounts.json
   ```

2. Fill in all 8 entries (`EA`, `NRW`, `SEPA`, `NIEA` → `DRP` and `CS`). Ask the team for the current accounts, or
   use your own tst accounts that meet the rules below.
3. Check it: `node .claude/skills/csoc-e2e/runner.mjs --journey all --dry-run` resolves all 8 accounts without signing
   in, prints each as ready (with its company name), and exits 1 naming any missing file, entry or field.

Never commit `accounts.json`, paste it into a ticket, or put its values in code. If the values ever reach GitHub,
rotate the passwords.

## Fields

| Field                | Example shape                        | What it is                                                                                                                                                                          |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `username`           | `name+tst+England+CSOC1@example.com` | The B2C sign-in email of an approved person for the organisation. `+tst+…` aliases of one inbox work well: every notification email lands in the one inbox the email capture reads. |
| `password`           | —                                    | That account's tst password.                                                                                                                                                        |
| `companyName`        | `NIMBLEVIEW LTD`                     | The organisation name exactly as the service shows it (used in assertions and evidence).                                                                                            |
| `orgId`              | `339509`                             | The 6-digit organisation (reference) number.                                                                                                                                        |
| `organisationId`     | `168498ac-…`                         | The organisation GUID the Waste Obligations API uses (`/organisations/{organisationId}/…`).                                                                                         |
| `complianceSchemeId` | `7041CCAA-…` (CS only)               | The compliance scheme GUID, for `CS` entries only (`/cso/{schemeId}/…`).                                                                                                            |

Regulator, nation and the regulator's mailbox come from the regulator code, so they aren't in the file.

## What each account needs on tst

- **Registered in the right nation** for its regulator (EA England, NRW Wales, SEPA Scotland, NIEA Northern Ireland),
  as a direct-registrant large producer (`DRP`) or a compliance scheme (`CS`).
- **Obligations calculated** for the year under test (all POMs approved), so the CSoC tile shows (eligibility gate).
- **No live declaration** for that year before a submit journey; cancel it (the runner's reset) or use another account.
- **An approved or delegated person** as the signed-in user, since basic users can't submit.

The unsubmitted-orgs data (`data/unsubmitted-orgs-test-data.js`) lists the same organisations by `orgId` and
`organisationId`; if the accounts change, update both.
