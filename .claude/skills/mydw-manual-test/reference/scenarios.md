# Scenarios, stack and data

## Starting the stack

From the epr-local-environment repo root (needs `az acr login --name devrwdinfac1401` and `.env`):

```
# time-shifted (scenarios S1–S3) — mock B2C is mandatory under time shift
docker compose -f compose.yml -f compose.b2cmock.yml -f compose.timeshift.yml \
  --profile packaging --profile timeshift-packaging up -d --build

# real clock (S0)
docker compose -f compose.yml -f compose.b2cmock.yml --profile packaging up -d --build
```

Frontend: https://localhost:7084/report-data. Sign-in picker: https://localhost:8443. The skill clicks the user's button.
Leave `B2CMOCK_AUTO_SELECT_USER_ID` unset in `.env`, otherwise every cell signs in as that one user.

Both flags are hard-coded `"true"` in `compose.yml` (`epr-packaging-frontend`). To switch them off, see
`flags-off.compose.yml`.

## Changing scenario

`compose.timeshift.yml` runs the frontend as `faketime -f '<TIMESHIFT_DATETIME>' dotnet …`.

- **The clock is frozen.** There is no leading `@`, so the frontend's clock stays fixed at that instant. Container TZ is UTC.
- **What is shifted:** `epr-packaging-frontend`, and `b2c-mock` (token times).
- **What is not shifted:** `epr-prn-common-backend`, `epr-pom-api-web`, `waste-obligations`. Status-history and `StatusUpdatedOn` timestamps therefore use the real date.

To change scenario, run `node scripts/gather.js --scenario S1|S2|S3` (or a literal `'YYYY-MM-DD hh:mm:ss'`). It:

1. Rewrites `TIMESHIFT_DATETIME=` in `epr-local-environment/.env`. The previous value is printed.
2. Runs `docker compose -f compose.yml -f compose.b2cmock.yml -f compose.timeshift.yml --profile packaging --profile timeshift-packaging up -d --no-deps --no-build --pull never --force-recreate epr-packaging-frontend b2c-mock`.
3. Waits for both containers to be healthy and re-runs preflight.
4. Re-seeds the MYDW-\* rows, if any exist, so their December/January issue dates follow the new clock.

The first time-shifted start still needs `--build` (above), because `--scenario` reuses the built `epr-packaging-frontend:timeshift` image.

| Id  | TIMESHIFT_DATETIME    | C (compliance year)     | What it exercises                                                                                                            |
| --- | --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| S0  | (no time shift)       | real (2026 in Oct 2026) | DW 2026 PRNs already offer 2026/2027, but no blue tag outside Dec/Jan                                                        |
| S1  | `2026-12-15 12:00:00` | 2026                    | December window: year choice + blue tag for DW PRNs issued 1 Dec 2026–31 Jan 2027                                            |
| S2  | `2027-01-31 23:59:59` | 2026                    | Last second before the cut-off (January counts as previous year). Boundary.                                                  |
| S3  | `2027-02-01 00:00:01` | 2027                    | After the window: DW 2026 → 2027 only; standard 2026 PRNs no longer actionable; 2027 PRNs actionable; year picker 2028..2025 |

Any other value is reported as scenario `custom`; the rules port still computes expectations for it.

## December Waste and multi-year rules

Ported in `scripts/lib/rules.js` from `epr-packaging-frontend`:

- `Mappers/PrnAvailableAcceptanceYearsResolver.cs`
- `Mappers/PrnDecemberWasteFlashWindowResolver.cs`
- `Application/Extensions/DateTimeExtensions.cs`
- `ObligationYearOptions.cs`

In the rules below, P is the PRN's ObligationYear and C is the compliance year (Feb–Jan, UK time).

**Available acceptance years.** These apply only while the PRN's status is AWAITING ACCEPTANCE (4).

- **Standard PRN:** `[P]` if P = C, otherwise none.
- **December Waste PRN:** P > C gives none. Otherwise, check these in order; the first that applies wins:
  1. P = 2025 and C is 2025 or 2026: `[C]`.
  2. now is before 1 Feb P+1 (UTC): `[P, P+1]`. This is the year choice.
  3. P+1 = C: `[C]`.
  4. Otherwise none (expired).

**What the user sees:**

- **None available:** no Accept/Reject and no checkbox.
- **One year:** Accept goes straight to `accept-prn/{id}`, and the PRN has a bulk checkbox.
- **Two years:** Accept goes to `choose-acceptance-year/{id}`. There is no bulk checkbox, because bulk always uses C.

**Blue tag** ("Can be accepted towards Y[ or Y+1] recycling obligations"). Shown only when all of these hold:

- the PRN is December Waste, awaiting, and has at least one available year;
- the UK date is in December or January;
- the PRN's IssueDate falls in that window (1 Dec – 31 Jan).

**"Choose a year" options:** C+1, C, C−1 … 2025, newest first. Choosing 2025 opens the historic "Your certificate/statement of compliance record for 2025" page.

**The year chosen on "Choose a year" is held in session.** It drives `manage-your-recycling-obligations` and the success-page "View recycling obligations progress" link.

**Accepting writes the year.** Accepting into a year sets `Prn.ObligationYear` to that year and adds a `PrnStatusHistory` row.

## Seeded PRNs (`compose/epr-prn-common-backend-migrations/seed.sql`, DB `EprPrnBackend`)

Status 4 = awaiting, 1 = accepted, 2 = rejected. Material Paper/board and Fibre both map to "Paper, board or fibre-based composite material". All tonnages are 1. seed.sql has no PERNs and no December-issued notes. Use `--seed` (next section).

**DRP — POP QUEST LTD (165282), org `E2316C5E-…`** (users: Direct Producer AP, SB FirstName DP, Francis Chelladurai BU)

| PRN                          | Type        | Year | Status | Issued     | Default role in the skill                  |
| ---------------------------- | ----------- | ---- | ------ | ---------- | ------------------------------------------ |
| DP-PRN-001-NPWD              | std         | 2025 | 4      | 2025-03-01 | expired example                            |
| DP-PRN-002-NPWD-DEC          | DW          | 2025 | 4      | 2025-03-01 | 2025-DW one-year case (`dw2025`)           |
| DP-PRN-003-RREPW             | std         | 2026 | 4      | 2026-03-01 | bulk                                       |
| DP-PRN-004-RREPW-DEC         | DW          | 2026 | 1      | 2026-03-01 | already accepted                           |
| DP-PRN-005-RREPW             | std         | 2027 | 4      | 2026-03-01 | future, not actionable until S3 (`future`) |
| DP-PRN-006-OLD / 007-OLD-DEC | std / DW    | 2025 | 1      | 2025-03-01 | accepted history                           |
| DP-PRN-008-RREPW             | DW (Fibre)  | 2026 | 4      | 2026-03-01 | MYDW-07 reject (`dwAlt`)                   |
| DP-PRN-009-RREPW             | std (Paper) | 2026 | 4      | 2026-04-15 | MYDW-05 (`standard`)                       |
| DP-PRN-010-RREPW             | DW (Paper)  | 2026 | 4      | 2026-04-16 | MYDW-04 (`dw`), `--seed-flash` target      |

**CS — Organisation Name (100002), scheme `D93376E3-…`** (users: First name Last Name AP, Francis Delegated DP, Francis Basic BU)

- **Awaiting:**
  - PRN-001 (std 2025)
  - PRN-002-NPWD-DEC (DW 2025)
  - PRN-003 (std 2026, `standard`)
  - PRN-004-RREPW-DEC (DW 2026)
  - PRN-009 (std 2027, `future`)
  - PRN-010-RREPW-DEC (DW 2027)
  - PRN-011-OLD-DEC (DW 2025)
  - PRN-012..017-RREPW (DW 2026 Fibre/Paper; PRN-015 is `dw`, PRN-014 is `dwAlt`)
- **Accepted:** PRN-005..008.

## Skill-seeded rows (`--seed`)

D is the December year from the frontend clock: the current December, else the most recent one, or `--dec-year`. C is the compliance year. Tag is `DP` (POP QUEST) or `CS` (Organisation Name). Each row clones agency and accreditation fields from an existing row of the same org. IssuerNotes says "Seeded by mydw-manual-test: …". Each row gets a status-4 history row (Comment `mydw-seed`).

| PrnNumber              | Note | DW  | Material      | t   | Issued       | Obligation year | Purpose                                                            | Used by                        |
| ---------------------- | ---- | --- | ------------- | --- | ------------ | --------------- | ------------------------------------------------------------------ | ------------------------------ |
| MYDW-{tag}-PRN-DW-DEC  | PRN  | yes | Paper/board   | 5   | 10 Dec D     | D               | Blue tag in S1/S2; year choice D/D+1                               | MYDW-04 default (PRN)          |
| MYDW-{tag}-PERN-DW-DEC | PERN | yes | Plastic       | 7   | 12 Dec D     | D               | Same, for PERN copy                                                | MYDW-04 `--note PERN`          |
| MYDW-{tag}-PRN-DW-JAN  | PRN  | yes | Glass Re-melt | 4   | 15 Jan D+1   | D               | Late issue, still in window (skipped while the clock is before it) | MYDW-08                        |
| MYDW-{tag}-PRN-DW-NOV  | PRN  | yes | Paper/board   | 2   | 28 Nov D     | D               | December Waste but outside the tag window                          | MYDW-08, MYDW-07 (PRN alt)     |
| MYDW-{tag}-PERN-STD    | PERN | no  | Aluminium     | 3   | now − 7 days | C               | Single-year PERN, bulk-selectable                                  | MYDW-05 `--note PERN`, MYDW-06 |
| MYDW-{tag}-PERN-STD-2  | PERN | no  | Steel         | 6   | now − 7 days | C               | Second PERN                                                        | MYDW-07 `--note PERN`, MYDW-06 |

Verified on 7 Oct 2026, with the UI matching `lib/rules.js` for every row:

- **S1 (15 Dec 2026):** DEC rows get the blue tag "Can be accepted towards 2026 or 2027 recycling obligations". The JAN row is skipped.
- **S2:** DEC and JAN rows get the tag; the NOV row has no tag.
- **S3:** all December Waste 2026 notes are 2027-only and bulk-selectable, with no tag.

The list is paginated at 10 rows. Seeded rows are the newest, so they sit on page 1.

**Obligation calculations** are seeded for 2025 and 2026 only (Aluminium 100, Glass 200), so the 2027 grid shows
"Not available yet" with only awaiting/accepted tonnage.

## Data control

| Command                           | Effect                                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--snapshot [--force]`            | Save every Prn row's status/year/issue date/StatusUpdatedOn and the max PrnStatusHistory id to `.state/prn-snapshot.json`. Take it on a freshly seeded stack.                      |
| `--restore`                       | Reset all snapshotted PRNs and seeded MYDW-\* rows to their baseline; delete history rows newer than the snapshot (except seed history). Prints `remainingDrift` (should be `[]`). |
| `--data-status`                   | Show drift against the snapshot.                                                                                                                                                   |
| `--seed [DRP\|CS] [--dec-year Y]` | Replace the org's MYDW-\* rows (table above) using the frontend clock. Needs the snapshot first.                                                                                   |
| `--unseed`                        | Delete all MYDW-\* rows and their history.                                                                                                                                         |
| `--scenario S1\|S2\|S3`           | Switch the time shift and re-seed (see above).                                                                                                                                     |
| `--seed-flash <PRN> [--date ISO]` | Move a PRN's IssueDate (default 2026-12-10) into the Dec–Jan window so the blue tag shows. Undone by `--restore`.                                                                  |
| `--rules [--org-type CS]`         | Print the expected behaviour of every PRN at the frontend's clock.                                                                                                                 |

SQL runs through `docker exec epr-local-environment-sqledge-1 sqlcmd`, using the container's own
`MSSQL_SA_PASSWORD`, so the password is never printed. A full reseed is `down -v` + `up`; re-take the snapshot afterwards.
