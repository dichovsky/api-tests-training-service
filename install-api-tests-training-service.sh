#!/usr/bin/env bash
set -e

# API Tests Training Service - Install script
# This script is run inside the LXC container

INSTALL_PATH="${INSTALL_PATH:-/opt/api-tests-training-service}"
GIT_REPO="${GIT_REPO:-https://github.com/dichovsky/api-tests-training-service.git}"
PORT="${PORT:-3000}"
TRAINING_MODE="${TRAINING_MODE:-false}"
ENV_FILE="/etc/api-tests-training-service.env"

# Fresh containers may lack curl/git
if ! command -v curl &> /dev/null || ! command -v git &> /dev/null; then
    apt-get update
    apt-get install -y curl ca-certificates git
fi

# Install Node.js 24 (LTS) if missing or older; Node 20 is EOL
if ! command -v node &> /dev/null || (( $(node -p 'process.versions.node.split(".")[0]') < 24 )); then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y nodejs
fi

# Clone or update repository
if [[ ! -d "$INSTALL_PATH/.git" ]]; then
    git clone "$GIT_REPO" "$INSTALL_PATH"
else
    cd "$INSTALL_PATH"
    git fetch origin
    git reset --hard origin/main
fi

cd "$INSTALL_PATH"

# Build needs devDependencies (typescript, rimraf); prune them afterwards
npm ci
npm run build
npm prune --omit=dev

# Admin token for runtime training-config updates: generated once, root-only,
# kept out of the world-readable unit file and out of any logs
if [[ ! -f "$ENV_FILE" ]]; then
    (umask 077 && echo "TRAINING_ADMIN_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > "$ENV_FILE")
fi
chmod 600 "$ENV_FILE"

# Create systemd service
cat > /etc/systemd/system/api-tests-training-service.service <<EOF
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
systemctl enable api-tests-training-service
systemctl restart api-tests-training-service

echo "API Tests Training Service installed successfully"
