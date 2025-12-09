import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { checkRateLimit, getClientIdentifier } from '@/lib/rateLimit';
import { verifyAdminAuth } from '@/lib/middleware/auth';
import { sanitizeHtml } from '@/lib/sanitize';

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
    const authResult = await verifyAdminAuth(req);
    // Note: For now, we allow unauthenticated requests but log them
    // In production, you may want to require authentication

    const { to, subject, html, type } = await req.json();

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

    // Sanitize HTML content
    const sanitizedHtml = sanitizeHtml(html);

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
      subject: sanitizeHtml(subject), // Sanitize subject too
      html: sanitizedHtml,
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
  } catch (error: any) {
    // Log error (in production, send to error tracking service)
    if (process.env.NODE_ENV === 'development') {
      console.error('Email sending error:', error);
    }
    return NextResponse.json(
      { error: 'Failed to send email', details: error.message },
      { status: 500 }
    );
  }
}
