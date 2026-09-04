const DEFAULT_MAX_TOKENS = 30;
const DEFAULT_WINDOW_SECONDS = 60;
const MAX_TRACKED_BUCKETS = 1000;

const buckets = new Map();

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getRateLimitConfig() {
  const maxTokens = parsePositiveInteger(process.env.RATE_LIMIT_MAX_TOKENS, DEFAULT_MAX_TOKENS);
  const windowSeconds = parsePositiveInteger(
    process.env.RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_WINDOW_SECONDS,
  );

  return {
    maxTokens,
    windowMs: windowSeconds * 1000,
  };
}

function pruneExpiredBuckets(now, windowMs) {
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }

  if (buckets.size <= MAX_TRACKED_BUCKETS) {
    return;
  }

  const overflow = buckets.size - MAX_TRACKED_BUCKETS;
  let removed = 0;
  for (const [key, bucket] of buckets.entries()) {
    if (removed >= overflow) {
      break;
    }
    if (now >= bucket.resetAt || bucket.resetAt - now > windowMs) {
      buckets.delete(key);
      removed += 1;
    }
  }
}

function consumeRateLimitToken(key, options = {}) {
  const now = options.now ?? Date.now();
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_SECONDS * 1000;

  pruneExpiredBuckets(now, windowMs);

  const existing = buckets.get(key);
  const bucket = !existing || now >= existing.resetAt
    ? { tokensRemaining: maxTokens, resetAt: now + windowMs }
    : existing;

  if (bucket.tokensRemaining <= 0) {
    const retryAfterMs = Math.max(bucket.resetAt - now, 0);
    return {
      allowed: false,
      limit: maxTokens,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      resetAt: new Date(bucket.resetAt).toISOString(),
    };
  }

  bucket.tokensRemaining -= 1;
  buckets.set(key, bucket);

  return {
    allowed: true,
    limit: maxTokens,
    remaining: bucket.tokensRemaining,
    retryAfterSeconds: Math.max(1, Math.ceil(Math.max(bucket.resetAt - now, 0) / 1000)),
    resetAt: new Date(bucket.resetAt).toISOString(),
  };
}

function resetBuckets() {
  buckets.clear();
}

module.exports = {
  consumeRateLimitToken,
  getRateLimitConfig,
  resetBuckets,
};