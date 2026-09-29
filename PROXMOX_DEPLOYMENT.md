# API Tests Training Service - Deployment Guide

## Proxmox VE Deployment

### Quick Start

The unauthenticated raw-URL quick start below is usable only when this repository
is public and the referenced scripts are published. The repository is currently
private; use the private-repository procedure below. An HTTP 404 from a private
raw URL does not mean the file is absent from an authenticated checkout.

For a public repository, deploy using Community Scripts:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)"
```

### Private repository installation

Use an authenticated local checkout of the intended revision to obtain both
`ct-api-tests-training-service.sh` and `install-api-tests-training-service.sh`.
Transfer those files to a private directory on the Proxmox host, such as
`/root/validation/`, through the existing authorized SSH connection. Record the
revision and script hashes; do not replace the private raw URL with an
unauthenticated download and assume it succeeded.

The new guest also needs access to application source **before the installer runs
`git clone`**. Host or workstation GitHub access does not automatically grant guest
access. Choose and authorize one of these source arrangements:

- A repository-specific, read-only SSH deploy key, provisioned in the guest by
  the bootstrap before cloning, with the expected GitHub host key verified. This
  is the preferred arrangement for ongoing updates. Creating or registering a
  key is a separate operator decision; the scripts do not do it automatically.
- A private bare Git mirror transferred through SSH and made available inside
  the guest before cloning. Set `var_git_repo` to its guest-local `file://` URL.
  This supports an isolated validation fixture without granting GitHub access;
  future source updates require refreshing that mirror.

Once guest SSH access has been arranged, run the staged files on the Proxmox host:

```bash
var_git_repo='git@github.com:dichovsky/api-tests-training-service.git' \
var_git_ref='<branch-tag-or-commit>' \
var_install_script_path='/root/validation/install-api-tests-training-service.sh' \
bash /root/validation/ct-api-tests-training-service.sh
```

For a mirror fixture, substitute the guest-local mirror URL for `var_git_repo`.
The local installer is copied into the guest and its private `file://` URL is
recorded for later updates. Leave `var_install_script_url` unset for this path;
a private unauthenticated raw URL cannot download its replacement.

If a mirror-backed deployment later receives approved GitHub SSH access, perform
one update with `var_git_repo='git@github.com:dichovsky/api-tests-training-service.git'`.
A successful update records that source for later runs. Changing Git `origin`
alone is insufficient: the updater sets origin from its recorded source settings.

### Configuration Variables

- `var_git_repo` - Git repository URL (default: https://github.com/dichovsky/api-tests-training-service.git)
- `var_git_ref` - Git branch, tag, or commit to install/update (default: `main`)
- `var_install_path` - Installation path (default: /opt/api-tests-training-service)
- `var_port` - Service port (default: 3000)
- `var_training_mode` - Enable training mode (default: false)
- `var_install_script_url` - Installer URL (default: this repository’s `main` installer)
- `var_install_script_path` - Optional installer file on the Proxmox host, for validating unpublished changes

### Advanced Installation

The raw-URL example requires a public repository. Apply the same settings to the
staged local wrapper for a private repository.

```bash
var_git_repo='https://github.com/dichovsky/api-tests-training-service.git' \
var_port='8080' \
var_training_mode='true' \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)"
```

### Update Service

Inside a private-repository container, run the wrapper from the installed
checkout. For the default installation path:

```bash
bash /opt/api-tests-training-service/ct-api-tests-training-service.sh
```

For a custom installation path, run `bash <configured-install-path>/ct-api-tests-training-service.sh`.
The recorded configuration selects the cached installer, so neither command
requires an unauthenticated private raw URL. The guest still needs access to its
recorded Git source to fetch application updates.

Updating the application checkout does not automatically replace the cached
installer at `/usr/local/lib/api-tests-training-service/installer.sh`. To upgrade
that installer, obtain the intended version through an authenticated checkout,
stage it securely in the guest, and validate the new installer before accepting
its result. Keep a known-good copy for recovery.

When the repository is public and the wrapper is published, this alternative is
also available:

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
Use an explicit branch URL only when the guest can actually download that
installer. The private-repository path uses the cached installer instead. The
raw quick-start defaults remain on `main`; a local validation run does not prove
those unpublished or unauthenticated entry points work.

Keep control of Community Scripts’ failure prompts during validation: some
upstream failure paths offer automatic container removal after a timeout. Retain
the test guest when inspecting failures and recover it before further acceptance
checks. A patched/local run proves only the recorded script versions; it does not
prove a different published entry point works.

The wrapper rejects Community Scripts' `keep` debug mode before container creation:
upstream can return success after failed provisioning in that mode. Use
`dev_mode=logs` for validation and explicitly control any failure/removal prompts.

Local command-double checks (no cluster mutations):

```bash
bash -n ct-api-tests-training-service.sh install-api-tests-training-service.sh
python3 scripts/test-deployment-scripts.py
```

### Training Config Admin Token

The install generates a random `TRAINING_ADMIN_TOKEN` inside the container and stores it in `/etc/api-tests-training-service.env` (root-only, mode 600). The service loads it via `EnvironmentFile=`, and reinstalls keep the existing token. It authorizes mentor-only reads and runtime changes through `GET`/`PATCH /training-config` (REST only; see `mentor/TRAINING_CONFIG.md`).

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
