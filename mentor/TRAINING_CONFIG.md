# Training Mode Configuration (mentors only)

This folder is not served by the service and is not linked from mentee-facing specs.
Do not share it with mentees: the defects below are what they are meant to find.

The service supports granular training mode configuration via environment variables.

## Enable Training Mode

```bash
TRAINING_MODE=true npm start
```

## Feature Flags

Each training feature can be individually enabled/disabled. Features only apply while training mode is enabled.

| Variable | Default | Description |
|----------|---------|-------------|
| `TRAINING_SKIP_TRIM_CREATE` | true | Skip trimming on entity creation (30% chance) |
| `TRAINING_SKIP_TRIM_UPDATE` | true | Skip trimming on entity update (25% chance) |

## Examples

### Training mode with only the update bug
```bash
TRAINING_MODE=true TRAINING_SKIP_TRIM_CREATE=false npm start
```

### Production (training disabled)
```bash
TRAINING_MODE=false npm start
```

## Runtime Reads and Updates

Available over REST only, and only with the admin token. Set `TRAINING_ADMIN_TOKEN`
when starting the service; without it the endpoint does not exist for anyone.

```bash
TRAINING_ADMIN_TOKEN=change-me npm start
```

Send the token as a bearer token:

```bash
curl http://localhost:3000/training-config -H 'Authorization: Bearer change-me'

curl -X PATCH http://localhost:3000/training-config \
  -H 'Authorization: Bearer change-me' \
  -H 'Content-Type: application/json' \
  -d '{"enabled": true, "features": {"skipTrimOnCreate": false}}'
```

Only `enabled` and the feature flags above are accepted, and every value must be a
boolean; anything else is rejected (`400`) and leaves the config unchanged. The full
contract is in [training-config.rest.yaml](training-config.rest.yaml).

| Request | Response |
|---------|----------|
| No `Authorization` header, or no `TRAINING_ADMIN_TOKEN` on the server | Express default `404 Cannot GET /training-config` (same as any unknown path); not counted as a failed attempt |
| Wrong bearer token | `401`; counted as a failed attempt |
| 5 wrong tokens from the same client IP within 15 minutes | `429` until the window ends, even with the right token |

Known exposure: any `Authorization` header (for example Postman collection-level auth)
gets the `401`, which reveals the route, and 5 of them from a mentee sharing your IP
(classroom NAT, same bridge) lock you out for 15 minutes. Call from a separate address
if that matters.

> **Reverse proxies:** clients are identified by the socket address (Express `trust proxy` is off). Behind a reverse proxy or TLS terminator every client shares the proxy's address, so 5 bad attempts from anyone would lock out the admin for 15 minutes. If you put a proxy in front, set `app.set('trust proxy', <proxy address>)` in `src/index.ts` so `req.ip` is the real client address. Runtime changes are kept in memory only and reset on restart.

## Removed From the Mentee-Facing API

These were public before and are gone so mentees cannot discover training mode:

- GraphQL `trainingMode`, `trainingConfig` and `updateTrainingConfig` (and the
  `TrainingConfig`, `TrainingFeatures`, `TrainingConfigInput`, `TrainingFeaturesInput` types).
- The `/training-config` paths from `api-rest.yaml` (now in [training-config.rest.yaml](training-config.rest.yaml)).
- Former requirement Req-10 from `REQUIREMENTS.md`:

  > The service should support training mode for identifying issues
  > - Training mode can be enabled via TRAINING_MODE environment variable
  > - In training mode, service may introduce intentional bugs for trainees to find
  > - Training mode status should be queryable via GraphQL (no longer applies: mentor REST only)
