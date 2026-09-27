# Training Mode Configuration

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

## Runtime Updates

The current config is readable by anyone:

- REST: `GET /training-config`
- GraphQL: `query { trainingConfig { enabled features { skipTrimOnCreate skipTrimOnUpdate } } }`

Changing it at runtime requires an admin token. Set `TRAINING_ADMIN_TOKEN` when starting the service; without it, runtime updates are disabled (`403` / GraphQL `FORBIDDEN`).

```bash
TRAINING_ADMIN_TOKEN=change-me npm start
```

Send the token as a bearer token. Only `enabled` and the feature flags above are accepted, and every value must be a boolean; anything else is rejected (`400` / GraphQL error) and leaves the config unchanged.

```bash
curl -X PATCH http://localhost:3000/training-config \
  -H 'Authorization: Bearer change-me' \
  -H 'Content-Type: application/json' \
  -d '{"enabled": true, "features": {"skipTrimOnCreate": false}}'
```

```graphql
mutation {
  updateTrainingConfig(config: { enabled: true, features: { skipTrimOnCreate: false } }) {
    enabled
  }
}
```

A missing or wrong token returns `401` (GraphQL `UNAUTHENTICATED`). After 5 wrong tokens from the same client IP within 15 minutes, that client gets `429` (GraphQL `RATE_LIMITED`) until the window ends, even with the right token. REST and GraphQL share the count.

> **Reverse proxies:** clients are identified by the socket address (Express `trust proxy` is off). Behind a reverse proxy or TLS terminator every client shares the proxy's address, so 5 bad attempts from anyone would lock out the admin for 15 minutes. If you put a proxy in front, set `app.set('trust proxy', <proxy address>)` in `src/index.ts` so `req.ip` is the real client address. Runtime changes are kept in memory only and reset on restart.
