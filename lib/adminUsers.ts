"use client";

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isAuthorizedAdmin, isNemsuEmail } from '@/lib/adminAuth';

export const ADMIN_USERS_COLLECTION = 'adminUsers';

export type AdminUserDoc = {
  email: string;
  active: boolean;
  role: 'admin';
  addedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function normalizeAdminEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export async function isAuthorizedAdminUser(email: string | null | undefined): Promise<boolean> {
  const normalizedEmail = normalizeAdminEmail(email);
  if (!normalizedEmail || !isNemsuEmail(normalizedEmail)) return false;

  // Bootstrap admins remain hardcoded for break-glass access.
  if (isAuthorizedAdmin(normalizedEmail)) return true;

  try {
    const adminRef = doc(db, ADMIN_USERS_COLLECTION, normalizedEmail);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) return false;

    const data = adminSnap.data() as Partial<AdminUserDoc>;
    return data.active === true;
  } catch {
    return false;
  }
}
