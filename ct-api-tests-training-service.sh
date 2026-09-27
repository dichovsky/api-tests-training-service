#!/usr/bin/env bash
_CS_DEFAULT_URL="https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main"
_cs_boot="${COMMUNITY_SCRIPTS_CORE_DIR:-$(dirname "${BASH_SOURCE[0]}")/../../core}/core/build.func"
source "$_cs_boot" 2>/dev/null || source <(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}/core/build.func")

# Copyright (c) 2025 Igor Magdich
# Author: Igor Magdich
# License: MIT | https://github.com/dichovsky/api-tests-training-service/blob/main/LICENSE
# Source: https://github.com/dichovsky/api-tests-training-service

APP="API Tests Training Service"
var_tags="${var_tags:-training;api-tests;graphql}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-4}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"
var_arm64="${var_arm64:-yes}"

# Application specific variables
var_git_repo="${var_git_repo:-https://github.com/dichovsky/api-tests-training-service.git}"
var_install_path="${var_install_path:-/opt/api-tests-training-service}"
var_port="${var_port:-3000}"
var_training_mode="${var_training_mode:-false}"
var_install_script_url="${var_install_script_url:-https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/install-api-tests-training-service.sh}"

header_info "$APP"
variables
color
check_container_storage
check_container_resources
catch_errors

function update_script() {
    header_info
    check_container_storage
    check_container_resources

    if [[ ! -d "$var_install_path" ]]; then
        msg_error "No $APP installation found at $var_install_path"
        exit 1
    fi

    msg_info "Updating $APP"
    
    # Pull latest code
    if [[ -d "$var_install_path/.git" ]]; then
        cd "$var_install_path"
        $STD git fetch origin
        $STD git reset --hard origin/main
    else
        msg_error "Installation not managed by git"
        exit 1
    fi

    # Install dependencies and rebuild
    cd "$var_install_path"
    $STD npm ci
    $STD npm run build
    $STD npm prune --omit=dev

    # Restart service
    if systemctl is-active --quiet api-tests-training-service; then
        msg_info "Restarting $APP service"
        systemctl restart api-tests-training-service
    else
        msg_info "Starting $APP service"
        systemctl start api-tests-training-service
    fi

    msg_ok "Updated $APP successfully"
    exit
}

start
build_container
description

# Install inside the new container, never on the Proxmox host
msg_info "Installing $APP in CT $CTID"
curl -fsSL "$var_install_script_url" | pct exec "$CTID" -- env \
    INSTALL_PATH="$var_install_path" GIT_REPO="$var_git_repo" \
    PORT="$var_port" TRAINING_MODE="$var_training_mode" bash -s
msg_ok "Installed $APP"

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it via: http://${IP}:${var_port}/api-specs${CL}"
echo -e "${INFO}${YW} GraphQL endpoint: http://${IP}:${var_port}/graphql${CL}"
echo -e "${INFO}${YW} Training config admin token: pct exec ${CTID} -- cat /etc/api-tests-training-service.env${CL}"
echo -e "${INFO}${YW} Update with: bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)\"${CL}"
