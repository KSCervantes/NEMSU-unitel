import nodemailer from 'nodemailer';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  generateBookingAutoCancelledEmail,
  generatePendingCancellationWarningEmail,
} from '@/lib/emailTemplates';
import { DEFAULT_HOTEL_SETTINGS, normalizeHotelSettings, type HotelSettings } from '@/lib/hotelSettings';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

const DAY_MS = 24 * 60 * 60 * 1000;
const WARNING_AFTER_MS = 2 * DAY_MS;
const CANCEL_AFTER_MS = 3 * DAY_MS;
const AUTO_CANCEL_REASON = 'Pending for 3 days without staff confirmation.';

type BookingData = {
  name?: string;
  surname?: string;
  email?: string;
  room?: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  createdAt?: Date | Timestamp | { seconds?: number; toMillis?: () => number };
  pendingAutoCancelWarningClaimedAt?: unknown;
  pendingAutoCancelWarningSentAt?: unknown;
  autoCancelledAt?: unknown;
};

type AutomationBooking = BookingData & {
  id: string;
};

export type PendingBookingAutomationResult = {
  checked: number;
  warned: number;
  cancelled: number;
  emailFailures: number;
};

function toMillis(value: BookingData['createdAt']): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

function formatDisplayDate(value?: string) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getGuestName(booking: AutomationBooking) {
  return [booking.name, booking.surname].filter(Boolean).join(' ').trim() || 'Guest';
}

function getExpiresAtLabel(createdAtMs: number) {
  return new Date(createdAtMs + CANCEL_AFTER_MS).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function getHotelSettings(): Promise<HotelSettings> {
  try {
    const snap = await getAdminDb().collection('settings').doc('hotel').get();
    return normalizeHotelSettings(snap.exists ? snap.data() : DEFAULT_HOTEL_SETTINGS);
  } catch {
    return DEFAULT_HOTEL_SETTINGS;
  }
}

function createTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Email service is not configured');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendWarningEmail(booking: AutomationBooking, createdAtMs: number, settings: HotelSettings) {
  if (!booking.email) return false;

  const transporter = createTransporter();
  const subject = `Pending Booking Reminder - ${settings.hotelName} (ID: ${booking.id})`;
  const html = generatePendingCancellationWarningEmail(
    getGuestName(booking),
    booking.id,
    booking.room || 'Room',
    formatDisplayDate(booking.checkIn),
    formatDisplayDate(booking.checkOut),
    getExpiresAtLabel(createdAtMs),
    settings
  );

  await transporter.sendMail({
    from: `"NEMSU Hotel" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject,
    html,
  });

  return true;
}

async function sendAutoCancelledEmail(booking: AutomationBooking, settings: HotelSettings) {
  if (!booking.email) return false;

  const transporter = createTransporter();
  const subject = `Booking Automatically Cancelled - ${settings.hotelName} (ID: ${booking.id})`;
  const html = generateBookingAutoCancelledEmail(
    getGuestName(booking),
    booking.id,
    booking.room || 'Room',
    formatDisplayDate(booking.checkIn),
    formatDisplayDate(booking.checkOut),
    AUTO_CANCEL_REASON,
    settings
  );

  await transporter.sendMail({
    from: `"NEMSU Hotel" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject,
    html,
  });

  return true;
}

async function claimWarning(bookingId: string, nowMs: number) {
  const db = getAdminDb();
  const ref = db.collection('bookings').doc(bookingId);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;

    const data = snap.data() as BookingData;
    const createdAtMs = toMillis(data.createdAt);

    if (
      data.status !== 'pending' ||
      !createdAtMs ||
      nowMs - createdAtMs < WARNING_AFTER_MS ||
      nowMs - createdAtMs >= CANCEL_AFTER_MS ||
      data.pendingAutoCancelWarningSentAt ||
      data.pendingAutoCancelWarningClaimedAt
    ) {
      return null;
    }

    transaction.update(ref, {
      pendingAutoCancelWarningClaimedAt: FieldValue.serverTimestamp(),
      pendingAutoCancelWarningReason: 'Pending booking is nearing the 3-day auto-cancellation deadline.',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { id: bookingId, ...data } as AutomationBooking;
  });
}

async function claimCancellation(bookingId: string, nowMs: number) {
  const db = getAdminDb();
  const ref = db.collection('bookings').doc(bookingId);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;

    const data = snap.data() as BookingData;
    const createdAtMs = toMillis(data.createdAt);

    if (
      data.status !== 'pending' ||
      !createdAtMs ||
      nowMs - createdAtMs < CANCEL_AFTER_MS ||
      data.autoCancelledAt
    ) {
      return null;
    }

    transaction.update(ref, {
      status: 'cancelled',
      autoCancelledAt: FieldValue.serverTimestamp(),
      autoCancelledReason: AUTO_CANCEL_REASON,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { id: bookingId, ...data } as AutomationBooking;
  });
}

export async function runPendingBookingAutomation(now = new Date()): Promise<PendingBookingAutomationResult> {
  const db = getAdminDb();
  const nowMs = now.getTime();
  const settings = await getHotelSettings();
  const snapshot = await db.collection('bookings').where('status', '==', 'pending').get();

  let warned = 0;
  let cancelled = 0;
  let emailFailures = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as BookingData;
    const createdAtMs = toMillis(data.createdAt);
    if (!createdAtMs) continue;

    if (nowMs - createdAtMs >= CANCEL_AFTER_MS) {
      const claimed = await claimCancellation(docSnap.id, nowMs);
      if (!claimed) continue;
      cancelled++;

      try {
        await sendAutoCancelledEmail(claimed, settings);
        await db.collection('bookings').doc(claimed.id).update({
          autoCancelEmailSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch {
        emailFailures++;
        await db.collection('bookings').doc(claimed.id).update({
          autoCancelEmailError: 'Failed to send auto-cancellation email',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      continue;
    }

    if (nowMs - createdAtMs >= WARNING_AFTER_MS) {
      const claimed = await claimWarning(docSnap.id, nowMs);
      if (!claimed) continue;
      warned++;

      try {
        await sendWarningEmail(claimed, createdAtMs, settings);
        await db.collection('bookings').doc(claimed.id).update({
          pendingAutoCancelWarningSentAt: FieldValue.serverTimestamp(),
          pendingAutoCancelWarningEmailStatus: 'sent',
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch {
        emailFailures++;
        await db.collection('bookings').doc(claimed.id).update({
          pendingAutoCancelWarningEmailStatus: 'failed',
          pendingAutoCancelWarningEmailError: 'Failed to send warning email',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }

  return {
    checked: snapshot.size,
    warned,
    cancelled,
    emailFailures,
  };
}
