#!/usr/bin/env bash
set -euo pipefail

application_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scoring_dir="${NIQ_SCORING_DIR:-${application_dir}/../niq-scoring}"

if [[ ! -f "${application_dir}/.env" ]]; then
  echo "Missing ${application_dir}/.env" >&2
  exit 1
fi

if [[ ! -f "${scoring_dir}/.env" ]]; then
  echo "Missing ${scoring_dir}/.env" >&2
  exit 1
fi

pids=()

cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do
    kill "${pid}" 2>/dev/null || true
  done
  wait "${pids[@]}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

(cd "${application_dir}" && exec bun --env-file=.env run dev) &
pids+=("$!")

(cd "${scoring_dir}" && exec bun --env-file=.env run dev) &
pids+=("$!")

# If either repository stops unexpectedly, stop the other one as well.
set +e
wait -n "${pids[@]}"
status=$?
set -e
exit "${status}"
