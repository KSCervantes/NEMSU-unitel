import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/middleware/auth';
import { runPendingBookingAutomation } from '@/lib/server/pendingBookingAutomation';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAuthorizedRequest(req: NextRequest) {
  const cronSecret = process.env.PENDING_BOOKING_CRON_SECRET || process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';

  if (cronSecret && providedSecret === cronSecret) {
    return true;
  }

  const authResult = await verifyAdminAuth(req);
  return authResult.isValid;
}

async function handleRequest(req: NextRequest) {
  try {
    const authorized = await isAuthorizedRequest(req);
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runPendingBookingAutomation();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logError(error as Error, { context: 'Pending booking automation failed' });
    return NextResponse.json(
      { error: 'Pending booking automation failed', details: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
