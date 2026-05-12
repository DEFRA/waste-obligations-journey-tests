#!/bin/sh

echo "run_id: $RUN_ID"

npm test
test_exit_code=$?

# Default to publishing results unless explicitly disabled (compose.yml does so).
PUBLISH_TEST_RESULTS=${PUBLISH_TEST_RESULTS:-1}

if [ "$PUBLISH_TEST_RESULTS" -eq 1 ]; then
  npm run report:publish
  publish_exit_code=$?
  if [ $publish_exit_code -ne 0 ]; then
    echo "failed to publish test results (exit $publish_exit_code)"
  fi
fi

# Propagate playwright's exit code so the portal sees pass/fail correctly.
if [ $test_exit_code -ne 0 ]; then
  echo "test suite failed (exit $test_exit_code)"
  exit $test_exit_code
fi

# Allow an explicit FAILED marker to override (matches CDP template convention).
if [ -f FAILED ]; then
  echo "test suite failed"
  cat ./FAILED
  exit 1
fi

if [ "$PUBLISH_TEST_RESULTS" -eq 1 ] && [ "${publish_exit_code:-0}" -ne 0 ]; then
  exit $publish_exit_code
fi

echo "test suite passed"
exit 0
