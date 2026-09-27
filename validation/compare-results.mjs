import { isDeepStrictEqual } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function canonicalBody(value, training, key = '') {
  if (Array.isArray(value)) return value.map(item => canonicalBody(item, training));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => {
      if (name === 'errors' && Array.isArray(child)) {
        // Exact resolver locations/messages are diagnostic evidence, not a compatibility contract.
        return [name, child.map(error => ({ code: error.extensions?.code ?? null, hasMessage: !!error.message }))];
      }
      if (name === 'error' && typeof child === 'string') return [name, '<error-message>'];
      return [name, canonicalBody(child, training, name)];
    }));
  }
  if (key === 'id' && (typeof value === 'number' || typeof value === 'string')) return '<id:' + typeof value + '>';
  if (training && key === 'name' && typeof value === 'string') return value.trim();
  return value;
}

function contracts(report) {
  return report.requests.map(request => ({
    case: request.case,
    method: request.method,
    path: request.path.replace(/\/entities\/\d+(?=\/|$)/, '/entities/:id'),
    ...(request.error ? { transportError: true } : {
      status: request.response.status,
      contentType: (request.response.headers['content-type'] || '').split(';')[0],
      body: typeof request.response.body === 'string'
        ? '<non-json-body>'
        : canonicalBody(request.response.body, request.case.startsWith('training:') || request.case === 'cleanup: synthetic entities removed'),
    }),
  }));
}

/** Compare accepted contracts, leaving timings, URLs, IDs, and random trim outcomes out. */
export function compareResults(baseline, candidate) {
  const checks = [];
  const add = (name, passed, detail) => checks.push({ name, passed, ...(!passed && detail ? { detail } : {}) });
  add('baseline accepted', baseline.passed === true);
  add('candidate accepted', candidate.passed === true);
  add('report format matches', baseline.schemaVersion === candidate.schemaVersion);
  add('same suite revision', baseline.suiteHash === candidate.suiteHash);
  add('same suite mode', baseline.mode === candidate.mode);
  add('same startup configuration', isDeepStrictEqual(baseline.expectedConfig, candidate.expectedConfig));
  add('same assertion inventory and results', isDeepStrictEqual(
    baseline.assertions.map(({ name, status }) => ({ name, status })),
    candidate.assertions.map(({ name, status }) => ({ name, status })),
  ));
  add('same packaged documentation assets', isDeepStrictEqual(baseline.sourceAssets, candidate.sourceAssets));
  const expected = contracts(baseline);
  const actual = contracts(candidate);
  const differences = [];
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    if (!isDeepStrictEqual(expected[i], actual[i])) {
      differences.push({ requestIndex: i, baseline: expected[i] ?? null, candidate: actual[i] ?? null });
    }
  }
  add('same HTTP and GraphQL response contracts', differences.length === 0, { differenceCount: differences.length });
  return {
    schemaVersion: 1, comparedAt: new Date().toISOString(),
    baseline: { baseUrl: baseline.baseUrl, startedAt: baseline.startedAt },
    candidate: { baseUrl: candidate.baseUrl, startedAt: candidate.startedAt },
    passed: checks.every(check => check.passed), checks, differences,
    ignored: ['timings', 'host URL', 'numeric ID values (type and uniqueness checked by suite)',
      'allowed random training whitespace', 'error wording/locations', 'non-JSON body layout (assets verified separately)'],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [baselinePath, candidatePath, outputArg] = process.argv.slice(2);
    if (!baselinePath || !candidatePath) throw new Error('Usage: node validation/compare-results.mjs BASELINE.json CANDIDATE.json [OUTPUT.json]');
    const [baseline, candidate] = await Promise.all([baselinePath, candidatePath].map(async path => JSON.parse(await readFile(path, 'utf8'))));
    const report = compareResults(baseline, candidate);
    const outputPath = outputArg || process.env.COMPARE_RESULT_PATH;
    if (outputPath) {
      await mkdir(dirname(resolve(outputPath)), { recursive: true });
      await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    }
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks, differenceCount: report.differences.length, outputPath: outputPath || null }));
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    console.error('Comparison failed: ' + error.message);
    process.exitCode = 1;
  }
}
