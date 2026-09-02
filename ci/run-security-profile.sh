#!/bin/sh
set -eu

# Runs the security profile on a GitHub-hosted Linux runner. Browser traffic is
# sent through a short-lived ZAP container on the runner's host network, which
# gives the daemon access to the dedicated CI stack at localhost:8010.

project=${1:-chrome-android}
zap_port=${ZAP_PORT:-8080}
zap_base="http://127.0.0.1:${zap_port}"
zap_image=${ZAP_IMAGE:-zaproxy/zap-stable:2.16.1}
zap_container="waste-obligations-journey-zap-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}"
# The CI runner uses loopback. Docker Desktop users can set this to 0.0.0.0
# when host-network loopback is not forwarded to the host browser process.
zap_listen_host=${ZAP_LISTEN_HOST:-127.0.0.1}

if [ -n "${EPR_BASE_URL:-}" ]; then
  target_base_url=$EPR_BASE_URL
elif [ "${ENVIRONMENT:-}" = "local" ]; then
  target_base_url=https://localhost:8010
elif [ "${ENVIRONMENT:-}" = "dev" ]; then
  target_base_url=https://waste-obligations.dev.cdp-int.defra.cloud
else
  target_base_url=https://waste-obligations.tst.cdp-int.defra.cloud
fi

stop_zap() {
  docker rm --force "$zap_container" >/dev/null 2>&1 || true
}

trap 'stop_zap' EXIT INT TERM

wait_for_zap() {
  attempt=0
  while [ "$attempt" -lt 60 ]; do
    if curl --silent --fail "${zap_base}/JSON/core/view/version/" >/dev/null; then
      return 0
    fi
    sleep 3
    attempt=$((attempt + 1))
  done

  echo "ZAP failed to start within 180 seconds" >&2
  docker logs "$zap_container" >&2 || true
  return 1
}

zap_result_ok() {
  printf '%s' "$1" | jq --exit-status '.Result == "OK"' >/dev/null 2>&1
}

exclude_third_parties() {
  for pattern in \
    '.*b2clogin\.com.*' \
    '.*login\.microsoftonline\.com.*' \
    '.*microsoftonline\.com.*'
  do
    response=$(curl --silent --fail --get \
      --data-urlencode "regex=${pattern}" \
      "${zap_base}/JSON/core/action/excludeFromProxy/")
    if ! zap_result_ok "$response"; then
      echo "Failed to exclude ${pattern} from the ZAP proxy" >&2
      return 1
    fi
  done
}

configure_scope() {
  context_name=epr-csoc
  curl --silent --fail --get \
    --data-urlencode "contextName=${context_name}" \
    "${zap_base}/JSON/context/action/newContext/" >/dev/null || true

  response=$(curl --silent --fail --get \
    --data-urlencode "contextName=${context_name}" \
    --data-urlencode "regex=${target_base_url}.*" \
    "${zap_base}/JSON/context/action/includeInContext/")
  if ! zap_result_ok "$response"; then
    echo "Failed to add ${target_base_url} to the ZAP context" >&2
    return 1
  fi
}

wait_for_passive_scan() {
  attempt=0
  while [ "$attempt" -lt 120 ]; do
    remaining=$(curl --silent --fail "${zap_base}/JSON/pscan/view/recordsToScan/" \
      | jq --raw-output '.recordsToScan // empty')
    if [ "$remaining" = "0" ]; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  echo "Passive ZAP scanning did not finish within 120 seconds" >&2
  return 1
}

check_zap_alerts() {
  wait_for_passive_scan
  response=$(curl --silent --fail "${zap_base}/JSON/alert/view/alertsSummary/")
  high=$(printf '%s' "$response" | jq --raw-output '.alertsSummary.High // "0"')
  medium=$(printf '%s' "$response" | jq --raw-output '.alertsSummary.Medium // "0"')
  low=$(printf '%s' "$response" | jq --raw-output '.alertsSummary.Low // "0"')
  info=$(printf '%s' "$response" | jq --raw-output '.alertsSummary.Informational // "0"')
  echo "ZAP alerts — High: ${high}, Medium: ${medium}, Low: ${low}, Informational: ${info}"

  if [ "$high" -gt 0 ] || [ "$medium" -gt 0 ]; then
    echo "Security scan failed: ZAP reported High or Medium alerts" >&2
    return 1
  fi
}

mkdir -p security-report

echo "PROFILE=security: running authentication setup outside the ZAP proxy"
PROFILE=security npx playwright test --project=setup

echo "Starting ZAP image ${zap_image} on ${zap_base}"
docker run --detach --rm \
  --name "$zap_container" \
  --network host \
  "$zap_image" \
  zap.sh -daemon -silent -host "$zap_listen_host" -port "$zap_port" \
  -config api.disablekey=true \
  -config connection.timeoutInSecs=120 >/dev/null

wait_for_zap
exclude_third_parties
configure_scope

test_exit=0
HTTP_PROXY="$zap_base" HTTP_PROXY_BYPASS='<-loopback>' SKIP_AUTH_SETUP=1 PROFILE=security \
  npx playwright test "--project=${project}" --output=test-results/security || test_exit=$?

zap_exit=0
check_zap_alerts || zap_exit=$?

if ! curl --silent --fail "${zap_base}/OTHER/core/other/htmlreport/" \
  --output security-report/index.html; then
  echo "ZAP HTML report could not be fetched" >&2
  rm -f security-report/index.html
  : > security-report/REPORT_MISSING
  zap_exit=1
fi

if [ "$test_exit" -ne 0 ]; then
  exit "$test_exit"
fi

exit "$zap_exit"
