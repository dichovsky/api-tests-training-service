import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildSchema } from 'graphql';

// Training config is mentor-only: nothing the service serves to mentees may mention it.
const SERVED_SPECS = ['api-rest.yaml', 'api-graphql.graphql', 'api-graphql.md', 'REQUIREMENTS.md'];
const TRAINING_LEAK = /training[ _-]?(mode|config|features)|trainingMode|TRAINING_|intentional|skipTrim/i;
const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf-8');

for (const file of SERVED_SPECS) {
  test(`served spec ${file} does not mention training config`, () => {
    assert.doesNotMatch(read(file), TRAINING_LEAK);
  });
}

test('the GraphQL schema has no training types or fields', () => {
  const schema = buildSchema(read('api-graphql.graphql'));
  const names = Object.values(schema.getTypeMap()).flatMap(type =>
    [type.name, ...('getFields' in type ? Object.keys(type.getFields()) : [])]);
  assert.deepEqual(names.filter(name => /training|skipTrim/i.test(name)), []);
});
