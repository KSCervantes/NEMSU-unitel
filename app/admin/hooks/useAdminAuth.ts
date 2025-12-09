"use client";
export const dynamic = "force-dynamic";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { isAuthorizedAdmin, isNemsuEmail } from '@/lib/adminAuth';

export function useAdminAuth() {
  const router = useRouter();

  useEffect(() => {
    const adminAuth = sessionStorage.getItem('adminAuth');
    const adminEmail = sessionStorage.getItem('adminEmail');

    // Check authentication
    if (adminAuth !== 'true') {
      router.push('/admin');
      return;
    }

    // Check if email exists and is from Google Sign-In
    if (adminEmail && adminEmail.includes('@')) {
      // First check: Must be NEMSU institution email
      if (!isNemsuEmail(adminEmail)) {
        auth.signOut();
        sessionStorage.removeItem('adminAuth');
        sessionStorage.removeItem('adminEmail');
        router.push('/admin');
        return;
      }

      // Second check: Must be in authorized list
      if (!isAuthorizedAdmin(adminEmail)) {
        auth.signOut();
        sessionStorage.removeItem('adminAuth');
        sessionStorage.removeItem('adminEmail');
        router.push('/admin');
        return;
      }
    }
  }, [router]);
}
