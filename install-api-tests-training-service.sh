#!/usr/bin/env bash
set -Eeuo pipefail

# Runs inside the guest. --update requires an existing Git installation.
ACTION="${1:-install}"
[[ "$ACTION" == install || "$ACTION" == --update ]] || { echo "Usage: $0 [--update]" >&2; exit 2; }
CONFIG_FILE="/etc/api-tests-training-service.conf"
ENV_FILE="/etc/api-tests-training-service.env"
SERVICE="api-tests-training-service"
[[ ! -f "$CONFIG_FILE" ]] || source "$CONFIG_FILE"
INSTALL_PATH="${INSTALL_PATH:-${DEPLOY_INSTALL_PATH:-/opt/api-tests-training-service}}"
GIT_REPO="${GIT_REPO:-${DEPLOY_GIT_REPO:-https://github.com/dichovsky/api-tests-training-service.git}}"
GIT_REF="${GIT_REF:-${DEPLOY_GIT_REF:-main}}"
PORT="${PORT:-${DEPLOY_PORT:-3000}}"
TRAINING_MODE="${TRAINING_MODE:-${DEPLOY_TRAINING_MODE:-false}}"
INSTALLER_URL="${INSTALLER_URL:-${DEPLOY_INSTALLER_URL:-https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/install-api-tests-training-service.sh}}"

# Keep generated shell/systemd configuration unambiguous.
[[ "$INSTALL_PATH" =~ ^/[a-zA-Z0-9_./-]+$ && "$INSTALL_PATH" != / && "$INSTALL_PATH" != *'/../'* ]] || { echo 'Invalid installation path' >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ && ${#PORT} -le 5 && "$PORT" -ge 1 && "$PORT" -le 65535 ]] || { echo 'Invalid service port' >&2; exit 2; }
[[ "$TRAINING_MODE" == true || "$TRAINING_MODE" == false ]] || { echo 'TRAINING_MODE must be true or false' >&2; exit 2; }
[[ -n "$GIT_REF" && "$GIT_REF" != -* ]] || { echo 'Invalid Git ref' >&2; exit 2; }
[[ "$EUID" -eq 0 ]] || { echo 'Run this installer as root inside the container' >&2; exit 1; }
if [[ "$ACTION" == --update && ! -d "$INSTALL_PATH/.git" ]]; then
    echo "No Git-managed installation found at $INSTALL_PATH" >&2
    exit 1
fi

if [[ "$ACTION" == install ]]; then
    if ! command -v curl >/dev/null || ! command -v git >/dev/null; then
        apt-get update
        apt-get install -y curl ca-certificates git
    fi
    if ! command -v node >/dev/null || (( $(node -p 'process.versions.node.split(".")[0]') < 24 )); then
        curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
        apt-get install -y nodejs
    fi
fi
command -v git >/dev/null
command -v npm >/dev/null
command -v node >/dev/null

if [[ ! -d "$INSTALL_PATH/.git" ]]; then
    git clone --no-checkout -- "$GIT_REPO" "$INSTALL_PATH"
fi
cd "$INSTALL_PATH"
# Fetch the requested branch/tag/SHA explicitly, so clone's default branch and
# stale local origin/main do not silently choose a different application.
git remote set-url origin "$GIT_REPO"
git fetch origin "$GIT_REF"
git reset --hard FETCH_HEAD
npm ci --include=dev
npm run build
npm prune --omit=dev
test -s dist/index.js

# Keep the admin token out of the unit, logs and deployment configuration.
if [[ ! -f "$ENV_FILE" ]]; then
    admin_token="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    [[ "$admin_token" =~ ^[[:xdigit:]]{64}$ ]] || { echo 'Admin token generation failed' >&2; exit 1; }
    (umask 077; printf 'TRAINING_ADMIN_TOKEN=%s\n' "$admin_token" > "$ENV_FILE")
    unset admin_token
fi
chown root:root "$ENV_FILE"
chmod 600 "$ENV_FILE"

cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=API Tests Training Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_PATH
ExecStart=/usr/bin/node $INSTALL_PATH/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=TRAINING_MODE=$TRAINING_MODE
EnvironmentFile=$ENV_FILE

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

# Observe real responses and a stable PID beyond RestartSec=10. An accepted
# restart command alone does not mean the service has started successfully.
PORT="$PORT" node <<'NODE'
const { execFileSync } = require('node:child_process');
const service = 'api-tests-training-service';
const base = `http://127.0.0.1:${process.env.PORT}`;
const deadline = Date.now() + 60_000;
let stableSince = 0;
let stablePid = '';
const state = () => {
  const raw = execFileSync('systemctl', ['show', service, '--property=MainPID,NRestarts,ActiveState'], { encoding: 'utf8' });
  return Object.fromEntries(raw.trim().split('\n').map(line => line.split('=')));
};
(async () => {
  const initialRestarts = state().NRestarts;
  while (Date.now() < deadline) {
    try {
      const current = state();
      if (current.NRestarts !== initialRestarts) throw new Error('Service restarted during readiness verification');
      if (current.ActiveState !== 'active' || current.MainPID === '0') throw new Error('Service is not active');
      const rest = await fetch(`${base}/entities`, { signal: AbortSignal.timeout(2000) });
      if (!rest.ok || !Array.isArray(await rest.json())) throw new Error('REST readiness failed');
      const graphql = await fetch(`${base}/graphql`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ entities { id } }' }), signal: AbortSignal.timeout(2000),
      });
      const body = await graphql.json();
      if (!graphql.ok || body.errors || !Array.isArray(body.data?.entities)) throw new Error('GraphQL readiness failed');
      if (stablePid !== current.MainPID) { stablePid = current.MainPID; stableSince = Date.now(); }
      if (Date.now() - stableSince >= 12_000) {
        console.log('REST and GraphQL ready; systemd process stable for 12 seconds');
        return;
      }
    } catch (error) {
      stableSince = 0;
      stablePid = '';
      if (state().NRestarts !== initialRestarts) throw new Error('Service is crash-looping during readiness verification');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Service did not reach stable REST and GraphQL readiness within 60 seconds');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE

# Only replace recorded settings after the service has passed readiness.
CONFIG_TMP="$(mktemp "${CONFIG_FILE}.XXXXXX")"
trap 'rm -f "$CONFIG_TMP"' EXIT
{
    printf 'DEPLOY_INSTALL_PATH=%q\n' "$INSTALL_PATH"
    printf 'DEPLOY_GIT_REPO=%q\n' "$GIT_REPO"
    printf 'DEPLOY_GIT_REF=%q\n' "$GIT_REF"
    printf 'DEPLOY_PORT=%q\n' "$PORT"
    printf 'DEPLOY_TRAINING_MODE=%q\n' "$TRAINING_MODE"
    printf 'DEPLOY_INSTALLER_URL=%q\n' "$INSTALLER_URL"
} > "$CONFIG_TMP"
chmod 600 "$CONFIG_TMP"
chown root:root "$CONFIG_TMP"
mv "$CONFIG_TMP" "$CONFIG_FILE"
trap - EXIT
printf 'API Tests Training Service %s succeeded at revision %s\n' "$ACTION" "$(git rev-parse HEAD)"
