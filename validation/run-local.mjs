import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runDir = resolve(process.env.RUN_DIR || `${root}/validation-results/local-${new Date().toISOString().replaceAll(':', '-')}`);
mkdirSync(runDir, { recursive: true });
const token = randomBytes(32).toString('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const hash = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const metadata = {
  startedAt: new Date().toISOString(), commit: git('rev-parse', 'HEAD'),
  trackedPatchHash: createHash('sha256').update(git('diff', 'HEAD', '--', '.', ':!.vscode/settings.json')).digest('hex'),
  lockfileHash: hash('package-lock.json'), suiteHash: hash('validation/service-suite.mjs'),
  node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  platform: process.platform, arch: process.arch, results: [],
};
let child;
let logFd;
let baseUrl;
async function freePort() {
  const server = createServer();
  await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  await new Promise(ok => server.close(ok));
  return port;
}
async function request(path, { method = 'GET', body, admin = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}
async function stop() {
  if (child) {
    const old = child;
    child = undefined;
    try { process.kill(-old.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    for (let i = 0; i < 30; i++) {
      try { process.kill(-old.pid, 0); } catch { break; }
      await delay(100);
    }
    try { process.kill(-old.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    closeSync(logFd);
  }
}
async function start(name, extra = {}, withToken = true) {
  await stop();
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), TRAINING_MODE: 'false', TRAINING_SKIP_TRIM_CREATE: 'true', TRAINING_SKIP_TRIM_UPDATE: 'true', ...extra };
  delete env.TRAINING_ADMIN_TOKEN;
  if (withToken) env.TRAINING_ADMIN_TOKEN = token;
  logFd = openSync(resolve(runDir, `${name}.log`), 'w', 0o600);
  const started = Date.now();
  child = spawn('npm', ['run', 'start'], { cwd: root, env, detached: true, stdio: ['ignore', logFd, logFd] });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  let runtimeStarted;
  for (;;) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${name}: npm start exited ${child.exitCode ?? child.signalCode}`);
    const log = readFileSync(resolve(runDir, `${name}.log`), 'utf8');
    if (runtimeStarted === undefined && log.includes('node dist/index.js')) runtimeStarted = Date.now();
    try {
      const rest = await request('/entities');
      const graphql = await request('/graphql', { method: 'POST', body: { query: '{ trainingMode }' } });
      if (rest.status === 200 && graphql.status === 200 && graphql.body.data) break;
    } catch { /* readiness polling, not assertion retries */ }
    if (runtimeStarted !== undefined && Date.now() - runtimeStarted > 60000) throw new Error(`${name}: runtime readiness timed out`);
    if (runtimeStarted === undefined && Date.now() - started > 180000) throw new Error(`${name}: build/start timed out`);
    await delay(250);
  }
  metadata.results.push({ name: `${name}-startup`, pass: true, elapsedMs: Date.now() - started, baseUrl });
}
async function suite(name, mode = 'full', extra = {}) {
  const result = await new Promise((ok, fail) => {
    const test = spawn(process.execPath, ['validation/service-suite.mjs'], {
      cwd: root, stdio: 'inherit', env: { ...process.env, BASE_URL: baseUrl, TRAINING_ADMIN_TOKEN: token, RESULT_PATH: resolve(runDir, `${name}.json`), SUITE_MODE: mode, ...extra },
    });
    test.on('error', fail);
    test.on('exit', (code, signal) => ok({ code, signal }));
  });
  metadata.results.push({ name, pass: result.code === 0, ...result });
  assert.equal(result.code, 0, `${name} failed; see its JSON evidence`);
}
try {
  await start('normal');
  await suite('normal');
  await start('development', { NODE_ENV: 'development' });
  await suite('development');
  // Establish state explicitly in a fresh process, then prove restart resets it.
  await start('before-restart');
  assert.equal((await request('/entities', { method: 'POST', body: { name: 'restart-fixture' } })).status, 201);
  assert.equal((await request('/training-config', { method: 'PATCH', admin: true, body: { enabled: true, features: { skipTrimOnCreate: false } } })).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await request('/training-config', { method: 'PATCH', body: {} })).status, 401);
  assert.equal((await request('/training-config', { method: 'PATCH', admin: true, body: {} })).status, 429);
  await start('after-restart');
  assert.deepEqual((await request('/entities')).body, []);
  assert.deepEqual((await request('/training-config')).body, { enabled: false, features: { skipTrimOnCreate: true, skipTrimOnUpdate: true } });
  assert.equal((await request('/training-config', { method: 'PATCH', admin: true, body: {} })).status, 200);
  assert.equal((await request('/entities', { method: 'POST', body: { name: 'id-reset' } })).body.id, 1);
  metadata.results.push({ name: 'restart-resets-entities-ids-config-lockout', pass: true });
  await start('no-token', {}, false);
  await suite('no-token', 'no-token');
  await start('startup-training', { TRAINING_MODE: 'true', TRAINING_SKIP_TRIM_CREATE: 'false', TRAINING_SKIP_TRIM_UPDATE: 'false' });
  await suite('startup-training', 'startup-training', { EXPECT_TRAINING_ENABLED: 'true', EXPECT_SKIP_TRIM_CREATE: 'false', EXPECT_SKIP_TRIM_UPDATE: 'false' });
  metadata.pass = true;
} catch (error) {
  metadata.pass = false;
  metadata.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try { await stop(); } catch (error) { metadata.pass = false; metadata.stopError = error.message; process.exitCode = 1; }
  metadata.finishedAt = new Date().toISOString();
  writeFileSync(resolve(runDir, 'summary.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(`Local validation: ${metadata.pass ? 'PASS' : 'FAIL'}; ${runDir}`);
}
