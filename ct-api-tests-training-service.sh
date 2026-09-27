#!/usr/bin/env bash
set -Ee -o pipefail

# Copyright (c) 2025 Igor Magdich
# License: MIT | https://github.com/dichovsky/api-tests-training-service/blob/main/LICENSE

# Community Scripts uses distinct engine and installer roots. Its supported
# local scripts root is populated below with our installer before creation.
_CS_DEFAULT_URL="https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main"
_cs_boot="${COMMUNITY_SCRIPTS_CORE_DIR:-$(dirname "${BASH_SOURCE[0]}")/../../core}/core/build.func"
if [[ -r "$_cs_boot" ]]; then
    source "$_cs_boot"
else
    _cs_engine="$(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}/core/build.func")"
    [[ -n "$_cs_engine" ]] || { echo 'Community Scripts engine download was empty' >&2; exit 1; }
    source /dev/stdin <<< "$_cs_engine"
    unset _cs_engine
fi

APP="API Tests Training Service"
var_tags="${var_tags:-training;api-tests;graphql}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-4}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"
var_arm64="${var_arm64:-yes}"

if ! command -v pveversion >/dev/null 2>&1 && [[ -f /etc/api-tests-training-service.conf ]]; then
    source /etc/api-tests-training-service.conf
fi
var_git_repo="${var_git_repo:-${DEPLOY_GIT_REPO:-https://github.com/dichovsky/api-tests-training-service.git}}"
var_git_ref="${var_git_ref:-${DEPLOY_GIT_REF:-main}}"
var_install_path="${var_install_path:-${DEPLOY_INSTALL_PATH:-/opt/api-tests-training-service}}"
var_port="${var_port:-${DEPLOY_PORT:-3000}}"
var_training_mode="${var_training_mode:-${DEPLOY_TRAINING_MODE:-false}}"
_app_installer_url_explicit="${var_install_script_url:-${DEPLOY_INSTALLER_URL:-}}"
var_install_script_url="${var_install_script_url:-${DEPLOY_INSTALLER_URL:-https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/install-api-tests-training-service.sh}}"

header_info "$APP"
variables
color
check_container_storage
check_container_resources
catch_errors

fetch_application_installer() {
    if [[ -n "${var_install_script_path:-}" ]]; then
        cat -- "$var_install_script_path"
    else
        curl -fsSL "$var_install_script_url"
    fi
}

update_script() {
    local installer_file
    installer_file="$(mktemp /tmp/api-tests-training-update.XXXXXX)"
    if ! fetch_application_installer > "$installer_file" || [[ ! -s "$installer_file" ]]; then
        rm -f "$installer_file"
        msg_error 'Could not obtain application installer for update'
        exit 1
    fi
    if ! bash -n "$installer_file"; then
        rm -f "$installer_file"
        msg_error 'Downloaded application installer has invalid shell syntax'
        exit 1
    fi
    local result=0
    INSTALL_PATH="$var_install_path" GIT_REPO="$var_git_repo" GIT_REF="$var_git_ref" \
        PORT="$var_port" TRAINING_MODE="$var_training_mode" INSTALLER_URL="$var_install_script_url" \
        bash "$installer_file" --update || result=$?
    rm -f "$installer_file"
    [[ "$result" -eq 0 ]] || exit "$result"
    msg_ok "Updated $APP successfully"
    exit 0
}

# Prepare the installer before creating a guest. The native build_container
# lifecycle executes this file; no second, post-provision installer is needed.
if command -v pveversion >/dev/null 2>&1; then
    _app_stage="$(mktemp -d /tmp/api-tests-training-installer.XXXXXX)"
    mkdir -p "$_app_stage/install"
    if ! fetch_application_installer > "$_app_stage/installer.sh" || [[ ! -s "$_app_stage/installer.sh" ]]; then
        rm -rf -- "$_app_stage"
        msg_error 'Could not obtain application installer; no container created'
        exit 1
    fi
    bash -n "$_app_stage/installer.sh"
    # A local validation installer remains available for bare updates inside the
    # guest. Published installs keep fetching the configured published URL.
    if [[ -n "${var_install_script_path:-}" && -z "$_app_installer_url_explicit" ]]; then
        var_install_script_url='file:///usr/local/lib/api-tests-training-service/installer.sh'
    fi
    {
        printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
        printf 'export INSTALL_PATH=%q GIT_REPO=%q GIT_REF=%q PORT=%q TRAINING_MODE=%q INSTALLER_URL=%q\n' \
            "$var_install_path" "$var_git_repo" "$var_git_ref" "$var_port" "$var_training_mode" "$var_install_script_url"
        printf 'install -d -m 700 /usr/local/lib/api-tests-training-service\n'
        printf "cat > /usr/local/lib/api-tests-training-service/installer.sh <<'API_TRAINING_INSTALLER_EOF'\n"
        cat "$_app_stage/installer.sh"
        printf '\nAPI_TRAINING_INSTALLER_EOF\n'
        printf 'chmod 700 /usr/local/lib/api-tests-training-service/installer.sh\n'
        printf 'exec bash /usr/local/lib/api-tests-training-service/installer.sh\n'
    } > "$_app_stage/install/${var_install}.sh"
    export COMMUNITY_SCRIPTS_ROOT="$_app_stage"
fi

start
build_container
[[ -z "${_app_stage:-}" ]] || rm -rf -- "$_app_stage"
description
msg_ok "Completed successfully!"
echo "REST API: http://${IP}:${var_port}/entities"
echo "GraphQL endpoint: http://${IP}:${var_port}/graphql"
echo "API specifications: http://${IP}:${var_port}/api-specs"
