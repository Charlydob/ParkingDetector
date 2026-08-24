export function createRateLimiter({ windowMs = 60_000, max = 20 } = {}) {
  const buckets = new Map();

  return {
    allow(key) {
      const now = Date.now();
      const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

      if (bucket.resetAt <= now) {
        bucket.count = 0;
        bucket.resetAt = now + windowMs;
      }

      bucket.count += 1;
      buckets.set(key, bucket);
      return bucket.count <= max;
    },
  };
}
