/**
 * Input sanitization utilities for XSS protection
 * Uses DOMPurify to sanitize user input before rendering
 */

import DOMPurify from 'dompurify';

// Basic server-safe escape when DOMPurify cannot run (no window)
function escapeHtmlFallback(dirty: string): string {
  return dirty
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param dirty - The potentially unsafe HTML string
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') {
    // Server-side: fall back to minimal escaping
    return escapeHtmlFallback(dirty);
  }
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target'],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Sanitize plain text (removes all HTML)
 * @param dirty - The potentially unsafe string
 * @returns Plain text with HTML stripped
 */
export function sanitizeText(dirty: string): string {
  if (typeof window === 'undefined') {
    return escapeHtmlFallback(dirty);
  }
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
}

/**
 * Sanitize user input for display in HTML attributes
 * @param dirty - The potentially unsafe string
 * @returns Escaped string safe for HTML attributes
 */
export function sanitizeAttribute(dirty: string): string {
  if (typeof window === 'undefined') {
    return escapeHtmlFallback(dirty);
  }
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
