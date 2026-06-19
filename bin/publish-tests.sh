#!/bin/sh
set -eu

# Publishes test artifacts to S3. The CDP Portal's report viewer renders the
# index.html at the run's S3 root, so a profile-aware landing page is generated
# there with links to whichever reports the profile produced. Allure and the
# profile-specific reports (WCAG / ZAP) sit at predictable sub-paths.
#
# Allure history persists per-profile at a stable sibling path (one level above
# the run-scoped $RESULTS_OUTPUT_S3_PATH) so trend graphs build up over time.
# Trend files are trimmed to the last 10 runs before re-upload.
#
# Layout:
#   $RESULTS_OUTPUT_S3_PATH/index.html              — landing page (links to reports)
#   $RESULTS_OUTPUT_S3_PATH/allure-report/          — Allure (run summary)
#   $RESULTS_OUTPUT_S3_PATH/test-results/           — Playwright traces, screenshots
#   $RESULTS_OUTPUT_S3_PATH/accessibility-report/   — WCAG findings (accessibility profile)
#   $RESULTS_OUTPUT_S3_PATH/security-report/        — ZAP HTML (security profile)
#   <parent-of-$RESULTS_OUTPUT_S3_PATH>/_allure-history/<profile>/  — persisted Allure history

ALLURE_DIR="$PWD/allure-report"
ACCESSIBILITY_DIR="$PWD/reports"
SECURITY_REPORT="$PWD/security-report/index.html"
PROFILE_VAL="${PROFILE:-e2e}"

echo "Publishing test results to S3 (profile: $PROFILE_VAL)"

if [ -z "${RESULTS_OUTPUT_S3_PATH:-}" ]; then
   echo "RESULTS_OUTPUT_S3_PATH is not set" >&2
   exit 1
fi

if [ ! -d "$ALLURE_DIR" ]; then
   echo "$ALLURE_DIR is not found" >&2
   exit 1
fi

aws s3 cp --quiet "$ALLURE_DIR" "$RESULTS_OUTPUT_S3_PATH/allure-report" --recursive
echo "Allure report published to $RESULTS_OUTPUT_S3_PATH/allure-report/"

HISTORY_LOCAL="$ALLURE_DIR/history"
HISTORY_S3_PATH="${RESULTS_OUTPUT_S3_PATH%/}"
HISTORY_S3_PATH="${HISTORY_S3_PATH%/*}/_allure-history/${PROFILE_VAL}"

# Run a jq filter in-place. Writes to a tmp file OUTSIDE $HISTORY_LOCAL so a
# parse failure can't leave .tmp cruft to be swept into the S3 upload below.
trim_in_place() {
   filter=$1
   target=$2
   tmp=$(mktemp)
   if jq "$filter" "$target" > "$tmp"; then
      mv "$tmp" "$target"
   else
      rm -f "$tmp"
      echo "jq failed parsing $target; aborting to avoid corrupting persisted history" >&2
      exit 1
   fi
}

if [ -d "$HISTORY_LOCAL" ]; then
   command -v jq >/dev/null || { echo "jq is required to trim allure history" >&2; exit 1; }
   for f in "$HISTORY_LOCAL"/categories-trend.json \
            "$HISTORY_LOCAL"/duration-trend.json \
            "$HISTORY_LOCAL"/history-trend.json \
            "$HISTORY_LOCAL"/retry-trend.json; do
      [ -f "$f" ] || continue
      trim_in_place '.[-10:]' "$f"
   done
   if [ -f "$HISTORY_LOCAL/history.json" ]; then
      # Null-safe: leave entries without an items[] array untouched. Allure
      # 2 keys this file by test-case id; newly-introduced tests can lack
      # items, and an unconditional `|= .[-10:]` would null-out their value.
      trim_in_place 'with_entries(if .value.items then .value.items |= .[-10:] else . end)' \
         "$HISTORY_LOCAL/history.json"
   fi
   aws s3 cp --quiet "$HISTORY_LOCAL" "$HISTORY_S3_PATH" --recursive
   echo "Allure history persisted to $HISTORY_S3_PATH (capped at last 10 runs)"
fi

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
