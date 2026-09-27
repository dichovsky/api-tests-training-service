# Local and Proxmox validation — 2026-09-27

Installation, update, controlled-failure recovery, process recovery and guest
reboot checks passed. A follow-up Google Chrome check also verified Apollo
Sandbox against both the local `npm run start` process and the deployed service:
the UI rendered and returned HTTP 200 with empty entities and training mode off.
The earlier blank frame was observed in Codex's in-app browser; no application
change was needed. The REST and GraphQL HTTP suites passed.

## Retained service and source

- Dedicated unprivileged Debian 13 LXC **102**, `api-tests-training`, on **pve3**.
- 2 vCPUs, 1 GiB RAM, 4 GiB `local-lvm` disk; LAN DHCP, port 3000.
- Address observed during validation: <http://192.168.88.126:3000/api-specs>.
- Installation: `/opt/api-tests-training-service`; unit: `api-tests-training-service`.
- Tested final implementation: `15c3632038aed1746f1eb2ed40352f6dfcffd242` on
  `test/proxmox-deployment-validation`. Report/plan commits may follow without
  changing the tested implementation. This report records pre-merge acceptance;
  subsequent `main` deployment evidence is saved in
  `validation-results/proxmox/post-merge-main-summary.json` when that step completes.
- Private GitHub source uses the owner-approved repository-scoped, read-only SSH
  deploy key. Its private half remains in this guest. The admin token is retained
  in `/etc/api-tests-training-service.env`, root-owned, mode 600.
- Recovery snapshot: `validation-baseline`, made before historical updates and
  fault injection. Ordinary update recovery was exercised; snapshot restore was not.

Final read-only checks confirmed the enabled, running unit with zero restarts,
empty entity state, training off, pruned development tools, no remaining failure
fixtures, and installed/cached script hashes matching the reviewed source. The
saved evidence contains no admin-token value. All three cluster nodes remained
online and quorate, Ceph reported `HEALTH_OK`, and existing guests retained their
placement/status with advancing uptimes. The local test process was stopped.

The local baseline ran on macOS arm64 with Node 24.21.0/npm 12.1.0 through
`npm run start`. The guest runs compiled JavaScript under systemd with Node
24.21.0/npm 11.19.0. Community Scripts core was explicitly selected as
`cbf119ed58df13cd74450faec727a70052a35f1c` for provisioning and scripted updates.
This does not certify future mutable upstream versions or package downloads.

## Results

| Check | Result |
| --- | --- |
| TypeScript, unit checks | Type-check passed; 24 unit tests passed |
| Deployment scripts | Shell syntax passed; six command-double tests passed, including optional platform probes and rejection of keep debug mode |
| Local production and development | Each passed 121 assertions / 629 requests |
| Local no-token and startup-training profiles | 23 and 21 assertions passed; explicit restart reset checks passed |
| Fresh native-wrapper installation | Passed; complete 121-assertion suite matched the local baseline |
| Real historical upgrade | `caa41dac260098d5f6c6cc36caa0fc62aceb6aa9` → `26be40920f7c581b996b7c18c73f75cd2dc6d915`; historical absence of throttling/spec change verified before upgrade |
| Repeat update, stopped-service update | Passed; token and saved settings preserved; full suite matched after each |
| Custom path/port/training | `/opt/api-training-custom`, port 3080, training on; 21 assertions passed before and after a bare update that retained settings |
| Default restoration, manual update, same-settings reinstall | Passed; full suite matched after each; token retained |
| No-token/startup-training on Proxmox | Same local profiles passed and compared with zero differences |
| Seven injected failures and recoveries | Each failed truthfully, preserved persistent settings/token, and recovered through the normal updater; full suite matched after every recovery |
| Final source update to `15c3632` | Passed; full suite matched |
| Process crash and container reboot | Passed; systemd recovered and auto-started, runtime entities/IDs/flags/lockout reset, token preserved, full suite matched after each |
| Browser Swagger | Rendered locally and on Proxmox; executed `GET /entities`, receiving 200 and `[]` |
| Browser Apollo Sandbox | Passed in Google Chrome locally and on Proxmox: rendered UI, executed `{ entities { id } trainingMode }`, HTTP 200 and expected response. The in-app browser had shown a blank frame |

The full suite covers CRUD, invalid inputs, zero/null/omitted sizes, replacement,
shared REST/GraphQL state, training settings and intentional defect flags,
authentication and cross-interface lockout, malformed JSON, and packaged specs.
Deterministic unit tests cover the random training boundaries.

Across 17 full Proxmox runs and four additional profile runs, all 2,143 assertions
passed (10,966 HTTP requests). The 19 comparisons with equivalent local profiles
reported zero differences in the compared contracts.

Comparisons establish equivalence of the selected tested contracts. They check
suite identity, startup settings, assertions, packaged asset hashes, status codes,
content types and normalized JSON. They exclude timing/host differences, numeric
ID values, allowed random whitespace and error wording. Request bodies, extra
response headers, content-type parameters and HTML layout are not independently
compared; relevant behaviors and assets have separate assertions. Custom training
true/true checks are additional checks, not comparisons with the local false/false
startup-training profile.

## Failure observations

| Injected failure | Exit | Observed before recovery |
| --- | --- | --- |
| Installer download unavailable | 1 | Existing APIs still answered |
| Installation absent | 1 | Existing APIs still answered |
| Git metadata absent | 1 | Existing APIs still answered; metadata restored by fixture cleanup |
| Git fetch failed | 44 | Existing APIs still answered |
| Dependency installation command failed | 45 | Existing APIs still answered |
| Build command failed | 46 | Existing APIs still answered |
| Compiled entrypoint crashes | 1 | APIs unavailable; systemd auto-restarting; updater detected the crash loop |

No failing update emitted its success confirmation. All seven ordinary recoveries
passed 121 assertions and baseline comparison, with the token/config preserved.
These observations do not promise uninterrupted service after other partial
dependency/build failures. Updates do not implement automatic rollback.

## Defects corrected and validation boundaries

The original wrapper failed a real fresh install with exit 115 while requesting
an application installer absent from the upstream Community Scripts catalog.
The corrected wrapper stages its installer through the native lifecycle.
Early shell `errexit` also had to be delayed until upstream optional platform
probes initialized. A later review identified upstream `keep` debug mode's false
success behavior; the wrapper now rejects it before provisioning, covered by a
command-double regression. The successful live fresh install used `fa37ed1`;
subsequent changes added validation documentation and this host-only guard.

Installation/update now share dependency installation, build, production pruning,
token retention and persisted deployment settings. They require actual REST and
GraphQL responses and a stable process for 12 seconds before success. Unexpected
Git, dependency, build and startup errors propagate to the caller.

Local API checks found two defects before accepting the baseline: numeric
overflow could store Infinity and break GraphQL, and malformed JSON returned an
HTML parser error. Finite-number validation and a JSON 400 response correct these.
The owner-confirmed zero/null semantics are now documented. Application and served
specification contents have remained unchanged since `59d0977`; the initial local
baseline recorded the pre-commit patch fingerprint as well as its later commit.

The repository is private. The anonymous raw-URL quick start is therefore not a
working installation path. The tested install staged authenticated local scripts
and provisioned the approved SSH key before cloning. Its bootstrap rendezvous was
a validation fixture, not an automatic credential-provisioning feature. Future
updates use the installed wrapper and cached installer, as documented in
[the deployment guide](../PROXMOX_DEPLOYMENT.md). Replacing the cached installer
requires explicitly staging a reviewed version.

## Evidence and reruns

The agreed scope is in [DEPLOYMENT_TEST_PLAN.md](../DEPLOYMENT_TEST_PLAN.md).
Portable commands and test-instance requirements are in [README.md](README.md).
Generated request/response evidence and sanitized command logs remain locally in
the Git-ignored `validation-results/` directory:

- `local-baseline/`: accepted runs, startup/restart metadata and browser observations.
- `proxmox/`: original failure, fresh install, update/custom/profile results,
  each injected failure and recovery, and comparison reports.
- `artifact-manifest.json` and `final-artifact-manifest.json`: script, suite and lockfile hashes during execution and at completion.
- `proxmox/final-guest.json` and `proxmox/final-cluster.json`: final provenance and health.
- `post-merge/browser-check.json`: follow-up Chrome verification resolving the original UI limitation.

Cluster-specific orchestration is retained in the sibling `proxmox` workspace:
`scripts/api_training_validation.py`, `scripts/api_training_scenarios.py`,
`scripts/api_training_extended.py`, and `scripts/api_training_finalize.py`.
These scripts verify the dedicated guest's identity before operating on it.
They are not portable commands for arbitrary production containers.

For an ordinary update in the retained guest, use the installed wrapper:

```sh
COMMUNITY_SCRIPTS_CORE_URL=https://raw.githubusercontent.com/community-scripts/core/cbf119ed58df13cd74450faec727a70052a35f1c \
bash /opt/api-tests-training-service/ct-api-tests-training-service.sh
```

The retained source ref is the tested review branch. After merging the fixes,
pass `var_git_ref=main` once to record `main` for subsequent updates.

The acceptance suite changes synthetic data/configuration and intentionally ends
with admin lockout. Run it only against a dedicated fresh test process, then
restart the service. Entity data, IDs, runtime flags and lockout are intentionally
in memory; the admin token and deployment settings are persistent.
