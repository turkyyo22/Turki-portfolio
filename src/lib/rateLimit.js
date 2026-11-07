// In-memory sliding-window rate limiter.
//
// Limits are per server instance: on serverless hosting each warm instance
// counts separately, so this caps abuse rather than enforcing exact numbers.
// For strict global limits, swap the Map for a shared store such as Redis.

const MAX_TRACKED_KEYS = 5000;

export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  function prune(currentTime) {
    for (const [key, timestamps] of hits) {
      if (timestamps[timestamps.length - 1] <= currentTime - windowMs) hits.delete(key);
    }
  }

  return function check(key) {
    const currentTime = now();
    const windowStart = currentTime - windowMs;
    const recent = (hits.get(key) || []).filter((time) => time > windowStart);

    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - currentTime) / 1000)) };
    }

    recent.push(currentTime);
    hits.set(key, recent);
    if (hits.size > MAX_TRACKED_KEYS) prune(currentTime);
    return { ok: true, remaining: limit - recent.length };
  };
}

/** Best-effort client IP from the proxy headers set by the hosting platform. */
export function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
