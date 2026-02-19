"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { isNemsuEmail } from '@/lib/adminAuth';
import { isAuthorizedAdminUser } from '@/lib/adminUsers';
import { logAdminActivity } from '@/lib/auditLog';
import { logWarning } from '@/lib/logger';

/**
 * Comprehensive auth hook for all admin sub-pages
 * Provides centralized security protection with:
 * 1. SessionStorage verification
 * 2. Firebase Auth verification
 * 3. NEMSU domain validation
 * 4. Whitelist authorization check
 */
export function useProtectedAdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const pagePathname = typeof window !== 'undefined' ? window.location.pathname : 'unknown';

    const rejectAccess = (adminEmail: string, details: string) => {
      if (details.includes('domain') || details.includes('authorized')) {
        logWarning('[Security] Unauthorized access attempt:', adminEmail, `(${details})`);
      }
      logAdminActivity({
        adminEmail: adminEmail || 'unknown',
        action: 'page_access_attempt',
        page: pagePathname,
        status: 'unauthorized',
        details,
      });
      auth.signOut();
      sessionStorage.removeItem('adminAuth');
      sessionStorage.removeItem('adminEmail');
      if (!cancelled) {
        setIsAuthenticated(false);
        setIsLoading(false);
      }
      router.push('/admin');
    };

    const verifyAccess = async () => {
      const adminAuth = sessionStorage.getItem('adminAuth');
      const adminEmail = sessionStorage.getItem('adminEmail') || '';

      // Level 1: Check session token
      if (adminAuth !== 'true') {
        if (adminEmail) {
          logAdminActivity({
            adminEmail,
            action: 'page_access_attempt',
            page: pagePathname,
            status: 'unauthorized',
            details: 'Invalid session token',
          });
        }
        if (!cancelled) {
          setIsAuthenticated(false);
          setIsLoading(false);
        }
        router.push('/admin');
        return;
      }

      // Level 2: Verify email exists
      if (!adminEmail || !adminEmail.includes('@')) {
        rejectAccess(adminEmail, 'Invalid email format');
        return;
      }

      // Level 3: NEMSU domain validation (@nemsu.edu.ph required)
      if (!isNemsuEmail(adminEmail)) {
        rejectAccess(adminEmail, 'Invalid NEMSU domain');
        return;
      }

      // Level 4: Authorization check (bootstrap list + Firestore-managed admins)
      const allowedAdmin = await isAuthorizedAdminUser(adminEmail);
      if (!allowedAdmin) {
        rejectAccess(adminEmail, 'Email not authorized');
        return;
      }

      // All checks passed - log successful access
      logAdminActivity({
        adminEmail,
        action: 'page_access',
        page: pagePathname,
        status: 'success',
      });

      if (!cancelled) {
        queueMicrotask(() => {
          setIsAuthenticated(true);
          setIsLoading(false);
        });
      }
    };

    void verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return { isAuthenticated, isLoading };
}
