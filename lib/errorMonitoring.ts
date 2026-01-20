/**
 * Production Error Monitoring
 * 
 * This module provides error tracking and monitoring for production environments.
 * You can integrate with services like Sentry, LogRocket, or other monitoring tools.
 */

import { logError } from './logger';

interface ErrorReport {
  message: string;
  stack?: string;
  timestamp: Date;
  url: string;
  userAgent: string;
  userId?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Report error to monitoring service
 * In production, this would send to Sentry, LogRocket, or similar service
 */
export function reportError(error: Error, additionalData?: Record<string, unknown>): void {
  const errorReport: ErrorReport = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date(),
    url: typeof window !== 'undefined' ? window.location.href : 'server',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    additionalData,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    logError('Error Report:', errorReport);
  }

  // In production, send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrate with your preferred error monitoring service
    // Example integrations:
    
    // Sentry:
    // import * as Sentry from '@sentry/nextjs';
    // Sentry.captureException(error, { extra: additionalData });
    
    // LogRocket:
    // import LogRocket from 'logrocket';
    // LogRocket.captureException(error, { extra: additionalData });
    
    // Custom API endpoint:
    // fetch('/api/log-error', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(errorReport),
    // }).catch(console.error);
  }
}

/**
 * Global error handler setup
 * Call this once on app initialization
 */
export function setupErrorMonitoring(): void {
  if (typeof window === 'undefined') return;

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    reportError(
      new Error(`Unhandled Promise Rejection: ${event.reason}`),
      { type: 'unhandledRejection', reason: event.reason }
    );
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    reportError(
      new Error(event.message),
      { 
        type: 'globalError',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }
    );
  });
}

/**
 * Track custom events for analytics
 */
export function trackEvent(
  _eventName: string,
  _properties?: Record<string, unknown>
): void {
  // Explicitly mark parameters as used to satisfy lint
  void _eventName;
  void _properties;
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrate with analytics service
    // Example: Google Analytics, Mixpanel, etc.
    
    // Google Analytics 4:
    // if (typeof window !== 'undefined' && (window as any).gtag) {
    //   (window as any).gtag('event', eventName, properties);
    // }
  }
}

/**
 * Set user context for error tracking
 */
export function setUserContext(_userId: string, _userEmail?: string): void {
  // Explicitly mark parameters as used to satisfy lint
  void _userId;
  void _userEmail;
  if (process.env.NODE_ENV === 'production') {
    // TODO: Set user context in monitoring service
    
    // Sentry:
    // import * as Sentry from '@sentry/nextjs';
    // Sentry.setUser({ id: userId, email: userEmail });
    
    // LogRocket:
    // import LogRocket from 'logrocket';
    // LogRocket.identify(userId, { email: userEmail });
  }
}
