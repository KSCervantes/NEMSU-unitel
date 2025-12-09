/**
 * Authorized admin emails for the UNITEL Hotel Management System
 * 
 * IMPORTANT: This is a whitelist of authorized admin emails.
 * Only emails in this list can access the admin panel.
 * 
 * To add new admins, add their @nemsu.edu.ph email to this array.
 * 
 * Security Note: This file is safe to commit as it only contains
 * email addresses (not passwords or secrets). The actual authentication
 * is handled by Firebase Auth, and this list serves as an additional
 * authorization layer.
 */
export const AUTHORIZED_ADMIN_EMAILS = [
  'kscervantes@nemsu.edu.ph',
  'jambautista@nemsu.edu.ph',
  'admin@nemsu.edu.ph',
  'staff@nemsu.edu.ph',
  'manager@nemsu.edu.ph',
  // Add more authorized emails here
];

// Check if email is authorized to access admin panel
export function isAuthorizedAdmin(email: string | null): boolean {
  if (!email) return false;

  // Convert to lowercase for case-insensitive comparison
  const normalizedEmail = email.toLowerCase().trim();

  // Check if email is in the authorized list
  return AUTHORIZED_ADMIN_EMAILS.includes(normalizedEmail);
}

// Check if email is from NEMSU institution
export function isNemsuEmail(email: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith('@nemsu.edu.ph');
}
