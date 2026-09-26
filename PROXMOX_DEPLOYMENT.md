# API Tests Training Service - Deployment Guide

## Proxmox VE Deployment

### Quick Start

Deploy to Proxmox VE using Community Scripts:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)"
```

### Configuration Variables

- `var_git_repo` - Git repository URL (default: https://github.com/dichovsky/api-tests-training-service.git)
- `var_install_path` - Installation path (default: /opt/api-tests-training-service)
- `var_port` - Service port (default: 3000)
- `var_training_mode` - Enable training mode (default: false)

### Advanced Installation

```bash
var_git_repo='https://github.com/dichovsky/api-tests-training-service.git' \
var_port='8080' \
var_training_mode='true' \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)"
```

### Update Service

Inside the container, run:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)"
```

The update script will:
1. Pull latest code from git
2. Install dependencies (`npm ci`)
3. Rebuild TypeScript (`npm run build`)
4. Restart systemd service

### Manual Update

```bash
pct enter <container_id>
cd /opt/api-tests-training-service
git pull origin main
npm ci
npm run build
systemctl restart api-tests-training-service
```

### Service Management

```bash
systemctl status api-tests-training-service
systemctl logs -f api-tests-training-service
systemctl restart api-tests-training-service
```

### Access

- REST API: http://<container_ip>:3000/entities
- GraphQL Playground: http://<container_ip>:3000/graphql
- API Specs: http://<container_ip>:3000/api-specs

## Docker Deployment

Alternative Docker deployment:

```bash
docker build -t api-tests-training-service .
docker run -d -p 3000:3000 --name api-tests-training-service api-tests-training-service
```

## Local Development

```bash
npm install
npm run dev
```
