/**
 * Input sanitization utilities for XSS protection
 * Uses DOMPurify to sanitize user input before rendering
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param dirty - The potentially unsafe HTML string
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') {
    // Server-side: return as-is (DOMPurify requires DOM)
    return dirty;
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
    return dirty;
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
    return dirty;
  }
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

