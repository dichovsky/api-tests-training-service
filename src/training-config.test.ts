import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EntityService, TrainingConfigManager } from './entity.service';
import { checkAdminToken } from './admin-auth';

const manager = TrainingConfigManager.getInstance();
const baseline = { enabled: false, features: { skipTrimOnCreate: true, skipTrimOnUpdate: true } };

test('invalid config updates are rejected and leave the config unchanged', () => {
  manager.updateConfig(baseline);
  const invalid: unknown[] = [
    { enabled: 'yes' },
    { enabled: null },
    { features: 'ab' },
    { features: { skipTrimOnCreate: null } },
    { features: { flakyEndpoint: true } },
    { evil: 1 },
    [],
    null,
    'enabled',
  ];
  for (const input of invalid) {
    const result = manager.updateConfig(input);
    assert.ok(result.errors?.length, `expected errors for ${JSON.stringify(input)}`);
    assert.equal(result.config, undefined);
    assert.deepEqual(manager.getConfig(), baseline);
  }
});

test('a valid partial update only changes the given values', () => {
  manager.updateConfig(baseline);
  try {
    assert.deepEqual(manager.updateConfig({ enabled: true }).config, { ...baseline, enabled: true });
    assert.deepEqual(manager.updateConfig({ features: { skipTrimOnUpdate: false } }).config, {
      enabled: true,
      features: { skipTrimOnCreate: true, skipTrimOnUpdate: false },
    });
  } finally {
    manager.updateConfig(baseline);
  }
});

test('skipTrimOnCreate controls whether training mode skips trimming', () => {
  mock.method(Math, 'random', () => 0);
  try {
    const service = new EntityService();
    manager.updateConfig({ enabled: true, features: { skipTrimOnCreate: true } });
    assert.equal(service.create({ name: ' a ' }).entity?.name, ' a ');
    manager.updateConfig({ features: { skipTrimOnCreate: false } });
    assert.equal(service.create({ name: ' a ' }).entity?.name, 'a');
  } finally {
    mock.restoreAll();
    manager.updateConfig(baseline);
  }
});

test('config updates are disabled when no admin token is configured', () => {
  assert.equal(checkAdminToken('Bearer anything', undefined), 'disabled');
  assert.equal(checkAdminToken('Bearer ', ''), 'disabled');
});

test('config updates require the exact bearer token', () => {
  assert.equal(checkAdminToken('Bearer s3cret', 's3cret'), 'ok');
  assert.equal(checkAdminToken(undefined, 's3cret'), 'unauthorized');
  assert.equal(checkAdminToken('Bearer wrong', 's3cret'), 'unauthorized');
  assert.equal(checkAdminToken('s3cret', 's3cret'), 'unauthorized');
  assert.equal(checkAdminToken('Bearer s3cret2', 's3cret'), 'unauthorized');
});
