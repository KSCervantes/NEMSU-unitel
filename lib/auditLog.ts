import { db } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from 'firebase/firestore';

export interface AuditLog {
  id?: string;
  adminEmail: string;
  action: string;
  resource?: string;
  page: string;
  timestamp?: any;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed' | 'unauthorized';
  details?: string;
}

/**
 * Log admin activity for security auditing
 */
export const logAdminActivity = async (log: AuditLog): Promise<void> => {
  try {
    const auditLogsRef = collection(db, 'auditLogs');

    // Get client IP if possible
    let ipAddress = 'unknown';
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      ipAddress = data.ip;
    } catch (error) {
      // IP fetch failed, use 'unknown'
    }

    await addDoc(auditLogsRef, {
      adminEmail: log.adminEmail,
      action: log.action,
      resource: log.resource || null,
      page: log.page,
      timestamp: serverTimestamp(),
      ipAddress,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      status: log.status,
      details: log.details || null,
    });

    console.log('✅ Audit log recorded:', log.action, log.adminEmail);
  } catch (error) {
    console.error('❌ Failed to log admin activity:', error);
  }
};

/**
 * Get audit logs for a specific admin
 */
export const getAdminLogs = async (adminEmail: string, limit: number = 50) => {
  try {
    const auditLogsRef = collection(db, 'auditLogs');
    const q = query(
      auditLogsRef,
      where('adminEmail', '==', adminEmail),
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(q);
    const logs: AuditLog[] = [];

    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() } as AuditLog);
    });

    return logs.slice(0, limit);
  } catch (error) {
    console.error('❌ Failed to fetch admin logs:', error);
    return [];
  }
};

/**
 * Get all audit logs (admin only)
 */
export const getAllAuditLogs = async (limit: number = 100) => {
  try {
    const auditLogsRef = collection(db, 'auditLogs');
    const q = query(
      auditLogsRef,
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(q);
    const logs: AuditLog[] = [];

    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() } as AuditLog);
    });

    return logs.slice(0, limit);
  } catch (error) {
    console.error('❌ Failed to fetch all audit logs:', error);
    return [];
  }
};

/**
 * Get failed login attempts
 */
export const getFailedLoginAttempts = async (limit: number = 50) => {
  try {
    const auditLogsRef = collection(db, 'auditLogs');
    const q = query(
      auditLogsRef,
      where('action', '==', 'login_attempt'),
      where('status', '==', 'failed'),
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(q);
    const logs: AuditLog[] = [];

    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() } as AuditLog);
    });

    return logs.slice(0, limit);
  } catch (error) {
    console.error('❌ Failed to fetch failed login attempts:', error);
    return [];
  }
};

/**
 * Get unauthorized access attempts
 */
export const getUnauthorizedAttempts = async (limit: number = 50) => {
  try {
    const auditLogsRef = collection(db, 'auditLogs');
    const q = query(
      auditLogsRef,
      where('status', '==', 'unauthorized'),
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(q);
    const logs: AuditLog[] = [];

    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() } as AuditLog);
    });

    return logs.slice(0, limit);
  } catch (error) {
    console.error('❌ Failed to fetch unauthorized attempts:', error);
    return [];
  }
};
