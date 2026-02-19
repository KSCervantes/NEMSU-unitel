import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { checkRateLimit, getClientIdentifier } from '@/lib/rateLimit';
import { verifyAdminAuth } from '@/lib/middleware/auth';
import { logError } from '@/lib/logger';
import {
  generateBookingApprovedEmail,
  generateBookingConfirmationEmail,
  generateBookingRejectedEmail
} from '@/lib/emailTemplates';
import { type SupportedCurrency } from '@/lib/hotelSettings';

type EmailType = 'confirmation' | 'approved' | 'rejected';

type SendEmailBody = {
  type?: unknown;
  to?: unknown;
  bookingId?: unknown;
  guestName?: unknown;
  roomType?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  guests?: unknown;
  totalAmount?: unknown;
  reason?: unknown;
  hotelName?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
  checkInTime?: unknown;
  checkOutTime?: unknown;
  currency?: unknown;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeText(value: unknown, maxLen = 160): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return escapeHtml(trimmed.slice(0, maxLen));
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function parseNonNegativeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function buildTemplateOptions(body: SendEmailBody) {
  const hotelName = sanitizeText(body.hotelName, 120);
  const contactEmail = sanitizeText(body.contactEmail, 120);
  const contactPhone = sanitizeText(body.contactPhone, 80);
  const checkInTime = sanitizeText(body.checkInTime, 10);
  const checkOutTime = sanitizeText(body.checkOutTime, 10);
  const currencyRaw = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : '';
  const currency: SupportedCurrency | undefined = currencyRaw === 'PHP' || currencyRaw === 'USD' || currencyRaw === 'EUR'
    ? currencyRaw as SupportedCurrency
    : undefined;

  return {
    ...(hotelName ? { hotelName } : {}),
    ...(contactEmail ? { contactEmail } : {}),
    ...(contactPhone ? { contactPhone } : {}),
    ...(checkInTime ? { checkInTime } : {}),
    ...(checkOutTime ? { checkOutTime } : {}),
    ...(currency ? { currency } : {}),
  };
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const identifier = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(identifier, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10, // 10 emails per 15 minutes
    });

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please try again later.',
          resetTime: rateLimitResult.resetTime,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const body = (await req.json()) as SendEmailBody;
    const type = typeof body.type === 'string' ? body.type : '';
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const emailType: EmailType | null = (type === 'confirmation' || type === 'approved' || type === 'rejected')
      ? type
      : null;

    // Validate input
    if (!to || !emailType) {
      return NextResponse.json(
        { error: 'Missing or invalid fields: to, type' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    if (emailType === 'approved' || emailType === 'rejected') {
      const authResult = await verifyAdminAuth(req);
      if (!authResult.isValid) {
        return NextResponse.json(
          { error: authResult.error || 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const bookingId = sanitizeText(body.bookingId, 80);
    const guestName = sanitizeText(body.guestName, 120);
    const roomType = sanitizeText(body.roomType, 120);
    const checkIn = sanitizeText(body.checkIn, 120);
    const checkOut = sanitizeText(body.checkOut, 120);
    const guests = parsePositiveInt(body.guests);
    const totalAmount = parseNonNegativeNumber(body.totalAmount);
    const reason = sanitizeText(body.reason, 400);
    const templateOptions = buildTemplateOptions(body);
    const subjectHotelName = templateOptions.hotelName || 'NEMSU Hotel';

    if (!bookingId || !guestName || !roomType || !checkIn || !checkOut) {
      return NextResponse.json(
        { error: 'Missing required booking details' },
        { status: 400 }
      );
    }

    let subject = '';
    let html = '';

    if (emailType === 'confirmation') {
      if (!guests) {
        return NextResponse.json(
          { error: 'Missing required field: guests' },
          { status: 400 }
        );
      }
      subject = `Booking Request Received - ${subjectHotelName} (ID: ${bookingId})`;
      html = generateBookingConfirmationEmail(
        guestName,
        bookingId,
        roomType,
        checkIn,
        checkOut,
        guests,
        templateOptions
      );
    }

    if (emailType === 'approved') {
      if (!guests) {
        return NextResponse.json(
          { error: 'Missing required field: guests' },
          { status: 400 }
        );
      }
      subject = `Booking Confirmed - ${subjectHotelName} (ID: ${bookingId})`;
      html = generateBookingApprovedEmail(
        guestName,
        bookingId,
        roomType,
        checkIn,
        checkOut,
        guests,
        totalAmount ?? undefined,
        templateOptions
      );
    }

    if (emailType === 'rejected') {
      subject = `Booking Update - ${subjectHotelName} (ID: ${bookingId})`;
      html = generateBookingRejectedEmail(
        guestName,
        bookingId,
        roomType,
        checkIn,
        checkOut,
        reason || undefined,
        templateOptions
      );
    }

    // Validate required environment variables
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 503 }
      );
    }

    // Create transporter using Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: `"NEMSU Hotel" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      message: 'Email sent successfully',
    }, {
      headers: {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
      },
    });
  } catch (error: unknown) {
    // Log error (in production, send to error tracking service)
    logError(error as Error, { context: 'Email sending error' });
    return NextResponse.json(
      { error: 'Failed to send email', details: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 }
    );
  }
}
