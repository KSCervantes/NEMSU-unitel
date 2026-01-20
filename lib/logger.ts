/**
 * Centralized logging utility
 * In production, console.log statements are removed or replaced with proper logging service
 */

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Log info messages (only in development)
 */
export function logInfo(...args: unknown[]): void {
  if (isDevelopment) {
    console.log('[INFO]', ...args);
  }
}

/**
 * Log error messages (always logged)
 */
export function logError(...args: unknown[]): void {
  console.error('[ERROR]', ...args);
  // In production, send to error tracking service (e.g., Sentry)
  // if (process.env.NODE_ENV === 'production') {
  //   errorTrackingService.captureException(...args);
  // }
}

/**
 * Log warning messages (only in development)
 */
export function logWarning(...args: unknown[]): void {
  if (isDevelopment) {
    console.warn('[WARN]', ...args);
  }
}

/**
 * Log debug messages (only in development)
 */
export function logDebug(...args: unknown[]): void {
  if (isDevelopment) {
    console.debug('[DEBUG]', ...args);
  }
}

