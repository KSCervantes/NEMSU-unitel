/**
 * Authentication middleware for API routes
 * Validates admin authentication before allowing access to protected endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedAdmin, isNemsuEmail } from '@/lib/adminAuth';
import { logError } from '@/lib/logger';

/**
 * Verify admin authentication from request headers
 * Checks for Firebase ID token in Authorization header
 */
export async function verifyAdminAuth(request: NextRequest): Promise<{
  isValid: boolean;
  email?: string;
  error?: string;
}> {
  try {
    // Require server-side shared secret until proper Firebase Admin verification is added
    const serverApiKey = process.env.ADMIN_API_KEY;
    const clientApiKey = request.headers.get('x-admin-api-key');
    if (!serverApiKey) {
      return {
        isValid: false,
        error: 'Server auth not configured',
      };
    }
    if (!clientApiKey || clientApiKey !== serverApiKey) {
      return {
        isValid: false,
        error: 'Invalid admin API key',
      };
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        isValid: false,
        error: 'Missing or invalid authorization header',
      };
    }

    // Verify Firebase ID token
    // Note: This requires Firebase Admin SDK on the server
    // For now, we'll validate sessionStorage on client-side
    // In production, implement proper server-side token verification

    const email = request.headers.get('x-admin-email');

    if (!email) {
      return {
        isValid: false,
        error: 'Missing admin email',
      };
    }

    // Validate domain and authorization
    if (!isNemsuEmail(email)) {
      return {
        isValid: false,
        error: 'Invalid domain',
      };
    }

    if (!isAuthorizedAdmin(email)) {
      return {
        isValid: false,
        error: 'Not authorized',
      };
    }

    return {
      isValid: true,
      email,
    };
  } catch (error) {
    logError(error as Error, { context: 'Auth verification error' });
    return {
      isValid: false,
      error: 'Authentication failed',
    };
  }
}

/**
 * Middleware wrapper for protected API routes
 */
export function withAuth(handler: (req: NextRequest, email: string) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const authResult = await verifyAdminAuth(req);

    if (!authResult.isValid) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    return handler(req, authResult.email!);
  };
}
