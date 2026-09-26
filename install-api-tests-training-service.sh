#!/usr/bin/env bash
set -e

# API Tests Training Service - Install script
# This script is run inside the LXC container

INSTALL_PATH="${INSTALL_PATH:-/opt/api-tests-training-service}"
GIT_REPO="${GIT_REPO:-https://github.com/dichovsky/api-tests-training-service.git}"
PORT="${PORT:-3000}"
TRAINING_MODE="${TRAINING_MODE:-false}"

# Fresh containers may lack curl/git
if ! command -v curl &> /dev/null || ! command -v git &> /dev/null; then
    apt-get update
    apt-get install -y curl ca-certificates git
fi

# Install Node.js 20 if not present
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
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

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable api-tests-training-service
systemctl restart api-tests-training-service

echo "API Tests Training Service installed successfully"
