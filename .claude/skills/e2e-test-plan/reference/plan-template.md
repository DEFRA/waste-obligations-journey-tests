# <Release name> (<SHORT>) release: E2E test cases

**Scope:** every child item of epics **<EPIC-1>** <title>, **<EPIC-2>** <title>, as read from Jira on <D Mon YYYY> (`node .claude/skills/jira-read/jira.mjs children <EPIC-1>,<EPIC-2>`). The coverage table at the end maps every story to its test cases. Items with nothing to test are listed under "Not tested" with the reason.

**Where each test runs:**

- **TST** (`<tst URL>`): everything that works on today's real date. In <Mon YYYY> the current obligation year is **<C>**, the future year is **<C+1>** and the past year is **<C-1>**.
- **LOCAL** (`https://localhost:7084/report-data`, sibling `epr-local-environment` stack): anything that needs a different date (time shift), a feature flag switched off, or data that can't be arranged on tst.
- **Manual (tst):** journeys across systems the browser suite can't reach (for example RREPW, the admin portal, Approve & Monitor, Power BI, email inboxes).

**Reading the steps:**

- <Shorthand used in the steps, e.g. "Choose year Y" means: account home → **Manage recycling obligations** → select **Y** → **Continue**.>
- Copy in quotes must match exactly (check against the linked Figma frames too).
- <Which parts are automated and by what runner; which are manual.>

---

## Accounts and data

| Env   | Who                       | How to sign in | Data you need |
| ----- | ------------------------- | -------------- | ------------- |
| TST   | <org type, role (DRP AP)> | <account/env>  | <data>        |
| LOCAL | <org, roles>              | mock B2C       | <seed/setup>  |

**LOCAL setup:** <stack start, baseline snapshot, seed, restore after mutating cases, scenario switch.>

| Scenario | Frozen clock | Why                        |
| -------- | ------------ | -------------------------- |
| S1       | <date time>  | <window/boundary it's for> |

---

## Part A: TST (real date)

### TST-01 <Behaviour, in a few words>

**Stories:** <KEY> AC<n>[, <KEY> AC<n>] · **User:** <DRP AP>

1. <Action>.
2. <Action>.

**Expected:**

- <Observable result, with exact copy in quotes and dynamic parts noted>.
- Step 2 <result tied to a step>.

---

## Part B: LOCAL (time-shifted)

Each case names its scenario. Restore the data after every case that accepts, rejects or submits.

### LOC-01 <Behaviour>

**Stories:** <KEY> AC<n> · **Scenario:** S<n> · **User:** <CS AP>

1. <Action>.

**Expected:**

- <Result>.

---

## Part C: tst cross-system journeys (manual)

<Where it runs and what to note before starting. Warn about anything automated that would disturb the data.>

### E2E-01 <Journey: start → checkpoints → end>

**Stories:** <KEYs> · **Env:** tst · **User:** <who, plus access to the other systems> · **Manual**

**Before you start:** <values to record first, e.g. the note number, tonnage [t], the obligations figures>.

1. <Step in system A>.
2. **<Checkpoint name>:** <what to look at>.

**Expected:**

- Step 2: <result, using the recorded values, e.g. +[t] accepted>.

---

## Coverage

| Story         | Status in Jira | Test cases       |
| ------------- | -------------- | ---------------- |
| <KEY> <title> | <status>       | <TST-01, LOC-02> |

### Scope coverage

From <the product definition / scope document>.

| Scope item | Test cases | Status                                |
| ---------- | ---------- | ------------------------------------- |
| <item>     | <cases>    | Covered / Q<n> / Not tested: <reason> |

**Not tested** (nothing to execute):

| Items        | Reason                                    |
| ------------ | ----------------------------------------- |
| <KEY>, <KEY> | <Spike / research / content / Not Needed> |

## Open questions

- **Q1:** <Where the ACs, scope or the built behaviour disagree, and what decision is needed.>
