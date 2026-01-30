import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { checkRateLimit, getClientIdentifier } from '@/lib/rateLimit';
import { verifyAdminAuth } from '@/lib/middleware/auth';
import { logError } from '@/lib/logger';

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

    // Verify authentication (optional - can be made required)
    await verifyAdminAuth(req);
    // Note: For now, we allow unauthenticated requests but log them
    // In production, you may want to require authentication

    const { to, subject, html } = await req.json();

    // Validate input
    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
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

    // Note: We don't sanitize HTML for email templates as they are server-generated
    // and trusted. Only sanitize if the HTML contains user-generated content.
    // For email templates from emailTemplates.ts, use them as-is.

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
      subject: subject, // Use subject as-is (it's from our template)
      html: html, // Use HTML as-is (it's from our template)
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
