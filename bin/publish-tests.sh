#!/bin/sh

# Publishes test artifacts to S3. The CDP Portal's report viewer renders the
# index.html at the run's S3 root, so a profile-aware landing page is generated
# there with links to whichever reports the profile produced. Allure and the
# profile-specific reports (WCAG / ZAP) sit at predictable sub-paths.
#
# Layout:
#   $RESULTS_OUTPUT_S3_PATH/index.html              — landing page (links to reports)
#   $RESULTS_OUTPUT_S3_PATH/allure-report/          — Allure (run summary)
#   $RESULTS_OUTPUT_S3_PATH/test-results/           — Playwright traces, screenshots
#   $RESULTS_OUTPUT_S3_PATH/accessibility-report/   — WCAG findings (accessibility profile)
#   $RESULTS_OUTPUT_S3_PATH/security-report/        — ZAP HTML (security profile)

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

aws s3 cp --quiet "$ALLURE_DIR" "$RESULTS_OUTPUT_S3_PATH/allure-report" --recursive
echo "Allure report published to $RESULTS_OUTPUT_S3_PATH/allure-report/"

if [ -d "$PWD/test-results" ]; then
   aws s3 cp --quiet "$PWD/test-results" "$RESULTS_OUTPUT_S3_PATH/test-results" --recursive
   echo "Playwright artifacts published to $RESULTS_OUTPUT_S3_PATH/test-results"
fi

case "$PROFILE_VAL" in
   accessibility)
      if [ -f "$ACCESSIBILITY_DIR/index.html" ]; then
         aws s3 cp --quiet "$ACCESSIBILITY_DIR" "$RESULTS_OUTPUT_S3_PATH/accessibility-report" --recursive
         echo "Accessibility report published to $RESULTS_OUTPUT_S3_PATH/accessibility-report/"
      else
         echo "Accessibility report missing at $ACCESSIBILITY_DIR/index.html" >&2
         exit 1
      fi
      ;;
   security)
      if [ -f "$SECURITY_REPORT" ]; then
         aws s3 cp --quiet "$SECURITY_REPORT" "$RESULTS_OUTPUT_S3_PATH/security-report/index.html"
         echo "Security report published to $RESULTS_OUTPUT_S3_PATH/security-report/index.html"
      elif [ -f "$PWD/security-report/REPORT_MISSING" ]; then
         echo "Security report missing (REPORT_MISSING marker present); skipping S3 upload" >&2
      fi
      ;;
esac

PROFILE="$PROFILE_VAL" node ./bin/generate-portal-index.js
aws s3 cp --quiet ./index.html "$RESULTS_OUTPUT_S3_PATH/index.html"
echo "Portal landing page published to $RESULTS_OUTPUT_S3_PATH/index.html"
