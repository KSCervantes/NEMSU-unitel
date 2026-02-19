"use client";
export const dynamic = "force-dynamic";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { isNemsuEmail } from '@/lib/adminAuth';
import { isAuthorizedAdminUser } from '@/lib/adminUsers';

export function useAdminAuth() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
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
          await auth.signOut();
          sessionStorage.removeItem('adminAuth');
          sessionStorage.removeItem('adminEmail');
          if (!cancelled) router.push('/admin');
          return;
        }

        // Second check: Must be authorized (bootstrap list + Firestore-managed admins)
        const allowedAdmin = await isAuthorizedAdminUser(adminEmail);
        if (!allowedAdmin) {
          await auth.signOut();
          sessionStorage.removeItem('adminAuth');
          sessionStorage.removeItem('adminEmail');
          if (!cancelled) router.push('/admin');
          return;
        }
      }
    };

    void verify();

    return () => {
      cancelled = true;
    };
  }, [router]);
}
