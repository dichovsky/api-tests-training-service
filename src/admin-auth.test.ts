import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeAdmin, createFailedAttemptLimiter } from './admin-auth';

const TOKEN = 's3cret';

test('blocks a client after the max failed attempts, even with the right token', () => {
  const limiter = createFailedAttemptLimiter(3, 60_000);
  for (let i = 0; i < 3; i++) {
    assert.equal(authorizeAdmin('Bearer wrong', '10.0.0.1', TOKEN, limiter), 'unauthorized');
  }
  assert.equal(authorizeAdmin('Bearer wrong', '10.0.0.1', TOKEN, limiter), 'rate_limited');
  assert.equal(authorizeAdmin(`Bearer ${TOKEN}`, '10.0.0.1', TOKEN, limiter), 'rate_limited');
});

test('failures are counted per client', () => {
  const limiter = createFailedAttemptLimiter(1, 60_000);
  assert.equal(authorizeAdmin('Bearer wrong', '10.0.0.1', TOKEN, limiter), 'unauthorized');
  assert.equal(authorizeAdmin('Bearer wrong', '10.0.0.1', TOKEN, limiter), 'rate_limited');
  assert.equal(authorizeAdmin(`Bearer ${TOKEN}`, '10.0.0.2', TOKEN, limiter), 'ok');
});

test('the block lifts once the window has passed', () => {
  const limiter = createFailedAttemptLimiter(2, 1_000);
  limiter.recordFailure('10.0.0.1', 0);
  limiter.recordFailure('10.0.0.1', 10);
  assert.equal(limiter.isBlocked('10.0.0.1', 999), true);
  assert.equal(limiter.isBlocked('10.0.0.1', 1_000), false);
  limiter.recordFailure('10.0.0.1', 1_000);
  assert.equal(limiter.isBlocked('10.0.0.1', 1_001), false);
});

test('requests while no admin token is configured are hidden and do not count as failures', () => {
  const limiter = createFailedAttemptLimiter(1, 60_000);
  assert.equal(authorizeAdmin('Bearer wrong', '10.0.0.1', undefined, limiter), 'hidden');
  assert.equal(authorizeAdmin('Bearer wrong', '10.0.0.1', undefined, limiter), 'hidden');
  assert.equal(limiter.isBlocked('10.0.0.1'), false);
});

test('requests without an Authorization header are hidden and do not count as failures', () => {
  const limiter = createFailedAttemptLimiter(1, 60_000);
  assert.equal(authorizeAdmin(undefined, '10.0.0.1', TOKEN, limiter), 'hidden');
  assert.equal(authorizeAdmin('', '10.0.0.1', TOKEN, limiter), 'hidden');
  assert.equal(limiter.isBlocked('10.0.0.1'), false);
});

test('a blocked client without an Authorization header still gets hidden, not rate_limited', () => {
  const limiter = createFailedAttemptLimiter(1, 60_000);
  assert.equal(authorizeAdmin('Bearer wrong', '10.0.0.1', TOKEN, limiter), 'unauthorized');
  assert.equal(authorizeAdmin(undefined, '10.0.0.1', TOKEN, limiter), 'hidden');
  assert.equal(authorizeAdmin('Bearer wrong', '10.0.0.1', TOKEN, limiter), 'rate_limited');
});

test('tracked clients are capped: the oldest entry is evicted first', () => {
  const limiter = createFailedAttemptLimiter(1, 60_000, 2);
  limiter.recordFailure('a', 0);
  limiter.recordFailure('b', 0);
  limiter.recordFailure('c', 0);
  assert.equal(limiter.isBlocked('a', 1), false);
  assert.equal(limiter.isBlocked('b', 1), true);
  assert.equal(limiter.isBlocked('c', 1), true);
});
