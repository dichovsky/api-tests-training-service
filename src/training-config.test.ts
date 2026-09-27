import { test } from 'node:test';
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

for (const enabled of [false, true]) {
  for (const skipTrimOnCreate of [false, true]) {
    for (const skipTrimOnUpdate of [false, true]) {
      test(`trimming respects independent flags: enabled=${enabled}, create=${skipTrimOnCreate}, update=${skipTrimOnUpdate}`, (t) => {
        // Zero always selects the intentional defect when its flag is active.
        t.mock.method(Math, 'random', () => 0);
        manager.updateConfig({ enabled, features: { skipTrimOnCreate, skipTrimOnUpdate } });
        try {
          const service = new EntityService();
          const created = service.create({ name: ' created ' }).entity!;
          assert.equal(created.name, enabled && skipTrimOnCreate ? ' created ' : 'created');
          const updated = service.update(created.id, { name: ' updated ' }).entity!;
          assert.equal(updated.name, enabled && skipTrimOnUpdate ? ' updated ' : 'updated');
          assert.deepEqual(service.getById(created.id), updated);
        } finally {
          manager.updateConfig(baseline);
        }
      });
    }
  }
}

for (const operation of ['create', 'update'] as const) {
  test(`${operation} training defect has the documented probability boundary`, (t) => {
    const threshold = operation === 'create' ? 0.3 : 0.25;
    let randomValue = 0;
    t.mock.method(Math, 'random', () => randomValue);
    manager.updateConfig({ enabled: true, features: { skipTrimOnCreate: true, skipTrimOnUpdate: true } });
    try {
      const service = new EntityService();
      const existing = service.create({ name: 'initial' }).entity!;
      for (const value of [0, threshold - 0.000001, threshold, 0.999999]) {
        randomValue = value;
        const result = operation === 'create'
          ? service.create({ name: ' name ' })
          : service.update(existing.id, { name: ' name ' });
        assert.equal(result.entity?.name, value < threshold ? ' name ' : 'name', `Math.random()=${value}`);
      }
    } finally {
      manager.updateConfig(baseline);
    }
  });
}

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
