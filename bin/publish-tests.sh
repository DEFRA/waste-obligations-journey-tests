#!/bin/sh

DIRECTORY="$PWD/allure-report"

echo "Publishing test results to S3"

if [ -n "$RESULTS_OUTPUT_S3_PATH" ]; then
   # PROFILE=accessibility swaps the primary report: the WCAG HTML from
   # tests/accessibility-checking.js → ./reports/ goes to the main S3 slot so
   # the Portal's "report" link opens the findings, not the Playwright run
   # summary. entrypoint.sh skips the Allure generate step for this profile,
   # so there is no fallback — if the spec died before
   # generateAccessibilityReportIndex ran, surface that loudly.
   if [ "${PROFILE:-e2e}" = "accessibility" ]; then
      if [ -f "$PWD/reports/index.html" ]; then
         aws s3 cp --quiet "$PWD/reports" "$RESULTS_OUTPUT_S3_PATH" --recursive
         echo "Accessibility report published to $RESULTS_OUTPUT_S3_PATH"
      else
         echo "Accessibility report missing at $PWD/reports/index.html" >&2
         exit 1
      fi
   elif [ -d "$DIRECTORY" ]; then
      aws s3 cp --quiet "$DIRECTORY" "$RESULTS_OUTPUT_S3_PATH" --recursive
      echo "Test results published to $RESULTS_OUTPUT_S3_PATH"
   else
      echo "$DIRECTORY is not found" >&2
      exit 1
   fi

   if [ -d "$PWD/test-results" ]; then
      aws s3 cp --quiet "$PWD/test-results" "$RESULTS_OUTPUT_S3_PATH/test-results" --recursive
      echo "Playwright artifacts published to $RESULTS_OUTPUT_S3_PATH/test-results"
   fi

   # Upload only the rendered HTML report — never the ZAP log or any other
   # files in security-report/, which can contain raw proxy traffic.
   if [ -f "$PWD/security-report/index.html" ]; then
      aws s3 cp --quiet "$PWD/security-report/index.html" "$RESULTS_OUTPUT_S3_PATH/security-report/index.html"
      echo "Security report published to $RESULTS_OUTPUT_S3_PATH/security-report/index.html"
   elif [ -f "$PWD/security-report/REPORT_MISSING" ]; then
      echo "Security report missing (REPORT_MISSING marker present); skipping S3 upload" >&2
   fi
else
   echo "RESULTS_OUTPUT_S3_PATH is not set"
   exit 1
fi
