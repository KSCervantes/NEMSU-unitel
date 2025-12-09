"use client";

import { useEffect, useCallback } from 'react';

/**
 * Custom hook for keyboard navigation
 * Handles common keyboard shortcuts and navigation patterns
 */
export function useKeyboardNavigation() {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    // Close modals on Escape
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('[role="dialog"]');
      const openModal = Array.from(modals).find(
        (modal) => (modal as HTMLElement).style.display !== 'none'
      );
      
      if (openModal) {
        const closeButton = openModal.querySelector('[aria-label*="close" i], [aria-label*="Close" i]');
        if (closeButton instanceof HTMLElement) {
          closeButton.click();
        }
      }
    }
  }, []);

  const handleEnter = useCallback((e: KeyboardEvent) => {
    // Submit forms on Enter (when focus is on submit button)
    if (e.key === 'Enter' && e.target instanceof HTMLElement) {
      const form = e.target.closest('form');
      if (form && e.target.tagName === 'BUTTON' && e.target.type === 'submit') {
        // Allow default behavior
        return;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleEnter);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleEnter);
    };
  }, [handleEscape, handleEnter]);
}

