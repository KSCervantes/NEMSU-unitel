"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { isAuthorizedAdmin, isNemsuEmail } from '@/lib/adminAuth';
import { logAdminActivity } from '@/lib/auditLog';

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
    const adminAuth = sessionStorage.getItem('adminAuth');
    const adminEmail = sessionStorage.getItem('adminEmail');
    const pagePathname = typeof window !== 'undefined' ? window.location.pathname : 'unknown';

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
      router.push('/admin');
      return;
    }

    // Level 2: Verify email exists
    if (!adminEmail || !adminEmail.includes('@')) {
      logAdminActivity({
        adminEmail: adminEmail || 'unknown',
        action: 'page_access_attempt',
        page: pagePathname,
        status: 'unauthorized',
        details: 'Invalid email format',
      });
      auth.signOut();
      sessionStorage.removeItem('adminAuth');
      sessionStorage.removeItem('adminEmail');
      router.push('/admin');
      return;
    }

    // Level 3: NEMSU domain validation (@nemsu.edu.ph required)
    if (!isNemsuEmail(adminEmail)) {
      console.warn(`[Security] Unauthorized access attempt: ${adminEmail} (invalid domain)`);
      logAdminActivity({
        adminEmail,
        action: 'page_access_attempt',
        page: pagePathname,
        status: 'unauthorized',
        details: 'Invalid NEMSU domain',
      });
      auth.signOut();
      sessionStorage.removeItem('adminAuth');
      sessionStorage.removeItem('adminEmail');
      router.push('/admin');
      return;
    }

    // Level 4: Whitelist authorization check
    if (!isAuthorizedAdmin(adminEmail)) {
      console.warn(`[Security] Unauthorized access attempt: ${adminEmail} (not in whitelist)`);
      logAdminActivity({
        adminEmail,
        action: 'page_access_attempt',
        page: pagePathname,
        status: 'unauthorized',
        details: 'Email not in authorized list',
      });
      auth.signOut();
      sessionStorage.removeItem('adminAuth');
      sessionStorage.removeItem('adminEmail');
      router.push('/admin');
      return;
    }

    // All checks passed - log successful access
    logAdminActivity({
      adminEmail,
      action: 'page_access',
      page: pagePathname,
      status: 'success',
    });

    setIsAuthenticated(true);
    setIsLoading(false);
  }, [router]);

  return { isAuthenticated, isLoading };
}
