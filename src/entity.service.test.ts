import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityService, EntityInput } from './entity.service';

test('update replaces the entity: omitted size is removed', () => {
  const service = new EntityService();
  const { entity } = service.create({ name: 'a', size: 5 });
  const result = service.update(entity!.id, { name: 'b' });
  assert.deepEqual(result.entity, { id: entity!.id, name: 'b' });
});

test('null size is treated as absent, not rejected', () => {
  const service = new EntityService();
  const withNull = { name: 'x', size: null } as unknown as EntityInput;
  const created = service.create(withNull);
  assert.deepEqual(created, { entity: { id: 1, name: 'x' } });
  service.update(1, { name: 'x', size: 5 });
  assert.deepEqual(service.update(1, withNull), { entity: { id: 1, name: 'x' } });
});

test('zero size is valid on create and update', () => {
  const service = new EntityService();
  assert.deepEqual(service.create({ name: 'x', size: 0 }), { entity: { id: 1, name: 'x', size: 0 } });
  service.update(1, { name: 'x', size: 5 });
  assert.deepEqual(service.update(1, { name: 'y', size: 0 }), { entity: { id: 1, name: 'y', size: 0 } });
});

test('invalid size is still rejected', () => {
  const service = new EntityService();
  assert.equal(service.create({ name: 'x', size: -1 }).errors?.[0].field, 'size');
  const wrongType = { name: 'x', size: '1' } as unknown as EntityInput;
  assert.equal(service.create(wrongType).errors?.[0].field, 'size');
});

test('non-finite sizes cannot be created or replace an existing entity', () => {
  const service = new EntityService();
  const original = service.create({ name: 'original', size: 5 }).entity!;
  for (const size of [Infinity, -Infinity, NaN]) {
    assert.equal(service.create({ name: 'invalid', size }).errors?.[0].field, 'size');
    assert.deepEqual(service.getAll(), [original]);
    assert.equal(service.update(original.id, { name: 'invalid', size }).errors?.[0].field, 'size');
    assert.deepEqual(service.getAll(), [original]);
  }
  assert.equal(service.create({ name: 'next', size: 0 }).entity?.id, 2);
});
