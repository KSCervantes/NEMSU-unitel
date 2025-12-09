"use client";

import { ReactNode } from 'react';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';

interface ModalWithFocusTrapProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Modal component with focus trap and keyboard navigation
 * Ensures accessibility and proper focus management
 */
export default function ModalWithFocusTrap({
  isOpen,
  onClose,
  title,
  children,
}: ModalWithFocusTrapProps) {
  const modalRef = useFocusTrap(isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      >
        {children}
      </div>
    </div>
  );
}

