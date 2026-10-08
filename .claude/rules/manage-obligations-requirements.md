# Manage Obligations requirements (CDP rebuild)

The high-level requirements for rebuilding Manage Obligations on the EPR Next Generation platform (CDP:
`waste-obligations-frontend` and `waste-obligations`). The Packaging frontend (`epr-packaging-frontend`) has most of this today, so use
these as the expected behaviour for both.

- **Select a year:** the account home asks which year to manage. The current year opens the Manage obligations page
  with that year's data. Each material has details on how its obligation is calculated.
- **No POM data:** with no POM (packaging placed on the market) data submitted, columns 2 (obligation) and 5
  (outstanding) show dashes and the status "No data yet". A material with under 1 tonne submitted is calculated as
  0: columns 2 and 5 show 0 and the status is "Met".
- **Accept or reject a single note:** from the Manage obligations page, the user sees every awaiting note that can be
  accepted or rejected, opens its detail page ("Awaiting acceptance" view), and accepts it into the year being
  managed (accepted tonnage updates) or rejects it. Each has a confirmation page.
- **List:** sort and filter. Continuing with nothing selected shows an error message.
- **Multi-select:** allowed for standard notes and single-year December Waste notes only, never for a December Waste
  note with a choice of year. The user reviews the selection, accepts them all into the year being managed, and sees
  a confirmation page listing every note accepted.
- **Future year (1 Dec to 31 Jan):** the user can manage the next year. Its page has no obligations yet. If no POM
  data is submitted or approved and there are December Waste notes with a choice of year awaiting, a reveal
  component explains why tonnage is already awaiting.
- **Year lock:** at 00:00 on 1 February the current year becomes the previous year and the future year becomes the
  current year.
- **Multi-year flash** (the blue tag): on the accept/reject list, the note page and the search page, for December
  Waste notes with a choice of year that are awaiting. Accepting one asks which year to accept it into.
- **Historic years:**
  - 2025 opens a static content page; its "search PRNs" link opens search filtered to 2025.
  - 2026 onwards opens a basic Manage obligations page with the CSoC tile for that year; its search link is filtered
    to that year.
- **CSoC tile** at the bottom of the Manage obligations page, with content for the year's CSoC status: submit it if
  not submitted, view it if submitted. A DRP submits a Certificate of Compliance; a CS submits a Statement of
  Compliance and declares whether it has met regulation 43. The CSoC page's obligations table follows the same
  no-data rules as the Manage obligations page.
- **Search:** the Manage obligations tile on account home has a "Search PRNs" link that lists every PRN and PERN for
  the organisation. Refine by organisation id and name; sort; filter by status and year (the year filter's
  logic depends on the note type). Results download as CSV. Opening a note shows it in its state (awaiting,
  accepted or rejected), and the note page downloads as a PDF.
- **Permissions:** approved and delegated users can accept and reject notes and submit CSoCs. Basic users are
  read-only for notes and CSoCs.
- **Emails:** if an organisation hasn't submitted its CSoC for a year, an automated email goes on 1 December of that
  year, and on 1 January if its status is MET.
- **Analytics:** GTM and GA4 on the frontend pages, the cookie banner, and a cookie page listing essential and
  non-essential cookies.
