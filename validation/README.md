# Service acceptance checks

The same HTTP suite runs against local and deployed services. It creates and
deletes entities, changes runtime training settings, and deliberately locks out
admin writes at the end. Use a dedicated test instance with an empty initial
entity store; restart it after testing to clear runtime state.

## Local baseline

```sh
npm ci --include=dev
npm test
npx tsc --noEmit
npm run test:local
```

The local runner starts the application through `npm run start` on available
ports. It tests production and development environments, no-token behavior,
startup training flags, and restart resets, then stops its own processes.
Evidence is saved under `validation-results/local-<timestamp>/`. Set `RUN_DIR`
to choose a different output directory. These files survive the normal build
cleanup; generated evidence is excluded from Git.

## An already running service

Provide its URL and admin token through environment variables, then run:

```sh
BASE_URL=http://<test-host>:3000 \
RESULT_PATH=validation-results/deployed.json \
npm run test:service
```

`TRAINING_ADMIN_TOKEN` must already be set in the invoking environment. The
runner never prints it or records authorization headers. Do not paste a real
token into committed scripts or test reports.

Default mode is `SUITE_MODE=full`: training disabled, both defect flags enabled,
and a configured admin token. Additional modes:

- `SUITE_MODE=no-token`: start the service without its admin token; writes to
  training configuration must be disabled.
- `SUITE_MODE=startup-training`: exercise the chosen startup settings. Use
  `EXPECT_TRAINING_ENABLED=true`, `EXPECT_SKIP_TRIM_CREATE=false`, and
  `EXPECT_SKIP_TRIM_UPDATE=false` for training enabled with defects disabled.

`SOURCE_ROOT` optionally selects the checkout containing the expected packaged
specification files. The default is this checkout. Only the server's lifecycle
differs between environments; the HTTP assertions are shared.

## Compare results

```sh
node validation/compare-results.mjs \
  validation-results/local-<timestamp>/normal.json \
  validation-results/deployed.json \
  validation-results/comparison.json
```

Both runs must pass, use the same suite and startup settings, and serve matching
documentation. Comparison preserves status codes, content types and response
contracts while excluding host addresses, timings, generated ID values, and
allowed random training whitespace. The suite separately checks identifier
types and uniqueness. Failures produce a nonzero process exit and retain their
request/response evidence.

Deployment-script checks that need no Proxmox host:

```sh
bash -n ct-api-tests-training-service.sh install-api-tests-training-service.sh
python3 scripts/test-deployment-scripts.py
```

Real deployment acceptance additionally requires installation, update, recovery,
systemd, guest restart and browser checks. Passing HTTP checks alone does not
establish that those lifecycle paths work.
