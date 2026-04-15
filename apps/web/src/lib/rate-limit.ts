import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

/**
 * Auth endpoints (login, register, reset): 5 requests per minute per IP
 */
export const authLimiter = new RateLimiterMemory({
  keyPrefix: 'auth',
  points: 5,
  duration: 60, // seconds
});

/**
 * API endpoints (tRPC, REST): 100 requests per minute per API key or session
 */
export const apiLimiter = new RateLimiterMemory({
  keyPrefix: 'api',
  points: 100,
  duration: 60,
});

/**
 * Quick Capture (public): 10 creates per hour per IP
 */
export const quickCaptureLimiter = new RateLimiterMemory({
  keyPrefix: 'quick-capture',
  points: 10,
  duration: 3600, // 1 hour
});

/**
 * Generic rate limit helper.
 * Resolves to { success: true } or { success: false, retryAfter: seconds }.
 */
export async function rateLimit(
  limiter: RateLimiterMemory,
  key: string,
): Promise<{ success: true } | { success: false; retryAfter: number }> {
  try {
    await limiter.consume(key, 1);
    return { success: true };
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      const retryAfter = Math.ceil(error.msBeforeNext / 1000);
      return { success: false, retryAfter };
    }
    // If something else goes wrong, allow the request through
    return { success: true };
  }
}
