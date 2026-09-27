import { createHash, timingSafeEqual } from 'crypto';

export type AdminAuthResult = 'ok' | 'disabled' | 'unauthorized';

const BEARER_PREFIX = 'Bearer ';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// Fails closed: without TRAINING_ADMIN_TOKEN, runtime config changes are disabled.
export function checkAdminToken(
  authorization: string | undefined,
  token: string | undefined = process.env.TRAINING_ADMIN_TOKEN,
): AdminAuthResult {
  if (!token) {
    return 'disabled';
  }
  const provided = authorization?.startsWith(BEARER_PREFIX) ? authorization.slice(BEARER_PREFIX.length) : '';
  // Hash both sides so the comparison is constant-time regardless of length
  return timingSafeEqual(digest(provided), digest(token)) ? 'ok' : 'unauthorized';
}
