#!/bin/sh
# Runs the CSoC regulator-side spec (regulator-tests/csoc-e2e-external.spec.js) inside the
# vendor/waste-packaging-regulator-tests submodule, where its page objects live, after the producer side
# (tests/csoc-e2e-journey.spec.js) has submitted. The variables it needs are listed at the top of the spec.
#
#   git submodule update --init vendor/waste-packaging-regulator-tests
#   npm --prefix vendor/waste-packaging-regulator-tests ci
#   JOURNEY=E2E-01.1 REGULATOR=EA ORG_TYPE=DRP ORG_ID=<organisationId> NATION_ID=<1-4> EVIDENCE_DIR=<dir> \
#     sh bin/run-regulator-spec.sh [extra playwright args]
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REG=${REGULATOR_TESTS_PATH:-$ROOT/vendor/waste-packaging-regulator-tests}

[ -f "$REG/package.json" ] || {
  echo "regulator tests missing: git submodule update --init vendor/waste-packaging-regulator-tests" >&2
  exit 1
}
[ -d "$REG/node_modules/@playwright/test" ] || {
  echo "regulator test dependencies missing: npm --prefix vendor/waste-packaging-regulator-tests ci" >&2
  exit 1
}

SPEC="$REG/test/specs/csoc-e2e-external.spec.js"
cp "$ROOT/regulator-tests/csoc-e2e-external.spec.js" "$SPEC"
trap 'rm -f "$SPEC"' EXIT INT TERM
cd "$REG"
SKIP_AUTH_SETUP=1 npx playwright test test/specs/csoc-e2e-external.spec.js "$@"
