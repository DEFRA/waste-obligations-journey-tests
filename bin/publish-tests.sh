#!/bin/sh

# Publishes test artifacts to S3. Layout depends on PROFILE:
#
# e2e (default):
#   $RESULTS_OUTPUT_S3_PATH/                — Allure report (index.html at root)
#   $RESULTS_OUTPUT_S3_PATH/test-results/   — Playwright traces / screenshots
#
# accessibility, security:
#   $RESULTS_OUTPUT_S3_PATH/index.html      — landing page linking to both
#                                             reports below
#   $RESULTS_OUTPUT_S3_PATH/allure-report/  — Allure (run summary)
#   $RESULTS_OUTPUT_S3_PATH/{accessibility,security}-report/
#                                            — profile-specific findings
#   $RESULTS_OUTPUT_S3_PATH/test-results/   — Playwright traces / screenshots

ALLURE_DIR="$PWD/allure-report"
ACCESSIBILITY_DIR="$PWD/reports"
SECURITY_REPORT="$PWD/security-report/index.html"
PROFILE_VAL="${PROFILE:-e2e}"

echo "Publishing test results to S3 (profile: $PROFILE_VAL)"

if [ -z "$RESULTS_OUTPUT_S3_PATH" ]; then
   echo "RESULTS_OUTPUT_S3_PATH is not set" >&2
   exit 1
fi

if [ ! -d "$ALLURE_DIR" ]; then
   echo "$ALLURE_DIR is not found" >&2
   exit 1
fi

# Writes a minimal "pick your report" landing page to ./landing-index.html.
# Args: 1=page title, 2=secondary link label, 3=secondary link path,
#       4=secondary link description.
write_landing_page() {
   title="$1"
   secondary_label="$2"
   secondary_path="$3"
   secondary_desc="$4"
   cat > "$PWD/landing-index.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; color: #0b0c0c; }
    h1 { font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 2rem 0; }
    li { margin: 1.5rem 0; }
    a.report { display: inline-block; padding: 0.75rem 1.25rem; background: #00703c; color: #fff; text-decoration: none; font-weight: 500; }
    a.report:hover { background: #005a30; }
    a.report:focus { outline: 3px solid #ffdd00; outline-offset: 0; }
    .desc { display: block; margin-top: 0.5rem; color: #505a5f; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <ul>
    <li>
      <a class="report" href="allure-report/">Allure run summary</a>
      <span class="desc">Playwright test execution: per-browser pass/fail, steps, traces, videos.</span>
    </li>
    <li>
      <a class="report" href="${secondary_path}">${secondary_label}</a>
      <span class="desc">${secondary_desc}</span>
    </li>
  </ul>
</body>
</html>
HTML
}

case "$PROFILE_VAL" in
   accessibility)
      if [ ! -f "$ACCESSIBILITY_DIR/index.html" ]; then
         echo "Accessibility report missing at $ACCESSIBILITY_DIR/index.html" >&2
         exit 1
      fi
      aws s3 cp --quiet "$ALLURE_DIR" "$RESULTS_OUTPUT_S3_PATH/allure-report" --recursive
      echo "Allure published to $RESULTS_OUTPUT_S3_PATH/allure-report/"
      aws s3 cp --quiet "$ACCESSIBILITY_DIR" "$RESULTS_OUTPUT_S3_PATH/accessibility-report" --recursive
      echo "Accessibility report published to $RESULTS_OUTPUT_S3_PATH/accessibility-report/"
      write_landing_page \
         "Accessibility scan — CSOC journey" \
         "WCAG findings" \
         "accessibility-report/" \
         "Per-page accessibility scan results (category and guideline views)."
      aws s3 cp --quiet "$PWD/landing-index.html" "$RESULTS_OUTPUT_S3_PATH/index.html"
      echo "Landing page published to $RESULTS_OUTPUT_S3_PATH/index.html"
      ;;
   security)
      aws s3 cp --quiet "$ALLURE_DIR" "$RESULTS_OUTPUT_S3_PATH/allure-report" --recursive
      echo "Allure published to $RESULTS_OUTPUT_S3_PATH/allure-report/"
      if [ -f "$SECURITY_REPORT" ]; then
         aws s3 cp --quiet "$SECURITY_REPORT" "$RESULTS_OUTPUT_S3_PATH/security-report/index.html"
         echo "Security report published to $RESULTS_OUTPUT_S3_PATH/security-report/index.html"
         write_landing_page \
            "Security scan — CSOC journey" \
            "ZAP security report" \
            "security-report/" \
            "OWASP ZAP findings from the proxied journey (and active scan if ZAP_ACTIVE=1)."
         aws s3 cp --quiet "$PWD/landing-index.html" "$RESULTS_OUTPUT_S3_PATH/index.html"
         echo "Landing page published to $RESULTS_OUTPUT_S3_PATH/index.html"
      else
         if [ -f "$PWD/security-report/REPORT_MISSING" ]; then
            echo "Security report missing (REPORT_MISSING marker present); landing page would link to a broken page, skipping" >&2
         else
            echo "Security report missing at $SECURITY_REPORT; landing page would link to a broken page, skipping" >&2
         fi
         # Fallback: serve Allure at the root so the Portal "report" link works.
         aws s3 cp --quiet "$ALLURE_DIR/index.html" "$RESULTS_OUTPUT_S3_PATH/index.html"
         echo "Allure index.html promoted to $RESULTS_OUTPUT_S3_PATH/index.html as fallback"
      fi
      ;;
   *)
      aws s3 cp --quiet "$ALLURE_DIR" "$RESULTS_OUTPUT_S3_PATH" --recursive
      echo "Test results published to $RESULTS_OUTPUT_S3_PATH"
      ;;
esac

if [ -d "$PWD/test-results" ]; then
   aws s3 cp --quiet "$PWD/test-results" "$RESULTS_OUTPUT_S3_PATH/test-results" --recursive
   echo "Playwright artifacts published to $RESULTS_OUTPUT_S3_PATH/test-results"
fi
