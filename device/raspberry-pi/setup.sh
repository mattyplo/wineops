#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SENSOR_APP_DIR="${SCRIPT_DIR}/temp_sensor"
readonly REQUIREMENTS_FILE="${SENSOR_APP_DIR}/requirements.txt"
readonly VENV_DIR="${SENSOR_APP_DIR}/venv"
readonly SERVICE_TEMPLATE="${SCRIPT_DIR}/systemd/wineops-reporter.service"
readonly SERVICE_NAME="wineops-reporter.service"
readonly ENV_FILE="${WINEOPS_ENV_FILE:-${HOME}/.supabase_env}"
readonly W1_DEVICES_DIR="${WINEOPS_W1_DEVICES_DIR:-/sys/bus/w1/devices}"
readonly SYSTEMD_DIR="${WINEOPS_SYSTEMD_DIR:-/etc/systemd/system}"

RECONFIGURE=false
SKIP_SYSTEMD="${WINEOPS_SKIP_SYSTEMD:-false}"
DETECTED_SENSORS=()

usage() {
  cat <<'EOF'
Usage: setup.sh [--reconfigure] [--help]

Configure the WineOps temperature reporter on Raspberry Pi OS.

  --reconfigure  Replace ~/.supabase_env after interactively collecting values
  --help         Show this help

Secrets are intentionally accepted only through interactive prompts.
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '\nSetup failed near line %s (exit %s).\n' "${BASH_LINENO[0]:-unknown}" "${exit_code}" >&2
  exit "${exit_code}"
}
trap on_error ERR

prompt_yes_no() {
  local prompt=$1
  local reply
  read -r -p "${prompt} [y/N] " reply
  [[ "${reply}" =~ ^[Yy]([Ee][Ss])?$ ]]
}

parse_args() {
  while (($#)); do
    case "$1" in
      --reconfigure) RECONFIGURE=true ;;
      --help|-h) usage; exit 0 ;;
      *) die "Unknown option: $1 (try --help)" ;;
    esac
    shift
  done
}

require_normal_user() {
  [[ "${EUID}" -ne 0 ]] || die "Run this script as your normal Pi user, not as root. It will use sudo when needed."
  [[ -n "${HOME:-}" && -d "${HOME}" ]] || die "A valid HOME directory is required."
}

show_platform() {
  local model="unknown"
  local os_name="unknown"
  local architecture

  if [[ -r /proc/device-tree/model ]]; then
    model="$(tr -d '\0' </proc/device-tree/model)"
  fi
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    os_name="${PRETTY_NAME:-${NAME:-unknown}}"
  fi
  architecture="$(uname -m)"

  printf 'Platform preflight:\n'
  printf '  Model:        %s\n' "${model}"
  printf '  Architecture: %s\n' "${architecture}"
  printf '  OS:           %s\n' "${os_name}"
}

install_or_report_dependencies() {
  local missing=()
  local command
  for command in git python3 sudo systemctl; do
    command -v "${command}" >/dev/null 2>&1 || missing+=("${command}")
  done

  if ! python3 -m venv --help >/dev/null 2>&1; then
    missing+=("python3-venv")
  fi

  if ((${#missing[@]} == 0)); then
    printf '  Python:       %s\n' "$(python3 --version 2>&1)"
    return
  fi

  printf 'Missing required dependencies: %s\n' "${missing[*]}"
  if command -v apt-get >/dev/null 2>&1 && prompt_yes_no "Install Raspberry Pi OS dependencies now?"; then
    sudo apt-get update
    sudo apt-get install -y git python3 python3-venv python3-pip
  else
    die "Install git, python3, python3-venv, python3-pip, sudo, and systemd, then rerun setup."
  fi

  python3 -m venv --help >/dev/null 2>&1 || die "Python venv support is still unavailable."
}

discover_sensors() {
  local path
  DETECTED_SENSORS=()

  if [[ ! -d "${W1_DEVICES_DIR}" ]]; then
    printf '\n1-Wire device path is unavailable: %s\n' "${W1_DEVICES_DIR}" >&2
    printf 'Enable 1-Wire with sudo raspi-config, reboot, and rerun setup.\n' >&2
    return 1
  fi

  shopt -s nullglob
  for path in "${W1_DEVICES_DIR}"/28-*; do
    [[ -d "${path}" ]] && DETECTED_SENSORS+=("$(basename -- "${path}")")
  done
  shopt -u nullglob

  if ((${#DETECTED_SENSORS[@]})); then
    local sorted_sensors=()
    while IFS= read -r path; do
      sorted_sensors+=("${path}")
    done < <(printf '%s\n' "${DETECTED_SENSORS[@]}" | sort -u)
    DETECTED_SENSORS=("${sorted_sensors[@]}")
    printf '\nDetected DS18B20 sensors:\n'
    printf '  %s\n' "${DETECTED_SENSORS[@]}"
  else
    printf '\nNo DS18B20 sensors were detected under %s.\n' "${W1_DEVICES_DIR}" >&2
    printf 'Check wiring and 1-Wire configuration before continuing.\n' >&2
  fi
}

validate_single_line() {
  local label=$1
  local value=$2
  [[ -n "${value}" ]] || die "${label} cannot be empty."
  [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] || die "${label} must be a single line."
}

validate_sensors() {
  local sensors=$1
  local sensor
  local values=()
  IFS=',' read -r -a values <<<"${sensors}"
  ((${#values[@]})) || return 1
  for sensor in "${values[@]}"; do
    sensor="${sensor//[[:space:]]/}"
    [[ "${sensor}" =~ ^28-[[:xdigit:]]+$ ]] || return 1
  done
}

dotenv_quote() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\'/\\\'}
  printf "'%s'" "${value}"
}

configure_environment() {
  local supabase_url
  local supabase_key
  local sensors
  local detected_csv=""
  local temp_file
  local backup_file

  if [[ -f "${ENV_FILE}" && "${RECONFIGURE}" != true ]]; then
    chmod 600 "${ENV_FILE}"
    printf '\nPreserving existing configuration: %s\n' "${ENV_FILE}"
    return
  fi

  if [[ -e "${ENV_FILE}" && ! -f "${ENV_FILE}" ]]; then
    die "Configuration path exists but is not a regular file: ${ENV_FILE}"
  fi

  printf '\nSupabase configuration\n'
  read -r -p 'SUPABASE_URL: ' supabase_url
  read -r -s -p 'SUPABASE_KEY (hidden): ' supabase_key
  printf '\n'
  validate_single_line "SUPABASE_URL" "${supabase_url}"
  validate_single_line "SUPABASE_KEY" "${supabase_key}"
  [[ "${supabase_url}" =~ ^https?:// ]] || die "SUPABASE_URL must begin with http:// or https://."

  if ((${#DETECTED_SENSORS[@]})); then
    detected_csv="$(IFS=,; printf '%s' "${DETECTED_SENSORS[*]}")"
    read -r -p "SENSORS [${detected_csv}]: " sensors
    sensors=${sensors:-${detected_csv}}
  else
    read -r -p 'SENSORS (comma-separated 28-* IDs): ' sensors
  fi
  sensors=${sensors//[[:space:]]/}
  validate_sensors "${sensors}" || die "SENSORS must be a comma-separated list of hexadecimal 28-* IDs."

  temp_file="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  chmod 600 "${temp_file}"
  {
    printf 'SUPABASE_URL=%s\n' "$(dotenv_quote "${supabase_url}")"
    printf 'SUPABASE_KEY=%s\n' "$(dotenv_quote "${supabase_key}")"
    printf 'SENSORS=%s\n' "$(dotenv_quote "${sensors}")"
  } >"${temp_file}"

  if [[ -f "${ENV_FILE}" ]]; then
    backup_file="${ENV_FILE}.backup.$(date +%Y%m%d%H%M%S)"
    cp -p -- "${ENV_FILE}" "${backup_file}"
    chmod 600 "${backup_file}"
    printf 'Backed up existing configuration to %s\n' "${backup_file}"
  fi
  mv -- "${temp_file}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  unset supabase_key
  printf 'Wrote configuration to %s with permissions 600.\n' "${ENV_FILE}"
}

setup_virtualenv() {
  [[ -f "${REQUIREMENTS_FILE}" ]] || die "Requirements file not found: ${REQUIREMENTS_FILE}"
  if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
    printf '\nCreating Python virtual environment...\n'
    python3 -m venv "${VENV_DIR}"
  else
    printf '\nReusing Python virtual environment: %s\n' "${VENV_DIR}"
  fi
  "${VENV_DIR}/bin/python" -m pip install --upgrade pip
  "${VENV_DIR}/bin/python" -m pip install --upgrade -r "${REQUIREMENTS_FILE}"
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g' -e 's/"/\\"/g'
}

render_service() {
  local destination=$1
  local service_user
  local app_dir
  local python_path
  local script_path

  [[ -f "${SERVICE_TEMPLATE}" ]] || die "Service template not found: ${SERVICE_TEMPLATE}"
  service_user="$(id -un)"
  app_dir="$(escape_sed_replacement "${SENSOR_APP_DIR}")"
  python_path="$(escape_sed_replacement "${VENV_DIR}/bin/python")"
  script_path="$(escape_sed_replacement "${SENSOR_APP_DIR}/supabase_reporter.py")"
  sed \
    -e "s|__WINEOPS_USER__|${service_user}|g" \
    -e "s|__WINEOPS_APP_DIR__|${app_dir}|g" \
    -e "s|__WINEOPS_PYTHON__|${python_path}|g" \
    -e "s|__WINEOPS_REPORTER__|${script_path}|g" \
    "${SERVICE_TEMPLATE}" >"${destination}"
}

install_service() {
  local rendered

  if [[ "${SKIP_SYSTEMD}" == true ]]; then
    printf '\nSkipping systemd installation (WINEOPS_SKIP_SYSTEMD=true).\n'
    return
  fi

  rendered="$(mktemp)"
  render_service "${rendered}"

  printf '\nInstalling systemd service...\n'
  sudo install -m 644 "${rendered}" "${SYSTEMD_DIR}/${SERVICE_NAME}"
  rm -f -- "${rendered}"
  sudo systemctl daemon-reload
  sudo systemctl enable "${SERVICE_NAME}"
  if ! sudo systemctl restart "${SERVICE_NAME}"; then
    systemctl status "${SERVICE_NAME}" --no-pager || true
    die "The reporter service did not start. Review the status output above."
  fi
}

configured_sensors() {
  sed -n "s/^SENSORS=['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}$/\1/p" "${ENV_FILE}" | head -n 1
}

show_summary() {
  printf '\nWineOps setup complete.\n'
  printf '  Application:  %s\n' "${SENSOR_APP_DIR}"
  printf '  Environment:  %s (mode %s)\n' "${ENV_FILE}" "$(stat -c '%a' "${ENV_FILE}")"
  if ((${#DETECTED_SENSORS[@]})); then
    printf '  Detected:     %s\n' "$(IFS=,; printf '%s' "${DETECTED_SENSORS[*]}")"
  else
    printf '  Detected:     none\n'
  fi
  printf '  Configured:   %s\n' "$(configured_sensors)"

  if [[ "${SKIP_SYSTEMD}" != true ]]; then
    printf '  Service:      %s\n' "$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || true)"
    printf '  Boot enabled: %s\n' "$(systemctl is-enabled "${SERVICE_NAME}" 2>/dev/null || true)"
    printf '\nCheck status: systemctl status %s\n' "${SERVICE_NAME}"
    printf 'View logs:   journalctl -u %s -b\n' "${SERVICE_NAME}"
  fi
  printf 'Reconfigure: %q --reconfigure\n' "${SCRIPT_DIR}/setup.sh"
}

main() {
  parse_args "$@"
  require_normal_user
  show_platform
  install_or_report_dependencies
  discover_sensors || die "1-Wire must be enabled before WineOps can be configured."
  configure_environment
  setup_virtualenv
  install_service
  show_summary
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
