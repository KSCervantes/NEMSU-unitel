/**
 * Enhanced error messages with actionable guidance
 * Provides user-friendly error messages with specific solutions
 */

export interface ErrorDetails {
  title: string;
  message: string;
  action?: string;
  code?: string;
}

/**
 * Get enhanced error message based on error type
 */
export function getEnhancedErrorMessage(error: unknown): ErrorDetails {
  const err = error as { code?: string; message?: string };
  // Firebase errors
  if (err?.code) {
    switch (err.code) {
      case 'auth/invalid-email':
        return {
          title: 'Invalid Email Address',
          message: 'The email address you entered is not valid. Please check and try again.',
          action: 'Verify your email format (e.g., user@example.com)',
          code: err.code,
        };
      
      case 'auth/user-not-found':
        return {
          title: 'Account Not Found',
          message: 'No account exists with this email address.',
          action: 'Check your email or create a new account',
          code: err.code,
        };
      
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return {
          title: 'Incorrect Password',
          message: 'The password you entered is incorrect.',
          action: 'Try again or use "Forgot Password" to reset',
          code: err.code,
        };
      
      case 'auth/too-many-requests':
        return {
          title: 'Too Many Attempts',
          message: 'Too many failed login attempts. Please try again later.',
          action: 'Wait a few minutes before trying again',
          code: err.code,
        };
      
      case 'permission-denied':
        return {
          title: 'Permission Denied',
          message: 'You do not have permission to perform this action.',
          action: 'Contact your administrator if you believe this is an error',
          code: err.code,
        };
      
      case 'unavailable':
        return {
          title: 'Service Unavailable',
          message: 'The service is temporarily unavailable. Please try again later.',
          action: 'Check your internet connection and try again in a moment',
          code: err.code,
        };
      
      case 'deadline-exceeded':
        return {
          title: 'Request Timeout',
          message: 'The request took too long to complete.',
          action: 'Check your internet connection and try again',
          code: err.code,
        };
    }
  }

  // Network errors
  if (err?.message?.includes('network') || err?.message?.includes('fetch')) {
    return {
      title: 'Network Error',
      message: 'Unable to connect to the server. Please check your internet connection.',
      action: 'Verify your internet connection and try again',
    };
  }

  // Validation errors
  if (err?.message?.includes('validation') || err?.message?.includes('required')) {
    return {
      title: 'Validation Error',
      message: err.message || 'Please fill in all required fields correctly.',
      action: 'Review the form and correct any highlighted errors',
    };
  }

  // Generic error
  return {
    title: 'An Error Occurred',
    message: err?.message || 'Something went wrong. Please try again.',
    action: 'If the problem persists, contact support',
  };
}

/**
 * Format error for display in UI
 */
export function formatErrorForDisplay(error: unknown): string {
  const errorDetails = getEnhancedErrorMessage(error);
  return errorDetails.message;
}

