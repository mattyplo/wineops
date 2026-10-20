#!/usr/bin/env bash

set -Eeuo pipefail

readonly TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PI_DIR="$(cd -- "${TEST_DIR}/.." && pwd)"

PASS=0
FAIL=0

fail() {
  printf 'not ok - %s\n' "$1" >&2
  FAIL=$((FAIL + 1))
}

pass() {
  printf 'ok - %s\n' "$1"
  PASS=$((PASS + 1))
}

assert_contains() {
  local needle=$1 file=$2
  grep -Fq -- "${needle}" "${file}"
}

assert_not_contains() {
  local needle=$1 file=$2
  ! grep -Fq -- "${needle}" "${file}"
}

new_fixture() {
  FIXTURE="$(mktemp -d)"
  cp -R "${PI_DIR}" "${FIXTURE}/pi"
  rm -rf "${FIXTURE}/pi/temp_sensor/venv"
  mkdir -p "${FIXTURE}/bin" "${FIXTURE}/home" "${FIXTURE}/w1/28-000001" "${FIXTURE}/systemd"
  : >"${FIXTURE}/commands"

  cat >"${FIXTURE}/bin/python3" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == "-m venv --help" ]]; then exit 0; fi
if [[ "$1" == "--version" ]]; then echo 'Python 3.test'; exit 0; fi
if [[ "$1" == "-m" && "$2" == "venv" ]]; then
  mkdir -p "$3/bin"
  cp "${WINEOPS_TEST_PYTHON}" "$3/bin/python"
  chmod +x "$3/bin/python"
  exit 0
fi
exit 0
EOF
  cat >"${FIXTURE}/bin/python" <<'EOF'
#!/usr/bin/env bash
printf 'python %s\n' "$*" >>"${WINEOPS_TEST_LOG}"
if [[ "${WINEOPS_TEST_PIP_FAIL:-false}" == true && "$*" == *'pip install -r'* ]]; then exit 1; fi
exit 0
EOF
  chmod +x "${FIXTURE}/bin/python3" "${FIXTURE}/bin/python"

  cat >"${FIXTURE}/bin/stat" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == -c && "$2" == %a ]]; then echo 640; exit 0; fi
exec /usr/bin/stat "$@"
EOF
  chmod +x "${FIXTURE}/bin/stat"

  for command in sudo systemctl git hostname; do
    cat >"${FIXTURE}/bin/${command}" <<EOF
#!/usr/bin/env bash
printf '${command} %s\\n' "\$*" >>"\${WINEOPS_TEST_LOG}"
case '${command}' in
  sudo) exec "\$@" ;;
  systemctl)
    if [[ "\${WINEOPS_TEST_SYSTEMD_FAIL:-false}" == true && "\$1" == restart ]]; then exit 1; fi
    if [[ "\$1" == is-active ]]; then echo active; fi
    if [[ "\$1" == is-enabled ]]; then echo enabled; fi
    ;;
  git) [[ "\${WINEOPS_TEST_GIT_FAIL:-false}" != true ]] ;;
  hostname) printf '%s\\n' "\${WINEOPS_TEST_HOSTNAME:-pi-01}" ;;
esac
EOF
    chmod +x "${FIXTURE}/bin/${command}"
  done

  export HOME="${FIXTURE}/home"
  export PATH="${FIXTURE}/bin:${PATH}"
  export WINEOPS_W1_DEVICES_DIR="${FIXTURE}/w1"
  export WINEOPS_SYSTEMD_DIR="${FIXTURE}/systemd"
  export WINEOPS_TEST_LOG="${FIXTURE}/commands"
  export WINEOPS_TEST_PYTHON="${FIXTURE}/bin/python"
  unset WINEOPS_TEST_PIP_FAIL WINEOPS_TEST_GIT_FAIL WINEOPS_TEST_SYSTEMD_FAIL
  export WINEOPS_TEST_HOSTNAME=pi-01
}

write_legacy_config() {
  cat >"${HOME}/.supabase_env" <<'EOF'
SUPABASE_URL='https://example.supabase.co'
SUPABASE_KEY='existing-secret'
SENSORS='28-000001'
EOF
  chmod 640 "${HOME}/.supabase_env"
}

run_setup() {
  "${FIXTURE}/pi/setup.sh" "$@" >"${FIXTURE}/output" 2>&1
}

test_legacy_configuration_reconciles_only_device_id() {
  new_fixture
  write_legacy_config
  export WINEOPS_TEST_HOSTNAME='invalid hostname'
  if printf 'pi-legacy\n' | run_setup --update; then
    if assert_contains "SUPABASE_KEY='existing-secret'" "${HOME}/.supabase_env" &&
       assert_contains "SENSORS='28-000001'" "${HOME}/.supabase_env" &&
       assert_contains "DEVICE_ID='pi-legacy'" "${HOME}/.supabase_env" &&
       [[ "$(stat -c '%a' "${HOME}/.supabase_env")" == 640 ]]; then
      pass 'legacy update preserves credentials, sensors, and file mode'
    else fail 'legacy update preserves credentials, sensors, and file mode'; fi
  else fail 'legacy update preserves credentials, sensors, and file mode'; fi
}

test_noninteractive_reports_missing_values_without_modifying_config() {
  new_fixture
  write_legacy_config
  cp "${HOME}/.supabase_env" "${FIXTURE}/before"
  export WINEOPS_TEST_HOSTNAME='invalid hostname'
  if ! run_setup --update --non-interactive &&
     cmp -s "${FIXTURE}/before" "${HOME}/.supabase_env" &&
     assert_contains 'Missing required configuration: DEVICE_ID' "${FIXTURE}/output" &&
     assert_not_contains 'systemctl restart' "${WINEOPS_TEST_LOG}"; then
    pass 'noninteractive update reports missing configuration without disruption'
  else fail 'noninteractive update reports missing configuration without disruption'; fi
}

test_repeated_updates_are_idempotent() {
  new_fixture
  write_legacy_config
  if run_setup --update --non-interactive; then
    cp "${HOME}/.supabase_env" "${FIXTURE}/first"
    if run_setup --update --non-interactive && cmp -s "${FIXTURE}/first" "${HOME}/.supabase_env"; then
      pass 'repeated updates do not change reconciled configuration'
    else fail 'repeated updates do not change reconciled configuration'; fi
  else fail 'repeated updates do not change reconciled configuration'; fi
}

test_dependency_failure_does_not_restart_reporter() {
  new_fixture
  write_legacy_config
  export WINEOPS_TEST_PIP_FAIL=true
  if ! run_setup --update --non-interactive &&
     assert_not_contains 'systemctl restart' "${WINEOPS_TEST_LOG}"; then
    pass 'dependency failure leaves reporter running'
  else fail 'dependency failure leaves reporter running'; fi
}

test_successful_update_restarts_and_checks_reporter() {
  new_fixture
  write_legacy_config
  if run_setup --update --non-interactive &&
     assert_contains 'systemctl daemon-reload' "${WINEOPS_TEST_LOG}" &&
     assert_contains 'systemctl enable wineops-reporter.service' "${WINEOPS_TEST_LOG}" &&
     assert_contains 'systemctl restart wineops-reporter.service' "${WINEOPS_TEST_LOG}" &&
     assert_contains 'systemctl is-active --quiet wineops-reporter.service' "${WINEOPS_TEST_LOG}"; then
    pass 'successful update restarts and checks reporter service'
  else fail 'successful update restarts and checks reporter service'; fi
}

test_git_failure_does_not_run_setup_or_restart_reporter() {
  new_fixture
  write_legacy_config
  export WINEOPS_TEST_GIT_FAIL=true
  if ! "${FIXTURE}/pi/update.sh" --non-interactive >"${FIXTURE}/output" 2>&1 &&
     assert_contains 'Git update failed' "${FIXTURE}/output" &&
     assert_not_contains 'systemctl restart' "${WINEOPS_TEST_LOG}"; then
    pass 'Git failure is diagnosed without restarting reporter'
  else fail 'Git failure is diagnosed without restarting reporter'; fi
}

test_systemd_failure_shows_status() {
  new_fixture
  write_legacy_config
  export WINEOPS_TEST_SYSTEMD_FAIL=true
  if ! run_setup --update --non-interactive &&
     assert_contains 'systemctl status wineops-reporter.service --no-pager' "${WINEOPS_TEST_LOG}" &&
     assert_contains 'did not start' "${FIXTURE}/output"; then
    pass 'failed restart reports service status'
  else fail 'failed restart reports service status'; fi
}

test_legacy_configuration_reconciles_only_device_id
test_noninteractive_reports_missing_values_without_modifying_config
test_repeated_updates_are_idempotent
test_dependency_failure_does_not_restart_reporter
test_successful_update_restarts_and_checks_reporter
test_git_failure_does_not_run_setup_or_restart_reporter
test_systemd_failure_shows_status

printf '%s passed, %s failed\n' "${PASS}" "${FAIL}"
((FAIL == 0))
