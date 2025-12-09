/**
 * Rate limiting utility for API endpoints
 * Prevents brute force attacks and abuse
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (use Redis in production)
const store: RateLimitStore = {};

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

const defaultConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 requests per window
};

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (IP address, email, etc.)
 * @param config - Rate limit configuration
 * @returns Object with allowed status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = defaultConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = store[identifier];

  // Clean up expired records
  if (record && now > record.resetTime) {
    delete store[identifier];
  }

  // Initialize or get existing record
  const currentRecord = store[identifier] || {
    count: 0,
    resetTime: now + config.windowMs,
  };

  // Check if limit exceeded
  if (currentRecord.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: currentRecord.resetTime,
    };
  }

  // Increment count
  currentRecord.count++;
  store[identifier] = currentRecord;

  return {
    allowed: true,
    remaining: config.maxRequests - currentRecord.count,
    resetTime: currentRecord.resetTime,
  };
}

/**
 * Get client identifier from request
 * Uses IP address or email if available
 */
export function getClientIdentifier(request: Request): string {
  // Try to get IP from headers (if behind proxy)
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             request.headers.get('x-real-ip') || 
             'unknown';

  // For login attempts, use email if available
  const email = request.headers.get('x-attempt-email');
  
  return email ? `email:${email}` : `ip:${ip}`;
}

/**
 * Clear rate limit for an identifier (useful for testing or manual reset)
 */
export function clearRateLimit(identifier: string): void {
  delete store[identifier];
}

