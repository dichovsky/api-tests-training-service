# Training Mode Configuration

The service supports granular training mode configuration via environment variables.

## Enable Training Mode

```bash
TRAINING_MODE=true npm start
```

## Feature Flags

All training features can be individually enabled/disabled:

| Variable | Default | Description |
|----------|---------|-------------|
| `TRAINING_SKIP_TRIM_CREATE` | true | Skip trimming on entity creation (20% chance) |
| `TRAINING_SKIP_TRIM_UPDATE` | true | Skip trimming on entity update (25% chance) |
| `TRAINING_FLAKY` | true | Enable flaky endpoint with random failures |
| `TRAINING_RATE_LIMIT` | true | Enable rate limiting |
| `TRAINING_SLOW` | true | Enable slow endpoint delays |
| `TRAINING_PAGINATION` | true | Enable pagination edge cases |
| `TRAINING_BULK_FAIL` | true | Enable partial failures in bulk operations |
| `TRAINING_GRAPHQL_LIMIT` | true | Enable GraphQL complexity limits |

## Examples

### Disable all training features
```bash
TRAINING_MODE=true TRAINING_SKIP_TRIM_CREATE=false TRAINING_SKIP_TRIM_UPDATE=false npm start
```

### Enable only flaky behavior
```bash
TRAINING_MODE=true TRAINING_SKIP_TRIM_CREATE=false TRAINING_SKIP_TRIM_UPDATE=false TRAINING_FLAKY=true TRAINING_RATE_LIMIT=false npm start
```

### Production (training disabled)
```bash
TRAINING_MODE=false npm start
```

## Configuration File

Create `.env` file:
```env
TRAINING_MODE=true
TRAINING_SKIP_TRIM_CREATE=true
TRAINING_SKIP_TRIM_UPDATE=true
TRAINING_FLAKY=true
TRAINING_RATE_LIMIT=true
TRAINING_SLOW=true
```

## Proxmox Deployment

Update `ct-api-tests-training-service.sh` to expose variables:
```bash
var_training_skip_trim_create="${var_training_skip_trim_create:-true}"
var_training_flaky="${var_training_flaky:-true}"
```
