/**
 * Authentication middleware for API routes
 * Validates admin authentication before allowing access to protected endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedAdmin, isNemsuEmail } from '@/lib/adminAuth';
import { logError } from '@/lib/logger';

type IdentityToolkitLookupResponse = {
  users?: Array<{
    email?: string;
  }>;
};

async function lookupFirebaseEmail(idToken: string): Promise<string | null> {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as IdentityToolkitLookupResponse;
  const email = data.users?.[0]?.email;
  if (!email || typeof email !== 'string') {
    return null;
  }

  return email.toLowerCase().trim();
}

async function isFirestoreManagedAdmin(email: string, idToken: string): Promise<boolean> {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return false;

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/adminUsers/${encodeURIComponent(email)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) return false;

  const payload = await response.json() as {
    fields?: {
      active?: { booleanValue?: boolean };
    };
  };

  return payload.fields?.active?.booleanValue === true;
}

/**
 * Verify admin authentication from request headers
 * Validates Firebase ID token via Identity Toolkit and enforces admin whitelist
 */
export async function verifyAdminAuth(request: NextRequest): Promise<{
  isValid: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        isValid: false,
        error: 'Missing or invalid authorization header',
      };
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) {
      return {
        isValid: false,
        error: 'Missing ID token',
      };
    }

    const email = request.headers.get('x-admin-email')?.toLowerCase().trim();

    if (!email) {
      return {
        isValid: false,
        error: 'Missing admin email',
      };
    }

    const tokenEmail = await lookupFirebaseEmail(idToken);
    if (!tokenEmail) {
      return {
        isValid: false,
        error: 'Invalid or expired ID token',
      };
    }

    if (tokenEmail !== email) {
      return {
        isValid: false,
        error: 'Token email mismatch',
      };
    }

    // Validate domain and authorization
    if (!isNemsuEmail(tokenEmail)) {
      return {
        isValid: false,
        error: 'Invalid domain',
      };
    }

    const staticAdmin = isAuthorizedAdmin(tokenEmail);
    const managedAdmin = staticAdmin ? true : await isFirestoreManagedAdmin(tokenEmail, idToken);
    if (!managedAdmin) {
      return {
        isValid: false,
        error: 'Not authorized',
      };
    }

    return {
      isValid: true,
      email: tokenEmail,
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
