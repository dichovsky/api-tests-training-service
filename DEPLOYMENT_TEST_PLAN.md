# Local baseline and Proxmox deployment validation

Status: execution finished. Local and deployed functional/lifecycle checks passed;
follow-up Chrome checks also verified the Apollo Sandbox UI in both environments. Results are retained under
`validation-results/` and summarized in [validation/REPORT.md](validation/REPORT.md).

## Goal and agreed decisions

Establish a correct, reproducible local baseline using `npm run start`, then run
the same service acceptance suite after Proxmox installation and scripted
updates. Matching an existing defect is not a pass: resolve unexpected failures
and rerun the affected checks before accepting a baseline.

- Create a dedicated LXC on `pve3`, subject to a fresh health/capacity check, and
  leave the verified service running when validation finishes.
- Include real version advancement, repeated updates, stopped-service updates,
  controlled failures, and recovery.
- `size: 0` is valid. Align prose with the existing non-negative-number contract;
  also document the existing acceptance of null as an absent optional size.
- Intentional training defects are expected only when their flags are enabled.
- Test data is synthetic. Entity data, runtime training configuration, and
  authentication lockout state are expected to reset on process restart.
- The generated admin token and persistent deployment settings must survive
  ordinary updates and guest restarts.

## Evidence from inspection

Initial application revision: `b65f5777eb2d4f7a4af483f329769ae69b9c8473`.
The only pre-existing tracked modification was `.vscode/settings.json`; preserve it.
Local tools observed: Node `24.21.0`, npm `12.1.0`.

There are 13 unit tests and no running-service integration suite. `npm run start`
builds before starting; the build deletes `dist`, `coverage`, and `test-results`.
The deployed systemd unit instead runs compiled JavaScript, and installation
prunes development dependencies. Both launch paths need validation.

Read-only cluster discovery found three online nodes, quorum, four existing
guests (100, 101, 107, 108), and no guests on `pve3`. Refresh these observations,
Ceph health, active tasks, networking, storage, and capacity before provisioning.
Use a newly allocated guest ID; do not reuse an existing workload's identity.

Static inspection predicts a fresh-install blocker with Community Scripts core
`cbf119ed58df13cd74450faec727a70052a35f1c`: `build_container()` fetches
`install/apiteststrainingservice-install.sh` from the upstream ProxmoxVE
repository before the wrapper reaches its custom installer. That file returned
404. Verify the actual entry point, capture its result, correct the integration,
and rerun. This is a source finding, not a completed deployment test.

## Reusable test runner and evidence

Add a dependency-light Node `.mjs` acceptance runner that accepts a base URL and reads
its admin token from the environment. Keep service requests and assertions
identical across environments. Separate lifecycle operations (start, stop,
restart, install, update, recovery) into local and Proxmox orchestration.
Using `.mjs` avoids changing TypeScript's inferred source root and compiled
entrypoint by adding TypeScript files outside `src`.

Use isolated, ordered scenarios and fresh processes where required. Run lockout
tests last within a process so they cannot invalidate later authorized checks.
Restore configuration after scenarios; clean up created entities by recorded ID.

Store timestamped evidence under `validation-results/<run-id>/`, outside the
build-cleaned directories, and exclude generated artifacts from ordinary Git
changes. Keep a concise, reviewable report and the reusable plan/tests in the
repository. Capture:

- Application commit, working-tree patch fingerprint when applicable, lockfile
  hash, test-suite revision/hash, script/helper hashes, OS and Node/npm versions.
- Non-secret settings, lifecycle command exit codes, sanitized logs, readiness
  observations, individual assertions, and an overall pass/fail result.
- Sanitized request/response evidence and a comparison report identifying
  unexpected differences rather than merely comparing whole response snapshots.

Never record tokens, authorization headers, or complete secret environment files.
Verify token preservation by private comparison and report only the result.
Retain actual failing observations; retries may poll readiness but must not hide
failed assertions. Bound startup readiness at 60 seconds after launching the
server process, separately from dependency installation and compilation. After
systemd starts/restarts the service, confirm sustained readiness beyond its
10-second automatic-restart interval and check that it is not crash-looping.

## Shared service acceptance suite

| Area | Required checks |
| --- | --- |
| Startup | REST and GraphQL respond; no startup exception; startup assets present; normal and production environments behave as documented |
| REST entities | Empty initial state; create/list/read/replace/delete; unique IDs; trimmed names; missing IDs; failed writes leave state unchanged |
| Validation | Missing, empty, whitespace-only and wrong-type names; omitted/null/zero/positive decimal/negative/wrong-type size; malformed request bodies |
| Replacement | Omitting size on replacement removes the prior value; null size is treated as absent |
| GraphQL | Queries and mutations; schema validation; missing/invalid IDs; meaningful errors; no leaked stack traces; introspection remains available in production |
| Shared state | Create through REST, read/update through GraphQL, verify/delete through REST, and exercise the reverse direction |
| Training configuration | Public reads; authorized partial updates across both APIs; invalid/unknown fields rejected without partial mutation; startup flags and runtime toggles respected |
| Admin authorization | No-token startup disables writes; missing/wrong token rejected; correct token works; five failed attempts share a lockout across REST and GraphQL; reads remain available |
| Training behavior | Disabled mode always trims; enabled mode with both defect flags off always trims; deterministic unit checks exercise create and update defects; enabled random behavior permits only the documented outcomes |
| Documentation | Root page, all API-spec pages/downloads, legacy redirect, and deployed assets match the tested revision; browser checks render Swagger and GraphQL Sandbox and execute a request |
| Restart | Entities and ID sequence reset; runtime flags return to startup settings; auth lockout clears; both APIs recover |

Assert each interface's actual contract: REST IDs are numbers and absent size is
omitted; GraphQL IDs are strings and selected absent size is null. Normalize
these known differences only for cross-interface comparisons. Inspect GraphQL
error bodies and codes as well as HTTP status.

Do not require identical random training sequences or exact error stack/layout
text between environments. Verify limiter expiry deterministically in unit tests;
verify actual shared lockout and restart reset against the running service.

## Execution order

1. **Prepare and validate locally.** Refresh source identity, preserve unrelated
   edits, align size documentation, add the reusable suite, run `npm ci --include=dev`,
   type-check, unit tests, and build. Start through `npm run start` on an available
   local port with explicit settings, including a private admin token. Scope
   `NODE_ENV=production` to runtime so build dependencies are available. Run the
   shared suite and required restart/no-token/training variants. Inspect the
   documentation in a browser. Save the first accepted baseline only after all
   unexpected failures are resolved.
2. **Preflight and fresh Proxmox install.** Refresh inventory and infrastructure
   health. Use the documented wrapper on `pve3` with Debian 13, an unprivileged
   guest, 2 CPUs, 1 GiB RAM, 4 GiB disk, LAN access, port 3000, and training off.
   Select healthy available storage and bridge from live discovery. Follow the
   provisioning task to completion and inspect guest state. Capture any script
   failure and correct/retest it; do not count a manually installed application
   as proof that the wrapper works.
3. **Verify installed service.** Record installed revisions, systemd settings,
   production dependencies, token-file ownership/mode, guest address, and logs.
   Probe within the guest and from this workstation. Run the complete shared
   suite against the installed address and compare it with the accepted local
   baseline for the same source revision and settings.
4. **Verify a real update.** Save a recovery checkpoint of this test guest.
   Prepare the older application revision
   `caa41dac260098d5f6c6cc36caa0fc62aceb6aa9` as a controlled fixture; it predates
   admin throttling and final REST-spec changes. Verify its compatible behavior,
   then execute the actual updater to the target revision. Assert commit
   advancement and an observable new behavior/spec change, followed by the full
   current acceptance suite. Preparing the fixture is not a claim that the
   installer supports selecting historical revisions.
5. **Verify repeatability and configuration.** Repeat an update at the same
   revision, update while the service is stopped, and reinstall with the same
   settings. Check token retention and permissions, enabled service state, and
   dependency pruning. Exercise documented custom path, port, and training mode
   with isolated recoverable fixtures and verify how the documented update
   command finds and retains those settings; run the documented bare command
   after a custom-path install rather than concealing a discovery bug by
   re-supplying the path. Verify the documented manual update
   sequence as a separate path. Return the retained guest to default settings.
6. **Exercise failures and recover.** In the new test guest only, induce missing
   installation/Git metadata, source-download/fetch failure, dependency-install
   failure, build failure, and startup failure separately. Use reversible local
   fixtures; do not break host networking or external repositories. Capture exit
   status, messages, service availability, and files/state left behind. Require
   failure to be reported truthfully, persistent token/settings to be preserved,
   and a demonstrated recovery to the recorded good revision. Existing scripts
   do not promise automatic rollback; a tested explicit recovery is acceptable.
   Rerun the full service suite after recovery. Keep control of Community Scripts
   prompts so timeout cleanup cannot unexpectedly remove the test guest.
7. **Restart and finish.** Crash the application process in the test guest and
   verify systemd's configured automatic recovery. Restart the guest, verify
   systemd auto-start and all
   expected reset/preservation behavior, and run the shared suite once more.
   Remove failure fixtures, restore training-off defaults, and perform a final
   clean service restart to clear entities, runtime changes, and auth lockout.
   Use read-only final probes and leave the service running. Report its address, exact source revision,
   results by phase, remaining limitations, and repeatable test commands.

## Source changes and deployment claims

Exercise the documented entry points and record the actual mutable upstream
inputs. Detect revision drift: local/deployed comparisons require matching
application content. If fixes alter application behavior or packaged docs,
regenerate the accepted local baseline before comparing deployment results.

Prepare, review, and test necessary fixes in the service repository and test
guest. Keep original-failure evidence separate from successful corrected runs.
If completing the published quick-start path requires publishing or merging a
fix, prepare the concrete tested change first and obtain any outstanding
publication approval at that point. A locally patched deployment must be labeled
as such until the published entry point uses the same tested contents.

## Completion criteria and boundaries

Completion requires an accepted local baseline; successful scripted fresh
installation, real/repeat/stopped-service updates, recovery, and guest restart;
matching functional results; preserved persistent configuration; and a final
running service. Report blocked or failing phases honestly rather than declaring
success based on command output or matching local defects.

Docker deployment, public exposure/TLS setup, performance/load certification,
new persistent entity storage, and host maintenance are outside this task. Do
not restart cluster nodes or modify existing workloads. Browser dependency
failures must be distinguished from backend failures and reported explicitly.
