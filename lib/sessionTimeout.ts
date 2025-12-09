/**
 * Session timeout management
 * Automatically logs out users after a period of inactivity
 */

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_TIME_MS = 5 * 60 * 1000; // Show warning 5 minutes before timeout

let timeoutId: NodeJS.Timeout | null = null;
let warningTimeoutId: NodeJS.Timeout | null = null;
let onTimeoutCallback: (() => void) | null = null;
let onWarningCallback: (() => void) | null = null;

/**
 * Initialize session timeout
 * @param onTimeout - Callback when session times out
 * @param onWarning - Callback when warning should be shown
 */
export function initSessionTimeout(
  onTimeout: () => void,
  onWarning?: () => void
): void {
  if (typeof window === 'undefined') return;

  onTimeoutCallback = onTimeout;
  onWarningCallback = onWarning || null;

  resetSessionTimeout();

  // Listen for user activity
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  events.forEach((event) => {
    document.addEventListener(event, resetSessionTimeout, { passive: true });
  });
}

/**
 * Reset the session timeout timer
 */
export function resetSessionTimeout(): void {
  if (typeof window === 'undefined') return;

  // Clear existing timeouts
  if (timeoutId) clearTimeout(timeoutId);
  if (warningTimeoutId) clearTimeout(warningTimeoutId);

  // Set warning timeout
  if (onWarningCallback) {
    warningTimeoutId = setTimeout(() => {
      if (onWarningCallback) onWarningCallback();
    }, SESSION_TIMEOUT_MS - WARNING_TIME_MS);
  }

  // Set session timeout
  timeoutId = setTimeout(() => {
    if (onTimeoutCallback) {
      onTimeoutCallback();
    }
  }, SESSION_TIMEOUT_MS);
}

/**
 * Clear session timeout (e.g., on logout)
 */
export function clearSessionTimeout(): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (warningTimeoutId) {
    clearTimeout(warningTimeoutId);
    warningTimeoutId = null;
  }
}

