"use client";

/**
 * Skip links for keyboard navigation accessibility
 * Allows users to skip to main content areas
 */
export default function SkipLinks() {
  return (
    <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-4 focus-within:left-4 focus-within:z-50">
      <a
        href="#main-content"
        className="block px-4 py-2 bg-blue-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Skip to main content
      </a>
    </div>
  );
}

