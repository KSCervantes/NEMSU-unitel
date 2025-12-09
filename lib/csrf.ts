/**
 * CSRF (Cross-Site Request Forgery) Protection
 * Generates and validates CSRF tokens for state-changing operations
 */

/**
 * Generate a random CSRF token
 */
export function generateCSRFToken(): string {
  if (typeof window === 'undefined') {
    // Server-side: use crypto
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
  
  // Client-side: use Web Crypto API
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store CSRF token in sessionStorage
 */
export function storeCSRFToken(token: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('csrf_token', token);
    sessionStorage.setItem('csrf_token_time', Date.now().toString());
  }
}

/**
 * Get CSRF token from sessionStorage
 */
export function getCSRFToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  const token = sessionStorage.getItem('csrf_token');
  const tokenTime = sessionStorage.getItem('csrf_token_time');
  
  // Token expires after 1 hour
  if (token && tokenTime) {
    const age = Date.now() - parseInt(tokenTime, 10);
    if (age < 60 * 60 * 1000) { // 1 hour
      return token;
    }
    // Token expired, remove it
    sessionStorage.removeItem('csrf_token');
    sessionStorage.removeItem('csrf_token_time');
  }
  
  return null;
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string | null): boolean {
  if (!token) return false;
  const storedToken = getCSRFToken();
  return storedToken !== null && storedToken === token;
}

/**
 * Initialize CSRF token (call on page load)
 */
export function initCSRF(): string {
  let token = getCSRFToken();
  if (!token) {
    token = generateCSRFToken();
    storeCSRFToken(token);
  }
  return token;
}

