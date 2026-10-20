#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage: update.sh [--non-interactive] [--help]

Update the WineOps Raspberry Pi reporter while preserving its configuration.
EOF
}

args=()
while (($#)); do
  case "$1" in
    --non-interactive) args+=("$1") ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Error: Unknown option: %s (try --help)\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

if ! git -C "${REPOSITORY_DIR}" pull --ff-only; then
  printf 'Error: Git update failed. The reporter was not restarted; resolve the Git problem and rerun update.sh.\n' >&2
  exit 1
fi

exec "${SCRIPT_DIR}/setup.sh" --update "${args[@]}"
