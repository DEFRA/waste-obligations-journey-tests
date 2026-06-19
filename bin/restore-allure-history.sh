#!/bin/sh
set -eu

# Restores the previous run's Allure history into ./allure-results/history/ so
# `allure generate` produces trend graphs. The history is persisted per-profile
# at a stable S3 location derived from $RESULTS_OUTPUT_S3_PATH (the run-scoped
# path the CDP Portal injects): strip the trailing per-run segment and append
# _allure-history/<profile>/.
#
# A missing history prefix on S3 is normal for the first run of a profile —
# detected by `aws s3 ls` returning non-zero with empty stderr. Real errors
# (AccessDenied, NoSuchBucket, network) print stderr and abort, so a broken
# pipeline never silently presents an empty trend graph.

PROFILE_VAL="${PROFILE:-e2e}"

if [ -z "${RESULTS_OUTPUT_S3_PATH:-}" ]; then
  echo "RESULTS_OUTPUT_S3_PATH not set; skipping allure history restore"
  exit 0
fi

HISTORY_S3_PATH="${RESULTS_OUTPUT_S3_PATH%/}"
HISTORY_S3_PATH="${HISTORY_S3_PATH%/*}/_allure-history/${PROFILE_VAL}"

mkdir -p ./allure-results/history

LS_RC=0
LS_STDERR=$(aws s3 ls "$HISTORY_S3_PATH/" 2>&1 >/dev/null) || LS_RC=$?

if [ "$LS_RC" -eq 0 ]; then
  aws s3 cp --quiet "$HISTORY_S3_PATH" ./allure-results/history --recursive
  echo "Restored allure history from $HISTORY_S3_PATH"
elif [ -z "$LS_STDERR" ]; then
  echo "No previous allure history at $HISTORY_S3_PATH (first run for this profile)"
else
  echo "Failed to check allure history at $HISTORY_S3_PATH: $LS_STDERR" >&2
  exit 1
fi
