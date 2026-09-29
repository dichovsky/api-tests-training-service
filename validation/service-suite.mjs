import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fields = 'id name size';
const baselineConfig = { enabled: false, features: { skipTrimOnCreate: true, skipTrimOnUpdate: true } };
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = entity => entity == null ? entity : {
  id: Number(entity.id), name: entity.name, ...(entity.size == null ? {} : { size: entity.size }),
};

/** Exercise an already running, isolated service. Never starts or stops it. */
export async function runSuite(options = {}) {
  const baseUrl = (options.baseUrl || process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const token = options.token ?? process.env.TRAINING_ADMIN_TOKEN ?? '';
  const mode = options.mode || process.env.SUITE_MODE || 'full';
  const resultPath = options.resultPath || process.env.RESULT_PATH;
  const sourceRoot = options.sourceRoot ?? process.env.SOURCE_ROOT ?? repoRoot;
  const envBoolean = (keys, fallback) => {
    const value = keys.map(key => process.env[key]).find(value => value !== undefined);
    return value === undefined ? fallback : value === 'true';
  };
  const expectedConfig = options.expectedConfig || {
    enabled: envBoolean(['EXPECTED_TRAINING_MODE', 'EXPECT_TRAINING_ENABLED'], mode === 'startup-training'),
    features: {
      skipTrimOnCreate: envBoolean(['EXPECTED_SKIP_TRIM_CREATE', 'EXPECT_SKIP_TRIM_CREATE'], true),
      skipTrimOnUpdate: envBoolean(['EXPECTED_SKIP_TRIM_UPDATE', 'EXPECT_SKIP_TRIM_UPDATE'], true),
    },
  };
  assert.ok(['full', 'no-token', 'startup-training'].includes(mode), 'Unknown SUITE_MODE');
  assert.ok(/^https?:\/\//.test(baseUrl), 'BASE_URL must be an HTTP(S) URL');
  assert.ok(!new URL(baseUrl).username && !new URL(baseUrl).password, 'BASE_URL must not contain credentials');
  if (mode === 'full') assert.ok(token, 'TRAINING_ADMIN_TOKEN is required for the full suite');
  const secrets = [token].filter(Boolean);
  const sanitize = value => {
    let text = JSON.stringify(value);
    for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
    return JSON.parse(text);
  };
  const report = {
    schemaVersion: 1, startedAt: new Date().toISOString(), baseUrl, mode,
    expectedConfig, runtime: { node: process.version, platform: process.platform, arch: process.arch },
    suiteHash: hash(await readFile(fileURLToPath(import.meta.url))),
    sourceAssets: {}, assertions: [], requests: [], observations: {},
  };
  const created = new Set();
  let currentCase = 'setup';

  async function request(method, path, body, settings = {}) {
    const requestEvidence = { case: currentCase, method, path };
    if (body !== undefined) requestEvidence.body = body;
    const started = performance.now();
    try {
      const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...settings.headers };
      if (settings.auth !== undefined) headers.Authorization = settings.auth;
      const response = await fetch(baseUrl + path, {
        method, headers, body: body === undefined ? undefined : settings.raw ? body : JSON.stringify(body),
        redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      const result = {
        status: response.status, data, text,
        headers: Object.fromEntries(['content-type', 'content-disposition', 'location']
          .flatMap(name => response.headers.has(name) ? [[name, response.headers.get(name)]] : [])),
      };
      report.requests.push(sanitize({ ...requestEvidence, elapsedMs: Math.round(performance.now() - started),
        response: { status: result.status, headers: result.headers, body: data } }));
      return result;
    } catch (error) {
      report.requests.push(sanitize({ ...requestEvidence, elapsedMs: Math.round(performance.now() - started), error: error.message }));
      throw error;
    }
  }
  async function check(name, fn) {
    currentCase = name;
    const started = performance.now();
    try {
      await fn();
      report.assertions.push({ name, status: 'passed', elapsedMs: Math.round(performance.now() - started) });
    } catch (error) {
      report.assertions.push(sanitize({ name, status: 'failed', elapsedMs: Math.round(performance.now() - started), error: error.message }));
    }
  }
  function json(result, expectedStatus = 200) {
    assert.equal(result.status, expectedStatus);
    assert.match(result.headers['content-type'] || '', /application\/json/);
    return result.data;
  }
  const bearer = 'Bearer ' + token;
  const gql = (query, variables = {}, auth) => request('POST', '/graphql', { query, variables }, { auth });
  function graphData(result) {
    const body = json(result);
    assert.equal(body.errors, undefined, JSON.stringify(body.errors));
    assert.ok(body.data && typeof body.data === 'object');
    return body.data;
  }
  function graphError(result, { status = 200, code, message } = {}) {
    const body = json(result, status);
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0, 'Expected GraphQL errors');
    for (const error of body.errors) {
      assert.ok(typeof error.message === 'string' && error.message.length > 0, 'Meaningful error message');
      assert.equal(error.extensions?.stacktrace, undefined, 'Must not expose a stack trace');
      assert.doesNotMatch(error.message, /(?:\/Users\/|\/opt\/|node_modules\/)/);
    }
    if (code) assert.equal(body.errors[0].extensions?.code, code);
    if (message) assert.match(body.errors[0].message, message);
    return body;
  }
  const restAll = async () => json(await request('GET', '/entities'));
  // Training config is mentor-only: REST with the admin token, absent from GraphQL and the served specs.
  const restConfig = async () => json(await request('GET', '/training-config', undefined, { auth: bearer }));
  async function patchConfig(config) {
    return json(await request('PATCH', '/training-config', config, { auth: bearer }));
  }
  // Hidden means byte-for-byte the Express default 404 for an unknown path.
  async function assertHidden(method, auth) {
    const response = await request(method, '/training-config', method === 'PATCH' ? { enabled: true } : undefined, { auth });
    assert.equal(response.status, 404);
    assert.match(response.text, new RegExp('Cannot ' + method + ' /training-config'));
  }
  const trainingLeak = /training[ _-]?(mode|config|features)|trainingMode|TRAINING_|intentional|skipTrim/i;
  async function createRest(input) {
    const entity = json(await request('POST', '/entities', input), 201);
    assert.equal(typeof entity.id, 'number');
    assert.ok(Number.isInteger(entity.id) && entity.id > 0);
    created.add(entity.id);
    return entity;
  }
  async function createGraph(input) {
    const entity = graphData(await gql('mutation($input: EntityInput!) { createEntity(input:$input) { ' + fields + ' } }', { input })).createEntity;
    assert.equal(typeof entity.id, 'string');
    assert.ok(Number.isInteger(Number(entity.id)) && Number(entity.id) > 0);
    created.add(Number(entity.id));
    return entity;
  }
  const updateGraph = (id, input) => gql('mutation($id:ID!, $input:EntityInput!) { updateEntity(id:$id,input:$input) { ' + fields + ' } }', { id: String(id), input });
  const getGraph = id => gql('query($id:ID!) { entity(id:$id) { ' + fields + ' } }', { id: String(id) });
  const deleteGraph = id => gql('mutation($id:ID!) { deleteEntity(id:$id) { ' + fields + ' } }', { id: String(id) });
  async function unchanged(operation) {
    const before = await restAll();
    await operation();
    assert.deepEqual(await restAll(), before, 'Rejected operation must leave entities unchanged');
  }
  async function configUnchanged(operation) {
    const before = await restConfig();
    await operation();
    assert.deepEqual(await restConfig(), before, 'Rejected operation must leave config unchanged');
  }
  async function cleanup() {
    for (const id of created) {
      const response = await request('DELETE', '/entities/' + id);
      assert.ok([200, 404].includes(response.status), 'Cleanup delete failed: ' + id);
    }
    assert.deepEqual(await restAll(), []);
  }

  await check('startup: REST empty initial state', async () => assert.deepEqual(await restAll(), []));
  await check('startup: GraphQL empty initial state', async () => {
    assert.deepEqual(graphData(await gql('{ entities { ' + fields + ' } }')).entities, []);
  });
  if (mode !== 'no-token') {
    await check('startup: REST environment configuration', async () => assert.deepEqual(await restConfig(), expectedConfig));
  }
  await check('hidden: GraphQL schema has no training types or fields', async () => {
    const { types } = graphData(await gql('{ __schema { types { name fields { name } inputFields { name } } } }')).__schema;
    const names = types.flatMap(type => [type.name, ...(type.fields ?? []).map(f => f.name), ...(type.inputFields ?? []).map(f => f.name)]);
    assert.deepEqual(names.filter(name => /training|skipTrim/i.test(name)), []);
  });
  await check('hidden: GraphQL rejects the removed training operations', async () => {
    graphError(await gql('{ trainingMode }'), { status: 400, code: 'GRAPHQL_VALIDATION_FAILED' });
    graphError(await gql('mutation { updateTrainingConfig(config:{enabled:true}) { enabled } }', {}, bearer), { status: 400, code: 'GRAPHQL_VALIDATION_FAILED' });
  });
  await check('hidden: repeated no-token requests look like an unknown path and never lock out', async () => {
    for (let i = 0; i < 6; i++) await assertHidden(i % 2 ? 'PATCH' : 'GET', undefined);
    await assertHidden('OPTIONS', undefined);
    if (mode !== 'no-token') assert.deepEqual(await restConfig(), expectedConfig);
  });
  await check('startup: introspection available', async () => {
    const schema = graphData(await gql('{ __schema { queryType { name } mutationType { name } } }')).__schema;
    assert.deepEqual(schema, { queryType: { name: 'Query' }, mutationType: { name: 'Mutation' } });
  });

  const docs = [
    ['/', 'Entities API', 'text/html'],
    ['/api-specs', 'API Specifications', 'text/html'],
    ['/api-specs/requirements', 'Requirements', 'text/html'],
    ['/api-specs/graphql', 'GraphQL Schema', 'text/html'],
    ['/api-specs/graphql.md', 'GraphQL Documentation', 'text/html'],
    ['/graphql', 'apollo', 'text/html'],
  ];
  for (const [path, marker, mime] of docs) {
    await check('docs: page ' + path, async () => {
      const response = await request('GET', path, undefined, { headers: { Accept: 'text/html' } });
      assert.equal(response.status, 200);
      assert.ok((response.headers['content-type'] || '').includes(mime));
      assert.ok(response.text.toLowerCase().includes(marker.toLowerCase()));
    });
  }
  await check('docs: requirements legacy redirect', async () => {
    const response = await request('GET', '/requirements');
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/api-specs/requirements');
  });
  const assets = [
    ['/api-specs/rest', 'api-rest.yaml', 'text/yaml', false],
    ['/api-specs/rest.yaml', 'api-rest.yaml', 'application/x-yaml', true],
    ['/api-specs/graphql.graphql', 'api-graphql.graphql', 'text/plain', true],
    ['/api-specs/REQUIREMENTS.md', 'REQUIREMENTS.md', 'text/markdown', true],
  ];
  for (const [path, file, mime, attachment] of assets) {
    await check('docs: asset ' + path, async () => {
      const response = await request('GET', path);
      assert.equal(response.status, 200);
      assert.ok((response.headers['content-type'] || '').includes(mime));
      if (attachment) assert.equal(response.headers['content-disposition'], 'attachment; filename="' + file + '"');
      report.sourceAssets[file] = { servedHash: hash(response.text) };
      if (sourceRoot) {
        const local = await readFile(resolve(sourceRoot, file), 'utf8');
        report.sourceAssets[file].sourceHash = hash(local);
        assert.equal(response.text, local, 'Served asset differs from tested source: ' + file);
      }
    });
  }
  for (const path of ['/', '/api-specs', '/api-specs/requirements', '/api-specs/REQUIREMENTS.md', '/api-specs/rest.yaml',
    '/api-specs/graphql', '/api-specs/graphql.graphql', '/api-specs/graphql.md']) {
    await check('hidden: served spec ' + path + ' has no training mentions', async () => {
      const response = await request('GET', path);
      assert.equal(response.status, 200);
      assert.doesNotMatch(response.text, trainingLeak);
    });
  }
  if (sourceRoot) {
    const escapeHtml = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    for (const [path, file] of [['/api-specs/graphql.md', 'api-graphql.md'], ['/api-specs/requirements', 'REQUIREMENTS.md'], ['/api-specs/graphql', 'api-graphql.graphql']]) {
      await check('docs: embedded content ' + file, async () => {
        const source = await readFile(resolve(sourceRoot, file), 'utf8');
        const response = await request('GET', path);
        assert.equal(response.status, 200);
        assert.ok(response.text.includes(escapeHtml(source)), 'Rendered source mismatch: ' + file);
        report.sourceAssets[file] ??= {};
        report.sourceAssets[file].sourceHash = hash(source);
        report.sourceAssets[file].embeddedMatches = true;
      });
    }
  }

  if (mode === 'no-token') {
    await check('no server token: training config hidden even with a bearer token', async () => {
      for (let i = 0; i < 6; i++) await assertHidden(i % 2 ? 'PATCH' : 'GET', 'Bearer synthetic-disabled-token');
    });
  }

  if (mode === 'full') {
    await check('contract: full baseline has training disabled', async () => assert.deepEqual(expectedConfig, baselineConfig));
    let first;
    await check('REST: first entity ID and omitted size', async () => {
      first = await createRest({ name: '  baseline first  ' });
      assert.deepEqual(first, { id: 1, name: 'baseline first' });
    });
    await check('shared: REST create GraphQL read', async () => {
      assert.ok(first, 'First create prerequisite failed');
      const found = graphData(await getGraph(first.id)).entity;
      assert.deepEqual(found, { id: String(first.id), name: 'baseline first', size: null });
    });
    await check('shared: GraphQL update REST read', async () => {
      assert.ok(first, 'First create prerequisite failed');
      const updated = graphData(await updateGraph(first.id, { name: '  via graph  ', size: 2.5 })).updateEntity;
      assert.deepEqual(normalize(updated), { id: first.id, name: 'via graph', size: 2.5 });
      assert.deepEqual(json(await request('GET', '/entities/' + first.id)), normalize(updated));
    });
    await check('shared: REST delete GraphQL absence', async () => {
      assert.ok(first, 'First create prerequisite failed');
      assert.equal(json(await request('DELETE', '/entities/' + first.id)).id, first.id);
      assert.equal(graphData(await getGraph(first.id)).entity, null);
    });
    await check('shared: GraphQL create REST replace GraphQL delete', async () => {
      const createdGraph = await createGraph({ name: '  graph created  ', size: 3 });
      assert.deepEqual(normalize(createdGraph), { id: Number(createdGraph.id), name: 'graph created', size: 3 });
      assert.deepEqual(json(await request('GET', '/entities/' + createdGraph.id)), normalize(createdGraph));
      const replaced = json(await request('PUT', '/entities/' + createdGraph.id, { name: '  rest replaced  ' }));
      assert.deepEqual(replaced, { id: Number(createdGraph.id), name: 'rest replaced' });
      const deleted = graphData(await deleteGraph(createdGraph.id)).deleteEntity;
      assert.deepEqual(deleted, { id: createdGraph.id, name: 'rest replaced', size: null });
      assert.equal((await request('GET', '/entities/' + createdGraph.id)).status, 404);
    });
    await check('entities: unique increasing IDs across protocols', async () => {
      const a = await createRest({ name: 'unique a' });
      const b = await createGraph({ name: 'unique b' });
      assert.ok(Number(b.id) > a.id && a.id > 1);
      assert.deepEqual(graphData(await gql('{ entities { ' + fields + ' } }')).entities.map(normalize), await restAll());
    });
    const sizes = [['omitted', undefined], ['null', null], ['zero', 0], ['positive decimal', 1.25]];
    for (const [name, size] of sizes) {
      await check('REST: accepted size ' + name, async () => {
        const input = { name: '  value  ', ...(size === undefined ? {} : { size }) };
        const entity = await createRest(input);
        assert.deepEqual(entity, { id: entity.id, name: 'value', ...(size == null ? {} : { size }) });
      });
      await check('GraphQL: accepted size ' + name, async () => {
        const entity = await createGraph({ name: '  value  ', ...(size === undefined ? {} : { size }) });
        assert.deepEqual(entity, { id: entity.id, name: 'value', size: size ?? null });
      });
    }
    for (const protocol of ['REST', 'GraphQL']) {
      for (const replacement of [{ name: '  replacement  ' }, { name: '  replacement  ', size: null }]) {
        await check(protocol + ': replacement removes size ' + ('size' in replacement ? 'null' : 'omitted'), async () => {
          const entity = await createRest({ name: 'before', size: 7 });
          const updated = protocol === 'REST'
            ? json(await request('PUT', '/entities/' + entity.id, replacement))
            : normalize(graphData(await updateGraph(entity.id, replacement)).updateEntity);
          assert.deepEqual(updated, { id: entity.id, name: 'replacement' });
          assert.deepEqual(json(await request('GET', '/entities/' + entity.id)), updated);
        });
      }
    }
    const invalid = [
      ['missing name', { size: 1 }, true], ['empty name', { name: '' }, false],
      ['whitespace name', { name: ' \t\n ' }, false], ['wrong name type', { name: 123 }, true],
      ['null name', { name: null }, true], ['negative size', { name: 'x', size: -1 }, false],
      ['wrong size type', { name: 'x', size: '2' }, true],
    ];
    for (const [name, input, schemaError] of invalid) {
      for (const action of ['create', 'update']) {
        await check('REST: reject ' + name + ' on ' + action, async () => {
          const entity = action === 'update' ? await createRest({ name: 'unchanged', size: 5 }) : undefined;
          await unchanged(async () => {
            const response = await request(action === 'create' ? 'POST' : 'PUT', '/entities' + (entity ? '/' + entity.id : ''), input);
            assert.ok(typeof json(response, 400).error === 'string');
          });
        });
        await check('GraphQL: reject ' + name + ' on ' + action, async () => {
          const entity = action === 'update' ? await createRest({ name: 'unchanged', size: 5 }) : undefined;
          await unchanged(async () => {
            const response = action === 'update' ? await updateGraph(entity.id, input)
              : await gql('mutation($input:EntityInput!) { createEntity(input:$input) { id } }', { input });
            graphError(response, { status: schemaError ? 400 : 200 });
          });
        });
      }
    }
    for (const id of ['999999', 'not-a-number']) {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        await check('REST: missing ID ' + id + ' ' + method, async () => unchanged(async () => {
          const response = await request(method, '/entities/' + id, method === 'PUT' ? { name: 'x' } : undefined);
          assert.match(json(response, 404).error, /not found/i);
        }));
      }
      await check('GraphQL: missing ID ' + id + ' query', async () => assert.equal(graphData(await getGraph(id)).entity, null));
      for (const action of ['update', 'delete']) {
        await check('GraphQL: missing ID ' + id + ' ' + action, async () => unchanged(async () => {
          graphError(action === 'update' ? await updateGraph(id, { name: 'x' }) : await deleteGraph(id),
            { message: id === 'not-a-number' ? /Invalid ID/ : /not found/i });
        }));
      }
    }
    await check('REST: malformed JSON rejects without writes', async () => unchanged(async () => {
      const response = await request('POST', '/entities', '{"name":', { raw: true });
      assert.deepEqual(json(response, 400), { error: 'Invalid JSON body' });
    }));
    await check('REST: JSON array rejects without writes', async () => unchanged(async () => {
      assert.equal((await request('POST', '/entities', [])).status, 400);
    }));
    for (const action of ['create', 'update']) {
      await check('REST: reject numeric overflow on ' + action, async () => {
        const entity = action === 'update' ? await createRest({ name: 'finite before', size: 3 }) : undefined;
        await unchanged(async () => {
          const response = await request(action === 'create' ? 'POST' : 'PUT', '/entities' + (entity ? '/' + entity.id : ''),
            '{"name":"overflow","size":1e309}', { raw: true });
          assert.ok(typeof json(response, 400).error === 'string');
        });
      });
    }
    await check('GraphQL: malformed JSON rejects without writes', async () => unchanged(async () => {
      assert.deepEqual(json(await request('POST', '/graphql', '{"query":', { raw: true }), 400), { error: 'Invalid JSON body' });
    }));
    for (const [protocol, path] of [['REST', '/entities'], ['GraphQL', '/graphql']]) {
      await check(protocol + ': top-level primitive JSON rejects without writes', async () => unchanged(async () => {
        for (const value of [null, 123, 'primitive']) {
          assert.deepEqual(json(await request('POST', path, value), 400), { error: 'Invalid JSON body' });
        }
      }));
    }
    await check('GraphQL: malformed query', async () => graphError(await gql('{'), { status: 400, code: 'GRAPHQL_PARSE_FAILED' }));
    await check('GraphQL: unknown field', async () => graphError(await gql('{ fieldThatDoesNotExist }'), { status: 400, code: 'GRAPHQL_VALIDATION_FAILED' }));
    await check('REST: valid token partial configuration update', async () => {
      assert.deepEqual(await patchConfig({ features: { skipTrimOnCreate: false } }), {
        enabled: false, features: { skipTrimOnCreate: false, skipTrimOnUpdate: true },
      });
      const config = await patchConfig({ enabled: true, features: { skipTrimOnUpdate: false } });
      assert.deepEqual(config, { enabled: true, features: { skipTrimOnCreate: false, skipTrimOnUpdate: false } });
      assert.deepEqual(await restConfig(), config);
    });
    const invalidConfigs = [
      ['wrong enabled type', { enabled: 'true' }], ['null enabled', { enabled: null }],
      ['wrong features type', { features: 'bad' }], ['null features', { features: null }],
      ['null feature', { features: { skipTrimOnCreate: null } }],
      ['unknown feature', { features: { unknownFlag: true } }], ['unknown key', { unknownKey: true }],
      ['atomic rejection', { enabled: false, features: { skipTrimOnUpdate: false, unknownFlag: true } }],
      ['array', []], ['empty JSON null', null],
    ];
    for (const [name, value] of invalidConfigs) {
      await check('REST config: reject ' + name + ' unchanged', async () => configUnchanged(async () => {
        assert.equal((await request('PATCH', '/training-config', value, { auth: bearer })).status, 400);
      }));
    }
    await check('config: empty partial updates are no-ops', async () => {
      const before = await restConfig();
      assert.deepEqual(await patchConfig({}), before);
      assert.deepEqual(await patchConfig({ features: {} }), before);
    });
  }

  async function trainingSamples(config, label, sampleCount) {
    const observations = { createsTrimmed: 0, createsUntrimmed: 0, updatesTrimmed: 0, updatesUntrimmed: 0 };
    for (let i = 0; i < sampleCount; i++) {
      const original = '  training sample ' + i + '  ';
      const entity = i % 2 === 0 ? await createRest({ name: original }) : await createGraph({ name: original });
      const allowedCreate = config.enabled && config.features.skipTrimOnCreate ? [original.trim(), original] : [original.trim()];
      assert.ok(allowedCreate.includes(entity.name), 'Unexpected training create name');
      observations[entity.name === original ? 'createsUntrimmed' : 'createsTrimmed']++;
      const changed = '  training updated ' + i + '  ';
      const updated = i % 2 === 0 ? graphData(await updateGraph(entity.id, { name: changed })).updateEntity
        : json(await request('PUT', '/entities/' + entity.id, { name: changed }));
      const allowedUpdate = config.enabled && config.features.skipTrimOnUpdate ? [changed.trim(), changed] : [changed.trim()];
      assert.ok(allowedUpdate.includes(updated.name), 'Unexpected training update name');
      observations[updated.name === changed ? 'updatesUntrimmed' : 'updatesTrimmed']++;
      assert.deepEqual(normalize(graphData(await getGraph(entity.id)).entity), json(await request('GET', '/entities/' + entity.id)));
    }
    report.observations[label] = observations;
  }
  if (mode === 'full') {
    const configs = [
      ['disabled always trims', baselineConfig],
      ['enabled flags off always trims', { enabled: true, features: { skipTrimOnCreate: false, skipTrimOnUpdate: false } }],
      ['create flag off', { enabled: true, features: { skipTrimOnCreate: false, skipTrimOnUpdate: true } }],
      ['update flag off', { enabled: true, features: { skipTrimOnCreate: true, skipTrimOnUpdate: false } }],
      ['both flags on allowed outcomes', { enabled: true, features: { skipTrimOnCreate: true, skipTrimOnUpdate: true } }],
    ];
    for (const [label, config] of configs) {
      await check('training: ' + label, async () => {
        assert.deepEqual(await patchConfig(config), config);
        await trainingSamples(config, label, 12);
      });
    }
    await check('config: restore startup settings', async () => assert.deepEqual(await patchConfig(baselineConfig), baselineConfig));
  }
  if (mode === 'startup-training') {
    await check('training: startup flags govern allowed outcomes', async () => trainingSamples(expectedConfig, 'startup training', 12));
  }
  await check('cleanup: synthetic entities removed', cleanup);

  if (mode === 'full') {
    // Five counted failures across methods and schemes; hidden (no-header) requests in between never count.
    const failedAuth = [
      ['PATCH wrong token', 'PATCH', 'Bearer synthetic-wrong-token'], ['GET wrong token', 'GET', 'Bearer synthetic-wrong-token'],
      ['PATCH wrong scheme', 'PATCH', 'Basic synthetic'], ['GET empty bearer', 'GET', 'Bearer '],
      ['PATCH wrong token fifth attempt', 'PATCH', 'Bearer synthetic-wrong-token'],
    ];
    for (const [label, method, auth] of failedAuth) {
      await check('auth: ' + label, async () => {
        const response = await request(method, '/training-config', method === 'PATCH' ? { enabled: true } : undefined, { auth });
        assert.match(json(response, 401).error, /token/i);
        await assertHidden(method, undefined);
      });
    }
    await check('auth: correct token blocked after five failures', async () => {
      assert.match(json(await request('PATCH', '/training-config', { enabled: true }, { auth: bearer }), 429).error, /Too many/i);
      assert.match(json(await request('GET', '/training-config', undefined, { auth: bearer }), 429).error, /Too many/i);
    });
    await check('auth: no-token requests stay hidden during lockout', async () => {
      await assertHidden('GET', undefined);
      await assertHidden('PATCH', undefined);
    });
    await check('auth: public entity reads remain available during lockout', async () => {
      assert.deepEqual(await restAll(), []);
      assert.deepEqual(graphData(await gql('{ entities { id } }')).entities, []);
    });
  }

  report.finishedAt = new Date().toISOString();
  report.summary = {
    total: report.assertions.length,
    passed: report.assertions.filter(item => item.status === 'passed').length,
    failed: report.assertions.filter(item => item.status === 'failed').length,
    requests: report.requests.length,
  };
  report.passed = report.summary.failed === 0;
  const safeReport = sanitize(report);
  if (resultPath) {
    await mkdir(dirname(resolve(resultPath)), { recursive: true });
    await writeFile(resultPath, JSON.stringify(safeReport, null, 2) + '\n', { mode: 0o600 });
  }
  return safeReport;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runSuite();
    console.log(JSON.stringify({ passed: result.passed, ...result.summary, resultPath: process.env.RESULT_PATH || null }));
    for (const failed of result.assertions.filter(item => item.status === 'failed')) console.error(failed.name + ': ' + failed.error);
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    console.error('Acceptance suite failed to initialize: ' + error.message);
    process.exitCode = 1;
  }
}
