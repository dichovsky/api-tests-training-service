import { createHash, timingSafeEqual } from 'crypto';

// 'hidden': no server token or no Authorization header, so callers answer as if the route does not exist
export type AdminAuthResult = 'ok' | 'hidden' | 'unauthorized' | 'rate_limited';

const BEARER_PREFIX = 'Bearer ';
const MAX_FAILED_ADMIN_ATTEMPTS = 5;
const ADMIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
// Hard cap on tracked clients so a flood of source IPs can't grow memory without bound
const MAX_TRACKED_CLIENTS = 10_000;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// Fails closed: without TRAINING_ADMIN_TOKEN, the training config is unreachable.
export function checkAdminToken(
  authorization: string | undefined,
  token: string | undefined = process.env.TRAINING_ADMIN_TOKEN,
): AdminAuthResult {
  if (!token || !authorization) {
    return 'hidden';
  }
  const provided = authorization.startsWith(BEARER_PREFIX) ? authorization.slice(BEARER_PREFIX.length) : '';
  // Hash both sides so the comparison is constant-time regardless of length
  return timingSafeEqual(digest(provided), digest(token)) ? 'ok' : 'unauthorized';
}

export interface FailedAttemptLimiter {
  isBlocked(clientKey: string, now?: number): boolean;
  recordFailure(clientKey: string, now?: number): void;
}

// In-process fixed window per client: fine for this single-instance service.
// ponytail: in-memory and per-process; move to a shared store if the service is ever scaled out.
export function createFailedAttemptLimiter(
  maxFailures: number,
  windowMs: number,
  maxTrackedClients: number = MAX_TRACKED_CLIENTS,
): FailedAttemptLimiter {
  const failures = new Map<string, { count: number; resetAt: number }>();

  return {
    isBlocked(clientKey, now = Date.now()) {
      const entry = failures.get(clientKey);
      return entry !== undefined && entry.resetAt > now && entry.count >= maxFailures;
    },
    recordFailure(clientKey, now = Date.now()) {
      const entry = failures.get(clientKey);
      if (!entry && failures.size >= maxTrackedClients) {
        // Maps iterate in insertion order, so the first key is the oldest: O(1) eviction
        const oldest = failures.keys().next().value;
        if (oldest !== undefined) failures.delete(oldest);
      }
      failures.set(
        clientKey,
        entry && entry.resetAt > now
          ? { count: entry.count + 1, resetAt: entry.resetAt }
          : { count: 1, resetAt: now + windowMs },
      );
    },
  };
}

const adminLimiter = createFailedAttemptLimiter(MAX_FAILED_ADMIN_ATTEMPTS, ADMIN_LOCKOUT_WINDOW_MS);

// Token check plus brute-force protection: a client that sent too many wrong tokens is
// blocked for the window even if it then sends the right one. Hidden requests are checked
// first and never counted, so curious mentees can neither discover the route nor lock it.
export function authorizeAdmin(
  authorization: string | undefined,
  clientKey: string,
  token: string | undefined = process.env.TRAINING_ADMIN_TOKEN,
  limiter: FailedAttemptLimiter = adminLimiter,
): AdminAuthResult {
  const result = checkAdminToken(authorization, token);
  if (result === 'hidden') {
    return result;
  }
  if (limiter.isBlocked(clientKey)) {
    return 'rate_limited';
  }
  if (result === 'unauthorized') {
    limiter.recordFailure(clientKey);
  }
  return result;
}
