// Email template utilities for NEMSU Hotel booking notifications

const NEMSU_LOGO = 'https://raw.githubusercontent.com/KSCervantes/NEMSU-unitel/main/public/img/NEMSU_LOGOO.webp';

export const generateBookingConfirmationEmail = (
  guestName: string,
  bookingId: string,
  roomType: string,
  checkIn: string,
  checkOut: string,
  guests: number
) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #112240 0%, #1e3a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .logo { margin-bottom: 20px; }
    .logo img { max-width: 80px; height: auto; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .booking-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-label { font-weight: bold; color: #374151; }
    .detail-value { color: #6b7280; }
    .status-badge { background: #fef3c7; color: #92400e; padding: 10px 20px; border-radius: 20px; display: inline-block; font-weight: bold; margin: 20px 0; border: 2px solid #fbbf24; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    .button { background: #fbbf24; color: #78350f; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <img src="${NEMSU_LOGO}" alt="NEMSU Logo" />
      </div>
      <h1 style="margin: 0;">NEMSU Hotel</h1>
      <h2 style="margin: 10px 0 0 0; font-weight: normal;">Booking Received</h2>
    </div>
    <div class="content">
      <p>Dear <strong>${guestName}</strong>,</p>
      <p>Thank you for choosing NEMSU Hotel! We have received your booking request and our team is reviewing it.</p>

      <div class="status-badge">⏳ Pending Review</div>

      <div class="booking-details">
        <h3 style="margin-top: 0; color: #112240;">Booking Details</h3>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">${bookingId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Room Type:</span>
          <span class="detail-value">${roomType}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Check-in:</span>
          <span class="detail-value">${checkIn}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Check-out:</span>
          <span class="detail-value">${checkOut}</span>
        </div>
        <div class="detail-row" style="border-bottom: none;">
          <span class="detail-label">Number of Guests:</span>
          <span class="detail-value">${guests}</span>
        </div>
      </div>

      <p><strong>What's Next?</strong></p>
      <ul>
        <li>Our team will review your booking request within 24 hours</li>
        <li>You'll receive an email notification once your booking is confirmed</li>
        <li>If you have any questions, feel free to contact us</li>
      </ul>

      <p>We look forward to hosting you at NEMSU Hotel!</p>
    </div>
    <div class="footer">
      <p><strong>NEMSU Hotel</strong><br>
      Excellence in Hospitality<br>
      📧 Email: jambautista@nemsu.edu.ph| 📞 Phone: +639 105 794 330</p>
      <p style="font-size: 12px; color: #9ca3af;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `;
};

export const generateBookingApprovedEmail = (
  guestName: string,
  bookingId: string,
  roomType: string,
  checkIn: string,
  checkOut: string,
  guests: number,
  totalAmount?: number
) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .logo { margin-bottom: 20px; }
    .logo img { max-width: 80px; height: auto; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .booking-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-label { font-weight: bold; color: #374151; }
    .detail-value { color: #6b7280; }
    .status-badge { background: #d1fae5; color: #065f46; padding: 10px 20px; border-radius: 20px; display: inline-block; font-weight: bold; margin: 20px 0; border: 2px solid #10b981; }
    .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    .highlight-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <img src="${NEMSU_LOGO}" alt="NEMSU Logo" />
      </div>
      <h1 style="margin: 0;">NEMSU Hotel</h1>
      <h2 style="margin: 10px 0 0 0; font-weight: normal;">Booking Confirmed!</h2>
    </div>
    <div class="content">
      <div class="success-icon">✅</div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>Great news! Your booking has been <strong>confirmed</strong> by our team.</p>

      <div class="status-badge">✓ Confirmed</div>

      <div class="booking-details">
        <h3 style="margin-top: 0; color: #059669;">Your Reservation</h3>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">${bookingId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Room Type:</span>
          <span class="detail-value">${roomType}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Check-in:</span>
          <span class="detail-value">${checkIn}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Check-out:</span>
          <span class="detail-value">${checkOut}</span>
        </div>
        <div class="detail-row" style="${totalAmount ? '' : 'border-bottom: none;'}">
          <span class="detail-label">Number of Guests:</span>
          <span class="detail-value">${guests}</span>
        </div>
        ${totalAmount ? `
        <div class="detail-row" style="border-bottom: none;">
          <span class="detail-label">Total Amount:</span>
          <span class="detail-value" style="font-size: 18px; font-weight: bold; color: #059669;">₱${totalAmount.toLocaleString()}</span>
        </div>
        ` : ''}
      </div>

      <div class="highlight-box">
        <strong>📋 Important Information:</strong>
        <ul style="margin: 10px 0 0 0;">
          <li>Please bring a valid ID during check-in</li>
          <li>Check-in time: 2:00 PM</li>
          <li>Check-out time: 12:00 PM</li>
          <li>Early check-in/late check-out may be available upon request</li>
        </ul>
      </div>

      <p>We're excited to welcome you to NEMSU Hotel! If you have any special requests or questions, please don't hesitate to contact us.</p>

      <p style="margin-top: 30px;"><strong>See you soon!</strong><br>
      The NEMSU Hotel Team</p>
    </div>
    <div class="footer">
      <p><strong>NEMSU Hotel</strong><br>
      Excellence in Hospitality<br>
      📧 Email: jambautista@nemsu.edu.ph| 📞 Phone: +639 105 794 330</p>
      <p style="font-size: 12px; color: #9ca3af;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `;
};

export const generateBookingRejectedEmail = (
  guestName: string,
  bookingId: string,
  roomType: string,
  checkIn: string,
  checkOut: string,
  reason?: string
) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <stlogo { margin-bottom: 20px; }
    .logo img { max-width: 80px; height: auto; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .booking-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-label { font-weight: bold; color: #374151; }
    .detail-value { color: #6b7280; }
    .status-badge { background: #fee2e2; color: #991b1b; padding: 10px 20px; border-radius: 20px; display: inline-block; font-weight: bold; margin: 20px 0; border: 2px solid #ef4444; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    .reason-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .alternative-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <img src="${NEMSU_LOGO}" alt="NEMSU Logo" />
      </div></head>
<body>
  <div class="container">
    <div class="header">

      <h1 style="margin: 0;">NEMSU Hotel</h1>
      <h2 style="margin: 10px 0 0 0; font-weight: normal;">Booking Update</h2>
    </div>
    <div class="content">
      <p>Dear <strong>${guestName}</strong>,</p>
      <p>We regret to inform you that we are unable to accommodate your booking request at this time.</p>

      <div class="status-badge">✕ Not Available</div>

      <div class="booking-details">
        <h3 style="margin-top: 0; color: #dc2626;">Booking Request Details</h3>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">${bookingId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Room Type:</span>
          <span class="detail-value">${roomType}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Check-in:</span>
          <span class="detail-value">${checkIn}</span>
        </div>
        <div class="detail-row" style="border-bottom: none;">
          <span class="detail-label">Check-out:</span>
          <span class="detail-value">${checkOut}</span>
        </div>
      </div>

      ${reason ? `
      <div class="reason-box">
        <strong>Reason:</strong><br>
        ${reason}
      </div>
      ` : ''}

      <div class="alternative-box">
        <strong>💡 What You Can Do:</strong>
        <ul style="margin: 10px 0 0 0;">
          <li>Try different dates for your stay</li>
          <li>Consider alternative room types</li>
          <li>Contact us directly for personalized assistance</li>
          <li>Check our availability calendar on our website</li>
        </ul>
      </div>

      <p>We sincerely apologize for any inconvenience this may cause. We would love to host you at NEMSU Hotel in the future and encourage you to submit a new booking request with alternative dates.</p>

      <p style="margin-top: 30px;">Thank you for your understanding.<br>
      The NEMSU Hotel Team</p>
    </div>
    <div class="footer">
      <p><strong>NEMSU Hotel</strong><br>
      Excellence in Hospitality<br>
      📧 Email: jambautista@nemsu.edu.ph| 📞 Phone: +639 105 794 330</p>
      <p style="font-size: 12px; color: #9ca3af;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `;
};
