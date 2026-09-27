# API Tests Training Service - Deployment Guide

## Proxmox VE Deployment

### Quick Start

Deploy to Proxmox VE using Community Scripts:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)"
```

### Configuration Variables

- `var_git_repo` - Git repository URL (default: https://github.com/dichovsky/api-tests-training-service.git)
- `var_git_ref` - Git branch, tag, or commit to install/update (default: `main`)
- `var_install_path` - Installation path (default: /opt/api-tests-training-service)
- `var_port` - Service port (default: 3000)
- `var_training_mode` - Enable training mode (default: false)
- `var_install_script_url` - Installer URL (default: this repository’s `main` installer)
- `var_install_script_path` - Optional installer file on the Proxmox host, for validating unpublished changes

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

The update script reads `/etc/api-tests-training-service.conf`, so a bare command
finds a custom installation path and preserves the configured source/ref, port,
training mode, and installer URL. Explicit `var_*` arguments override those saved
values. Successful installation/update writes this root-only configuration; an
update that fails leaves the previous recorded settings in place.

The update script will:

1. Download the configured installer and require an existing Git installation.
2. Fetch the configured Git ref and reset the checkout to that revision. Tracked
   local changes are discarded; keep application changes in Git.
3. Install build dependencies with `npm ci --include=dev`, build, then prune
   development dependencies with `npm prune --omit=dev`.
4. Enable and restart the systemd service, including when it was stopped.
5. Require real REST and GraphQL responses within a 60-second observation window,
   with the same healthy process for 12 seconds (longer than its restart delay).

Git, dependency, build, and readiness failures return nonzero. There is no
automatic rollback: the checkout, dependencies or unit may already have changed.
Restore the known-good snapshot, or rerun with a known-good `var_git_ref` and
compatible installer, then repeat the service checks. The admin token is preserved.
Entities, runtime training changes and authentication lockouts are in memory and
reset when the service restarts.

For an installation made before persistent deployment settings were introduced,
provide its custom `var_install_path`, `var_port` and `var_training_mode` once when
updating; successful completion records them for subsequent bare updates.

### Manual Update

```bash
pct enter <container_id>
cd /opt/api-tests-training-service
# Replace main with the recorded branch/tag/SHA when applicable.
git fetch origin main
git reset --hard FETCH_HEAD
npm ci --include=dev
npm run build
npm prune --omit=dev
systemctl restart api-tests-training-service
curl --fail http://127.0.0.1:3000/entities
curl --fail -H 'Content-Type: application/json' \
  --data '{"query":"{ entities { id } }"}' http://127.0.0.1:3000/graphql
systemctl status api-tests-training-service
```

Use the configured installation directory and port when they differ from the
example. Inspect the GraphQL response for errors and confirm the same healthy
systemd process remains running for at least 12 seconds. The scripted update
performs these checks automatically.

### Reproducible deployment validation

The wrapper stages the selected application installer under Community Scripts’
supported local scripts root. `build_container()` then runs that installer through
its normal lifecycle. This avoids looking for this application’s installer
in the public Community Scripts repository, and avoids installing twice.

To validate an installer saved on the Proxmox host while selecting a source
branch or immutable application commit:

```bash
mode=default \
var_ctid='<unused-id>' var_hostname='api-tests-training' \
var_brg='vmbr0' var_net='dhcp' \
var_container_storage='<rootdir-storage>' var_template_storage='<template-storage>' \
var_git_ref='<branch-tag-or-commit>' \
var_install_script_path='/root/validation/install-api-tests-training-service.sh' \
bash /root/validation/ct-api-tests-training-service.sh
```

The guest must be able to fetch `var_git_repo`. An immutable `var_git_ref` stays
pinned on repeat updates; pass a new value to test version advancement. Set
`COMMUNITY_SCRIPTS_CORE_URL` to an immutable core commit URL to record a reproducible
engine version. Application source and the engine are selected independently.

A host-local installer is retained privately inside the guest at
`/usr/local/lib/api-tests-training-service/installer.sh`; its `file://` URL becomes
the update source unless an explicit `var_install_script_url` was also supplied.
Use an explicit published branch URL when updates should download that branch’s
installer instead. Published quick-start defaults remain on `main`.

Keep control of Community Scripts’ failure prompts during validation: some
upstream failure paths offer automatic container removal after a timeout. Retain
the test guest when inspecting failures and recover it before further acceptance
checks. A patched/local run proves only the recorded script versions; it does not
prove a different published entry point works.

Local command-double checks (no cluster mutations):

```bash
bash -n ct-api-tests-training-service.sh install-api-tests-training-service.sh
python3 scripts/test-deployment-scripts.py
```

### Training Config Admin Token

The install generates a random `TRAINING_ADMIN_TOKEN` inside the container and stores it in `/etc/api-tests-training-service.env` (root-only, mode 600). The service loads it via `EnvironmentFile=`, and reinstalls keep the existing token. It authorizes runtime changes through `PATCH /training-config` and the GraphQL `updateTrainingConfig` mutation.

Read it from the Proxmox host:

```bash
pct exec <container_id> -- cat /etc/api-tests-training-service.env
```

To rotate it, replace the value in that file and run `systemctl restart api-tests-training-service`.

### Service Management

```bash
systemctl status api-tests-training-service
journalctl -u api-tests-training-service -f
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
npm ci --include=dev
npm run start
```
