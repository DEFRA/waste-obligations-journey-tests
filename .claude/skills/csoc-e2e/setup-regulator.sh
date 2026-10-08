#!/bin/sh
# Fetches the regulator tests (the vendor/waste-packaging-regulator-tests submodule, pinned in this repo) and installs
# their dependencies, so csoc-e2e can run the regulator half of each journey. Safe to re-run.
set -eu
root=$(git rev-parse --show-toplevel)
sub="$root/vendor/waste-packaging-regulator-tests"
git -C "$root" submodule update --init vendor/waste-packaging-regulator-tests
npm --prefix "$sub" ci --no-audit --no-fund
echo "Regulator tests ready at $sub ($(git -C "$sub" log --oneline -1))"
