#!/bin/sh

DIRECTORY="$PWD/allure-report"

echo "Publishing test results to S3"

if [ -n "$RESULTS_OUTPUT_S3_PATH" ]; then
   if [ -d "$DIRECTORY" ]; then
      aws s3 cp --quiet "$DIRECTORY" "$RESULTS_OUTPUT_S3_PATH" --recursive
      echo "Test results published to $RESULTS_OUTPUT_S3_PATH"
   else
      echo "$DIRECTORY is not found"
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
