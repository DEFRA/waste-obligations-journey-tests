#!/bin/sh
# UserPromptSubmit hook: while a qa-ticket evidence session is open (evidence/QA/.active holds <KEY>/<ts>), remind
# Claude on every turn to log results as they happen. Prints nothing otherwise.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f evidence/QA/.active ] || exit 0
session=$(cat evidence/QA/.active)
echo "Active QA evidence session: ${session}. Record each test case's result in evidence/QA/${session}/run.json (run.pass/fail/blocked) the moment it completes, and record the build under test before testing; never batch or reconstruct results."
